# Household & Invite System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add households, invite links, and household-scoped tasks to the recurring task tracker.

**Architecture:** Three new DB tables (`households`, `household_members`, `invite_tokens`) plus a nullable `household_id` on `tasks`. Organized as vertical slices — each task delivers a working, testable feature end-to-end from DB through backend to frontend.

**Tech Stack:** Express + TypeScript, Drizzle ORM 0.39, PostgreSQL 16, React 18 + Vite 5, node-schedule, web-push.

---

## File Map

**Create (backend):**
- `backend/src/utils/token.ts` — `generateToken()` utility
- `backend/src/routes/households.ts` — household + member + invite-generation routes
- `backend/src/routes/invite.ts` — public invite routes
- `backend/src/__tests__/token.test.ts`
- `backend/src/__tests__/households.test.ts`
- `backend/drizzle/0001_household_invite.sql`

**Modify (backend):**
- `backend/src/db/schema.ts`
- `backend/src/app.ts`
- `backend/src/routes/tasks.ts`
- `backend/src/notifier.ts`
- `backend/src/scheduler.ts`

**Create (frontend):**
- `frontend/src/pages/InvitePage.tsx`
- `frontend/src/pages/HouseholdManager.tsx`

**Modify (frontend):**
- `frontend/src/api.ts`
- `frontend/src/App.tsx`
- `frontend/src/pages/Login.tsx`
- `frontend/src/pages/Dashboard.tsx`
- `frontend/src/components/TaskForm.tsx`

---

### Task 1: Schema + Migration (shared foundation)

**Files:**
- Modify: `backend/src/db/schema.ts`
- Create: `backend/drizzle/0001_household_invite.sql`

- [ ] **Step 1: Replace `backend/src/db/schema.ts`**

```typescript
import { pgTable, uuid, text, doublePrecision, timestamp, jsonb, unique } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  pushSubscription: jsonb('push_subscription'),
});

export const households = pgTable('households', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const householdMembers = pgTable('household_members', {
  id: uuid('id').defaultRandom().primaryKey(),
  householdId: uuid('household_id').references(() => households.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  status: text('status').notNull(), // 'pending' | 'active'
  invitedById: uuid('invited_by_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique('household_members_household_user_unique').on(table.householdId, table.userId),
]);

export const inviteTokens = pgTable('invite_tokens', {
  id: uuid('id').defaultRandom().primaryKey(),
  token: text('token').notNull().unique(),
  householdId: uuid('household_id').references(() => households.id, { onDelete: 'cascade' }).notNull(),
  createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});

export const tasks = pgTable('tasks', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  intervalHours: doublePrecision('interval_hours').notNull(),
  ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'set null' }),
  householdId: uuid('household_id').references(() => households.id, { onDelete: 'set null' }),
  nextDeadline: timestamp('next_deadline', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const completions = pgTable('completions', {
  id: uuid('id').defaultRandom().primaryKey(),
  taskId: uuid('task_id').references(() => tasks.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }).notNull().defaultNow(),
});
```

- [ ] **Step 2: Create `backend/drizzle/0001_household_invite.sql`**

```sql
CREATE TABLE IF NOT EXISTS "households" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "household_members" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "household_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "status" text NOT NULL,
  "invited_by_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "household_members_household_user_unique" UNIQUE("household_id","user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "invite_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "token" text NOT NULL,
  "household_id" uuid NOT NULL,
  "created_by_id" uuid,
  "expires_at" timestamp with time zone NOT NULL,
  CONSTRAINT "invite_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "household_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'households_members_household_id_fk') THEN
    ALTER TABLE "household_members" ADD CONSTRAINT "households_members_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE cascade;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'household_members_user_id_fk') THEN
    ALTER TABLE "household_members" ADD CONSTRAINT "household_members_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'household_members_invited_by_id_fk') THEN
    ALTER TABLE "household_members" ADD CONSTRAINT "household_members_invited_by_id_fk" FOREIGN KEY ("invited_by_id") REFERENCES "users"("id") ON DELETE set null;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invite_tokens_household_id_fk') THEN
    ALTER TABLE "invite_tokens" ADD CONSTRAINT "invite_tokens_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE cascade;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invite_tokens_created_by_id_fk') THEN
    ALTER TABLE "invite_tokens" ADD CONSTRAINT "invite_tokens_created_by_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE set null;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tasks_household_id_households_id_fk') THEN
    ALTER TABLE "tasks" ADD CONSTRAINT "tasks_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE set null;
  END IF;
END $$;
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd backend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add backend/src/db/schema.ts backend/drizzle/0001_household_invite.sql
git commit -m "feat: add households, household_members, invite_tokens schema and migration"
```

---

### Task 2: Vertical Slice — Create & Browse Households

**Delivers:** Users can create a household, see a list of their households, and navigate to a Households page from the dashboard.

**Files:**
- Create: `backend/src/routes/households.ts` (POST + GET only)
- Modify: `backend/src/app.ts`
- Modify: `frontend/src/api.ts` (add Household type + createHousehold + getHouseholds)
- Create: `frontend/src/pages/HouseholdManager.tsx` (create + list only)
- Modify: `frontend/src/App.tsx` (add /households route)
- Modify: `frontend/src/pages/Dashboard.tsx` (add Households button)
- Create: `backend/src/__tests__/households.test.ts`

- [ ] **Step 1: Write the failing backend tests**

Create `backend/src/__tests__/households.test.ts`:

