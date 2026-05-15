jest.mock('../mailer', () => ({ sendMail: jest.fn().mockResolvedValue(undefined) }));

import 'dotenv/config';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { createApp } from '../app';
import { db } from '../db';
import { users, passwordResetTokens, households, householdMembers, tasks, completions } from '../db/schema';
import { generateToken } from '../utils/token';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U';
process.env.VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || 'UUxI4O8-HoKU6B14FhTXLRC0yUsX0kDgOjNT3f_Oqp8';
process.env.VAPID_EMAIL = process.env.VAPID_EMAIL || 'test@example.com';
process.env.FRONTEND_URL = 'http://localhost:5173';

const app = createApp();

// Strong password that passes zxcvbn score >= 2
const STRONG_PASSWORD = 'C0rrect-H0rse-Battery!';
const WEAK_PASSWORD = 'password';

// Unique prefix to avoid collisions
const P = '_acc_';

beforeAll(async () => {
  // Clean up any leftover test data
  await db.delete(passwordResetTokens);
  await db.delete(users).where(eq(users.name, `${P}main`));
  await db.delete(users).where(eq(users.name, `${P}other`));
  await db.delete(users).where(eq(users.name, `${P}reg`));
  await db.delete(users).where(eq(users.name, `${P}reg2`));
  await db.delete(users).where(eq(users.name, `${P}del`));
});

afterAll(async () => {
  await db.delete(passwordResetTokens);
  await db.delete(users).where(eq(users.name, `${P}main`));
  await db.delete(users).where(eq(users.name, `${P}other`));
  await db.delete(users).where(eq(users.name, `${P}reg`));
  await db.delete(users).where(eq(users.name, `${P}reg2`));
  await db.delete(users).where(eq(users.name, `${P}del`));
});

// ─── Register ──────────────────────────────────────────────────────────────────

describe('POST /api/auth/register', () => {
  afterEach(async () => {
    await db.delete(users).where(eq(users.name, `${P}reg`));
    await db.delete(users).where(eq(users.name, `${P}reg2`));
  });

  it('happy path → 201 with id, username, email and JWT cookie', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: `${P}reg`, email: `${P}reg@test.local`, password: STRONG_PASSWORD })
      .expect(201);

    expect(res.body.id).toBeDefined();
    expect(res.body.username).toBe(`${P}reg`);
    expect(res.body.email).toBe(`${P}reg@test.local`);

    const cookies = res.headers['set-cookie'] as unknown as string[];
    expect(cookies).toBeDefined();
    expect(cookies.some((c: string) => c.startsWith('token='))).toBe(true);
  });

  it('duplicate username → 409 username_taken', async () => {
    const hash = await bcrypt.hash(STRONG_PASSWORD, 10);
    await db.insert(users).values({ name: `${P}reg`, email: `${P}reg@test.local`, passwordHash: hash });

    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: `${P}reg`, email: `${P}reg2@test.local`, password: STRONG_PASSWORD })
      .expect(409);

    expect(res.body.error).toBe('username_taken');
  });

  it('duplicate email → 409 email_taken', async () => {
    const hash = await bcrypt.hash(STRONG_PASSWORD, 10);
    await db.insert(users).values({ name: `${P}reg`, email: `${P}reg@test.local`, passwordHash: hash });

    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: `${P}reg2`, email: `${P}reg@test.local`, password: STRONG_PASSWORD })
      .expect(409);

    expect(res.body.error).toBe('email_taken');
  });

  it('weak password → 400', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ username: `${P}reg`, email: `${P}reg@test.local`, password: WEAK_PASSWORD })
      .expect(400);
  });

  it('missing fields → 400', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ email: `${P}reg@test.local`, password: STRONG_PASSWORD })
      .expect(400);
  });
});

// ─── Login ─────────────────────────────────────────────────────────────────────

