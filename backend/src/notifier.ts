import webpush from 'web-push';
import { eq, isNotNull } from 'drizzle-orm';
import { db } from './db';
import { users } from './db/schema';

webpush.setVapidDetails(
  `mailto:${process.env.VAPID_EMAIL}`,
  process.env.VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!,
);

export async function sendPushNotification(taskName: string, ownerId: string | null): Promise<void> {
  const targets = ownerId
    ? await db.select().from(users).where(eq(users.id, ownerId))
    : await db.select().from(users).where(isNotNull(users.pushSubscription));

  await Promise.allSettled(
    targets
      .filter(u => u.pushSubscription !== null)
      .map(u =>
        webpush.sendNotification(
          u.pushSubscription as webpush.PushSubscription,
          JSON.stringify({ title: 'Task Due', body: taskName }),
        ),
      ),
  );
}