```typescript
import 'dotenv/config';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { eq, and } from 'drizzle-orm';
import { createApp } from '../app';
import { db } from '../db';
import { users, households, householdMembers, inviteTokens } from '../db/schema';
import { generateToken } from '../utils/token';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U';
process.env.VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || 'UUxI4O8-HoKU6B14FhTXLRC0yUsX0kDgOjNT3f_Oqp8';
process.env.VAPID_EMAIL = process.env.VAPID_EMAIL || 'test@example.com';
process.env.FRONTEND_URL = 'http://localhost:5173';

const app = createApp();

let userAId: string;
let userBId: string;
let cookieA: string;
let cookieB: string;

beforeAll(async () => {
  await db.delete(inviteTokens);
  await db.delete(householdMembers);
  await db.delete(households);
  await db.delete(users).where(eq(users.name, '_hh_user_a_'));
  await db.delete(users).where(eq(users.name, '_hh_user_b_'));

  const hash = await bcrypt.hash('pass', 10);
  const [a] = await db.insert(users).values({ name: '_hh_user_a_', passwordHash: hash }).returning();
  const [b] = await db.insert(users).values({ name: '_hh_user_b_', passwordHash: hash }).returning();
  userAId = a.id;
  userBId = b.id;

  const resA = await request(app).post('/auth/login').send({ name: '_hh_user_a_', password: 'pass' });
  cookieA = (resA.headers['set-cookie'] as unknown as string[])[0];
  const resB = await request(app).post('/auth/login').send({ name: '_hh_user_b_', password: 'pass' });
  cookieB = (resB.headers['set-cookie'] as unknown as string[])[0];
});

afterAll(async () => {
  await db.delete(inviteTokens);
  await db.delete(householdMembers);
  await db.delete(households);
  await db.delete(users).where(eq(users.name, '_hh_user_a_'));
  await db.delete(users).where(eq(users.name, '_hh_user_b_'));
});

describe('POST /households', () => {
  it('creates a household and adds creator as active member', async () => {
    const res = await request(app)
      .post('/households')
      .set('Cookie', cookieA)
      .send({ name: 'Test Household' })
      .expect(201);

    expect(res.body.name).toBe('Test Household');
    expect(res.body.id).toBeDefined();

    const [member] = await db.select().from(householdMembers)
      .where(and(eq(householdMembers.householdId, res.body.id), eq(householdMembers.userId, userAId)));
    expect(member.status).toBe('active');

    await db.delete(householdMembers).where(eq(householdMembers.householdId, res.body.id));
    await db.delete(households).where(eq(households.id, res.body.id));
  });

  it('returns 400 for empty name', async () => {
    await request(app).post('/households').set('Cookie', cookieA).send({ name: '' }).expect(400);
  });
});

describe('GET /households', () => {
  it('returns only households the caller belongs to', async () => {
    const [hh] = await db.insert(households).values({ name: 'My House' }).returning();
    await db.insert(householdMembers).values({ householdId: hh.id, userId: userAId, status: 'active' });

    const resA = await request(app).get('/households').set('Cookie', cookieA).expect(200);
    expect(resA.body.some((h: { id: string }) => h.id === hh.id)).toBe(true);

    const resB = await request(app).get('/households').set('Cookie', cookieB).expect(200);
    expect(resB.body.some((h: { id: string }) => h.id === hh.id)).toBe(false);

    await db.delete(householdMembers).where(eq(householdMembers.householdId, hh.id));
    await db.delete(households).where(eq(households.id, hh.id));
  });
});

describe('GET /households/:id/members', () => {
  it('returns 403 for non-members', async () => {
    const [hh] = await db.insert(households).values({ name: 'Private' }).returning();
    await db.insert(householdMembers).values({ householdId: hh.id, userId: userAId, status: 'active' });

    await request(app).get(`/households/${hh.id}/members`).set('Cookie', cookieB).expect(403);

    await db.delete(householdMembers).where(eq(householdMembers.householdId, hh.id));
    await db.delete(households).where(eq(households.id, hh.id));
  });

  it('returns all members including pending', async () => {
    const [hh] = await db.insert(households).values({ name: 'WithPending' }).returning();
    await db.insert(householdMembers).values([
      { householdId: hh.id, userId: userAId, status: 'active' },
      { householdId: hh.id, userId: userBId, status: 'pending' },
    ]);

    const res = await request(app).get(`/households/${hh.id}/members`).set('Cookie', cookieA).expect(200);
    expect(res.body).toHaveLength(2);
    expect(res.body.some((m: { status: string }) => m.status === 'pending')).toBe(true);

    await db.delete(householdMembers).where(eq(householdMembers.householdId, hh.id));
    await db.delete(households).where(eq(households.id, hh.id));
  });
});

describe('POST /households/:id/members/:userId/accept', () => {
  it('sets pending member to active', async () => {
    const [hh] = await db.insert(households).values({ name: 'AcceptHouse' }).returning();
    await db.insert(householdMembers).values([
      { householdId: hh.id, userId: userAId, status: 'active' },
      { householdId: hh.id, userId: userBId, status: 'pending' },
    ]);

    await request(app)
      .post(`/households/${hh.id}/members/${userBId}/accept`)
      .set('Cookie', cookieA)
      .expect(200);

    const [member] = await db.select().from(householdMembers)
      .where(and(eq(householdMembers.householdId, hh.id), eq(householdMembers.userId, userBId)));
    expect(member.status).toBe('active');

    await db.delete(householdMembers).where(eq(householdMembers.householdId, hh.id));
    await db.delete(households).where(eq(households.id, hh.id));
  });
});

describe('DELETE /households/:id/members/:userId', () => {
  it('removes a member', async () => {
    const [hh] = await db.insert(households).values({ name: 'RemoveHouse' }).returning();
    await db.insert(householdMembers).values([
      { householdId: hh.id, userId: userAId, status: 'active' },
      { householdId: hh.id, userId: userBId, status: 'active' },
    ]);

    await request(app)
      .delete(`/households/${hh.id}/members/${userBId}`)
      .set('Cookie', cookieA)
      .expect(204);

    const members = await db.select().from(householdMembers).where(eq(householdMembers.householdId, hh.id));
    expect(members).toHaveLength(1);

    await db.delete(householdMembers).where(eq(householdMembers.householdId, hh.id));
    await db.delete(households).where(eq(households.id, hh.id));
  });

  it('auto-deletes household when last active member removes themselves', async () => {
    const [hh] = await db.insert(households).values({ name: 'LastMember' }).returning();
    await db.insert(householdMembers).values({ householdId: hh.id, userId: userAId, status: 'active' });

    await request(app)
      .delete(`/households/${hh.id}/members/${userAId}`)
      .set('Cookie', cookieA)
      .expect(204);

    const remaining = await db.select().from(households).where(eq(households.id, hh.id));
    expect(remaining).toHaveLength(0);
  });
});

describe('Invite flow', () => {
  it('full happy path: generate → GET token info → join → accept', async () => {
    const [hh] = await db.insert(households).values({ name: 'InviteHouse' }).returning();
    await db.insert(householdMembers).values({ householdId: hh.id, userId: userAId, status: 'active' });

    const inviteRes = await request(app)
      .post(`/households/${hh.id}/invites`)
      .set('Cookie', cookieA)
      .expect(201);
    const { url } = inviteRes.body as { url: string };
    const token = url.split('/invite/')[1];

    const infoRes = await request(app).get(`/invite/${token}`).expect(200);
    expect(infoRes.body.householdName).toBe('InviteHouse');
    expect(infoRes.body.expiresAt).toBeDefined();

    await request(app).post(`/invite/${token}/join`).set('Cookie', cookieB).expect(200);

    const [member] = await db.select().from(householdMembers)
      .where(and(eq(householdMembers.householdId, hh.id), eq(householdMembers.userId, userBId)));
    expect(member.status).toBe('pending');

    const tokenRows = await db.select().from(inviteTokens).where(eq(inviteTokens.token, token));
    expect(tokenRows).toHaveLength(0);

    await request(app)
      .post(`/households/${hh.id}/members/${userBId}/accept`)
      .set('Cookie', cookieA)
      .expect(200);

    const [accepted] = await db.select().from(householdMembers)
      .where(and(eq(householdMembers.householdId, hh.id), eq(householdMembers.userId, userBId)));
    expect(accepted.status).toBe('active');

    await db.delete(householdMembers).where(eq(householdMembers.householdId, hh.id));
    await db.delete(households).where(eq(households.id, hh.id));
  });

  it('returns 410 for expired token', async () => {
    const [hh] = await db.insert(households).values({ name: 'ExpiredHouse' }).returning();
    await db.insert(householdMembers).values({ householdId: hh.id, userId: userAId, status: 'active' });

    const expiredToken = generateToken();
    await db.insert(inviteTokens).values({
      token: expiredToken,
      householdId: hh.id,
      createdById: userAId,
      expiresAt: new Date(Date.now() - 1000),
    });

    await request(app).get(`/invite/${expiredToken}`).expect(410);

    await db.delete(householdMembers).where(eq(householdMembers.householdId, hh.id));
    await db.delete(households).where(eq(households.id, hh.id));
  });

  it('returns 409 when user is already a member', async () => {
    const [hh] = await db.insert(households).values({ name: 'AlreadyMember' }).returning();
    await db.insert(householdMembers).values([
      { householdId: hh.id, userId: userAId, status: 'active' },
      { householdId: hh.id, userId: userBId, status: 'active' },
    ]);

    const validToken = generateToken();
    await db.insert(inviteTokens).values({
      token: validToken,
      householdId: hh.id,
      createdById: userAId,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    await request(app).post(`/invite/${validToken}/join`).set('Cookie', cookieB).expect(409);

    await db.delete(inviteTokens).where(eq(inviteTokens.token, validToken));
    await db.delete(householdMembers).where(eq(householdMembers.householdId, hh.id));
    await db.delete(households).where(eq(households.id, hh.id));
  });
});
```

