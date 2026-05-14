import { Router, Response } from 'express';
import { eq, and } from 'drizzle-orm';
import { db } from '../db';
import { inviteTokens, householdMembers, households } from '../db/schema';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();

async function deleteIfExpired(
  token: string,
  expiresAt: Date,
  res: Response,
): Promise<boolean> {
  if (expiresAt < new Date()) {
    await db.delete(inviteTokens).where(eq(inviteTokens.token, token));
    res.status(410).json({ error: 'Invite expired' });
    return true;
  }
  return false;
}

// GET /invite/:token — public
router.get('/:token', async (req, res) => {
  const [row] = await db
    .select({ token: inviteTokens, householdName: households.name })
    .from(inviteTokens)
    .innerJoin(households, eq(inviteTokens.householdId, households.id))
    .where(eq(inviteTokens.token, req.params.token));

  if (!row) { res.status(404).json({ error: 'Invite not found' }); return; }
  if (await deleteIfExpired(req.params.token, row.token.expiresAt, res)) return;

  res.json({ householdName: row.householdName, expiresAt: row.token.expiresAt.toISOString() });
});

// POST /invite/:token/join — requires auth
router.post('/:token/join', requireAuth, async (req, res) => {
  const { userId } = req as unknown as AuthRequest;

  const [row] = await db
    .select({ token: inviteTokens })
    .from(inviteTokens)
    .where(eq(inviteTokens.token, req.params.token));

  if (!row) { res.status(404).json({ error: 'Invite not found' }); return; }
  if (await deleteIfExpired(req.params.token, row.token.expiresAt, res)) return;

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
