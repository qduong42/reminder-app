# Implementation Plan: Account Creation & Related Flows

**Spec:** `docs/superpowers/specs/2026-05-15-account-creation-design.md`
**Date:** 2026-05-15

---

## Summary

Add open registration, email-based password reset, account settings (identity and password change), and account deletion to the existing reminder app. The work touches: one new DB migration, two new backend route files, two new backend utility files, updates to existing auth routes and schema, seven new `api.ts` methods, four new frontend pages, one new shared frontend component, and updates to the Login page and Dashboard header.

New dependencies required:
- Backend: `nodemailer`, `zxcvbn` (+ their `@types/*`)
- Frontend: `zxcvbn` (+ `@types/zxcvbn`)

---

## Ordered Implementation Steps

### Step 1 — Install new backend dependencies

**Files to modify:** `backend/package.json` (implicit — run install commands)

**What to do:**
- Run `npm install nodemailer zxcvbn` in `backend/`
- Run `npm install --save-dev @types/nodemailer @types/zxcvbn` in `backend/`

**Acceptance criteria:**
- `nodemailer` and `zxcvbn` appear in `backend/package.json` dependencies.
- TypeScript compilation still passes (`npm run build`).

**Dependencies:** None.

---

### Step 2 — Install new frontend dependencies

**Files to modify:** `frontend/package.json` (implicit — run install commands)

**What to do:**
- Run `npm install zxcvbn` in `frontend/`
- Run `npm install --save-dev @types/zxcvbn` in `frontend/`

**Acceptance criteria:**
- `zxcvbn` appears in `frontend/package.json` dependencies.
- `npm run build` in `frontend/` still succeeds.

**Dependencies:** None (can run in parallel with Step 1).

---

### Step 3 — Add DB migration file

**Files to create:** `backend/drizzle/0002_account_flows.sql`

**What to do:**
Create the migration file with exactly the SQL from the spec:

```sql
-- Add email to users (nullable first so existing rows survive, then backfill and constrain)
ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;
UPDATE users SET email = name || '@placeholder.local' WHERE email IS NULL;
ALTER TABLE users ALTER COLUMN email SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users(email);

-- Password reset tokens (mirrors invite_tokens pattern)
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id         TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  token      TEXT NOT NULL UNIQUE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS prt_user_id_idx ON password_reset_tokens(user_id);
```

Apply the migration: `npm run db:migrate` in `backend/`.

**Acceptance criteria:**
- `users` table has a non-null `email` column with a unique index.
- `password_reset_tokens` table exists with the correct columns and FK.
- Existing user rows have a placeholder email and no errors on migrate.

**Dependencies:** Steps 1–2 do not need to complete first; this step is independent.

---

### Step 4 — Update Drizzle schema

**Files to modify:** `backend/src/db/schema.ts`

**What to do:**
1. Add `email: text('email').notNull().unique()` to the `users` table definition (after `passwordHash`).
2. Add the `passwordResetTokens` table definition at the end of the file, mirroring `inviteTokens` structure:
   - `id: text('id').primaryKey().default(sql\`gen_random_uuid()\`)`  
     (Note: `id` is TEXT in the SQL migration, not UUID — match the migration exactly.)
   - `token: text('token').notNull().unique()`
   - `userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' })`
   - `expiresAt: timestamp('expires_at', { withTimezone: true }).notNull()`
   - `createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()`
3. Add `sql` import from `drizzle-orm` if not already imported.

**Acceptance criteria:**
- TypeScript compilation passes.
- `passwordResetTokens` is exported from the schema and importable in routes/tests.
- `users.email` field is visible in the type system.

**Dependencies:** Step 3 (migration must exist to match the schema).

---

### Step 5 — Add `.env` entries for email and frontend URL

**Files to modify:** `backend/.env`

**What to do:**
Append the following variables (do not overwrite existing content):
```
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_FROM=noreply@reminder.local
FRONTEND_URL=http://localhost:5173
```

Also add a note comment about running Mailpit:
```
# Mailpit: docker run -d -p 1025:1025 -p 8025:8025 axllent/mailpit
```

**Acceptance criteria:**
- The four env vars are present in `.env`.
- `FRONTEND_URL` is already used in `app.ts` for CORS; this makes it explicit.

**Dependencies:** None.

---

### Step 6 — Create `backend/src/mailer.ts`

