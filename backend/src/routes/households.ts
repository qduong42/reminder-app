import { Router } from 'express';
import { eq, and } from 'drizzle-orm';
import { db } from '../db';
import { households, householdMembers, inviteTokens, users } from '../db/schema';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { generateToken } from '../utils/token';
import { isActiveMember } from '../utils/membership';

const router = Router();
router.use(requireAuth);

// POST /households
router.post('/', async (req, res) => {
  const { userId } = req as unknown as AuthRequest;
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
  const { userId } = req as unknown as AuthRequest;
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
  const { userId } = req as unknown as AuthRequest;
  if (!(await isActiveMember(req.params.id, userId))) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  await db.delete(households).where(eq(households.id, req.params.id));
  res.status(204).send();
});

// GET /households/:id/members
router.get('/:id/members', async (req, res) => {
  const { userId } = req as unknown as AuthRequest;
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
  const { userId } = req as unknown as AuthRequest;
  if (!(await isActiveMember(req.params.id, userId))) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const token = generateToken();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await db.insert(inviteTokens).values({ token, householdId: req.params.id, createdById: userId, expiresAt });

  const base = process.env.FRONTEND_URL || 'http://localhost:5173';
  res.status(201).json({ url: `${base}/invite/${token}` });
});

// POST /households/:id/members/:targetUserId/accept
router.post('/:id/members/:targetUserId/accept', async (req, res) => {
  const { userId } = req as unknown as AuthRequest;
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
  const { userId } = req as unknown as AuthRequest;
  if (!(await isActiveMember(req.params.id, userId))) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  await db.transaction(async (tx) => {
    await tx.delete(householdMembers).where(
      and(
        eq(householdMembers.householdId, req.params.id),
        eq(householdMembers.userId, req.params.targetUserId),
      ),
    );
    const remaining = await tx.select().from(householdMembers).where(
      and(eq(householdMembers.householdId, req.params.id), eq(householdMembers.status, 'active')),
    );
    if (remaining.length === 0) {
      await tx.delete(households).where(eq(households.id, req.params.id));
    }
  });
  res.status(204).send();
});

export default router;