describe('POST /api/auth/login', () => {
  beforeAll(async () => {
    const hash = await bcrypt.hash(STRONG_PASSWORD, 10);
    await db.insert(users).values({ name: `${P}main`, email: `${P}main@test.local`, passwordHash: hash });
  });

  afterAll(async () => {
    await db.delete(users).where(eq(users.name, `${P}main`));
  });

  it('login with username → success', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ name: `${P}main`, password: STRONG_PASSWORD })
      .expect(200);

    expect(res.body.name).toBe(`${P}main`);
  });

  it('login with email → success', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ usernameOrEmail: `${P}main@test.local`, password: STRONG_PASSWORD })
      .expect(200);

    expect(res.body.name).toBe(`${P}main`);
  });

  it('wrong password → 401', async () => {
    await request(app)
      .post('/api/auth/login')
      .send({ name: `${P}main`, password: 'wrongpassword' })
      .expect(401);
  });
});

// ─── Forgot password ───────────────────────────────────────────────────────────

describe('POST /api/auth/forgot-password', () => {
  beforeAll(async () => {
    const hash = await bcrypt.hash(STRONG_PASSWORD, 10);
    await db.insert(users).values({ name: `${P}main`, email: `${P}main@test.local`, passwordHash: hash });
  });

  afterAll(async () => {
    await db.delete(passwordResetTokens);
    await db.delete(users).where(eq(users.name, `${P}main`));
  });

  it('valid email → 200 {}', async () => {
    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: `${P}main@test.local` })
      .expect(200);

    expect(res.body).toEqual({});

    // verify token was inserted
    const [mainUser] = await db.select().from(users).where(eq(users.name, `${P}main`));
    const [prtRow] = await db.select().from(passwordResetTokens).where(eq(passwordResetTokens.userId, mainUser.id));
    expect(prtRow).toBeDefined();
    // cleanup
    await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, mainUser.id));
  });

  it('unknown email → 200 {} (no enumeration)', async () => {
    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'nonexistent@test.local' })
      .expect(200);

    expect(res.body).toEqual({});
  });
});

// ─── Reset password ────────────────────────────────────────────────────────────