**Files to create:** `backend/src/mailer.ts`

**What to do:**
Create a `sendMail` function wrapping Nodemailer:
- Reads `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM` from `process.env`.
- Creates a transporter with `createTransport({ host, port, secure: false })` (no auth for Mailpit).
- Exports `sendMail({ to, subject, html }: { to: string; subject: string; html: string }): Promise<void>`.
- Use `transporter.sendMail({ from: SMTP_FROM, to, subject, html })`.

**Acceptance criteria:**
- File compiles without errors.
- Function signature matches what `routes/auth.ts` will call.

**Dependencies:** Step 1 (nodemailer must be installed).

---

### Step 7 — Create `backend/src/emails/passwordReset.ts`

**Files to create:** `backend/src/emails/passwordReset.ts`

**What to do:**
Create and export `passwordResetEmail({ resetUrl }: { resetUrl: string }): string` that returns an HTML string for the password reset email. The HTML should include:
- A heading: "Reset your password"
- The `resetUrl` as a clickable link with text "Reset Password"
- Expiry note: "This link expires in 1 hour."

**Acceptance criteria:**
- Function returns a non-empty HTML string containing the `resetUrl`.
- File compiles without errors.

**Dependencies:** None (pure function, no imports needed beyond the argument type).

---

### Step 8 — Update `backend/src/db/schema.ts` (already covered in Step 4)

_Merged into Step 4. No separate step needed._

---

### Step 9 — Update existing auth routes (`backend/src/routes/auth.ts`)

**Files to modify:** `backend/src/routes/auth.ts`

**What to do:**

1. **`POST /login`** — accept `usernameOrEmail` field (in addition to `name` for backwards compat):
   - Change the destructured body to accept `{ name, usernameOrEmail, password, rememberMe }`.
   - Resolve the lookup identifier: `const identifier = usernameOrEmail ?? name`.
   - Query: `db.select().from(users).where(or(eq(users.name, identifier), eq(users.email, identifier)))`.
   - Import `or` from `drizzle-orm`.
   - Keep error response as `{ error: 'Invalid credentials' }` (401).

2. **`GET /me`** — include `email` in the select and response:
   - Change `.select({ id: users.id, name: users.name })` to `.select({ id: users.id, name: users.name, email: users.email })`.

3. **`POST /register`** (new route on this router):
   - Accept `{ username, email, password }`.
   - Validate: `username` 3–30 chars, alphanumeric/underscore/hyphen (`/^[a-zA-Z0-9_-]{3,30}$/`).
   - Validate: `email` basic format check.
   - Validate: `password` min 8 chars, `zxcvbn(password).score >= 2`.
   - Check uniqueness: query `users` for existing `name = username` → 409 `{ error: 'username_taken' }`.
   - Check uniqueness: query `users` for existing `email` → 409 `{ error: 'email_taken' }`.
   - `bcrypt.hash(password, 10)`, insert into `users`, set JWT cookie (same logic as login, use 7-day default, no rememberMe for register).
   - Return 201 `{ id, username: name, email }`.

4. **`POST /forgot-password`** (new route):
   - Accept `{ email }`.
   - Look up user by email; if not found, return 200 `{}` (no enumeration).
   - `generateToken()` (reuse `utils/token.ts`), insert into `password_reset_tokens` with `expiresAt = new Date(Date.now() + 60 * 60 * 1000)`.
   - Call `sendMail` with `passwordResetEmail({ resetUrl: \`${FRONTEND_URL}/reset-password/${token}\` })`.
   - Always return 200 `{}`.

5. **`POST /reset-password/:token`** (new route):
   - Look up token in `password_reset_tokens` where `token = req.params.token`.
   - If not found → 404 `{ error: 'Token not found' }`.
   - If `expiresAt < now()` → 410 `{ error: 'Token expired' }`.
   - Validate new password: min 8 chars, zxcvbn score >= 2; if not → 400 `{ error: 'Password too weak' }`.
   - `bcrypt.hash(newPassword, 10)`, update `users.passwordHash` where `id = token.userId`.
   - Hard-delete the token row.
   - Return 200 `{}`.

