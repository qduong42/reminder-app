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
      .where(and(eq(users.id, ownerId), isNotNull(users.pushSubscription)));
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
