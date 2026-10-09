import { sqliteTable, text, integer, real, primaryKey } from 'drizzle-orm/sqlite-core';

export const profiles = sqliteTable('profiles', {
  owner: text('owner').primaryKey(), data: text('data').notNull(), updatedAt: integer('updated_at').notNull(),
});
export const accounts = sqliteTable('accounts', {
  id: text('id').primaryKey(), email: text('email').notNull().unique(), name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(), dataOwner: text('data_owner').notNull().unique(), createdAt: integer('created_at').notNull(),
});
export const accountSessions = sqliteTable('account_sessions', {
  tokenHash: text('token_hash').primaryKey(), accountId: text('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }), expiresAt: integer('expires_at').notNull(),
});
export const accountAttempts = sqliteTable('account_attempts', {
  key: text('key').primaryKey(), count: integer('count').notNull(), expiresAt: integer('expires_at').notNull(),
});
export const items = sqliteTable('items', {
  owner: text('owner').notNull(), collection: text('collection').notNull(), id: text('id').notNull(),
  data: text('data').notNull(), createdAt: integer('created_at').notNull(), updatedAt: integer('updated_at').notNull(),
}, table => [primaryKey({ columns: [table.owner, table.collection, table.id] })]);
export const uploads = sqliteTable('uploads', {
  owner: text('owner').notNull(), id: text('id').notNull(), mime: text('mime').notNull(), name: text('name').notNull(), createdAt: integer('created_at').notNull(),
}, table => [primaryKey({ columns: [table.owner, table.id] })]);
export const rates = sqliteTable('rates', {
  base: text('base').notNull(), quote: text('quote').notNull(), date: text('date').notNull(), rate: real('rate').notNull(), fetchedAt: integer('fetched_at').notNull(),
}, table => [primaryKey({ columns: [table.base, table.quote, table.date] })]);
export const stockQuotes = sqliteTable('stock_quotes', {
  symbol: text('symbol').primaryKey(), data: text('data').notNull(), fetchedAt: integer('fetched_at').notNull(),
});
export const rateRequests = sqliteTable('rate_requests', {
  base: text('base').notNull(), quote: text('quote').notNull(), target: text('target').notNull(), fetchedAt: integer('fetched_at').notNull(),
}, table => [primaryKey({ columns: [table.base, table.quote, table.target] })]);
