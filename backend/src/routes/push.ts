import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { users } from '../db/schema';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();

router.post('/subscribe', requireAuth, async (req, res) => {
  const { userId } = req as AuthRequest;
  const subscription = req.body as Record<string, unknown>;
  await db.update(users).set({ pushSubscription: subscription }).where(eq(users.id, userId));
  res.status(204).send();
});

export default router;