describe('POST /api/auth/reset-password/:token', () => {
  let resetUserId: string;

  beforeAll(async () => {
    const hash = await bcrypt.hash(STRONG_PASSWORD, 10);
    const [u] = await db
      .insert(users)
      .values({ name: `${P}main`, email: `${P}main@test.local`, passwordHash: hash })
      .returning();
    resetUserId = u.id;
  });

  afterAll(async () => {
    await db.delete(passwordResetTokens);
    await db.delete(users).where(eq(users.name, `${P}main`));
  });

  it('happy path: resets password and user can log in with new password', async () => {
    const token = generateToken();
    await db.insert(passwordResetTokens).values({
      token,
      userId: resetUserId,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    const newPassword = 'N3wStr0ng-Pass!';
    const res = await request(app)
      .post(`/api/auth/reset-password/${token}`)
      .send({ newPassword })
      .expect(200);

    expect(res.body).toEqual({});

    // Verify can log in with new password
    await request(app)
      .post('/api/auth/login')
      .send({ name: `${P}main`, password: newPassword })
      .expect(200);

    // Restore original password for subsequent tests
    const hash = await bcrypt.hash(STRONG_PASSWORD, 10);
    await db.update(users).set({ passwordHash: hash }).where(eq(users.name, `${P}main`));
  });

  it('expired token → 410', async () => {
    const token = generateToken();
    await db.insert(passwordResetTokens).values({
      token,
      userId: resetUserId,
      expiresAt: new Date(Date.now() - 1000),
    });

    await request(app)
      .post(`/api/auth/reset-password/${token}`)
      .send({ newPassword: 'N3wStr0ng-Pass!' })
      .expect(410);

    await db.delete(passwordResetTokens).where(eq(passwordResetTokens.token, token));
  });

  it('unknown token → 404', async () => {
    await request(app)
      .post('/api/auth/reset-password/nonexistenttoken123')
      .send({ newPassword: 'N3wStr0ng-Pass!' })
      .expect(404);
  });

  it('weak new password → 400', async () => {
    const token = generateToken();
    await db.insert(passwordResetTokens).values({
      token,
      userId: resetUserId,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    await request(app)
      .post(`/api/auth/reset-password/${token}`)
      .send({ newPassword: WEAK_PASSWORD })
      .expect(400);

    await db.delete(passwordResetTokens).where(eq(passwordResetTokens.token, token));
  });

  it('token is single-use: second use → 404', async () => {
    const token = generateToken();
    await db.insert(passwordResetTokens).values({
      token,
      userId: resetUserId,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    await request(app)
      .post(`/api/auth/reset-password/${token}`)
      .send({ newPassword: 'N3wStr0ng-Pass!' })
      .expect(200);

    await request(app)
      .post(`/api/auth/reset-password/${token}`)
      .send({ newPassword: 'An0ther-Str0ng-Pass!' })
      .expect(404);
  });
});

// ─── PATCH /account/identity ───────────────────────────────────────────────────

describe('PATCH /api/account/identity', () => {
  let mainCookie: string;

  beforeAll(async () => {
    const hash = await bcrypt.hash(STRONG_PASSWORD, 10);
    await db.insert(users).values({ name: `${P}main`, email: `${P}main@test.local`, passwordHash: hash });
    await db.insert(users).values({ name: `${P}other`, email: `${P}other@test.local`, passwordHash: hash });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ name: `${P}main`, password: STRONG_PASSWORD });
    mainCookie = (res.headers['set-cookie'] as unknown as string[])[0];
  });

  afterAll(async () => {
    // Reset to original name/email in case tests changed them
    await db.delete(users).where(eq(users.name, `${P}main`));
    await db.delete(users).where(eq(users.name, `${P}main_updated`));
    await db.delete(users).where(eq(users.name, `${P}other`));
  });

  it('happy path: updates username and email, returns new values', async () => {
    const res = await request(app)
      .patch('/api/account/identity')
      .set('Cookie', mainCookie)
      .send({
        username: `${P}main_updated`,
        email: `${P}main_updated@test.local`,
        currentPassword: STRONG_PASSWORD,
      })
      .expect(200);

    expect(res.body.username).toBe(`${P}main_updated`);
    expect(res.body.email).toBe(`${P}main_updated@test.local`);

    // Rename back for subsequent tests
    await db.update(users).set({ name: `${P}main`, email: `${P}main@test.local` }).where(eq(users.name, `${P}main_updated`));
    // Re-login since username changed
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ name: `${P}main`, password: STRONG_PASSWORD });
    mainCookie = (loginRes.headers['set-cookie'] as unknown as string[])[0];
  });

  it('wrong current password → 403', async () => {
    await request(app)
      .patch('/api/account/identity')
      .set('Cookie', mainCookie)
      .send({
        username: `${P}main`,
        email: `${P}main@test.local`,
        currentPassword: 'wrongpassword',
      })
      .expect(403);
  });

  it('duplicate username → 409', async () => {
    await request(app)
      .patch('/api/account/identity')
      .set('Cookie', mainCookie)
      .send({
        username: `${P}other`,
        email: `${P}main@test.local`,
        currentPassword: STRONG_PASSWORD,
      })
      .expect(409);
  });

  it('duplicate email → 409', async () => {
    await request(app)
      .patch('/api/account/identity')
      .set('Cookie', mainCookie)
      .send({
        username: `${P}main`,
        email: `${P}other@test.local`,
        currentPassword: STRONG_PASSWORD,
      })
      .expect(409);
  });
});

// ─── PATCH /account/password ───────────────────────────────────────────────────

describe('PATCH /api/account/password', () => {
  let mainCookie: string;

  beforeAll(async () => {
    const hash = await bcrypt.hash(STRONG_PASSWORD, 10);
    await db.insert(users).values({ name: `${P}main`, email: `${P}main@test.local`, passwordHash: hash });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ name: `${P}main`, password: STRONG_PASSWORD });
    mainCookie = (res.headers['set-cookie'] as unknown as string[])[0];
  });

  afterAll(async () => {
    await db.delete(users).where(eq(users.name, `${P}main`));
  });

  it('happy path → 200', async () => {
    const newPw = 'Upd4ted-Str0ng!Pass';
    const res = await request(app)
      .patch('/api/account/password')
      .set('Cookie', mainCookie)
      .send({ currentPassword: STRONG_PASSWORD, newPassword: newPw })
      .expect(200);

    expect(res.body).toEqual({});

    // verify new password works
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ usernameOrEmail: `${P}main`, password: newPw });
    expect(loginRes.status).toBe(200);

    // Restore original password
    const hash = await bcrypt.hash(STRONG_PASSWORD, 10);
    await db.update(users).set({ passwordHash: hash }).where(eq(users.name, `${P}main`));
  });

  it('wrong current password → 403', async () => {
    await request(app)
      .patch('/api/account/password')
      .set('Cookie', mainCookie)
      .send({ currentPassword: 'wrongpassword', newPassword: 'N3wStr0ng-Pass!' })
      .expect(403);
  });

  it('weak new password → 400', async () => {
    await request(app)
      .patch('/api/account/password')
      .set('Cookie', mainCookie)
      .send({ currentPassword: STRONG_PASSWORD, newPassword: WEAK_PASSWORD })
      .expect(400);
  });
});