**Acceptance criteria (from spec):**
- `POST /register` happy path → 201 with `{ id, username, email }` + JWT cookie set.
- Duplicate username → 409 `{ error: 'username_taken' }`.
- Duplicate email → 409 `{ error: 'email_taken' }`.
- Weak password (zxcvbn score < 2) → 400 `{ error: 'Password too weak' }`.
- `POST /login` accepts both `name` and `usernameOrEmail` fields; matches on both `name` and `email` columns.
- `GET /me` returns `email` field.
- `POST /forgot-password` always returns 200.
- `POST /reset-password/:token` happy path → 200; expired → 410; unknown → 404; token is single-use (second use → 404).

**Dependencies:** Steps 4, 6, 7 (schema, mailer, email template).

---

### Step 10 — Create `backend/src/routes/account.ts`

**Files to create:** `backend/src/routes/account.ts`

**What to do:**
Create a new Express router. All routes use `requireAuth` middleware.

1. **`GET /`** — return `{ id, username: name, email }` for the authenticated user.

2. **`PATCH /identity`** — accept `{ username, email, currentPassword }`:
   - Verify `currentPassword` against stored hash → 403 `{ error: 'Invalid current password' }` if wrong.
   - Check username uniqueness (exclude current user) → 409 `{ error: 'username_taken' }`.
   - Check email uniqueness (exclude current user) → 409 `{ error: 'email_taken' }`.
   - Update `users.name` and `users.email`.
   - Return 200 `{ id, username, email }`.

3. **`PATCH /password`** — accept `{ currentPassword, newPassword }`:
   - Verify `currentPassword` → 403 if wrong.
   - Validate `newPassword`: min 8 chars, zxcvbn score >= 2 → 400 `{ error: 'Password too weak' }`.
   - `bcrypt.hash(newPassword, 10)`, update `users.passwordHash`.
   - Return 200 `{}`.

4. **`DELETE /`** — accept `{ currentPassword }`:
   - Verify `currentPassword` → 403 if wrong.
   - Run the 7-step deletion cascade **in a single `db.transaction`**:
     1. Query `householdMembers` where `userId` = caller and `status = 'active'`; for each household, check if any other active members exist; collect `householdIds` where the caller is the only active member.
     2. `db.delete(completions).where(eq(completions.userId, userId))`
     3. `db.delete(tasks).where(and(eq(tasks.ownerId, userId), isNull(tasks.householdId)))`
     4. `db.delete(householdMembers).where(eq(householdMembers.userId, userId))`
     5. `db.delete(households).where(inArray(households.id, householdIds))` (skip if `householdIds` is empty)
     6. `db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, userId))`
     7. `db.delete(users).where(eq(users.id, userId))`
   - Return 204.

Import all needed schema tables from `../db/schema`.

**Acceptance criteria (from spec):**
- `GET /api/account` returns `{ id, username, email }` for the authenticated user.
- `PATCH /api/account/identity` happy path updates and returns new values; wrong password → 403; duplicate username/email → 409.
- `PATCH /api/account/password` happy path → 200; wrong current password → 403; weak new password → 400.
- `DELETE /api/account` happy path removes user and all their data in a transaction; wrong password → 403.

**Dependencies:** Step 4 (schema with `passwordResetTokens` and `users.email`).

---

### Step 11 — Register the account router in `app.ts`

**Files to modify:** `backend/src/app.ts`

**What to do:**
- Import `accountRouter` from `./routes/account`.
- Add `app.use('/api/account', accountRouter)` after the existing route registrations.

**Acceptance criteria:**
- `GET /api/account` returns data (not 404) when authenticated.
- All four `/api/account` endpoints are reachable.

**Dependencies:** Step 10.

---

### Step 12 — Write backend integration tests

**Files to create:** `backend/src/__tests__/account.test.ts`

**What to do:**
Follow the test pattern in `backend/src/__tests__/households.test.ts`. Set up test users via direct DB inserts (using `bcrypt.hash`), obtain cookies via `POST /api/auth/login`.

Cover all test cases from spec Section 6:

- **Register:** happy path (201 + cookie); duplicate username (409); duplicate email (409); weak password (400); missing fields (400).
- **Login:** login with username; login with email; wrong password (401).
- **Forgot password:** always 200 for valid email; always 200 for unknown email.
- **Reset password:** happy path resets password and allows login with new password; expired token (410); unknown token (404); weak password (400); token is single-use (second use → 404).
- **PATCH /account/identity:** happy path updates fields; wrong current password (403); duplicate username (409); duplicate email (409).
- **PATCH /account/password:** happy path; wrong current password (403); weak new password (400).
- **DELETE /account:** happy path cascades all data (verify user row gone, tasks gone, memberships gone); wrong password (403).

