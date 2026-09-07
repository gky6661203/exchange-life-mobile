import assert from 'node:assert/strict';
import test from 'node:test';
import { fakeRates, harness } from './helpers.js';

test('expense conversion is calculated server-side using historical provider data', async t => {
  const server = await harness(); t.after(server.close); await server.login();
  const response = await server.request('/expenses', 'POST', { amount: 10, currency: 'EUR', category: 'food', note: 'Lunch', date: '2026-09-05', rate: 0, baseAmount: 0, baseCurrency: 'USD', rateDate: '2099-01-01', id: 'injected' });
  assert.equal(response.status, 201);
  const item = await response.json();
  assert.equal(item.rate, 7.8123); assert.equal(item.baseAmount, 78.12); assert.equal(item.baseCurrency, 'CNY'); assert.equal(item.rateDate, '2026-09-04'); assert.notEqual(item.id, 'injected');
  const profile = server.store.profile();
  assert.equal((await server.request('/profile', 'PUT', { ...profile, baseCurrency: 'USD' })).status, 409);
  assert.equal(server.store.profile().baseCurrency, 'CNY');
  assert.equal((await server.request(`/expenses/${item.id}`, 'PUT', { amount: 11, currency: 'CNY', category: 'food', note: '', date: '2026-09-05' })).status, 200);
  const saved = (await (await server.request('/data')).json()).expenses[0];
  assert.equal(saved.rate, 1); assert.equal(saved.baseAmount, 11);
  assert.equal((await server.request(`/expenses/${item.id}`, 'DELETE')).status, 204);
  assert.deepEqual((await (await server.request('/data')).json()).expenses, []);
});

test('invalid money, impossible dates, future expenses and invalid currencies cannot be stored', async t => {
  const server = await harness(); t.after(server.close); await server.login();
  const expense = { amount: 10, currency: 'CNY', category: 'food', note: '', date: '2026-09-06' };
  for (const patch of [{ amount: 0 }, { amount: -1 }, { amount: null }, { amount: 1e50 }, { date: '2026-02-30' }, { date: '2026-09-07' }, { currency: 'ABC' }, { category: '' }]) assert.equal((await server.request('/expenses', 'POST', { ...expense, ...patch })).status, 400, JSON.stringify(patch));
  const profile = server.store.profile();
  assert.equal((await server.request('/profile', 'PUT', { ...profile, departureDate: '2026-10-01', returnDate: '2026-09-01' })).status, 400);
  assert.equal((await server.request('/profile', 'PUT', { ...profile, timeZone: 'Mars/Olympus' })).status, 400);
  assert.equal((await server.request('/profile', 'PUT', { ...profile, monthlyBudgets: { '2026-13': 10 } })).status, 400);
  assert.equal((await server.request('/rates?base=ABC&quote=CNY')).status, 400);
  assert.deepEqual((await (await server.request('/data')).json()).expenses, []);
});

test('expense date validation uses the configured local timezone', async t => {
  const server = await harness({ now: () => Date.parse('2026-09-06T20:00:00Z') }); t.after(server.close); await server.login();
  const response = await server.request('/expenses', 'POST', { amount: 10, currency: 'CNY', category: 'food', note: '', date: '2026-09-07' });
  assert.equal(response.status, 201);
  assert.equal((await response.json()).rateDate, '2026-09-07');
});

for (const action of ['update', 'delete'] as const) test(`a pending expense conversion cannot overwrite a concurrent ${action}`, { timeout: 10_000 }, async t => {
  let release!: () => void, entered!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  const started = new Promise<void>(resolve => { entered = resolve; });
  const server = await harness({ fetcher: async (...args) => { entered(); await pending; return fakeRates(...args); } });
  t.after(server.close); await server.login();
  const expense = { amount: 10, currency: 'CNY', category: 'food', note: '', date: '2026-09-04' };
  const created = await (await server.request('/expenses', 'POST', expense)).json();
  const slowSave = server.request(`/expenses/${created.id}`, 'PUT', { ...expense, amount: 20, currency: 'EUR' });
  try {
    await started;
    if (action === 'delete') assert.equal((await server.request(`/expenses/${created.id}`, 'DELETE')).status, 204);
    else assert.equal((await server.request(`/expenses/${created.id}`, 'PUT', { ...expense, amount: 30 })).status, 200);
  } finally { release(); }
  assert.equal((await slowSave).status, action === 'delete' ? 404 : 409);
  const rows = server.store.list<{ amount: number; currency: string }>('expenses');
  if (action === 'delete') assert.deepEqual(rows, []);
  else { assert.equal(rows.length, 1); assert.equal(rows[0].amount, 30); assert.equal(rows[0].currency, 'CNY'); }
});

