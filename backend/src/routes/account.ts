import { Router } from 'express';
import { eq, and, ne, isNull, inArray } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import zxcvbn from 'zxcvbn';
import { db } from '../db';
import { users, households, householdMembers, completions, tasks, passwordResetTokens, inviteTokens } from '../db/schema';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

// GET /account
router.get('/', async (req, res) => {
  const { userId } = req as unknown as AuthRequest;
  try {
    const [user] = await db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .where(eq(users.id, userId));
    if (!user) { res.status(404).json({ error: 'User not found' }); return; }
    res.json({ id: user.id, username: user.name, email: user.email });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /account/identity
router.patch('/identity', async (req, res) => {
  const { userId } = req as unknown as AuthRequest;
  const { username, email } = req.body as { username: string; email: string };

  // Input validation
  if (!username || !/^[a-zA-Z0-9_-]{3,30}$/.test(username)) {
    res.status(400).json({ error: 'Invalid username: must be 3–30 characters and contain only letters, numbers, underscores, or hyphens' });
    return;
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: 'Invalid email address' });
    return;
  }

  try {
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user) { res.status(404).json({ error: 'User not found' }); return; }

    // Check username uniqueness (excluding current user)
    if (username !== user.name) {
      const [existing] = await db.select().from(users).where(and(eq(users.name, username), ne(users.id, userId)));
      if (existing) { res.status(409).json({ error: 'username_taken' }); return; }
    }

    // Check email uniqueness (excluding current user)
    if (email !== user.email) {
      const [existing] = await db.select().from(users).where(and(eq(users.email, email), ne(users.id, userId)));
      if (existing) { res.status(409).json({ error: 'email_taken' }); return; }
    }

    await db.update(users).set({ name: username, email }).where(eq(users.id, userId));
    res.json({ id: userId, username, email });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /account/password
router.patch('/password', async (req, res) => {
  const { userId } = req as unknown as AuthRequest;
  const { currentPassword, newPassword } = req.body as { currentPassword: string; newPassword: string };
  try {
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user) { res.status(404).json({ error: 'User not found' }); return; }

    const passwordValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!passwordValid) { res.status(403).json({ error: 'Invalid current password' }); return; }

    if (typeof newPassword !== 'string' || newPassword.length < 8 || zxcvbn(newPassword).score < 2) {
      res.status(400).json({ error: 'Password too weak' });
      return;
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await db.update(users).set({ passwordHash }).where(eq(users.id, userId));
    res.json({});
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /account
router.delete('/', async (req, res) => {
  const { userId } = req as unknown as AuthRequest;
  const { currentPassword } = req.body as { currentPassword: string };
  try {
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user) { res.status(404).json({ error: 'User not found' }); return; }

    const passwordValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!passwordValid) { res.status(403).json({ error: 'Invalid current password' }); return; }

    await db.transaction(async (tx) => {
      // Step 1: find households where caller is the only active member
      const callerMemberships = await tx
        .select({ householdId: householdMembers.householdId })
        .from(householdMembers)
        .where(and(eq(householdMembers.userId, userId), eq(householdMembers.status, 'active')));

      const householdIds: string[] = [];
      for (const { householdId } of callerMemberships) {
        const otherActiveMembers = await tx
          .select({ id: householdMembers.id })
          .from(householdMembers)
          .where(
            and(
              eq(householdMembers.householdId, householdId),
              eq(householdMembers.status, 'active'),
              ne(householdMembers.userId, userId),
            ),
          );
        if (otherActiveMembers.length === 0) {
          householdIds.push(householdId);
        }
      }

      // Step 2: delete completions
      await tx.delete(completions).where(eq(completions.userId, userId));

      // Step 3: delete personal tasks (no household)
      await tx.delete(tasks).where(and(eq(tasks.ownerId, userId), isNull(tasks.householdId)));

      // Step 4: delete household memberships
      await tx.delete(householdMembers).where(eq(householdMembers.userId, userId));

      // Step 5: delete tasks belonging to sole-member households, then the households
      if (householdIds.length > 0) {
        await tx.delete(tasks).where(inArray(tasks.householdId, householdIds));
        await tx.delete(households).where(inArray(households.id, householdIds));
      }

      // Step 6: delete invite tokens created by this user
      await tx.delete(inviteTokens).where(eq(inviteTokens.createdById, userId));

      // Step 7: delete password reset tokens
      await tx.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, userId));

      // Step 8: delete user
      await tx.delete(users).where(eq(users.id, userId));
    });

    res.status(204).send();
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