For the email tests, mock `sendMail` (e.g., `jest.mock('../mailer')`) so no SMTP connection is needed in tests.

**Acceptance criteria:**
- All test cases from spec pass.
- No real network calls to SMTP.
- `npm test` exits 0 for this file.

**Dependencies:** Steps 9, 10, 11 (routes must exist).

---

### Step 13 — Update `User` interface and add new API methods in `frontend/src/api.ts`

**Files to modify:** `frontend/src/api.ts`

**What to do:**

1. Update the `User` interface:
   ```typescript
   export interface User {
     id: string;
     name: string;
     email: string;  // add this
   }
   ```

2. Update `api.login` to send `usernameOrEmail` instead of `name`:
   ```typescript
   login: (usernameOrEmail: string, password: string, rememberMe: boolean) =>
     apiFetch<User>('/api/auth/login', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({ usernameOrEmail, password, rememberMe }),
     }),
   ```

3. Update `apiFetch` to expose the response status for error handling. Change the function to throw an object with the status code: catch `!res.ok`, parse JSON body if possible, and throw `{ status: res.status, body }`. This enables pages to distinguish 409/403/410/404.

   Suggested shape:
   ```typescript
   export class ApiError extends Error {
     constructor(public status: number, public body: unknown) {
       super(`API error ${status}`);
     }
   }
   ```
   Throw `new ApiError(res.status, body)` instead of generic `Error`.

4. Add all seven new methods from the spec:
   ```typescript
   register(data: { username: string; email: string; password: string }): Promise<{ id: string; username: string; email: string }>
   forgotPassword(email: string): Promise<void>
   resetPassword(token: string, password: string): Promise<void>
   getAccount(): Promise<{ id: string; username: string; email: string }>
   updateIdentity(data: { username: string; email: string; currentPassword: string }): Promise<{ id: string; username: string; email: string }>
   updatePassword(data: { currentPassword: string; newPassword: string }): Promise<void>
   deleteAccount(currentPassword: string): Promise<void>
   ```

**Acceptance criteria:**
- TypeScript compiles with no errors.
- `api.login` still works with existing Login page (update call site too — see Step 14).
- `ApiError` is exported so pages can `instanceof` check it.

**Dependencies:** None (can start before backend steps complete).

---

### Step 14 — Update `frontend/src/pages/Login.tsx`

**Files to modify:** `frontend/src/pages/Login.tsx`

**What to do:**
1. Rename the `name` state variable to `usernameOrEmail` and update the input accordingly.
2. Change the label from "Username" to "Username or Email".
3. Update `api.login(usernameOrEmail, password, rememberMe)` call.
4. Add "Forgot password?" link below the password field: `<a href="/forgot-password">Forgot password?</a>` (or use `<Link to="/forgot-password">`).
5. Add "Don't have an account? Register" link below the submit button → `/register`.
6. Update the error text from `'Invalid username or password'` to `'Invalid username/email or password'` to match spec.

**Acceptance criteria:**
- Login with username still works.
- Login with email works (via Step 9 backend changes).
- "Forgot password?" link is visible and navigates to `/forgot-password`.
- "Register" link navigates to `/register`.

**Dependencies:** Step 13 (`api.login` signature updated).

---

### Step 15 — Create shared `frontend/src/components/PasswordStrengthBar.tsx`

**Files to create:** `frontend/src/components/PasswordStrengthBar.tsx`

**What to do:**
Create a functional component accepting `{ password: string }`:
- Import `zxcvbn` from `'zxcvbn'`.
- Compute `const result = zxcvbn(password)` (only when `password` is non-empty).
- Score-to-color mapping: 0–1 → `#dc2626` (red), 2 → `#d97706` (orange), 3 → `#84cc16` (yellow-green), 4 → `#16a34a` (green).
- Render a `<div>` containing a filled bar (width = `(score / 4) * 100%`) in the appropriate color.
- Show a text label: "Too weak" (0–1), "Fair" (2), "Good" (3), "Strong" (4).
- If `password` is empty, render nothing (return `null`).