test('checklists, courses, exchanges, places and documents support validated CRUD', async t => {
  const server = await harness(); t.after(server.close); await server.login();
  const examples = {
    checklists: { group: 'daily', title: 'Apply for a visa', dueDate: '2026-10-01', done: false },
    courses: { name: 'History', room: 'A2', teacher: 'Teacher', weekday: 1, startPeriod: 2, endPeriod: 3 },
    exchanges: { date: '2026-09-01', fromCurrency: 'CNY', toCurrency: 'EUR', fromAmount: 100, toAmount: 12, note: '' },
    places: { name: 'Library', category: 'study', address: 'Campus', note: '', visited: false },
    documents: { name: 'Passport', number: 'TEST-ONLY', expiryDate: '2028-01-01', note: '' },
  };
  for (const [collection, example] of Object.entries(examples)) {
    const created = await server.request(`/${collection}`, 'POST', example);
    assert.equal(created.status, 201, collection); const item = await created.json();
    const updated = await server.request(`/${collection}/${item.id}`, 'PUT', { ...example, ...(collection === 'checklists' ? { done: true } : {}) });
    assert.equal(updated.status, 200, collection);
    if (collection === 'checklists') assert.equal((await updated.json()).done, true);
    assert.equal((await server.request(`/${collection}/${item.id}`, 'DELETE')).status, 204, collection);
    assert.equal((await server.request(`/${collection}/${item.id}`, 'PUT', example)).status, 404, collection);
  }
});

test('course conflicts include partial overlaps and reject out-of-range day/period values', async t => {
  const server = await harness(); t.after(server.close); await server.login();
  const course = { name: 'Math', room: '', teacher: '', weekday: 3, startPeriod: 4, endPeriod: 6 };
  const created = await (await server.request('/courses', 'POST', course)).json();
  for (const range of [[3, 4], [5, 5], [6, 7], [1, 12]]) assert.equal((await server.request('/courses', 'POST', { ...course, startPeriod: range[0], endPeriod: range[1] })).status, 409);
  assert.equal((await server.request('/courses', 'POST', { ...course, startPeriod: 7, endPeriod: 8 })).status, 201);
  assert.equal((await server.request('/courses', 'POST', { ...course, weekday: 4 })).status, 201);
  assert.equal((await server.request(`/courses/${created.id}`, 'PUT', { ...course, name: 'Updated' })).status, 200);
  for (const patch of [{ weekday: 0 }, { weekday: 8 }, { startPeriod: 0 }, { endPeriod: 17 }, { startPeriod: 7, endPeriod: 6 }, { weekday: 1.5 }]) assert.equal((await server.request('/courses', 'POST', { ...course, ...patch })).status, 400);
});

test('malformed JSON and oversized payloads produce controlled errors', async t => {
  const server = await harness(); t.after(server.close); await server.login();
  const headers = { Cookie: server.cookie, 'X-Requested-With': 'ExchangeLife', 'Content-Type': 'application/json' };
  const malformed = await server.app.request('http://localhost/api/places', { method: 'POST', headers, body: '{not json' });
  assert.equal(malformed.status, 400); assert.equal(typeof (await malformed.json()).error, 'string');
  const large = await server.app.request('http://localhost/api/places', { method: 'POST', headers, body: JSON.stringify({ note: 'a'.repeat(130 * 1024) }) });
  assert.equal(large.status, 413);
});
