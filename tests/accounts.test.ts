import test from 'node:test';
import assert from 'node:assert/strict';
import { createAccountBackend } from '../server/account-backend';
const password = 'A-safe-test-password-2026!';
function client(backend: ReturnType<typeof createAccountBackend>) {
  let cookie = '';
  return {
    get cookie() { return cookie; },
    setCookie(value: string) { cookie = value; },
    async request(path: string, method = 'GET', value?: unknown, extras: Record<string, string> = {}) {
      const headers = new Headers({ Origin: 'https://exchange.test', 'X-Requested-With': 'ExchangeLife', ...extras });
      if (cookie) headers.set('Cookie', cookie);
      const body = value instanceof FormData ? value : value === undefined ? undefined : JSON.stringify(value);
      if (value !== undefined && !(value instanceof FormData)) headers.set('Content-Type', 'application/json');
      const response = await backend.fetch(new Request(`https://exchange.test/api${path}`, { method, headers, body }));
      if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie')!.split(';')[0];
      return response;
    },
  };
}
test('registration, normalized Email, hashed credentials, secure sessions, duplicate accounts and logout', async t => {
  const backend = createAccountBackend(':memory:'); t.after(backend.close); const browser = client(backend);
  assert.equal((await browser.request('/data')).status, 401);
  assert.equal((await browser.request('/auth/register', 'POST', { email: 'a@example.com', password: 'short', name: 'A' })).status, 400);
  const register = await browser.request('/auth/register', 'POST', { email: ' Alice@Example.com ', password, name: 'Alice' });
  assert.equal(register.status, 201); assert.match(register.headers.get('set-cookie')!, /HttpOnly/); assert.match(register.headers.get('set-cookie')!, /Secure/);
  const user = (await register.json()).user; assert.equal(user.email, 'alice@example.com'); assert.equal(user.password_hash, undefined);
  const row = backend.database.prepare('SELECT password_hash FROM accounts').get()!; assert.ok(!String(row.password_hash).includes(password));
  assert.equal(backend.database.prepare('SELECT token_hash FROM account_sessions WHERE token_hash=?').get(browser.cookie.split('=')[1]), undefined);
  const data = await (await browser.request('/data')).json(); assert.equal(data.profile.name, 'Alice'); assert.deepEqual(data.documents, []);
  assert.equal((await browser.request('/auth/register', 'POST', { email: 'ALICE@example.com', password, name: 'Other' })).status, 409);
  const oldCookie = browser.cookie; assert.equal((await browser.request('/auth/logout', 'POST')).status, 204);
  browser.setCookie(oldCookie); assert.equal((await browser.request('/data')).status, 401);
  assert.equal((await browser.request('/auth/login', 'POST', { email: 'alice@example.com', password: 'wrong' })).status, 401);
  assert.equal((await browser.request('/auth/login', 'POST', { email: 'ALICE@example.com', password })).status, 200);
  backend.database.prepare('UPDATE account_sessions SET expires_at=0').run(); assert.equal((await browser.request('/data')).status, 401);
});
test('accounts cannot read, modify, export or fetch another account’s records or photos', async t => {
  const backend = createAccountBackend(':memory:'); t.after(backend.close); const alice = client(backend), bob = client(backend);
  for (const [browser, name] of [[alice, 'Alice'], [bob, 'Bob']] as const) assert.equal((await browser.request('/auth/register', 'POST', { email: `${name}@example.com`, password, name })).status, 201);
  const placeInput = { name: 'Private café', category: 'cafe', address: '', note: '', visited: false };
  const saved = await alice.request('/places', 'POST', placeInput); assert.equal(saved.status, 201); const item = await saved.json();
  const form = new FormData(); form.set('image', new File([new Uint8Array([137,80,78,71,13,10,26,10,...new Array(40).fill(0)])], 'private.png', { type: 'image/png' }));
  const upload = await alice.request('/uploads', 'POST', form); assert.equal(upload.status, 201); const photo = await upload.json();
  assert.equal((await alice.request(`/uploads/${photo.id}`)).status, 200); assert.equal((await bob.request(`/uploads/${photo.id}`)).status, 404);
  assert.deepEqual((await (await bob.request('/data')).json()).places, []);
  assert.equal((await bob.request(`/places/${item.id}`, 'PUT', placeInput)).status, 404);
  assert.equal((await bob.request(`/places/${item.id}`, 'DELETE')).status, 404);
  const exported = await (await bob.request('/export')).json(); assert.deepEqual(exported.places, []); assert.deepEqual(exported.originals, []);
  assert.equal((await (await alice.request('/data')).json()).places.length, 1);
});
test('legacy Email records are preserved and cannot be claimed by merely registering the same Email', async t => {
  const backend = createAccountBackend(':memory:'); t.after(backend.close);
  backend.database.prepare('INSERT INTO profiles(owner,data,updated_at) VALUES(?,?,?)').run('owner@example.com', JSON.stringify({ name: 'Original private data' }), Date.now());
  const browser = client(backend);
  assert.equal((await browser.request('/auth/register', 'POST', { email: 'owner@example.com', password, name: 'New account' }, { 'oai-authenticated-user-id': 'forged', 'oai-authenticated-user-email': 'owner@example.com' })).status, 201);
  assert.equal((await (await browser.request('/data')).json()).profile.name, 'New account');
  assert.equal(backend.database.prepare('SELECT owner FROM profiles').get()!.owner, 'owner@example.com');
});
test('login and registration reject cross-site requests and repeated failed logins are limited', async t => {
  const backend = createAccountBackend(':memory:'); t.after(backend.close); const browser = client(backend);
  assert.equal((await browser.request('/auth/login', 'POST', { email: 'a@example.com', password }, { Origin: 'https://attacker.test' })).status, 403);
  assert.equal((await browser.request('/auth/register', 'POST', { email: 'a@example.com', password, name: 'A' }, { 'X-Requested-With': '' })).status, 403);
  for (let i = 0; i < 12; i++) assert.equal((await browser.request('/auth/login', 'POST', { email: 'absent@example.com', password: 'incorrect' })).status, 401);
  const limited = await browser.request('/auth/login', 'POST', { email: 'absent@example.com', password }); assert.equal(limited.status, 429); assert.ok(limited.headers.get('retry-after'));
});
