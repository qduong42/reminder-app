# Household & Invite System Design

## Goal

Allow users to create households, invite others via a single-use time-limited link, and scope tasks to a household. Users can sign up without a household and belong to multiple households simultaneously.

## Architecture

Three new tables (`households`, `household_members`, `invite_tokens`) plus a nullable `household_id` column on `tasks`. Registration remains free-standing — no invite required. Invite links create a pending membership that any active member can accept or reject.

## Tech Stack

Existing: Express + TypeScript, Drizzle ORM, PostgreSQL 16, React 18 + Vite 5.

---

## Data Model

### New tables

```sql
households
  id            uuid PK DEFAULT gen_random_uuid()
  name          text NOT NULL
  created_at    timestamptz DEFAULT now()

household_members
  id             uuid PK DEFAULT gen_random_uuid()
  household_id   uuid FK → households (ON DELETE CASCADE)
  user_id        uuid FK → users (ON DELETE CASCADE)
  status         text NOT NULL  -- 'pending' | 'active'
  invited_by_id  uuid FK → users (ON DELETE SET NULL)
  created_at     timestamptz DEFAULT now()
  UNIQUE (household_id, user_id)

invite_tokens
  id             uuid PK DEFAULT gen_random_uuid()
  token          text NOT NULL UNIQUE  -- 12-char alphanumeric, cryptographically random
  household_id   uuid FK → households (ON DELETE CASCADE)
  created_by_id  uuid FK → users (ON DELETE SET NULL)
  expires_at     timestamptz NOT NULL  -- created_at + 24h
  -- no used_at: tokens are hard-deleted on use (see ADR 0001)
```

### Modified tables

```sql
tasks
  + household_id  uuid FK → households (ON DELETE SET NULL)  -- nullable; NULL = personal task
```

---

## API

### Households

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/households` | required | Create household; creator becomes active member |
| GET | `/households` | required | List households the caller belongs to (any status) |
| DELETE | `/households/:id` | active member | Delete household and all its data |
| GET | `/households/:id/members` | active member | List all members including pending |
| POST | `/households/:id/invites` | active member | Generate invite token; returns full URL |
| POST | `/households/:id/members/:userId/accept` | active member | Accept a pending member |
| DELETE | `/households/:id/members/:userId` | active member | Reject pending or remove active member; if caller is last active member, household is auto-deleted (see ADR 0002) |

### Invite flow (public entry point)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/invite/:token` | none | Validate token; return `{ householdName, expiresAt }` |
| POST | `/invite/:token/join` | required | Join household as pending member; token is deleted |

### Tasks (updated)

- `GET /tasks` — Task Feed: all personal tasks owned by caller + all household tasks from households where caller is an active member
- `GET /tasks?scope=personal` — personal tasks only
- `GET /tasks?householdId=<id>` — one household's tasks (caller must be active member)
- `POST /tasks` — body optionally includes `householdId`; if omitted, task is personal
- All other task endpoints unchanged

---

## Invite Flow (step by step)

1. User A (active member) calls `POST /households/:id/invites` → receives `https://app/invite/xK9mP2qR4nJw`
2. User A shares the link
3. User B visits the URL → frontend calls `GET /invite/:token` → shows household name and expiry
4. If User B is not logged in: frontend redirects to login/register, preserving `/invite/xK9mP2qR4nJw` as the return URL. After auth, user is redirected back automatically.
5. Frontend calls `POST /invite/:token/join` → User B added as `pending` member; token row is deleted
6. Any active member of the household sees User B under "Pending Members"
7. Active member calls `POST /households/:id/members/:userId/accept` → status changes to `active`

---

## Authorization rules

| Action | Pending Member | Active Member | Non-member |
|--------|---------------|---------------|------------|
| Personal tasks (own) | ✅ | ✅ | ✅ (own tasks) |
| Household tasks | ❌ | ✅ | ❌ |
| List household members | ❌ | ✅ | ❌ |
| Generate invite token | ❌ | ✅ | ❌ |
| Accept/remove members | ❌ | ✅ | ❌ |
| Complete a household task | ❌ | ✅ | ❌ |

---

## Push Notifications

- **Household Task** deadline → notify all active members of its household
- **Personal Task** deadline → notify its owner only
- Pending members never receive household task notifications
- `notifier.ts` must look up active membership before sending

---

## Error Handling

| Scenario | HTTP status |
|----------|-------------|
| Token not found | 404 |
| Token expired | 410 Gone |
| Caller already a member (any status) | 409 Conflict |
| Caller not an active member of household | 403 Forbidden |
| Household not found | 404 |

---

## Testing

**Unit tests**
- `generateToken()` — 12-char output, alphanumeric only, no collisions across 1000 calls
- `isExpired(token)` — returns true 1ms past `expires_at`, false 1ms before

**Integration tests**
- Full happy path: create household → generate invite → join → accept
- Expired token rejected (410) and deleted
- Duplicate join rejected (409)
- Non-member / pending member cannot access household routes (403)
- Pending member can still create and read their own personal tasks
- Last active member self-removal deletes the household
- Household task notifications go only to active members
- Existing task tests still pass (householdId is additive; null = personal, visible only to owner)
