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