**Acceptance criteria:**
- Component renders without errors.
- Bar is proportionally filled to score.
- Color changes correctly at score thresholds.

**Dependencies:** Step 2 (zxcvbn installed in frontend).

---

### Step 16 — Create `frontend/src/pages/Register.tsx`

**Files to create:** `frontend/src/pages/Register.tsx`

**What to do:**
- Fields: `username`, `email`, `password` (with `<PasswordStrengthBar password={password} />`).
- On submit: call `api.register({ username, email, password })`.
- On success: `navigate('/')`.
- Error handling:
  - `username_taken` → field-level error: "Username is already taken"
  - `email_taken` → field-level error: "Email is already registered"
  - `Password too weak` → field-level error below password field
  - Unknown → "Something went wrong, please try again"
- "Already have an account? Log in" link → `/login`.

**Acceptance criteria:**
- Happy path registers and redirects to `/`.
- Field-level errors display inline below the relevant field.
- `PasswordStrengthBar` updates as user types.

**Dependencies:** Steps 13, 15.

---

### Step 17 — Create `frontend/src/pages/ForgotPassword.tsx`

**Files to create:** `frontend/src/pages/ForgotPassword.tsx`

**What to do:**
- Single `email` field.
- On submit: call `api.forgotPassword(email)`.
- Always show after submit: "If that address is registered, you'll receive a reset link shortly."
- Read `?error=expired` and `?error=invalid` from URL query params (use `useSearchParams`):
  - `expired` → show banner: "Your reset link has expired. Request a new one below."
  - `invalid` → show banner: "That reset link is invalid. Request a new one below."
- Link back to login: "Back to login" → `/login`.

**Acceptance criteria:**
- Submit always shows the success message regardless of whether email exists (no enumeration on frontend).
- Error banners appear when query params are present.
- Banner disappears after a successful new submission (or on re-mount without query params).

**Dependencies:** Step 13.

---

### Step 18 — Create `frontend/src/pages/ResetPassword.tsx`

**Files to create:** `frontend/src/pages/ResetPassword.tsx`

**What to do:**
- Read `:token` from URL params (`useParams`).
- Fields: `newPassword` (with `<PasswordStrengthBar />`), `confirmPassword`.
- Client-side validation: passwords must match before submit.
- On submit: call `api.resetPassword(token, newPassword)`.
- On success: `navigate('/login')`.
- On 410 (expired): `navigate('/forgot-password?error=expired')`.
- On 404 (invalid): `navigate('/forgot-password?error=invalid')`.
- On 400 (weak): show inline error "Password too weak".
- Unknown error: "Something went wrong, please try again".

**Acceptance criteria:**
- Happy path resets password and navigates to `/login`.
- Mismatched passwords show a client-side error before submitting.
- 410 and 404 redirect to `/forgot-password` with appropriate query param.

**Dependencies:** Steps 13, 15.

---

### Step 19 — Create `frontend/src/pages/Settings.tsx`

**Files to create:** `frontend/src/pages/Settings.tsx`

**What to do:**
Three independent `<form>` sections on one page:

1. **Identity section** — prefill from `api.getAccount()` on mount:
   - Fields: `username` (pre-filled), `email` (pre-filled), `currentPassword`.
   - On submit: `api.updateIdentity({ username, email, currentPassword })`.
   - On success: update displayed values; show "Saved." confirmation.
   - Errors: `username_taken`, `email_taken` → field-level; `Invalid current password` → "Incorrect password" below current password field.

2. **Password section:**
   - Fields: `currentPassword`, `newPassword` (with `<PasswordStrengthBar />`), `confirmNewPassword`.
   - Client-side: `newPassword` must match `confirmNewPassword`.
   - On submit: `api.updatePassword({ currentPassword, newPassword })`.
   - On success: clear all three fields; show "Password updated." confirmation.
   - Errors: `Invalid current password` → "Incorrect password"; `Password too weak` → inline.

3. **Delete Account section:**
   - Red "Delete Account" button that, when clicked, expands an inline confirmation area.
   - Confirmation area contains: `currentPassword` input, a text input where user must type `DELETE`.
   - On submit (only if text input === "DELETE"): call `api.deleteAccount(currentPassword)`.
   - On success: `navigate('/login')`.
   - On wrong password (403): "Incorrect password" error.

