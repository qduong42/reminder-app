# Account Creation & Related Flows — Design Spec

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add open registration, email-based password reset, account settings (identity and password change), and account deletion to the existing reminder app.

**Architecture:** Extend the existing Express + Drizzle + PostgreSQL backend with new routes under `/api/auth` and a new `/api/account` router. Add `email` to the `users` table and a `password_reset_tokens` table via a new migration. Add four new React pages. Email delivery uses Nodemailer with Mailpit in local dev.

**Tech Stack:** Express, Drizzle ORM 0.39, PostgreSQL 16, bcryptjs, zxcvbn, Nodemailer, React 18 + react-router-dom v6.

---

## 1. Data Model

### Migration: `drizzle/0002_account_flows.sql`

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

### Schema changes (`backend/src/db/schema.ts`)

- Add `email: text('email').notNull().unique()` to the `users` table definition.
- Add `passwordResetTokens` table definition mirroring `inviteTokens` structure, with `userId` FK referencing `users.id`.

---

## 2. API Endpoints

All new routes require the existing Express middleware chain. `/api/account` routes all require `requireAuth`.

### Existing routes updated

| Method | Path | Change |
|--------|------|--------|
| `GET` | `/api/auth/me` | Also return `email` in response |
| `POST` | `/api/auth/login` | Accept `usernameOrEmail` field (falls back to `name` for backwards compat); match against both `name` and `email` columns |

### New auth routes (`/api/auth`)

| Method | Path | Auth | Body | Response |
|--------|------|------|------|----------|
| `POST` | `/api/auth/register` | none | `{ username, email, password }` | `201 { id, username, email }` + sets JWT cookie |
| `POST` | `/api/auth/forgot-password` | none | `{ email }` | `200 {}` always (no enumeration) |
| `POST` | `/api/auth/reset-password/:token` | none | `{ password }` | `200 {}` on success; `404` invalid token; `410` expired token |

### New account routes (`/api/account`, all require auth)

| Method | Path | Body | Response |
|--------|------|------|----------|
| `GET` | `/api/account` | — | `{ id, username, email }` |
| `PATCH` | `/api/account/identity` | `{ username, email, currentPassword }` | `200 { id, username, email }` |
| `PATCH` | `/api/account/password` | `{ currentPassword, newPassword }` | `200 {}` |
| `DELETE` | `/api/account` | `{ currentPassword }` | `204` |

**Registration validation:**
- `username`: 3–30 chars, alphanumeric + underscore + hyphen, unique
- `email`: valid format, unique
- `password`: min 8 chars, zxcvbn score ≥ 2

**Password reset flow:**
1. `POST /forgot-password` → look up user by email → generate 12-char token (reuse `utils/token.ts`) → insert into `password_reset_tokens` with `expires_at = now() + 1h` → send email → return 200 regardless.
2. `POST /reset-password/:token` → look up token → check expiry → bcrypt hash new password → update `users.passwordHash` → hard-delete token → return 200.

**Account deletion cascade (single transaction, explicit order):**
1. Identify households where this user is the only active member → collect `householdIds` to delete.
2. Delete `completions` WHERE `userId = userId`.
3. Delete `tasks` WHERE `ownerId = userId` AND `householdId IS NULL` (personal tasks).
4. Delete `household_members` WHERE `userId = userId`.
5. Delete identified households (and their tasks/completions cascade from the tasks FK).
6. Delete `password_reset_tokens` WHERE `userId = userId`.
7. Delete `users` WHERE `id = userId`.

All seven steps run inside one `db.transaction`.

---

## 3. Email Infrastructure

### `backend/src/mailer.ts`

Single `sendMail({ to, subject, html })` function wrapping Nodemailer. Reads `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM` from env. No auth (Mailpit accepts unauthenticated connections).

### `backend/src/emails/passwordReset.ts`

Generates the password reset email HTML. Accepts `{ resetUrl }`. Reset URL shape: `http://localhost:5173/reset-password/<token>` (from `FRONTEND_URL` env var).

### Local dev setup

Mailpit runs via Docker:
```bash
docker run -d -p 1025:1025 -p 8025:8025 axllent/mailpit
```
Web UI at `http://localhost:8025`. Add to `.env`:
```
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_FROM=noreply@reminder.local
FRONTEND_URL=http://localhost:5173
```

---

## 4. Frontend Pages and Routes

### New routes in `App.tsx`

```
/register            → RegisterPage    (public)
/forgot-password     → ForgotPasswordPage  (public)
/reset-password/:token → ResetPasswordPage  (public)
/settings            → SettingsPage    (requireAuth)
```