- [ ] **Step 2: Create `backend/src/utils/token.ts`**

```typescript
import { randomBytes } from 'crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

export function generateToken(): string {
  const bytes = randomBytes(12);
  return Array.from(bytes, b => ALPHABET[b % ALPHABET.length]).join('');
}
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd backend && npx jest src/__tests__/households.test.ts
```

Expected: FAIL — routes not mounted.

- [ ] **Step 4: Create `backend/src/routes/households.ts`**

```typescript
import { Router } from 'express';
import { eq, and } from 'drizzle-orm';
import { db } from '../db';
import { households, householdMembers, inviteTokens, users } from '../db/schema';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { generateToken } from '../utils/token';

const router = Router();
router.use(requireAuth);

async function isActiveMember(householdId: string, userId: string): Promise<boolean> {
  const [member] = await db.select().from(householdMembers).where(
    and(
      eq(householdMembers.householdId, householdId),
      eq(householdMembers.userId, userId),
      eq(householdMembers.status, 'active'),
    ),
  );
  return !!member;
}

// POST /households
router.post('/', async (req, res) => {
  const { userId } = req as AuthRequest;
  const { name } = req.body as { name: string };
  if (typeof name !== 'string' || !name.trim()) {
    res.status(400).json({ error: 'name is required' });
    return;
  }
  const [household] = await db.insert(households).values({ name }).returning();
  await db.insert(householdMembers).values({ householdId: household.id, userId, status: 'active' });
  res.status(201).json(household);
});

// GET /households
router.get('/', async (req, res) => {
  const { userId } = req as AuthRequest;
  const rows = await db
    .select({
      id: households.id,
      name: households.name,
      createdAt: households.createdAt,
      status: householdMembers.status,
    })
    .from(householdMembers)
    .innerJoin(households, eq(householdMembers.householdId, households.id))
    .where(eq(householdMembers.userId, userId));
  res.json(rows);
});

// DELETE /households/:id
router.delete('/:id', async (req, res) => {
  const { userId } = req as AuthRequest;
  if (!(await isActiveMember(req.params.id, userId))) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  await db.delete(households).where(eq(households.id, req.params.id));
  res.status(204).send();
});

// GET /households/:id/members
router.get('/:id/members', async (req, res) => {
  const { userId } = req as AuthRequest;
  if (!(await isActiveMember(req.params.id, userId))) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  const rows = await db
    .select({
      id: householdMembers.id,
      userId: householdMembers.userId,
      name: users.name,
      status: householdMembers.status,
      invitedById: householdMembers.invitedById,
      createdAt: householdMembers.createdAt,
    })
    .from(householdMembers)
    .innerJoin(users, eq(householdMembers.userId, users.id))
    .where(eq(householdMembers.householdId, req.params.id));
  res.json(rows);
});

// POST /households/:id/invites
router.post('/:id/invites', async (req, res) => {
  const { userId } = req as AuthRequest;
  if (!(await isActiveMember(req.params.id, userId))) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  const [household] = await db.select().from(households).where(eq(households.id, req.params.id));
  if (!household) { res.status(404).json({ error: 'Household not found' }); return; }

  const token = generateToken();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await db.insert(inviteTokens).values({ token, householdId: req.params.id, createdById: userId, expiresAt });

  const base = process.env.FRONTEND_URL || 'http://localhost:5173';
  res.status(201).json({ url: `${base}/invite/${token}` });
});

// POST /households/:id/members/:targetUserId/accept
router.post('/:id/members/:targetUserId/accept', async (req, res) => {
  const { userId } = req as AuthRequest;
  if (!(await isActiveMember(req.params.id, userId))) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  const [updated] = await db
    .update(householdMembers)
    .set({ status: 'active' })
    .where(
      and(
        eq(householdMembers.householdId, req.params.id),
        eq(householdMembers.userId, req.params.targetUserId),
        eq(householdMembers.status, 'pending'),
      ),
    )
    .returning();
  if (!updated) { res.status(404).json({ error: 'Pending member not found' }); return; }
  res.json(updated);
});

// DELETE /households/:id/members/:targetUserId
router.delete('/:id/members/:targetUserId', async (req, res) => {
  const { userId } = req as AuthRequest;
  if (!(await isActiveMember(req.params.id, userId))) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  await db.delete(householdMembers).where(
    and(
      eq(householdMembers.householdId, req.params.id),
      eq(householdMembers.userId, req.params.targetUserId),
    ),
  );
  const remaining = await db.select().from(householdMembers).where(
    and(eq(householdMembers.householdId, req.params.id), eq(householdMembers.status, 'active')),
  );
  if (remaining.length === 0) {
    await db.delete(households).where(eq(households.id, req.params.id));
  }
  res.status(204).send();
});

export default router;
```

- [ ] **Step 5: Create `backend/src/routes/invite.ts`**

