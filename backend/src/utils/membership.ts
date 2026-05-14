import { eq, and } from 'drizzle-orm';
import { db } from '../db';
import { householdMembers } from '../db/schema';

export async function isActiveMember(householdId: string, userId: string): Promise<boolean> {
  const [member] = await db.select().from(householdMembers).where(
    and(
      eq(householdMembers.householdId, householdId),
      eq(householdMembers.userId, userId),
      eq(householdMembers.status, 'active'),
    ),
  );
  return !!member;
}
