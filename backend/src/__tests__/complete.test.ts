import 'dotenv/config';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { createApp } from '../app';
import { db } from '../db';
import { users, tasks, completions } from '../db/schema';
import { computeNextDeadline } from '../deadline';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U';
process.env.VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || 'UUxI4O8-HoKU6B14FhTXLRC0yUsX0kDgOjNT3f_Oqp8';
process.env.VAPID_EMAIL = process.env.VAPID_EMAIL || 'test@example.com';

const app = createApp();

let userId: string;
let taskId: string;
let authCookie: string;

beforeAll(async () => {
  // Clean up any leftover test data
  await db.delete(completions);
  await db.delete(tasks).where(eq(tasks.name, 'Integration Test Task'));
  await db.delete(users).where(eq(users.name, '_test_user_'));

  const passwordHash = await bcrypt.hash('testpass', 10);
  const [user] = await db.insert(users).values({ name: '_test_user_', passwordHash, email: '_test_user_@test.local' }).returning();
  userId = user.id;

  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ name: '_test_user_', password: 'testpass' });
  authCookie = (loginRes.headers['set-cookie'] as unknown as string[])[0];

  const [task] = await db.insert(tasks).values({
    name: 'Integration Test Task',
    intervalHours: 24,
    ownerId: userId,
    nextDeadline: computeNextDeadline(new Date(), 24),
  }).returning();
  taskId = task.id;
});

afterAll(async () => {
  await db.delete(completions).where(eq(completions.taskId, taskId));
  await db.delete(tasks).where(eq(tasks.id, taskId));
  await db.delete(users).where(eq(users.id, userId));
});

describe('POST /tasks/:id/complete', () => {
  it('inserts a completion record, updates deadline, and returns urgency', async () => {
    const beforeComplete = new Date();

    const res = await request(app)
      .post(`/api/tasks/${taskId}/complete`)
      .set('Cookie', authCookie)
      .expect(200);

    // Completion was inserted
    const completionRows = await db.select().from(completions).where(eq(completions.taskId, taskId));
    expect(completionRows).toHaveLength(1);
    expect(completionRows[0].userId).toBe(userId);
    expect(completionRows[0].completedAt.getTime()).toBeGreaterThanOrEqual(beforeComplete.getTime());

    // Deadline updated to roughly completedAt + 24h
    const [updatedTask] = await db.select().from(tasks).where(eq(tasks.id, taskId));
    const expectedMs = completionRows[0].completedAt.getTime() + 24 * 3600 * 1000;
    expect(Math.abs(updatedTask.nextDeadline.getTime() - expectedMs)).toBeLessThan(2000);

    // Response has correct shape with urgency
    expect(res.body.id).toBe(taskId);
    expect(res.body.urgency).toBe('on-track');
    expect(typeof res.body.nextDeadline).toBe('string');
  });

  it('rejects completion of another user personal task with 403', async () => {
    const hash2 = await bcrypt.hash('pass2', 10);
    const [user2] = await db.insert(users).values({ name: '_test_user_2_', passwordHash: hash2, email: '_test_user_2_@test.local' }).returning();
    const [personalTask] = await db.insert(tasks).values({
      name: 'Personal Task User2',
      intervalHours: 12,
      ownerId: user2.id,
      nextDeadline: computeNextDeadline(new Date(), 12),
    }).returning();

    await request(app)
      .post(`/api/tasks/${personalTask.id}/complete`)
      .set('Cookie', authCookie)
      .expect(403);

    // Cleanup
    await db.delete(tasks).where(eq(tasks.id, personalTask.id));
    await db.delete(users).where(eq(users.id, user2.id));
  });
});