```typescript
import { Router } from 'express';
import { eq, and } from 'drizzle-orm';
import { db } from '../db';
import { inviteTokens, householdMembers, households } from '../db/schema';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();

// GET /invite/:token — public
router.get('/:token', async (req, res) => {
  const [row] = await db
    .select({ token: inviteTokens, householdName: households.name })
    .from(inviteTokens)
    .innerJoin(households, eq(inviteTokens.householdId, households.id))
    .where(eq(inviteTokens.token, req.params.token));

  if (!row) { res.status(404).json({ error: 'Invite not found' }); return; }

  if (row.token.expiresAt < new Date()) {
    await db.delete(inviteTokens).where(eq(inviteTokens.token, req.params.token));
    res.status(410).json({ error: 'Invite expired' });
    return;
  }

  res.json({ householdName: row.householdName, expiresAt: row.token.expiresAt.toISOString() });
});

// POST /invite/:token/join — requires auth
router.post('/:token/join', requireAuth, async (req, res) => {
  const { userId } = req as AuthRequest;

  const [row] = await db
    .select({ token: inviteTokens })
    .from(inviteTokens)
    .where(eq(inviteTokens.token, req.params.token));

  if (!row) { res.status(404).json({ error: 'Invite not found' }); return; }

  if (row.token.expiresAt < new Date()) {
    await db.delete(inviteTokens).where(eq(inviteTokens.token, req.params.token));
    res.status(410).json({ error: 'Invite expired' });
    return;
  }

  const [existing] = await db.select().from(householdMembers).where(
    and(eq(householdMembers.householdId, row.token.householdId), eq(householdMembers.userId, userId)),
  );
  if (existing) { res.status(409).json({ error: 'Already a member' }); return; }

  await db.transaction(async (tx) => {
    await tx.insert(householdMembers).values({
      householdId: row.token.householdId,
      userId,
      status: 'pending',
      invitedById: row.token.createdById,
    });
    await tx.delete(inviteTokens).where(eq(inviteTokens.token, req.params.token));
  });

  res.json({ status: 'pending' });
});

export default router;
```

- [ ] **Step 6: Mount routers in `backend/src/app.ts`**

```typescript
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import path from 'path';
import authRouter from './routes/auth';
import tasksRouter from './routes/tasks';
import pushRouter from './routes/push';
import householdsRouter from './routes/households';
import inviteRouter from './routes/invite';

export function createApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
  }));

  app.use('/auth', authRouter);
  app.use('/tasks', tasksRouter);
  app.use('/push', pushRouter);
  app.use('/households', householdsRouter);
  app.use('/invite', inviteRouter);

  if (process.env.NODE_ENV === 'production') {
    const frontendDist = path.join(__dirname, '../frontend-dist');
    app.use(express.static(frontendDist));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(frontendDist, 'index.html'));
    });
  }

  return app;
}
```

- [ ] **Step 7: Run all backend tests**

```bash
cd backend && npx jest
```

Expected: all tests PASS.

- [ ] **Step 8: Update `frontend/src/api.ts`**

Replace the file:

```typescript
export interface Task {
  id: string;
  name: string;
  intervalHours: number;
  ownerId: string | null;
  householdId: string | null;
  nextDeadline: string;
  createdAt: string;
  urgency: 'overdue' | 'due-soon' | 'on-track';
}

export interface User {
  id: string;
  name: string;
}

export interface Household {
  id: string;
  name: string;
  createdAt: string;
  status: 'pending' | 'active';
}

export interface Member {
  id: string;
  userId: string;
  name: string;
  status: 'pending' | 'active';
  invitedById: string | null;
  createdAt: string;
}

export interface InviteInfo {
  householdName: string;
  expiresAt: string;
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: 'include', ...options });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  login: (name: string, password: string, rememberMe: boolean) =>
    apiFetch<User>('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, password, rememberMe }),
    }),

  logout: () => apiFetch<void>('/auth/logout', { method: 'POST' }),

  me: () => apiFetch<User>('/auth/me'),

  getTasks: (params?: { scope?: 'personal'; householdId?: string }) => {
    const qs = params?.scope
      ? `?scope=${params.scope}`
      : params?.householdId
      ? `?householdId=${params.householdId}`
      : '';
    return apiFetch<Task[]>(`/tasks${qs}`);
  },

  createTask: (data: { name: string; intervalHours: number; householdId?: string }) =>
    apiFetch<Task>('/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  updateTask: (id: string, data: Partial<{ name: string; intervalHours: number }>) =>
    apiFetch<Task>(`/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  deleteTask: (id: string) => apiFetch<void>(`/tasks/${id}`, { method: 'DELETE' }),

  completeTask: (id: string) => apiFetch<Task>(`/tasks/${id}/complete`, { method: 'POST' }),

  subscribe: (subscription: PushSubscriptionJSON) =>
    apiFetch<void>('/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(subscription),
    }),

  getHouseholds: () => apiFetch<Household[]>('/households'),

  createHousehold: (name: string) =>
    apiFetch<Household>('/households', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    }),

  deleteHousehold: (id: string) => apiFetch<void>(`/households/${id}`, { method: 'DELETE' }),

  getMembers: (householdId: string) => apiFetch<Member[]>(`/households/${householdId}/members`),

  generateInvite: (householdId: string) =>
    apiFetch<{ url: string }>(`/households/${householdId}/invites`, { method: 'POST' }),

  acceptMember: (householdId: string, userId: string) =>
    apiFetch<Member>(`/households/${householdId}/members/${userId}/accept`, { method: 'POST' }),

  removeMember: (householdId: string, userId: string) =>
    apiFetch<void>(`/households/${householdId}/members/${userId}`, { method: 'DELETE' }),

  getInviteInfo: (token: string) => apiFetch<InviteInfo>(`/invite/${token}`),

  joinViaInvite: (token: string) =>
    apiFetch<{ status: string }>(`/invite/${token}/join`, { method: 'POST' }),
};
```

- [ ] **Step 9: Create `frontend/src/pages/HouseholdManager.tsx`**

```tsx
import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, Household, Member } from '../api';