### Shared component: `frontend/src/components/PasswordStrengthBar.tsx`

Accepts `password: string`. Runs zxcvbn client-side, renders a colored bar: score 0–1 red, 2 orange, 3 yellow-green, 4 green. Reused on Register, ResetPassword, and the Password section of Settings.

### `/register` — `frontend/src/pages/Register.tsx`

Fields: username, email, password (with `PasswordStrengthBar`). Submit calls `api.register()`. On success, redirects to `/`. "Already have an account? Log in" link.

### `/forgot-password` — `frontend/src/pages/ForgotPassword.tsx`

Single email field. On submit, calls `api.forgotPassword()`. Always shows: "If that address is registered, you'll receive a reset link shortly." Accepts `?error=expired` and `?error=invalid` query params from reset page redirects and displays a contextual banner above the form.

### `/reset-password/:token` — `frontend/src/pages/ResetPassword.tsx`

Fields: new password (with `PasswordStrengthBar`) + confirm password. Calls `api.resetPassword(token, password)`. On success, redirects to `/login`. On 410/404, redirects to `/forgot-password?error=expired` or `?error=invalid`.

### `/settings` — `frontend/src/pages/Settings.tsx`

Three stacked sections on a single page, each an independent `<form>`:

1. **Identity** — username + email fields, current password field. Calls `PATCH /api/account/identity`. Shows current values as defaults.
2. **Password** — current password, new password (strength bar), confirm new password. Calls `PATCH /api/account/password`.
3. **Delete Account** — red "Delete Account" button that expands an inline confirmation: current password field + "Type DELETE to confirm" text input. Calls `DELETE /api/account`. On success, redirects to `/login`.

Settings link added to Dashboard header (gear icon or "Settings" text button).

### Login page updates

- Accept `usernameOrEmail` in the form field (label changes to "Username or Email").
- Add "Forgot password?" link below the password field → `/forgot-password`.

### New API client methods (`frontend/src/api.ts`)

```typescript
register(data: { username: string; email: string; password: string }): Promise<{ id: string; username: string; email: string }>
forgotPassword(email: string): Promise<void>
resetPassword(token: string, password: string): Promise<void>
getAccount(): Promise<{ id: string; username: string; email: string }>
updateIdentity(data: { username: string; email: string; currentPassword: string }): Promise<{ id: string; username: string; email: string }>
updatePassword(data: { currentPassword: string; newPassword: string }): Promise<void>
deleteAccount(currentPassword: string): Promise<void>
```

---

## 5. Error Handling

### Backend error codes

| Scenario | Status | Body |
|----------|--------|------|
| Duplicate username | 409 | `{ error: 'username_taken' }` |
| Duplicate email | 409 | `{ error: 'email_taken' }` |
| Invalid credentials (login) | 401 | `{ error: 'Invalid credentials' }` |
| Wrong current password | 403 | `{ error: 'Invalid current password' }` |
| Weak password | 400 | `{ error: 'Password too weak' }` |
| Invalid reset token | 404 | `{ error: 'Token not found' }` |
| Expired reset token | 410 | `{ error: 'Token expired' }` |

### Frontend error mapping

- Field-level: `username_taken` → "Username is already taken", `email_taken` → "Email is already registered"
- Banner: `Invalid credentials` → "Invalid username/email or password"
- Current password: `Invalid current password` → "Incorrect password" inline below field
- Reset token: 410 → redirect to `/forgot-password?error=expired`; 404 → redirect to `/forgot-password?error=invalid`
- Unknown errors → "Something went wrong, please try again"

---

## 6. Testing

### Backend integration tests (`backend/src/__tests__/account.test.ts`)

- `POST /api/auth/register` — happy path; duplicate username; duplicate email; weak password; missing fields
- `POST /api/auth/login` — login with username; login with email; wrong password
- `POST /api/auth/forgot-password` — always 200; valid email queues token; unknown email still 200
- `POST /api/auth/reset-password/:token` — happy path resets password; expired token 410; unknown token 404; weak password 400; token is single-use (second use 404)
- `PATCH /api/account/identity` — happy path; wrong current password; duplicate username/email
- `PATCH /api/account/password` — happy path; wrong current password; weak new password
- `DELETE /api/account` — happy path cascades all data; wrong password 403

### Frontend

Manual golden-path smoke test: register → login with email → change username → forgot password flow → reset password → log in with new password → delete account.

No automated frontend tests (existing pattern).
