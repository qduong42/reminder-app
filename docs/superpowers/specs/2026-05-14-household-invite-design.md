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
  used_at        timestamptz  -- NULL until consumed
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
| GET | `/households/:id/members` | active member | List all members including pending |
| POST | `/households/:id/invites` | active member | Generate invite token; returns full URL |
| POST | `/households/:id/members/:userId/accept` | active member | Accept a pending member |
| DELETE | `/households/:id/members/:userId` | active member | Reject pending or remove active member |

### Invite flow (public entry point)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/invite/:token` | none | Validate token; return `{ householdName, expiresAt }` |
| POST | `/invite/:token/join` | required | Join household as pending member |

### Tasks (updated)

- `GET /tasks?householdId=<id>` — filter by household (omit for personal tasks)
- `POST /tasks` — body optionally includes `householdId`
- All other task endpoints unchanged

---

## Invite Flow (step by step)

1. User A (active member) calls `POST /households/:id/invites` → receives `https://app/invite/xK9mP2qR4nJw`
2. User A shares the link
3. User B visits the URL → frontend calls `GET /invite/:token` → shows household name and expiry
4. User B logs in or registers (existing auth flow, unchanged)
5. Frontend calls `POST /invite/:token/join` → User B added as `pending` member; token marked `used_at = now()`
6. Any active member of the household sees User B under "Pending Members"
7. Active member calls `POST /households/:id/members/:userId/accept` → status changes to `active`

---

## Error Handling

| Scenario | HTTP status |
|----------|-------------|
| Token not found | 404 |
| Token expired or already used | 410 Gone |
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
- Expired token rejected (410)
- Already-used token rejected (410)
- Duplicate join rejected (409)
- Non-member cannot list members (403)
- Non-member cannot accept pending user (403)
- Existing task tests still pass (householdId is additive; null = personal)