export function HouseholdManager() {
  const navigate = useNavigate();
  const [households, setHouseholds] = useState<Household[]>([]);
  const [selected, setSelected] = useState<Household | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [newName, setNewName] = useState('');
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadHouseholds = useCallback(async () => {
    try {
      setHouseholds(await api.getHouseholds());
    } catch {
      navigate('/login');
    }
  }, [navigate]);

  useEffect(() => { loadHouseholds(); }, [loadHouseholds]);

  async function selectHousehold(h: Household) {
    if (h.status !== 'active') return;
    setSelected(h);
    setInviteUrl(null);
    setMembers(await api.getMembers(h.id));
  }

  async function handleCreate() {
    if (!newName.trim()) return;
    try {
      await api.createHousehold(newName.trim());
      setNewName('');
      await loadHouseholds();
    } catch {
      setError('Failed to create household.');
    }
  }

  async function handleGenerateInvite() {
    if (!selected) return;
    const { url } = await api.generateInvite(selected.id);
    setInviteUrl(url);
  }

  async function handleAccept(userId: string) {
    if (!selected) return;
    await api.acceptMember(selected.id, userId);
    setMembers(prev => prev.map(m => m.userId === userId ? { ...m, status: 'active' as const } : m));
  }

  async function handleRemove(userId: string) {
    if (!selected) return;
    await api.removeMember(selected.id, userId);
    await loadHouseholds();
    setSelected(null);
    setMembers([]);
  }

  async function handleDeleteHousehold() {
    if (!selected || !confirm(`Delete "${selected.name}"? This cannot be undone.`)) return;
    await api.deleteHousehold(selected.id);
    setSelected(null);
    setMembers([]);
    await loadHouseholds();
  }

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', padding: 16, fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ margin: 0 }}>Households</h1>
        <button onClick={() => navigate('/')}>← Dashboard</button>
      </div>

      {error && <p style={{ color: '#dc2626' }}>{error}</p>}

      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        <input
          value={newName}
          onChange={e => setNewName(e.target.value)}
          placeholder="New household name"
          style={{ flex: 1, padding: '6px 10px' }}
          onKeyDown={e => e.key === 'Enter' && handleCreate()}
        />
        <button onClick={handleCreate}>Create</button>
      </div>

      {households.length === 0 && <p style={{ color: '#6b7280' }}>No households yet.</p>}

      <div style={{ display: 'flex', gap: 16 }}>
        <div style={{ width: 200 }}>
          {households.map(h => (
            <div
              key={h.id}
              onClick={() => selectHousehold(h)}
              style={{
                padding: '8px 12px',
                cursor: h.status === 'active' ? 'pointer' : 'default',
                background: selected?.id === h.id ? '#e0f2fe' : 'transparent',
                borderRadius: 4,
                marginBottom: 4,
              }}
            >
              <div>{h.name}</div>
              {h.status === 'pending' && (
                <div style={{ fontSize: 11, color: '#d97706' }}>Pending approval</div>
              )}
            </div>
          ))}
        </div>

        {selected && (
          <div style={{ flex: 1 }}>
            <h2 style={{ marginTop: 0 }}>{selected.name}</h2>
            <button onClick={handleGenerateInvite} style={{ marginBottom: 12 }}>
              Generate Invite Link
            </button>
            {inviteUrl && (
              <div style={{ padding: 8, background: '#f0fdf4', borderRadius: 4, marginBottom: 12, wordBreak: 'break-all' }}>
                <strong>Invite link (24h):</strong><br />
                <a href={inviteUrl}>{inviteUrl}</a>
                <button onClick={() => navigator.clipboard.writeText(inviteUrl)} style={{ marginLeft: 8, fontSize: 12 }}>
                  Copy
                </button>
              </div>
            )}
            <h3>Members</h3>
            {members.map(m => (
              <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ flex: 1 }}>{m.name}</span>
                {m.status === 'pending' && (
                  <>
                    <span style={{ color: '#d97706', fontSize: 12 }}>Pending</span>
                    <button onClick={() => handleAccept(m.userId)} style={{ fontSize: 12 }}>Accept</button>
                  </>
                )}
                <button onClick={() => handleRemove(m.userId)} style={{ fontSize: 12, color: '#dc2626' }}>
                  Remove
                </button>
              </div>
            ))}
            <button onClick={handleDeleteHousehold} style={{ marginTop: 16, color: '#dc2626', fontSize: 12 }}>
              Delete Household
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 10: Create `frontend/src/pages/InvitePage.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api, InviteInfo } from '../api';

export function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    api.getInviteInfo(token)
      .then(setInfo)
      .catch((err: Error) => {
        if (err.message.includes('410')) setError('This invite link has expired.');
        else if (err.message.includes('404')) setError('Invite link not found.');
        else setError('Something went wrong.');
      })
      .finally(() => setLoading(false));
  }, [token]);

  async function handleJoin() {
    if (!token) return;
    try {
      await api.me();
    } catch {
      navigate(`/login?returnTo=/invite/${token}`);
      return;
    }
    try {
      await api.joinViaInvite(token);
      setJoined(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('409')) setError('You are already a member of this household.');
      else setError('Failed to join. Please try again.');
    }
  }

  if (loading) return <div style={{ padding: 32 }}>Loading...</div>;

  if (error) return (
    <div style={{ maxWidth: 400, margin: '80px auto', padding: 24, fontFamily: 'sans-serif', textAlign: 'center' }}>
      <p style={{ color: '#dc2626' }}>{error}</p>
    </div>
  );

  if (joined) return (
    <div style={{ maxWidth: 400, margin: '80px auto', padding: 24, fontFamily: 'sans-serif', textAlign: 'center' }}>
      <h2>Request sent!</h2>
      <p>You've been added as a pending member of <strong>{info?.householdName}</strong>. An active member needs to accept you.</p>
      <button onClick={() => navigate('/')}>Go to Dashboard</button>
    </div>
  );

  return (
    <div style={{ maxWidth: 400, margin: '80px auto', padding: 24, fontFamily: 'sans-serif', textAlign: 'center' }}>
      <h2>You've been invited!</h2>
      <p>Join <strong>{info?.householdName}</strong>?</p>
      <p style={{ fontSize: 12, color: '#6b7280' }}>
        Expires {info ? new Date(info.expiresAt).toLocaleString() : ''}
      </p>
      <button onClick={handleJoin} style={{ padding: '8px 24px', fontSize: 16 }}>
        Join Household
      </button>
    </div>
  );
}
```

- [ ] **Step 11: Update `frontend/src/pages/Login.tsx` — add `returnTo` redirect**

Replace `navigate('/')` in the `handleSubmit` success block with:

```typescript
const params = new URLSearchParams(window.location.search);
navigate(params.get('returnTo') || '/');
```

Full updated `Login.tsx`:

```tsx
import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';

export function Login() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.login(name, password, rememberMe);
      const params = new URLSearchParams(window.location.search);
      navigate(params.get('returnTo') || '/');
    } catch {
      setError('Invalid username or password');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 360, margin: '80px auto', padding: '0 16px', fontFamily: 'sans-serif' }}>
      <h1>Task Tracker</h1>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', marginBottom: 4 }}>Username</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            required
            autoComplete="username"
            style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }}
          />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', marginBottom: 4 }}>Password</label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }}
          />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label>
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={e => setRememberMe(e.target.checked)}
              style={{ marginRight: 8 }}
            />
            Remember me (30 days)
          </label>
        </div>
        {error && <p style={{ color: 'red', margin: '0 0 12px' }}>{error}</p>}
        <button
          type="submit"
          disabled={loading}
          style={{ width: '100%', padding: '10px', cursor: loading ? 'not-allowed' : 'pointer' }}
        >
          {loading ? 'Logging in…' : 'Log in'}
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 12: Update `frontend/src/App.tsx`**

```tsx
import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { InvitePage } from './pages/InvitePage';
import { HouseholdManager } from './pages/HouseholdManager';
import { api } from './api';

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const buf = new ArrayBuffer(raw.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < raw.length; i++) view[i] = raw.charCodeAt(i);
  return view;
}

