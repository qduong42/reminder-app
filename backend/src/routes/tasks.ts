import { Router } from 'express';
import { eq, or, isNull } from 'drizzle-orm';
import { db } from '../db';
import { tasks, completions } from '../db/schema';
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

// GET /tasks — shared tasks + caller's personal tasks
router.get('/', async (req, res) => {
  const { userId } = req as AuthRequest;
  const rows = await db
    .select()
    .from(tasks)
    .where(or(isNull(tasks.ownerId), eq(tasks.ownerId, userId)));
  const now = new Date();
  res.json(rows.map(t => formatTask(t, now)));
});

// POST /tasks — create task; schedule job
router.post('/', async (req, res) => {
  const { userId } = req as AuthRequest;
  const { name, intervalHours, shared } = req.body as {
    name: string;
    intervalHours: number;
    shared: boolean;
  };
  if (typeof name !== 'string' || typeof intervalHours !== 'number' || typeof shared !== 'boolean') {
    res.status(400).json({ error: 'name (string), intervalHours (number), and shared (boolean) are required' });
    return;
  }
  if (!name.trim()) {
    res.status(400).json({ error: 'name must not be empty' });
    return;
  }
  if (intervalHours <= 0 || !isFinite(intervalHours)) {
    res.status(400).json({ error: 'intervalHours must be a positive finite number' });
    return;
  }
  const now = new Date();
  const nextDeadline = computeNextDeadline(now, intervalHours);

  const [task] = await db
    .insert(tasks)
    .values({ name, intervalHours, ownerId: shared ? null : userId, nextDeadline })
    .returning();

  scheduleTask(task.id, task.name, task.ownerId, task.nextDeadline);
  res.status(201).json(formatTask(task));
});

// PATCH /tasks/:id — edit name, interval, ownership
router.patch('/:id', async (req, res) => {
  const { userId } = req as unknown as AuthRequest;
  const [existing] = await db.select().from(tasks).where(eq(tasks.id, req.params.id));
  if (!existing) { res.status(404).json({ error: 'Not found' }); return; }
  if (existing.ownerId !== null && existing.ownerId !== userId) {
    res.status(403).json({ error: 'Forbidden' }); return;
  }

  const { name, intervalHours, shared } = req.body as {
    name?: string;
    intervalHours?: number;
    shared?: boolean;
  };

  if (name !== undefined && typeof name !== 'string') {
    res.status(400).json({ error: 'name must be a string' }); return;
  }
  if (intervalHours !== undefined && (typeof intervalHours !== 'number' || intervalHours <= 0 || !isFinite(intervalHours))) {
    res.status(400).json({ error: 'intervalHours must be a positive finite number' }); return;
  }
  if (shared !== undefined && typeof shared !== 'boolean') {
    res.status(400).json({ error: 'shared must be a boolean' }); return;
  }

  const updates: Partial<typeof tasks.$inferInsert> = {};
  if (name !== undefined) updates.name = name;
  if (intervalHours !== undefined) updates.intervalHours = intervalHours;
  if (shared !== undefined) updates.ownerId = shared ? null : userId;

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: 'No valid fields to update' });
    return;
  }

  const [updated] = await db
    .update(tasks)
    .set(updates)
    .where(eq(tasks.id, req.params.id))
    .returning();

  scheduleTask(updated.id, updated.name, updated.ownerId, updated.nextDeadline);
  res.json(formatTask(updated));
});

// DELETE /tasks/:id — shared: any user; personal: owner only
router.delete('/:id', async (req, res) => {
  const { userId } = req as unknown as AuthRequest;
  const [existing] = await db.select().from(tasks).where(eq(tasks.id, req.params.id));
  if (!existing) { res.status(404).json({ error: 'Not found' }); return; }
  if (existing.ownerId !== null && existing.ownerId !== userId) {
    res.status(403).json({ error: 'Forbidden' }); return;
  }

  cancelTask(req.params.id);
  await db.delete(completions).where(eq(completions.taskId, req.params.id));
  await db.delete(tasks).where(eq(tasks.id, req.params.id));
  res.status(204).send();
});

// POST /tasks/:id/complete — reset deadline from completion time; reschedule
router.post('/:id/complete', async (req, res) => {
  const { userId } = req as unknown as AuthRequest;
  const [task] = await db.select().from(tasks).where(eq(tasks.id, req.params.id));
  if (!task) { res.status(404).json({ error: 'Not found' }); return; }
  if (task.ownerId !== null && task.ownerId !== userId) {
    res.status(403).json({ error: 'Forbidden' }); return;
  }

  const now = new Date();
  let updated: typeof tasks.$inferSelect;
  await db.transaction(async (tx) => {
    await tx.insert(completions).values({ taskId: task.id, userId, completedAt: now });
    const nextDeadline = computeNextDeadline(now, task.intervalHours);
    [updated!] = await tx
      .update(tasks)
      .set({ nextDeadline })
      .where(eq(tasks.id, task.id))
      .returning();
  });

  scheduleTask(updated!.id, updated!.name, updated!.ownerId, updated!.nextDeadline);
  res.json(formatTask(updated!));
});

export default router;
