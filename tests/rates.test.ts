import assert from 'node:assert/strict';
import test from 'node:test';
import { Store } from '../server/db.js';
import { RateService, RatesUnavailable } from '../server/rates.js';
import { fakeRates, FIXED_NOW, harness } from './helpers.js';

test('rate observations are real dated provider rows within a 30-day window and repeated requests use cache', async t => {
  const store = new Store(':memory:'); t.after(() => store.close());
  let calls = 0;
  const service = new RateService(store, async (...args) => { calls++; return fakeRates(...args); }, () => FIXED_NOW);
  const result = await service.get('EUR', 'TWD');
  assert.equal(result.base, 'EUR'); assert.equal(result.quote, 'TWD'); assert.equal(result.rate, 7.8123); assert.equal(result.date, '2026-09-04'); assert.equal(result.stale, false);
  assert.ok(result.history.length >= 20 && result.history.length <= 23);
  assert.ok(result.history.every(row => row.date >= '2026-08-08' && row.date <= '2026-09-06'));
  assert.equal(result.history.some(row => new Date(`${row.date}T00:00:00Z`).getUTCDay() === 0), false);
  await service.get('EUR', 'TWD'); assert.equal(calls, 1);
});

test('historical requests never poison the latest-rate cache', async t => {
  const store = new Store(':memory:'); t.after(() => store.close());
  let calls = 0;
  const service = new RateService(store, async (...args) => { calls++; return fakeRates(...args); }, () => FIXED_NOW);
  assert.equal((await service.get('EUR', 'CNY', '2026-09-01')).date, '2026-09-01');
  assert.equal((await service.get('EUR', 'CNY')).date, '2026-09-04');
  assert.equal(calls, 2);
});

test('simultaneous requests share one provider response and historical cache refreshes daily', async t => {
  const store = new Store(':memory:'); t.after(() => store.close());
  let now = FIXED_NOW, calls = 0;
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  const service = new RateService(store, async (...args) => { calls++; await pending; return fakeRates(...args); }, () => now);
  const first = service.get('EUR', 'CNY', '2026-09-01');
  const second = service.get('EUR', 'CNY', '2026-09-01');
  release();
  assert.deepEqual(await first, await second); assert.equal(calls, 1);
  now += 86_400_000 - 1;
  await service.get('EUR', 'CNY', '2026-09-01'); assert.equal(calls, 1);
  now++;
  await service.get('EUR', 'CNY', '2026-09-01'); assert.equal(calls, 2);
});

test('latest observations and same-currency dates follow the profile timezone', async t => {
  const store = new Store(':memory:'); t.after(() => store.close());
  store.setSetting('profile', JSON.stringify({ ...store.profile(), timeZone: 'America/Los_Angeles' }));
  const service = new RateService(store, fakeRates, () => Date.parse('2026-09-08T01:00:00Z'));
  assert.equal((await service.get('CNY', 'CNY')).date, '2026-09-07');
  const result = await service.get('EUR', 'CNY');
  assert.equal(result.date, '2026-09-07');
  assert.ok(result.history.every(row => row.date <= '2026-09-07'));
});

test('outages return explicitly stale dated cache and never manufacture an unavailable pair', async t => {
  const store = new Store(':memory:'); t.after(() => store.close());
  let now = FIXED_NOW, online = true;
  const service = new RateService(store, async (...args) => {
    if (!online) throw new Error('Network unavailable');
    return fakeRates(...args);
  }, () => now);
  const live = await service.get('EUR', 'CNY');
  online = false; now += 3_600_001;
  const cached = await service.get('EUR', 'CNY');
  assert.equal(cached.stale, true); assert.equal(cached.rate, live.rate); assert.equal(cached.date, live.date);
  await assert.rejects(service.get('USD', 'TWD'), RatesUnavailable);
  assert.equal((await service.get('CNY', 'CNY')).rate, 1);
});

test('provider errors, invalid records and future-only observations cannot become ledger rates', async t => {
  const store = new Store(':memory:'); t.after(() => store.close());
  for (const response of [Response.json({ error: 'bad' }, { status: 500 }), Response.json([{ base: 'EUR', quote: 'CNY', date: '2099-01-01', rate: 999 }]), Response.json([{ base: 'USD', quote: 'CNY', date: '2026-09-04', rate: 1 }]), Response.json([{ base: 'EUR', quote: 'CNY', date: '2026-09-04', rate: -1 }])]) {
    const service = new RateService(store, async () => response, () => FIXED_NOW);
    await assert.rejects(service.get('EUR', 'CNY'), RatesUnavailable);
  }
  assert.equal((store.db.prepare('SELECT count(*) AS count FROM rates').get() as { count: number }).count, 0);
});

test('expense persistence is blocked during an uncached currency-provider outage', async t => {
  const server = await harness({ fetcher: async () => { throw new Error('Offline'); } }); t.after(server.close); await server.login();
  const expense = { amount: 10, currency: 'EUR', category: 'food', note: '', date: '2026-09-04' };
  const response = await server.request('/expenses', 'POST', expense);
  assert.equal(response.status, 503);
  assert.deepEqual(server.store.list('expenses'), []);
  assert.equal((await server.request('/expenses', 'POST', { ...expense, currency: 'CNY' })).status, 201);
});

test('an expense cannot race a profile currency update into a mixed-currency ledger', async t => {
  let release!: () => void;
  let entered!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  const started = new Promise<void>(resolve => { entered = resolve; });
  const server = await harness({ fetcher: async (...args) => { entered(); await pending; return fakeRates(...args); } }); t.after(server.close); await server.login();
  const saving = server.request('/expenses', 'POST', { amount: 10, currency: 'EUR', category: 'food', note: '', date: '2026-09-04' });
  await started;
  assert.equal((await server.request('/profile', 'PUT', { ...server.store.profile(), baseCurrency: 'USD' })).status, 200);
  release();
  assert.equal((await saving).status, 409);
  assert.deepEqual(server.store.list('expenses'), []);
});