async function registerPush(): Promise<void> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  const reg = await navigator.serviceWorker.register('/sw.js');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return;
  const existing = await reg.pushManager.getSubscription();
  const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY as string;
  if (!vapidKey) return;
  const sub = existing ?? (await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidKey),
  }));
  await api.subscribe(sub.toJSON());
}

function AppRoutes() {
  useEffect(() => { registerPush(); }, []);
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Dashboard />} />
      <Route path="/invite/:token" element={<InvitePage />} />
      <Route path="/households" element={<HouseholdManager />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
```

- [ ] **Step 13: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 14: Commit**

```bash
git add backend/src/utils/token.ts backend/src/routes/households.ts backend/src/routes/invite.ts backend/src/app.ts backend/src/__tests__/households.test.ts frontend/src/api.ts frontend/src/pages/HouseholdManager.tsx frontend/src/pages/InvitePage.tsx frontend/src/pages/Login.tsx frontend/src/App.tsx
git commit -m "feat: households, invite flow, member management — full vertical slice"
```

---

### Task 3: Vertical Slice — Household-Scoped Tasks

**Delivers:** Tasks can be created inside a household. The dashboard shows a scope selector (All Tasks / Personal / per-household). Only active household members can see, edit, delete, and complete household tasks.

**Files:**
- Modify: `backend/src/routes/tasks.ts`
- Modify: `frontend/src/pages/Dashboard.tsx`
- Modify: `frontend/src/components/TaskForm.tsx`

- [ ] **Step 1: Replace `backend/src/routes/tasks.ts`**

```typescript
import { Router } from 'express';
import { eq, and, or, isNull, inArray } from 'drizzle-orm';
import { db } from '../db';
import { tasks, completions, householdMembers } from '../db/schema';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { computeNextDeadline, getUrgency } from '../deadline';
import { scheduleTask, cancelTask } from '../scheduler';

const router = Router();
router.use(requireAuth);

function formatTask(task: typeof tasks.$inferSelect, now = new Date()) {
  return {
    ...task,
    nextDeadline: task.nextDeadline.toISOString(),
    createdAt: task.createdAt.toISOString(),
    urgency: getUrgency(task.nextDeadline, task.intervalHours, now),
  };
}

async function canAccessTask(task: typeof tasks.$inferSelect, userId: string): Promise<boolean> {
  if (task.householdId) {
    const [member] = await db.select().from(householdMembers).where(
      and(
        eq(householdMembers.householdId, task.householdId),
        eq(householdMembers.userId, userId),
        eq(householdMembers.status, 'active'),
      ),
    );
    return !!member;
  }
  return task.ownerId === userId;
}

// GET /tasks — Task Feed, ?scope=personal, or ?householdId=<id>
router.get('/', async (req, res) => {
  const { userId } = req as AuthRequest;
  const { scope, householdId } = req.query as { scope?: string; householdId?: string };
  const now = new Date();

  if (scope === 'personal') {
    const rows = await db.select().from(tasks).where(
      and(isNull(tasks.householdId), eq(tasks.ownerId, userId)),
    );
    res.json(rows.map(t => formatTask(t, now)));
    return;
  }

  if (householdId) {
    const [member] = await db.select().from(householdMembers).where(
      and(
        eq(householdMembers.householdId, householdId),
        eq(householdMembers.userId, userId),
        eq(householdMembers.status, 'active'),
      ),
    );
    if (!member) { res.status(403).json({ error: 'Forbidden' }); return; }
    const rows = await db.select().from(tasks).where(eq(tasks.householdId, householdId));
    res.json(rows.map(t => formatTask(t, now)));
    return;
  }

  // Task Feed: personal + all active households
  const activeHouseholds = await db
    .select({ householdId: householdMembers.householdId })
    .from(householdMembers)
    .where(and(eq(householdMembers.userId, userId), eq(householdMembers.status, 'active')));

  const householdIds = activeHouseholds.map(h => h.householdId);
  const personalCondition = and(isNull(tasks.householdId), eq(tasks.ownerId, userId));

  const rows = householdIds.length > 0
    ? await db.select().from(tasks).where(or(personalCondition, inArray(tasks.householdId, householdIds)))
    : await db.select().from(tasks).where(personalCondition);

  res.json(rows.map(t => formatTask(t, now)));
});

// POST /tasks
router.post('/', async (req, res) => {
  const { userId } = req as AuthRequest;
  const { name, intervalHours, householdId } = req.body as {
    name: string;
    intervalHours: number;
    householdId?: string;
  };

  if (typeof name !== 'string' || typeof intervalHours !== 'number') {
    res.status(400).json({ error: 'name (string) and intervalHours (number) are required' });
    return;
  }
  if (!name.trim()) { res.status(400).json({ error: 'name must not be empty' }); return; }
  if (intervalHours <= 0 || !isFinite(intervalHours)) {
    res.status(400).json({ error: 'intervalHours must be a positive finite number' });
    return;
  }

  if (householdId) {
    const [member] = await db.select().from(householdMembers).where(
      and(
        eq(householdMembers.householdId, householdId),
        eq(householdMembers.userId, userId),
        eq(householdMembers.status, 'active'),
      ),
    );
    if (!member) { res.status(403).json({ error: 'Forbidden' }); return; }
  }

  const now = new Date();
  const nextDeadline = computeNextDeadline(now, intervalHours);
  const [task] = await db
    .insert(tasks)
    .values({ name, intervalHours, ownerId: userId, householdId: householdId ?? null, nextDeadline })
    .returning();

  scheduleTask(task.id, task.name, task.ownerId, task.householdId, task.nextDeadline);
  res.status(201).json(formatTask(task));
});

// PATCH /tasks/:id
router.patch('/:id', async (req, res) => {
  const { userId } = req as unknown as AuthRequest;
  const [existing] = await db.select().from(tasks).where(eq(tasks.id, req.params.id));
  if (!existing) { res.status(404).json({ error: 'Not found' }); return; }
  if (!(await canAccessTask(existing, userId))) { res.status(403).json({ error: 'Forbidden' }); return; }

  const { name, intervalHours } = req.body as { name?: string; intervalHours?: number };

  if (name !== undefined && typeof name !== 'string') {
    res.status(400).json({ error: 'name must be a string' }); return;
  }
  if (intervalHours !== undefined && (typeof intervalHours !== 'number' || intervalHours <= 0 || !isFinite(intervalHours))) {
    res.status(400).json({ error: 'intervalHours must be a positive finite number' }); return;
  }

  const updates: Partial<typeof tasks.$inferInsert> = {};
  if (name !== undefined) updates.name = name;
  if (intervalHours !== undefined) updates.intervalHours = intervalHours;

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: 'No valid fields to update' }); return;
  }

  const [updated] = await db.update(tasks).set(updates).where(eq(tasks.id, req.params.id)).returning();
  scheduleTask(updated.id, updated.name, updated.ownerId, updated.householdId, updated.nextDeadline);
  res.json(formatTask(updated));
});