**Acceptance criteria:**
- Each section submits independently without affecting the others.
- All three error scenarios from spec display correctly.
- Delete requires both correct password and typing "DELETE".
- After delete, user is redirected to `/login`.

**Dependencies:** Steps 13, 15.

---

### Step 20 — Add new routes to `frontend/src/App.tsx` and update Dashboard header

**Files to modify:**
- `frontend/src/App.tsx`
- `frontend/src/pages/Dashboard.tsx`

**What to do — `App.tsx`:**
1. Import the four new pages: `Register`, `ForgotPassword`, `ResetPassword`, `Settings`.
2. Add routes inside `<Routes>`:
   ```tsx
   <Route path="/register" element={<Register />} />
   <Route path="/forgot-password" element={<ForgotPassword />} />
   <Route path="/reset-password/:token" element={<ResetPassword />} />
   <Route path="/settings" element={<Settings />} />
   ```
   The `/settings` route does not need a separate `requireAuth` wrapper at the router level (Settings page calls `api.getAccount()` and will redirect to `/login` on 401, following the existing pattern used by Dashboard).

**What to do — `Dashboard.tsx`:**
- Add a "Settings" button (or link) to the header button group, next to "Households" and "Log out".
- Navigate to `/settings` on click: `<button onClick={() => navigate('/settings')}>Settings</button>`.

**Acceptance criteria:**
- All four new routes render the correct page component.
- The `*` catch-all still redirects to `/` for unknown paths (comes after the new routes).
- Dashboard header has a working "Settings" link.

**Dependencies:** Steps 16, 17, 18, 19 (pages must exist before importing them).

---

## Dependency Summary

```
Step 1 (install nodemailer/zxcvbn backend)
Step 2 (install zxcvbn frontend)          — parallel with Step 1
Step 3 (migration SQL)                     — independent
Step 4 (schema.ts update)                  — after Step 3
Step 5 (.env additions)                    — independent
Step 6 (mailer.ts)                         — after Step 1
Step 7 (emails/passwordReset.ts)           — independent
Step 9 (update auth routes)                — after Steps 4, 6, 7
Step 10 (account router)                   — after Step 4
Step 11 (register account router in app)   — after Step 10
Step 12 (backend tests)                    — after Steps 9, 10, 11
Step 13 (api.ts updates)                   — independent of backend steps
Step 14 (Login.tsx update)                 — after Step 13
Step 15 (PasswordStrengthBar)              — after Step 2
Step 16 (Register page)                    — after Steps 13, 15
Step 17 (ForgotPassword page)              — after Step 13
Step 18 (ResetPassword page)               — after Steps 13, 15
Step 19 (Settings page)                    — after Steps 13, 15
Step 20 (App.tsx + Dashboard updates)      — after Steps 16, 17, 18, 19
```

Key parallelism opportunities:
- Steps 1 and 2 can run in parallel.
- Steps 3, 5, 7 are independent of each other and of Steps 1–2.
- Steps 6 and 7 can run in parallel after Step 1.
- Steps 13–15 (frontend) can run in parallel with Steps 9–11 (backend).

---

## Notes and Caveats

- **`users.id` type mismatch:** The existing schema uses `uuid('id').defaultRandom()` for `users.id` (a UUID Drizzle column), but the migration spec defines `password_reset_tokens.user_id` as `TEXT`. The schema step (Step 4) should use `uuid('user_id')` to match the existing FK pattern from `inviteTokens`, not `text`. The SQL migration uses `TEXT` because PostgreSQL UUIDs are stored as text-compatible. Adjust the migration SQL accordingly if Drizzle complains, or cast appropriately.

- **`apiFetch` breaking change:** Changing `apiFetch` to throw `ApiError` in Step 13 will change behavior for all existing callers. Verify that existing pages (Dashboard, HouseholdManager, InvitePage) still handle errors correctly after this change — they currently `catch` and navigate to `/login`, which remains compatible.

- **No frontend automated tests:** The spec notes no automated frontend tests (existing pattern). Manual golden-path smoke test should cover: register → login with email → change username → forgot password flow → reset password → log in with new password → delete account.

- **zxcvbn import:** `zxcvbn` is a CommonJS module. In Vite, it may need `import zxcvbn from 'zxcvbn'` (default import). Verify at implementation time that the import resolves correctly.
