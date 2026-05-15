# Architecture Deepening Candidates

Surfaced via `/improve-codebase-architecture` on 2026-05-15. Each survives the deletion test — removing the proposed module would scatter complexity, not just relocate it. Vocabulary follows LANGUAGE.md (module, interface, depth, seam, adapter, leverage, locality); domain terms follow CONTEXT.md.

---

## 1. User lifecycle module (deepening)

- **Files**: `backend/src/routes/account.ts` (DELETE `/`, 7-step cascade inline in the handler, ~48 lines inside a transaction).
- **Problem**: The route mixes HTTP transport (read currentPassword, return 204) with the *policy* of "delete a User" — cascade order, which Households auto-delete (last Active Member rule, per ADR-0002), which orphans to clean. The seam is at the wrong place: every future caller (admin tool, scheduled cleanup, test) would re-derive the cascade.
- **Solution**: Pull the cascade behind a `deleteUser(userId, tx)` module. Route becomes ~5 lines: parse, verify password, call `deleteUser`, 204.
- **Benefits**: Locality — the "what does it mean to delete a User" rule (including the ADR-0002 auto-delete) sits in one place. Leverage — the same module can serve any future trigger. Tests target the policy directly rather than going through HTTP + supertest.

---

## 2. Validation policy module (deepening)

- **Files**: `backend/src/routes/auth.ts` (POST `/register`, POST `/reset-password/:token`) and `backend/src/routes/account.ts` (PATCH `/identity`, PATCH `/password`).
- **Problem**: Username regex (`/^[a-zA-Z0-9_-]{3,30}$/`), email regex, password rules (length + `zxcvbn` score ≥ 2) are duplicated verbatim. CONTEXT.md *names* these as Password Policy and the identifying shape of Username/Email — they are domain rules, but they live nowhere as a module.
- **Solution**: `backend/src/policy/identity.ts` with `validateUsername(s)`, `validateEmail(s)`, `validatePassword(s)` each returning `{ ok: true } | { ok: false; reason }`. Routes call once and translate to HTTP status.
- **Benefits**: Locality — when the policy shifts (e.g. raise zxcvbn threshold), one edit. Leverage — frontend `PasswordStrengthBar` already runs zxcvbn; the rule is now reusable and the labels can come from the same module. Tests against the policy are pure, not HTTP-driven.

---

## 3. Active-member access seam (deepening via adapter)

- **Files**: `backend/src/utils/membership.ts` (the `isActiveMember` query), all of `backend/src/routes/tasks.ts` and `backend/src/routes/households.ts` (6+ call sites each writing `if (!(await isActiveMember(...))) return 403`).
- **Problem**: `isActiveMember` is deep enough as a query. What's shallow is the *HTTP boilerplate around it*. Every route hand-rolls the same 403 check. The seam at the route layer is missing — there is no `requireActiveHouseholdMember(':householdId')` adapter.
- **Solution**: Middleware adapter that reads a route param, runs `isActiveMember`, attaches the verified household to the request, or returns 403. Routes drop their guards.
- **Benefits**: Locality — the access decision lives in one place; future auditing/logging hooks attach there. Leverage — two adapters already plausible (active member required vs. pending-or-active for the join flow), so the seam is real, not hypothetical.

---

## 4. Notification targeting module (deepening)

- **Files**: `backend/src/scheduler.ts` (passes `ownerId` and `householdId` separately to the notifier), `backend/src/notifier.ts` (re-queries members to decide recipients).
- **Problem**: CONTEXT.md states the rule precisely — "A Household Task deadline notifies all Active Members of its household; a Personal Task notifies only its owner; Pending Members never receive household task notifications." That rule is currently *implicit* inside the notifier, intermingled with push delivery. There's no place named for it.
- **Solution**: `getNotificationTargets(task): Promise<UserId[]>` as its own module. The notifier becomes "deliver to these targets" and stops carrying the domain rule.
- **Benefits**: Locality — Pending Member exclusion sits in one named place rather than being an accident of a query. Leverage — same targeting is reusable for any future delivery channel (email digest, in-app banner). Testable without push infrastructure.

---

## 5. API error-to-field mapping (locality)

- **Files**: `frontend/src/pages/Register.tsx`, `ResetPassword.tsx`, `Settings.tsx`, `ForgotPassword.tsx`. Each form has its own block translating `ApiError.status` + `body.error` into a field-level message or general banner.
- **Problem**: The mapping vocabulary (`'username_taken'` → "Username is already taken", `410` → redirect-expired) is duplicated. The backend's error shape (`{ error: 'username_taken' }`) is the *interface*, but every form re-implements decoding it.
- **Solution**: `frontend/src/utils/apiErrors.ts` exposing something like `decodeApiError(err): { field?: 'username'|'email'|'password'|'currentPassword'; message: string; redirect?: string }`. Forms call once, set state from the result.
- **Benefits**: Locality — change a backend error string in one place, update one frontend module. Leverage — adding a new form (e.g. an admin invite form) reuses the decoder. Tests target the decoder directly; forms stay declarative.

---

## Skipped

- **Frontend `api.ts` grouping into sub-modules** — cosmetic; `apiFetch` is already the deep part, the wrappers are intentionally thin.
- **Global Express error-handler middleware** — useful hygiene, but not a deepening per se.

## Documented drift (not architecture)

CONTEXT.md still says "Profile Updates … require the current password" — that requirement was removed during implementation. Worth updating CONTEXT.md or recording an ADR for the change.