// DELETE /tasks/:id
router.delete('/:id', async (req, res) => {
  const { userId } = req as unknown as AuthRequest;
  const [existing] = await db.select().from(tasks).where(eq(tasks.id, req.params.id));
  if (!existing) { res.status(404).json({ error: 'Not found' }); return; }
  if (!(await canAccessTask(existing, userId))) { res.status(403).json({ error: 'Forbidden' }); return; }

  cancelTask(req.params.id);
  await db.delete(completions).where(eq(completions.taskId, req.params.id));
  await db.delete(tasks).where(eq(tasks.id, req.params.id));
  res.status(204).send();
});

// POST /tasks/:id/complete
router.post('/:id/complete', async (req, res) => {
  const { userId } = req as unknown as AuthRequest;
  const [task] = await db.select().from(tasks).where(eq(tasks.id, req.params.id));
  if (!task) { res.status(404).json({ error: 'Not found' }); return; }
  if (!(await canAccessTask(task, userId))) { res.status(403).json({ error: 'Forbidden' }); return; }

  const now = new Date();
  let updated: typeof tasks.$inferSelect;
  await db.transaction(async (tx) => {
    await tx.insert(completions).values({ taskId: task.id, userId, completedAt: now });
    const nextDeadline = computeNextDeadline(now, task.intervalHours);
    [updated!] = await tx.update(tasks).set({ nextDeadline }).where(eq(tasks.id, task.id)).returning();
  });

  scheduleTask(updated!.id, updated!.name, updated!.ownerId, updated!.householdId, updated!.nextDeadline);
  res.json(formatTask(updated!));
});

export default router;
```

- [ ] **Step 2: Run backend tests**

```bash
cd backend && npx jest
```

Expected: all tests PASS. If `complete.test.ts` fails because it uses `shared: boolean`, remove that field from the test's API calls (the test creates tasks directly via DB, so no change needed there — only API call changes matter).

- [ ] **Step 3: Update `frontend/src/pages/Dashboard.tsx`**

```tsx
import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, Task, Household } from '../api';
import { TaskCard } from '../components/TaskCard';
import { TaskForm } from '../components/TaskForm';

type UrgencyKey = 'overdue' | 'due-soon' | 'on-track';

const SECTION_LABEL: Record<UrgencyKey, string> = {
  overdue: 'Overdue',
  'due-soon': 'Due Soon',
  'on-track': 'On Track',
};

const SECTION_COLOR: Record<UrgencyKey, string> = {
  overdue: '#dc2626',
  'due-soon': '#d97706',
  'on-track': '#16a34a',
};

type Scope = 'all' | 'personal' | string;

