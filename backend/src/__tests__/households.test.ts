import 'dotenv/config';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { eq, and } from 'drizzle-orm';
import { createApp } from '../app';
import { db } from '../db';
import { users, households, householdMembers, inviteTokens } from '../db/schema';
import { generateToken } from '../utils/token';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U';
process.env.VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || 'UUxI4O8-HoKU6B14FhTXLRC0yUsX0kDgOjNT3f_Oqp8';
process.env.VAPID_EMAIL = process.env.VAPID_EMAIL || 'test@example.com';
process.env.FRONTEND_URL = 'http://localhost:5173';

const app = createApp();

let userAId: string;
let userBId: string;
let cookieA: string;
let cookieB: string;

beforeAll(async () => {
  await db.delete(inviteTokens);
  await db.delete(householdMembers);
  await db.delete(households);
  await db.delete(users).where(eq(users.name, '_hh_user_a_'));
  await db.delete(users).where(eq(users.name, '_hh_user_b_'));

  const hash = await bcrypt.hash('pass', 10);
  const [a] = await db.insert(users).values({ name: '_hh_user_a_', passwordHash: hash }).returning();
  const [b] = await db.insert(users).values({ name: '_hh_user_b_', passwordHash: hash }).returning();
  userAId = a.id;
  userBId = b.id;

  const resA = await request(app).post('/auth/login').send({ name: '_hh_user_a_', password: 'pass' });
  cookieA = (resA.headers['set-cookie'] as unknown as string[])[0];
  const resB = await request(app).post('/auth/login').send({ name: '_hh_user_b_', password: 'pass' });
  cookieB = (resB.headers['set-cookie'] as unknown as string[])[0];
});

afterAll(async () => {
  await db.delete(inviteTokens);
  await db.delete(householdMembers);
  await db.delete(households);
  await db.delete(users).where(eq(users.name, '_hh_user_a_'));
  await db.delete(users).where(eq(users.name, '_hh_user_b_'));
});

describe('POST /households', () => {
  it('creates a household and adds creator as active member', async () => {
    const res = await request(app)
      .post('/households')
      .set('Cookie', cookieA)
      .send({ name: 'Test Household' })
      .expect(201);

    expect(res.body.name).toBe('Test Household');
    expect(res.body.id).toBeDefined();

    const [member] = await db.select().from(householdMembers)
      .where(and(eq(householdMembers.householdId, res.body.id), eq(householdMembers.userId, userAId)));
    expect(member.status).toBe('active');

    await db.delete(householdMembers).where(eq(householdMembers.householdId, res.body.id));
    await db.delete(households).where(eq(households.id, res.body.id));
  });

  it('returns 400 for empty name', async () => {
    await request(app).post('/households').set('Cookie', cookieA).send({ name: '' }).expect(400);
  });
});

describe('GET /households', () => {
  it('returns only households the caller belongs to', async () => {
    const [hh] = await db.insert(households).values({ name: 'My House' }).returning();
    await db.insert(householdMembers).values({ householdId: hh.id, userId: userAId, status: 'active' });

    const resA = await request(app).get('/households').set('Cookie', cookieA).expect(200);
    expect(resA.body.some((h: { id: string }) => h.id === hh.id)).toBe(true);

    const resB = await request(app).get('/households').set('Cookie', cookieB).expect(200);
    expect(resB.body.some((h: { id: string }) => h.id === hh.id)).toBe(false);

    await db.delete(householdMembers).where(eq(householdMembers.householdId, hh.id));
    await db.delete(households).where(eq(households.id, hh.id));
  });
});

describe('GET /households/:id/members', () => {
  it('returns 403 for non-members', async () => {
    const [hh] = await db.insert(households).values({ name: 'Private' }).returning();
    await db.insert(householdMembers).values({ householdId: hh.id, userId: userAId, status: 'active' });

    await request(app).get(`/households/${hh.id}/members`).set('Cookie', cookieB).expect(403);

    await db.delete(householdMembers).where(eq(householdMembers.householdId, hh.id));
    await db.delete(households).where(eq(households.id, hh.id));
  });

  it('returns all members including pending', async () => {
    const [hh] = await db.insert(households).values({ name: 'WithPending' }).returning();
    await db.insert(householdMembers).values([
      { householdId: hh.id, userId: userAId, status: 'active' },
      { householdId: hh.id, userId: userBId, status: 'pending' },
    ]);

    const res = await request(app).get(`/households/${hh.id}/members`).set('Cookie', cookieA).expect(200);
    expect(res.body).toHaveLength(2);
    expect(res.body.some((m: { status: string }) => m.status === 'pending')).toBe(true);

    await db.delete(householdMembers).where(eq(householdMembers.householdId, hh.id));
    await db.delete(households).where(eq(households.id, hh.id));
  });
});

