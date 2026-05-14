import webpush from 'web-push';
import { eq, isNotNull } from 'drizzle-orm';
import { db } from './db';
import { users } from './db/schema';

const { VAPID_EMAIL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY } = process.env;
if (!VAPID_EMAIL || !VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  throw new Error('Missing required VAPID environment variables: VAPID_EMAIL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY');
}

webpush.setVapidDetails(
  `mailto:${VAPID_EMAIL}`,
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY,
);

export async function sendPushNotification(taskName: string, ownerId: string | null): Promise<void> {
  const targets = ownerId
    ? await db.select().from(users).where(eq(users.id, ownerId))
    : await db.select().from(users).where(isNotNull(users.pushSubscription));

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