export function Dashboard() {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [scope, setScope] = useState<Scope>('all');
  const [households, setHouseholds] = useState<Household[]>([]);

  const loadTasks = useCallback(async () => {
    try {
      if (scope === 'all') {
        setTasks(await api.getTasks());
      } else if (scope === 'personal') {
        setTasks(await api.getTasks({ scope: 'personal' }));
      } else {
        setTasks(await api.getTasks({ householdId: scope }));
      }
    } catch {
      navigate('/login');
    }
  }, [navigate, scope]);

  useEffect(() => {
    api.me().catch(() => navigate('/login'));
    api.getHouseholds()
      .then(data => setHouseholds(data.filter(h => h.status === 'active')))
      .catch(() => {});
    loadTasks();
  }, [loadTasks, navigate]);

  async function handleComplete(id: string) {
    const updated = await api.completeTask(id);
    setTasks(prev => prev.map(t => (t.id === id ? updated : t)));
  }

  async function handleDelete(id: string) {
    await api.deleteTask(id);
    setTasks(prev => prev.filter(t => t.id !== id));
  }

  async function handleLogout() {
    await api.logout();
    navigate('/login');
  }

  const groups: Record<UrgencyKey, Task[]> = {
    overdue: tasks.filter(t => t.urgency === 'overdue'),
    'due-soon': tasks.filter(t => t.urgency === 'due-soon'),
    'on-track': tasks.filter(t => t.urgency === 'on-track'),
  };

  const currentHouseholdId = scope !== 'all' && scope !== 'personal' ? scope : undefined;

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', padding: 16, fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ margin: 0 }}>Tasks</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => { setEditTask(null); setShowForm(true); }}>+ New Task</button>
          <button onClick={() => navigate('/households')}>Households</button>
          <button onClick={handleLogout}>Log out</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {(['all', 'personal'] as Scope[]).map(s => (
          <button
            key={s}
            onClick={() => setScope(s)}
            style={{ fontWeight: scope === s ? 'bold' : 'normal', textDecoration: scope === s ? 'underline' : 'none' }}
          >
            {s === 'all' ? 'All Tasks' : 'Personal'}
          </button>
        ))}
        {households.map(h => (
          <button
            key={h.id}
            onClick={() => setScope(h.id)}
            style={{ fontWeight: scope === h.id ? 'bold' : 'normal', textDecoration: scope === h.id ? 'underline' : 'none' }}
          >
            {h.name}
          </button>
        ))}
      </div>

      {tasks.length === 0 && (
        <p style={{ color: '#6b7280' }}>No tasks yet. Create one to get started.</p>
      )}

      {(['overdue', 'due-soon', 'on-track'] as UrgencyKey[]).map(group =>
        groups[group].length > 0 ? (
          <section key={group} style={{ marginBottom: 24 }}>
            <h2 style={{ color: SECTION_COLOR[group], margin: '0 0 8px', fontSize: 18 }}>
              {SECTION_LABEL[group]} ({groups[group].length})
            </h2>
            {groups[group].map(task => (
              <TaskCard
                key={task.id}
                task={task}
                onComplete={handleComplete}
                onEdit={() => { setEditTask(task); setShowForm(true); }}
                onDelete={handleDelete}
              />
            ))}
          </section>
        ) : null,
      )}

      {showForm && (
        <TaskForm
          task={editTask}
          households={households}
          defaultHouseholdId={currentHouseholdId}
          onSave={async () => { setShowForm(false); await loadTasks(); }}
          onClose={() => setShowForm(false)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Update `frontend/src/components/TaskForm.tsx`**

```tsx
import { useState, FormEvent } from 'react';
import { api, Task, Household } from '../api';
import { parseInterval } from '../utils/parseInterval';

interface Props {
  task: Task | null;
  households: Household[];
  defaultHouseholdId?: string;
  onSave: () => Promise<void>;
  onClose: () => void;
}

function formatIntervalForInput(hours: number): string {
  if (hours % 720 === 0) return `${hours / 720}m`;
  if (hours % 24 === 0) return `${hours / 24}d`;
  return `${hours}h`;
}

export function TaskForm({ task, households, defaultHouseholdId, onSave, onClose }: Props) {
  const [name, setName] = useState(task?.name ?? '');
  const [intervalInput, setIntervalInput] = useState(task ? formatIntervalForInput(task.intervalHours) : '24h');
  const [householdId, setHouseholdId] = useState<string | undefined>(
    task?.householdId ?? defaultHouseholdId ?? undefined,
  );
  const [loading, setLoading] = useState(false);
  const [intervalError, setIntervalError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const parsed = parseInterval(intervalInput);
    if (!parsed.ok) {
      setIntervalError(parsed.error);
      return;
    }
    setIntervalError('');
    setLoading(true);
    try {
      if (task) {
        await api.updateTask(task.id, { name, intervalHours: parsed.hours });
      } else {
        await api.createTask({ name, intervalHours: parsed.hours, householdId });
      }
      await onSave();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 100,
    }}>
      <div style={{ background: 'white', borderRadius: 8, padding: 24, minWidth: 340, fontFamily: 'sans-serif' }}>
        <h2 style={{ margin: '0 0 16px' }}>{task ? 'Edit Task' : 'New Task'}</h2>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', marginBottom: 4 }}>Name</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              required
              style={{ width: '100%', padding: 8, boxSizing: 'border-box' }}
            />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', marginBottom: 4 }}>Interval</label>
            <input
              type="text"
              value={intervalInput}
              onChange={e => { setIntervalInput(e.target.value); setIntervalError(''); }}
              placeholder="e.g. 2h, 3d, 1m"
              required
              style={{ width: '100%', padding: 8, boxSizing: 'border-box' }}
            />
            {intervalError && <small style={{ color: '#dc2626' }}>{intervalError}</small>}
            <small style={{ color: '#6b7280', display: 'block', marginTop: 2 }}>h = hours · d = days · m = months</small>
          </div>
          {!task && (
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 4 }}>Household (optional)</label>
              <select
                value={householdId ?? ''}
                onChange={e => setHouseholdId(e.target.value || undefined)}
                style={{ width: '100%', padding: '6px 10px', boxSizing: 'border-box' }}
              >
                <option value="">Personal task</option>
                {households.map(h => (
                  <option key={h.id} value={h.id}>{h.name}</option>
                ))}
              </select>
            </div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" disabled={loading}>
              {loading ? 'Saving…' : task ? 'Save' : 'Create'}
            </button>
            <button type="button" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Run all backend tests**

```bash
cd backend && npx jest
```

Expected: all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/src/routes/tasks.ts frontend/src/pages/Dashboard.tsx frontend/src/components/TaskForm.tsx
git commit -m "feat: household-scoped tasks — scope selector, household picker, updated auth"
```

---

### Task 4: Vertical Slice — Household-Aware Push Notifications

**Delivers:** When a household task deadline fires, all active members of that household receive the push notification (not all users).

**Files:**
- Modify: `backend/src/notifier.ts`
- Modify: `backend/src/scheduler.ts`

- [ ] **Step 1: Replace `backend/src/notifier.ts`**

```typescript
import webpush from 'web-push';
import { eq, and, isNotNull } from 'drizzle-orm';
import { db } from './db';
import { users, householdMembers } from './db/schema';

const { VAPID_EMAIL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY } = process.env;
if (!VAPID_EMAIL || !VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  throw new Error('Missing required VAPID environment variables: VAPID_EMAIL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY');
}

webpush.setVapidDetails(
  `mailto:${VAPID_EMAIL}`,
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY,
);

export async function sendPushNotification(
  taskName: string,
  ownerId: string | null,
  householdId: string | null,
): Promise<void> {
  let targets: { pushSubscription: unknown }[];

  if (householdId) {
    targets = await db
      .select({ pushSubscription: users.pushSubscription })
      .from(householdMembers)
      .innerJoin(users, eq(householdMembers.userId, users.id))
      .where(
        and(
          eq(householdMembers.householdId, householdId),
          eq(householdMembers.status, 'active'),
          isNotNull(users.pushSubscription),
        ),
      );
  } else if (ownerId) {
    targets = await db
      .select({ pushSubscription: users.pushSubscription })
      .from(users)
      .where(eq(users.id, ownerId));
  } else {
    return;
  }

  const results = await Promise.allSettled(
    targets
      .filter(u => u.pushSubscription !== null)
      .map(u =>
        webpush.sendNotification(
          u.pushSubscription as webpush.PushSubscription,
          JSON.stringify({ title: 'Task Due', body: taskName }),
        ),
      ),
  );
  results.forEach(r => {
    if (r.status === 'rejected') console.error('Push notification failed:', r.reason);
  });
}
```

- [ ] **Step 2: Replace `backend/src/scheduler.ts`**

```typescript
import schedule from 'node-schedule';
import { db } from './db';
import { tasks } from './db/schema';
import { sendPushNotification } from './notifier';

const jobs = new Map<string, schedule.Job>();

export function scheduleTask(
  taskId: string,
  taskName: string,
  ownerId: string | null,
  householdId: string | null,
  deadline: Date,
): void {
  cancelTask(taskId);

  const now = new Date();
  const fireAt = deadline <= now ? new Date(now.getTime() + 1) : deadline;

  const job = schedule.scheduleJob(fireAt, async () => {
    try {
      await sendPushNotification(taskName, ownerId, householdId);
    } finally {
      jobs.delete(taskId);
    }
  });

  if (job) jobs.set(taskId, job);
}

export function cancelTask(taskId: string): void {
  const existing = jobs.get(taskId);
  if (existing) {
    existing.cancel();
    jobs.delete(taskId);
  }
}

export async function scheduleAll(): Promise<void> {
  const allTasks = await db.select().from(tasks);
  for (const task of allTasks) {
    scheduleTask(task.id, task.name, task.ownerId, task.householdId, task.nextDeadline);
  }
}
```

- [ ] **Step 3: Run all backend tests**

```bash
cd backend && npx jest
```

Expected: all tests PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/src/notifier.ts backend/src/scheduler.ts
git commit -m "feat: scope push notifications to household active members"
```