describe('POST /households/:id/members/:userId/accept', () => {
  it('sets pending member to active', async () => {
    const [hh] = await db.insert(households).values({ name: 'AcceptHouse' }).returning();
    await db.insert(householdMembers).values([
      { householdId: hh.id, userId: userAId, status: 'active' },
      { householdId: hh.id, userId: userBId, status: 'pending' },
    ]);

    await request(app)
      .post(`/households/${hh.id}/members/${userBId}/accept`)
      .set('Cookie', cookieA)
      .expect(200);

    const [member] = await db.select().from(householdMembers)
      .where(and(eq(householdMembers.householdId, hh.id), eq(householdMembers.userId, userBId)));
    expect(member.status).toBe('active');

    await db.delete(householdMembers).where(eq(householdMembers.householdId, hh.id));
    await db.delete(households).where(eq(households.id, hh.id));
  });
});

describe('DELETE /households/:id/members/:userId', () => {
  it('removes a member', async () => {
    const [hh] = await db.insert(households).values({ name: 'RemoveHouse' }).returning();
    await db.insert(householdMembers).values([
      { householdId: hh.id, userId: userAId, status: 'active' },
      { householdId: hh.id, userId: userBId, status: 'active' },
    ]);

    await request(app)
      .delete(`/households/${hh.id}/members/${userBId}`)
      .set('Cookie', cookieA)
      .expect(204);

    const members = await db.select().from(householdMembers).where(eq(householdMembers.householdId, hh.id));
    expect(members).toHaveLength(1);

    await db.delete(householdMembers).where(eq(householdMembers.householdId, hh.id));
    await db.delete(households).where(eq(households.id, hh.id));
  });

  it('auto-deletes household when last active member removes themselves', async () => {
    const [hh] = await db.insert(households).values({ name: 'LastMember' }).returning();
    await db.insert(householdMembers).values({ householdId: hh.id, userId: userAId, status: 'active' });

    await request(app)
      .delete(`/households/${hh.id}/members/${userAId}`)
      .set('Cookie', cookieA)
      .expect(204);

    const remaining = await db.select().from(households).where(eq(households.id, hh.id));
    expect(remaining).toHaveLength(0);
  });
});

describe('Invite flow', () => {
  it('full happy path: generate → GET token info → join → accept', async () => {
    const [hh] = await db.insert(households).values({ name: 'InviteHouse' }).returning();
    await db.insert(householdMembers).values({ householdId: hh.id, userId: userAId, status: 'active' });

    const inviteRes = await request(app)
      .post(`/households/${hh.id}/invites`)
      .set('Cookie', cookieA)
      .expect(201);
    const { url } = inviteRes.body as { url: string };
    const token = url.split('/invite/')[1];

    const infoRes = await request(app).get(`/invite/${token}`).expect(200);
    expect(infoRes.body.householdName).toBe('InviteHouse');
    expect(infoRes.body.expiresAt).toBeDefined();

    await request(app).post(`/invite/${token}/join`).set('Cookie', cookieB).expect(200);

    const [member] = await db.select().from(householdMembers)
      .where(and(eq(householdMembers.householdId, hh.id), eq(householdMembers.userId, userBId)));
    expect(member.status).toBe('pending');

    const tokenRows = await db.select().from(inviteTokens).where(eq(inviteTokens.token, token));
    expect(tokenRows).toHaveLength(0);

    await request(app)
      .post(`/households/${hh.id}/members/${userBId}/accept`)
      .set('Cookie', cookieA)
      .expect(200);

    const [accepted] = await db.select().from(householdMembers)
      .where(and(eq(householdMembers.householdId, hh.id), eq(householdMembers.userId, userBId)));
    expect(accepted.status).toBe('active');

    await db.delete(householdMembers).where(eq(householdMembers.householdId, hh.id));
    await db.delete(households).where(eq(households.id, hh.id));
  });

  it('returns 410 for expired token', async () => {
    const [hh] = await db.insert(households).values({ name: 'ExpiredHouse' }).returning();
    await db.insert(householdMembers).values({ householdId: hh.id, userId: userAId, status: 'active' });

    const expiredToken = generateToken();
    await db.insert(inviteTokens).values({
      token: expiredToken,
      householdId: hh.id,
      createdById: userAId,
      expiresAt: new Date(Date.now() - 1000),
    });

    await request(app).get(`/invite/${expiredToken}`).expect(410);

    await db.delete(householdMembers).where(eq(householdMembers.householdId, hh.id));
    await db.delete(households).where(eq(households.id, hh.id));
  });

  it('returns 409 when user is already a member', async () => {
    const [hh] = await db.insert(households).values({ name: 'AlreadyMember' }).returning();
    await db.insert(householdMembers).values([
      { householdId: hh.id, userId: userAId, status: 'active' },
      { householdId: hh.id, userId: userBId, status: 'active' },
    ]);

    const validToken = generateToken();
    await db.insert(inviteTokens).values({
      token: validToken,
      householdId: hh.id,
      createdById: userAId,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    await request(app).post(`/invite/${validToken}/join`).set('Cookie', cookieB).expect(409);

    await db.delete(inviteTokens).where(eq(inviteTokens.token, validToken));
    await db.delete(householdMembers).where(eq(householdMembers.householdId, hh.id));
    await db.delete(households).where(eq(households.id, hh.id));
  });
});
