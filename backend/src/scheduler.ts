import schedule from 'node-schedule';
import { db } from './db';
import { tasks } from './db/schema';
import { sendPushNotification } from './notifier';

const jobs = new Map<string, schedule.Job>();

export function scheduleTask(
  taskId: string,
  taskName: string,
  ownerId: string | null,
  householdId: string | null,
  deadline: Date,
): void {
  cancelTask(taskId);

  const now = new Date();
  const fireAt = deadline <= now ? new Date(now.getTime() + 1) : deadline;

  const job = schedule.scheduleJob(fireAt, async () => {
    try {
      await sendPushNotification(taskName, ownerId, householdId);
    } finally {
      jobs.delete(taskId);
    }
  });

  if (job) jobs.set(taskId, job);
}

export function cancelTask(taskId: string): void {
  const existing = jobs.get(taskId);
  if (existing) {
    existing.cancel();
    jobs.delete(taskId);
  }
}

export async function scheduleAll(): Promise<void> {
  const allTasks = await db.select().from(tasks);
  for (const task of allTasks) {
    scheduleTask(task.id, task.name, task.ownerId, task.householdId, task.nextDeadline);
  }
}
