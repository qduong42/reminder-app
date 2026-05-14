# Issues

---

## #1 — Natural interval input on task creation

**Status:** Closed

### Description

The task creation form currently requires a raw number of hours (e.g. `24`). Users should be able to type human-friendly shorthand instead.

Supported formats:
- `2h` → 2 hours
- `2d` → 2 days (48 hours)
- `1m` → 1 month (720 hours, i.e. 30 days)

No minute-level granularity (e.g. `30min`, `45m` meaning minutes) — minimum unit is hours.

### Acceptance Criteria

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

### Notes

- Parsing happens client-side in `TaskForm.tsx` before the value is sent to the API.
- The API continues to receive `intervalHours` as a plain `number` — no backend changes needed.
- The `m` suffix unambiguously means **months** (not minutes) given the no-minutes constraint.
