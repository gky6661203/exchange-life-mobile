import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import worker, { type Env } from '../worker/index';
import type { D1Database, R2Bucket } from '@cloudflare/workers-types';

/** SQLite-backed adapters let development and tests use the same API as Sites. */
export function createAccountBackend(path = process.env.DATABASE_PATH || resolve('data', 'accounts.sqlite')) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const database = new DatabaseSync(path);
  database.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS account_migrations(name TEXT PRIMARY KEY); CREATE TABLE IF NOT EXISTS account_objects(key TEXT PRIMARY KEY,bytes BLOB NOT NULL,mime TEXT NOT NULL,name TEXT NOT NULL);');
  const migrationDirectory = resolve(import.meta.dirname, '../drizzle');
  for (const name of readdirSync(migrationDirectory).filter(name => name.endsWith('.sql')).sort()) {
    if (database.prepare('SELECT name FROM account_migrations WHERE name=?').get(name)) continue;
    database.exec('BEGIN');
    try { database.exec(readFileSync(resolve(migrationDirectory, name), 'utf8')); database.prepare('INSERT INTO account_migrations(name) VALUES(?)').run(name); database.exec('COMMIT'); }
    catch (error) { database.exec('ROLLBACK'); throw error; }
  }
  class Statement {
    constructor(readonly sql: string, readonly values: (string | number | null | Uint8Array)[] = []) {}
    bind(...values: (string | number | null | Uint8Array)[]) { return new Statement(this.sql, values); }
    async first<T>(column?: string): Promise<T | null> { const row = database.prepare(this.sql).get(...this.values); return (row ? column ? row[column] : row : null) as T | null; }
    async all<T>() { return { results: database.prepare(this.sql).all(...this.values) as T[], success: true, meta: {} }; }
    async run() { const result = database.prepare(this.sql).run(...this.values); return { success: true, results: [], meta: { changes: result.changes } }; }
  }
  const db = {
    prepare(sql: string) { return new Statement(sql); },
    async batch(statements: Statement[]) {
      database.exec('BEGIN');
      try { const result = []; for (const statement of statements) result.push(await statement.run()); database.exec('COMMIT'); return result; }
      catch (error) { database.exec('ROLLBACK'); throw error; }
    },
  } as unknown as D1Database;
  const uploads = {
    async put(key: string, bytes: Uint8Array, options: { httpMetadata: { contentType: string }; customMetadata: { name: string } }) {
      database.prepare('INSERT INTO account_objects(key,bytes,mime,name) VALUES(?,?,?,?) ON CONFLICT(key) DO UPDATE SET bytes=excluded.bytes,mime=excluded.mime,name=excluded.name').run(key, bytes, options.httpMetadata.contentType, options.customMetadata.name);
    },
    async get(key: string) {
      const row = database.prepare('SELECT bytes,mime FROM account_objects WHERE key=?').get(key) as { bytes: Uint8Array; mime: string } | undefined;
      if (!row) return null;
      const bytes = new Uint8Array(row.bytes);
      return { body: new Response(bytes).body, arrayBuffer: async () => bytes.buffer, httpMetadata: { contentType: row.mime } };
    },
    async delete(key: string) { database.prepare('DELETE FROM account_objects WHERE key=?').run(key); },
  } as unknown as R2Bucket;
  const env: Env = { DB: db, UPLOADS: uploads, APP_ORIGIN: process.env.APP_ORIGIN, SECURE_COOKIES: process.env.NODE_ENV === 'production' ? 'true' : 'false', ASSETS: { fetch: async () => new Response('Not found', { status: 404 }) } };
  async function fetch(request: Request) {
    // Only the Sites edge can supply trusted platform identity, never local clients.
    const headers = new Headers(request.headers); headers.delete('oai-authenticated-user-id'); headers.delete('oai-authenticated-user-email');
    return worker.fetch(new Request(request, { headers }), env);
  }
  return { fetch, env, database, close: () => database.close() };
}
