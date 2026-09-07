import { sqliteTable, text, integer, real, primaryKey } from 'drizzle-orm/sqlite-core';

export const profiles = sqliteTable('profiles', {
  owner: text('owner').primaryKey(), data: text('data').notNull(), updatedAt: integer('updated_at').notNull(),
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
export const rateRequests = sqliteTable('rate_requests', {
  base: text('base').notNull(), quote: text('quote').notNull(), target: text('target').notNull(), fetchedAt: integer('fetched_at').notNull(),
}, table => [primaryKey({ columns: [table.base, table.quote, table.target] })]);
