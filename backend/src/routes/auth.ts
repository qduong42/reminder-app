import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { eq, or } from 'drizzle-orm';
import zxcvbn from 'zxcvbn';
import { db } from '../db';
import { users, passwordResetTokens } from '../db/schema';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { generateToken } from '../utils/token';
import { sendMail } from '../mailer';
import { passwordResetEmail } from '../emails/passwordReset';

const router = Router();

router.post('/login', async (req, res) => {
  try {
    const { name, usernameOrEmail, password, rememberMe } = req.body as {
      name?: string;
      usernameOrEmail?: string;
      password: string;
      rememberMe?: boolean;
    };

    const identifier = usernameOrEmail ?? name;

    if (typeof identifier !== 'string' || typeof password !== 'string') {
      res.status(400).json({ error: 'usernameOrEmail and password are required' });
      return;
    }

    const [user] = await db
      .select()
      .from(users)
      .where(or(eq(users.name, identifier), eq(users.email, identifier)));

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET!, { expiresIn: '30d' });

    res.cookie('token', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      ...(rememberMe ? { maxAge: 30 * 24 * 60 * 60 * 1000 } : {}),
    });

    res.json({ id: user.id, name: user.name });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/logout', (_req, res) => {
  res.clearCookie('token', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });
  res.status(204).send();
});

router.get('/me', requireAuth, async (req, res) => {
  try {
    const { userId } = req as AuthRequest;
    const [user] = await db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .where(eq(users.id, userId));
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body as {
      username: string;
      email: string;
      password: string;
    };

    if (typeof username !== 'string' || !/^[a-zA-Z0-9_-]{3,30}$/.test(username)) {
      res.status(400).json({ error: 'Invalid username' });
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      res.status(400).json({ error: 'Invalid email' });
      return;
    }

    if (typeof password !== 'string' || password.length < 8 || zxcvbn(password).score < 2) {
      res.status(400).json({ error: 'Password too weak' });
      return;
    }

    const [existingByUsername] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.name, username));
    if (existingByUsername) {
      res.status(409).json({ error: 'username_taken' });
      return;
    }

    const [existingByEmail] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email));
    if (existingByEmail) {
      res.status(409).json({ error: 'email_taken' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const [newUser] = await db
      .insert(users)
      .values({ name: username, email, passwordHash })
      .returning({ id: users.id, name: users.name, email: users.email });

    const jwtToken = jwt.sign({ userId: newUser.id }, process.env.JWT_SECRET!, { expiresIn: '7d' });

    res.cookie('token', jwtToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.status(201).json({ id: newUser.id, username: newUser.name, email: newUser.email });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body as { email?: string };
    if (typeof email !== 'string' || email.length === 0) {
      res.status(400).json({ error: 'email is required' });
      return;
    }

    const [user] = await db.select().from(users).where(eq(users.email, email));
    if (!user) {
      res.json({});
      return;
    }

    const token = generateToken();
    await db.insert(passwordResetTokens).values({
      token,
      userId: user.id,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${token}`;
    await sendMail({
      to: user.email,
      subject: 'Reset your password',
      html: passwordResetEmail({ resetUrl }),
    });

    res.json({});
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/reset-password/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const { newPassword } = req.body as { newPassword: string };

    const [tokenRow] = await db
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.token, token));

    if (!tokenRow) {
      res.status(404).json({ error: 'Token not found' });
      return;
    }

    if (tokenRow.expiresAt < new Date()) {
      res.status(410).json({ error: 'Token expired' });
      return;
    }

    if (typeof newPassword !== 'string' || newPassword.length < 8 || zxcvbn(newPassword).score < 2) {
      res.status(400).json({ error: 'Password too weak' });
      return;
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await db.update(users).set({ passwordHash }).where(eq(users.id, tokenRow.userId));
    await db.delete(passwordResetTokens).where(eq(passwordResetTokens.token, token));

    res.json({});
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