// ─── DELETE /account ───────────────────────────────────────────────────────────

describe('DELETE /api/account', () => {
  let delCookie: string;
  let delUserId: string;

  beforeEach(async () => {
    const hash = await bcrypt.hash(STRONG_PASSWORD, 10);
    const [u] = await db
      .insert(users)
      .values({ name: `${P}del`, email: `${P}del@test.local`, passwordHash: hash })
      .returning();
    delUserId = u.id;

    const res = await request(app)
      .post('/api/auth/login')
      .send({ name: `${P}del`, password: STRONG_PASSWORD });
    delCookie = (res.headers['set-cookie'] as unknown as string[])[0];
  });

  afterEach(async () => {
    // Clean up in case a test left user around (e.g. wrong password test)
    await db.delete(completions).where(eq(completions.userId, delUserId));
    await db.delete(householdMembers).where(eq(householdMembers.userId, delUserId));
    await db.delete(users).where(eq(users.name, `${P}del`));
  });

  it('happy path: cascades all data (user row gone, tasks gone, memberships gone)', async () => {
    // Create a household where del user is the sole active member
    const [hh] = await db.insert(households).values({ name: '_acc_del_hh' }).returning();
    await db.insert(householdMembers).values({ householdId: hh.id, userId: delUserId, status: 'active' });

    // Create a household task
    const [hhTask] = await db.insert(tasks).values({
      name: '_acc_del_hh_task',
      intervalHours: 24,
      ownerId: delUserId,
      householdId: hh.id,
      nextDeadline: new Date(Date.now() + 24 * 60 * 60 * 1000),
    }).returning();

    // Create a personal task
    const [personalTask] = await db.insert(tasks).values({
      name: '_acc_del_personal_task',
      intervalHours: 24,
      ownerId: delUserId,
      householdId: null,
      nextDeadline: new Date(Date.now() + 24 * 60 * 60 * 1000),
    }).returning();

    await request(app)
      .delete('/api/account')
      .set('Cookie', delCookie)
      .send({ currentPassword: STRONG_PASSWORD })
      .expect(204);

    // User row should be gone
    const remainingUsers = await db.select().from(users).where(eq(users.id, delUserId));
    expect(remainingUsers).toHaveLength(0);

    // Tasks should be gone
    const remainingHhTasks = await db.select().from(tasks).where(eq(tasks.id, hhTask.id));
    expect(remainingHhTasks).toHaveLength(0);

    const remainingPersonalTasks = await db.select().from(tasks).where(eq(tasks.id, personalTask.id));
    expect(remainingPersonalTasks).toHaveLength(0);

    // Memberships should be gone
    const remainingMemberships = await db.select().from(householdMembers).where(eq(householdMembers.userId, delUserId));
    expect(remainingMemberships).toHaveLength(0);

    // Household itself should be gone (sole-member cascade)
    const remainingHouseholds = await db.select().from(households).where(eq(households.id, hh.id));
    expect(remainingHouseholds).toHaveLength(0);
  });

  it('wrong password → 403', async () => {
    await request(app)
      .delete('/api/account')
      .set('Cookie', delCookie)
      .send({ currentPassword: 'wrongpassword' })
      .expect(403);

    // User should still exist
    const remaining = await db.select().from(users).where(eq(users.id, delUserId));
    expect(remaining).toHaveLength(1);
  });
});
