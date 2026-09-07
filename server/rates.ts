import type { RateResult } from '../src/lib/types.js';
import type { Store } from './db.js';
import { isDate, todayInZone } from './validation.js';

interface RateRow { base: string; quote: string; date: string; rate: number }
interface CachedRow extends RateRow { fetched_at: number }
const ONE_DAY = 86_400_000;

export class RatesUnavailable extends Error {
  constructor() { super('暂时无法取得此币种的可靠汇率，请稍后再试'); }
}

/** Only actual provider observations are cached; missing days are never interpolated. */
export class RateService {
  private pending = new Map<string, Promise<RateResult>>();
  constructor(private store: Store, private fetcher: typeof fetch = fetch, private now: () => number = Date.now) {}

  async get(base: string, quote: string, requestedDate?: string): Promise<RateResult> {
    const today = todayInZone(this.now(), this.store.profile().timeZone);
    const target = requestedDate && requestedDate < today ? requestedDate : today;
    const from = new Date(new Date(`${target}T00:00:00Z`).valueOf() - 29 * ONE_DAY).toISOString().slice(0, 10);
    if (base === quote) {
      return { base, quote, rate: 1, date: target, stale: false, history: Array.from({ length: 30 }, (_, index) => ({ date: new Date(new Date(`${from}T00:00:00Z`).valueOf() + index * ONE_DAY).toISOString().slice(0, 10), rate: 1 })) };
    }

    const rows = this.cached(base, quote, from, target);
    const fetched = this.store.db.prepare('SELECT fetched_at FROM rate_requests WHERE base=? AND quote=? AND target=?').get(base, quote, target) as { fetched_at: number } | undefined;
    // Keep today's observations for 1 hour. Historical observations are refreshed daily.
    const ttl = requestedDate && target < today ? ONE_DAY : 3_600_000;
    if (rows.length && fetched && this.now() - fetched.fetched_at < ttl) return this.result(base, quote, rows, false, target);

    const key = `${base}:${quote}:${target}`;
    const existing = this.pending.get(key);
    if (existing) return existing;
    const request = this.refresh(base, quote, from, target, rows);
    this.pending.set(key, request);
    try { return await request; } finally { this.pending.delete(key); }
  }

  private async refresh(base: string, quote: string, from: string, target: string, rows: CachedRow[]): Promise<RateResult> {
    try {
      const url = new URL('https://api.frankfurter.dev/v2/rates');
      url.search = new URLSearchParams({ base, quotes: quote, from, to: target }).toString();
      const response = await this.fetcher(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(12_000) });
      if (!response.ok) throw new RatesUnavailable();
      const data: unknown = await response.json();
      if (!Array.isArray(data) || data.length === 0 || data.length > 1000) throw new RatesUnavailable();
      const valid = data.filter((value): value is RateRow => value && typeof value === 'object' && value.base === base && value.quote === quote && typeof value.date === 'string' && isDate(value.date) && value.date >= from && value.date <= target && typeof value.rate === 'number' && Number.isFinite(value.rate) && value.rate > 0);
      if (!valid.length) throw new RatesUnavailable();
      const statement = this.store.db.prepare('INSERT INTO rates(base,quote,date,rate,fetched_at) VALUES(?,?,?,?,?) ON CONFLICT(base,quote,date) DO UPDATE SET rate=excluded.rate,fetched_at=excluded.fetched_at');
      for (const row of valid) statement.run(row.base, row.quote, row.date, row.rate, this.now());
      this.store.db.prepare('INSERT INTO rate_requests(base,quote,target,fetched_at) VALUES(?,?,?,?) ON CONFLICT(base,quote,target) DO UPDATE SET fetched_at=excluded.fetched_at').run(base, quote, target, this.now());
      rows = this.cached(base, quote, from, target);
      return this.result(base, quote, rows, false, target);
    } catch {
      // A cache fallback is disclosed even if the stored rate happens to be recent.
      if (rows.length) return this.result(base, quote, rows, true, target);
      throw new RatesUnavailable();
    }
  }

  private cached(base: string, quote: string, from: string, to: string): CachedRow[] {
    return this.store.db.prepare('SELECT base,quote,date,rate,fetched_at FROM rates WHERE base=? AND quote=? AND date>=? AND date<=? ORDER BY date').all(base, quote, from, to) as unknown as CachedRow[];
  }
  private result(base: string, quote: string, rows: CachedRow[], stale: boolean, target: string): RateResult {
    const latest = rows.at(-1)!;
    const tooOld = new Date(`${target}T00:00:00Z`).valueOf() - new Date(`${latest.date}T00:00:00Z`).valueOf() > 7 * ONE_DAY;
    return { base, quote, date: latest.date, rate: latest.rate, stale: stale || tooOld, history: rows.map(row => ({ date: row.date, rate: row.rate })) };
  }
}




