import { pgTable, uuid, text, doublePrecision, timestamp, jsonb, unique } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  pushSubscription: jsonb('push_subscription'),
});

export const households = pgTable('households', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const householdMembers = pgTable('household_members', {
  id: uuid('id').defaultRandom().primaryKey(),
  householdId: uuid('household_id').references(() => households.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  status: text('status').notNull(), // 'pending' | 'active'
  invitedById: uuid('invited_by_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique('household_members_household_user_unique').on(table.householdId, table.userId),
]);

export const inviteTokens = pgTable('invite_tokens', {
  id: uuid('id').defaultRandom().primaryKey(),
  token: text('token').notNull().unique(),
  householdId: uuid('household_id').references(() => households.id, { onDelete: 'cascade' }).notNull(),
  createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});

export const tasks = pgTable('tasks', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  intervalHours: doublePrecision('interval_hours').notNull(),
  ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'set null' }),
  householdId: uuid('household_id').references(() => households.id, { onDelete: 'set null' }),
  nextDeadline: timestamp('next_deadline', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const completions = pgTable('completions', {
  id: uuid('id').defaultRandom().primaryKey(),
  taskId: uuid('task_id').references(() => tasks.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }).notNull().defaultNow(),
});
