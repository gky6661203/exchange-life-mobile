import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { AppData, Collection, Profile } from '../src/lib/types.js';

export const collections: Collection[] = ['expenses', 'documents', 'checklists', 'courses', 'exchanges', 'places'];
export const defaultProfile: Profile = {
  name: '', destination: '', school: '', departureDate: '', returnDate: '', semesterStart: '', semesterEnd: '',
  baseCurrency: 'CNY', localCurrency: 'EUR', semesterBudget: 0, monthlyBudgets: {}, studentId: '', address: '',
  timeZone: 'Asia/Shanghai',
};

export class Store {
  readonly db: DatabaseSync;
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS items (id TEXT PRIMARY KEY, collection TEXT NOT NULL, data TEXT NOT NULL, created_at INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS items_collection ON items(collection);
      CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, expires_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS uploads (id TEXT PRIMARY KEY, mime TEXT NOT NULL, name TEXT NOT NULL, bytes BLOB NOT NULL, created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS rates (base TEXT NOT NULL, quote TEXT NOT NULL, date TEXT NOT NULL, rate REAL NOT NULL, fetched_at INTEGER NOT NULL, PRIMARY KEY(base, quote, date));
      CREATE TABLE IF NOT EXISTS rate_requests (base TEXT NOT NULL, quote TEXT NOT NULL, target TEXT NOT NULL, fetched_at INTEGER NOT NULL, PRIMARY KEY(base, quote, target));
    `);
    if (!this.getSetting('profile')) this.setSetting('profile', JSON.stringify(defaultProfile));
  }
  getSetting(key: string): string | undefined {
    return (this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined)?.value;
  }
  setSetting(key: string, value: string) {
    this.db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, value);
  }
  profile(): Profile { return { ...defaultProfile, ...JSON.parse(this.getSetting('profile')!) }; }
  list<T = unknown>(collection: Collection): T[] {
    return (this.db.prepare('SELECT data FROM items WHERE collection = ? ORDER BY created_at, id').all(collection) as { data: string }[]).map(row => JSON.parse(row.data));
  }
  get<T = unknown>(collection: Collection, id: string): T | undefined {
    const row = this.db.prepare('SELECT data FROM items WHERE collection = ? AND id = ?').get(collection, id) as { data: string } | undefined;
    return row ? JSON.parse(row.data) : undefined;
  }
  save(collection: Collection, item: { id: string }, now: number) {
    this.db.prepare('INSERT INTO items(id,collection,data,created_at) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(item.id, collection, JSON.stringify(item), now);
  }
  delete(collection: Collection, id: string) { this.db.prepare('DELETE FROM items WHERE collection=? AND id=?').run(collection, id); }
  data(): AppData {
    return Object.fromEntries([['profile', this.profile()], ...collections.map(collection => [collection, this.list(collection)])]) as unknown as AppData;
  }
  close() { this.db.close(); }
}




