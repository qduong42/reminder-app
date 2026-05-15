# Issues

---

## Open

_(none)_

---

## Resolved

### #5 — Household task card shows "Personal" instead of the household name

**Status:** Closed

#### Description

When a task is created under a household, the task card displayed it as a personal task rather than showing the household it belongs to.

#### Acceptance Criteria

**Given** I am an active member of a household and I have created a task assigned to that household,  
**When** I view the task on the Dashboard,  
**Then** the task card displays the household name alongside the due date.

#### Root Cause

`TaskCard.tsx` used `task.ownerId` as the personal/household discriminator (`task.ownerId ? 'personal' : householdName`). But every task has an `ownerId` (the creator) — household tasks too — so the check always evaluated to "personal". Fixed by switching the discriminator to `task.householdId`: `task.householdId ? (householdName ?? 'shared') : 'personal'`.

---

### #6 — Cannot switch a task between personal and a household when editing

**Status:** Closed

#### Description

The task edit form did not allow changing the household assignment of an existing task. Once a task was created as personal, it could not be moved to a household, and vice versa.

#### Acceptance Criteria

**Given** I have a personal task,  
**When** I edit the task and select a household,  
**Then** the task is reassigned to that household and the card shows the household name.

**Given** I have a household task,  
**When** I edit the task and select "Personal",  
**Then** the task is reassigned to me as a personal task and the card shows "personal".

#### Root Cause

`TaskForm.tsx` gated the Household picker behind `!task`, so it was hidden in edit mode. `PATCH /api/tasks/:id` also did not accept `householdId`. Fixed by removing the gate, threading `householdId` through `api.updateTask`, and accepting `householdId` (string or null, validated against active membership) in the backend route.

---

### #4 — Navigating directly to `/invite/:token` shows raw JSON instead of the invite page

**Status:** Closed

#### Description

When a user opens an invite link directly in the browser (e.g. `http://localhost:5173/invite/xK9mP2qR4nJw`), they see a raw JSON response (`{ householdName, expiresAt }`) instead of the `InvitePage` UI.

#### Steps to Reproduce

1. Generate an invite link from the Households page.
2. Open the link directly in a browser tab.
3. Observe: the browser displays raw JSON, not the invite page.

#### Expected Behaviour

The browser renders the `InvitePage` component, showing the household name, expiry, and a "Join Household" button.

#### Acceptance Criteria

**Given** I have a valid invite link,  
**When** I navigate to `/invite/:token` in the browser,  
**Then** I see the invite page UI — not raw JSON.

#### Root Cause

Vite proxy `/invite` intercepted direct browser navigation. Fixed by prefixing all backend routes with `/api` and updating the proxy to a single `/api` rule.

---

### #3 — Household picker in New Task form shows no households

**Status:** Closed

#### Description

When creating a new task, the Household dropdown only shows "Personal task" — no households appear as options, even when the user is an active member of one or more households.

#### Steps to Reproduce

1. Log in as a user who is an active member of at least one household.
2. On the Dashboard, click **+ New Task**.
3. Open the **Household** dropdown.
4. Observe: only "Personal task" is listed; no household options are shown.

#### Expected Behaviour

The dropdown lists all households the user is an active member of, in addition to the "Personal task" option.

#### Acceptance Criteria

**Given** I am logged in and an active member of a household,  
**When** I open the New Task form and click the Household dropdown,  
**Then** I see "Personal task" and each of my active households as selectable options.

#### Root Cause

`/households` was not listed in the Vite dev proxy config (`vite.config.ts`), so the browser request never reached the backend. Fixed by adding `/households` and `/invite` to the proxy.

---

### #2 — Clicking "Households" on the Dashboard redirects to login

**Status:** Closed

#### Description

When a logged-in user is on the Dashboard and clicks the "Households" button, they are unexpectedly redirected to the login screen instead of seeing the Households page.

#### Steps to Reproduce

1. Log in as any user.
2. On the Dashboard, click the **Households** button (top-right area).
3. Observe: browser navigates to `/login` instead of `/households`.

#### Expected Behaviour

The user is taken to `/households` and sees the Households page (create household, list, manage members).

#### Acceptance Criteria

**Given** I am logged in and on the Dashboard,  
**When** I click the Households button,  
**Then** I am taken to `/households` and the Households page loads without error.

#### Root Cause

`/households` and `/invite` were missing from the Vite dev proxy config (`vite.config.ts`). Requests to these routes were not forwarded to the backend, causing `api.getHouseholds()` to fail, which triggered the redirect to login. Fixed by adding both routes to the proxy.

---

### #1 — Natural interval input on task creation

**Status:** Closed

#### Description

The task creation form currently requires a raw number of hours (e.g. `24`). Users should be able to type human-friendly shorthand instead.

Supported formats:
- `2h` → 2 hours
- `2d` → 2 days (48 hours)
- `1m` → 1 month (720 hours, i.e. 30 days)

No minute-level granularity (e.g. `30min`, `45m` meaning minutes) — minimum unit is hours.

#### Acceptance Criteria

**Given** I am on the New Task form and I focus the interval field,  
**When** I type `2h`,  
**Then** the field is accepted and the task is created with `intervalHours = 2`.

**Given** I am on the New Task form,  
**When** I type `2d`,  
**Then** the field is accepted and the task is created with `intervalHours = 48`.

**Given** I am on the New Task form,  
**When** I type `1m`,  
**Then** the field is accepted and the task is created with `intervalHours = 720`.

**Given** I am on the New Task form,  
**When** I type a bare number (e.g. `24`),  
**Then** it is treated as hours and accepted (backwards-compatible).

**Given** I am on the New Task form,  
**When** I type an invalid string (e.g. `abc`, `0h`, `-1d`, empty),  
**Then** the field shows a validation error and the form cannot be submitted.

**Given** I am on the New Task form,  
**When** I type a minute-level shorthand (e.g. `30min`),  
**Then** the field shows a validation error — minute-level intervals are not supported.

#### Notes

- Parsing happens client-side in `TaskForm.tsx` before the value is sent to the API.
- The API continues to receive `intervalHours` as a plain `number` — no backend changes needed.
- The `m` suffix unambiguously means **months** (not minutes) given the no-minutes constraint.
