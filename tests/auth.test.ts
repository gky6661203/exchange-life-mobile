import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/app.js';
import { harness, FIXED_NOW, TEST_PASSWORD } from './helpers.js';

test('all private data, exports and originals require an authenticated session', async t => {
  const server = await harness(); t.after(server.close);
  for (const route of ['/data', '/export', '/rates?base=EUR&quote=CNY', '/uploads/00000000-0000-4000-8000-000000000000']) assert.equal((await server.request(route)).status, 401);
  assert.deepEqual(await (await server.request('/auth/status')).json(), { authenticated: false, configured: true, setupAllowed: false });
  const loggedIn = await server.login();
  const setCookie = loggedIn.headers.get('Set-Cookie')!;
  assert.match(setCookie, /HttpOnly/i); assert.match(setCookie, /SameSite=Lax/i); assert.match(setCookie, /Max-Age=2592000/);
  const token = server.cookie.split('=')[1];
  assert.equal(server.store.db.prepare('SELECT token_hash FROM sessions WHERE token_hash=?').get(token), undefined);
  assert.equal(server.store.getSetting('password')!.includes(TEST_PASSWORD), false);
  const data = await (await server.request('/data')).json();
  assert.equal(data.profile.name, '');
  for (const key of ['expenses', 'documents', 'checklists', 'courses', 'exchanges', 'places']) assert.deepEqual(data[key], []);
  assert.equal((await server.request('/auth/logout', 'POST')).status, 204);
  assert.equal((await server.request('/data')).status, 401);
});

test('mutation CSRF protection and origin validation cover login and authenticated writes', async t => {
  const server = await harness(); t.after(server.close);
  assert.equal((await server.app.request('http://localhost/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: TEST_PASSWORD }) })).status, 403);
  assert.equal((await server.request('/auth/login', 'POST', { password: TEST_PASSWORD }, { Origin: 'https://attacker.example' })).status, 403);
  await server.login();
  assert.equal((await server.request('/data', 'GET', undefined, { Origin: 'https://attacker.example' })).status, 403);
  assert.equal((await server.request('/places', 'POST', { name: 'Test' }, { 'X-Requested-With': '' })).status, 403);
});

test('persistent session and private records survive server restart, then expire after 30 days', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'exchange-life-test-'));
  let server: Awaited<ReturnType<typeof harness>> | undefined;
  try {
    const databasePath = join(directory, 'app.sqlite');
    server = await harness({ databasePath });
    await server.login(); const cookie = server.cookie;
    const place = await server.request('/places', 'POST', { name: 'Saved café', category: 'cafe', address: '', note: '', visited: false });
    assert.equal(place.status, 201);
    server.close(); server = undefined;
    server = await harness({ databasePath }); server.setCookie(cookie);
    assert.equal((await (await server.request('/data')).json()).places[0].name, 'Saved café');
    server.close(); server = undefined;
    server = await harness({ databasePath, now: () => FIXED_NOW + 31 * 86_400_000 }); server.setCookie(cookie);
    assert.equal((await server.request('/data')).status, 401);
  } finally { server?.close(); rmSync(directory, { recursive: true, force: true }); }
});

test('changing the deployment password revokes previously issued sessions', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'exchange-life-password-test-'));
  let server: Awaited<ReturnType<typeof harness>> | undefined;
  try {
    const databasePath = join(directory, 'app.sqlite');
    server = await harness({ databasePath }); await server.login(); const cookie = server.cookie;
    server.close(); server = undefined;
    server = await harness({ databasePath, password: 'New-private-password-2026' }); server.setCookie(cookie);
    assert.equal((await server.request('/data')).status, 401);
    await server.login(); assert.equal((await server.request('/data')).status, 200);
  } finally { server?.close(); rmSync(directory, { recursive: true, force: true }); }
});

test('production fails closed without a password, enforces a strong password and disables setup', async t => {
  await assert.rejects(createApp({ production: true, password: '' }), /APP_PASSWORD/);
  await assert.rejects(createApp({ production: true, password: 'short' }), /APP_PASSWORD/);
  await assert.rejects(createApp({ production: true, password: TEST_PASSWORD, publicOrigins: [] }), /APP_ORIGIN/);
  const server = await harness({ production: true, publicOrigins: ['https://exchange.example'] }); t.after(server.close);
  assert.equal((await server.request('/auth/setup', 'POST', { password: TEST_PASSWORD })).status, 403);
  const login = await server.login(); assert.match(login.headers.get('Set-Cookie')!, /Secure/);
  assert.equal((await server.request('/data')).status, 200, 'the configured HTTPS origin works behind an HTTP proxy');
  assert.equal((await server.request('/data', 'GET', undefined, { Origin: 'http://localhost' })).status, 403, 'the internal request origin does not bypass the production allowlist');
  await assert.rejects(createApp({ production: true, password: TEST_PASSWORD, publicOrigins: ['http://exchange.example'] }), /HTTPS/);
  for (const origin of ['https://exchange.example/path', 'https://user:secret@exchange.example', 'https://exchange.example?query=1', 'file:///']) {
    await assert.rejects(createApp({ production: true, password: TEST_PASSWORD, publicOrigins: [origin] }), /APP_ORIGIN/);
  }
});

test('first run requires an actual loopback client as well as a localhost host', async t => {
  const server = await createApp({ databasePath: ':memory:', production: false, getClientAddress: () => '127.0.0.1' }); t.after(server.close);
  const headers = { 'Content-Type': 'application/json', 'X-Requested-With': 'ExchangeLife', Origin: 'http://localhost' };
  assert.equal((await server.app.request('http://localhost/api/auth/setup', { method: 'POST', headers, body: JSON.stringify({ password: 'short' }) })).status, 400);
  assert.equal((await server.app.request('http://localhost/api/auth/setup', { method: 'POST', headers, body: JSON.stringify({ password: TEST_PASSWORD }) })).status, 201);
  assert.equal((await server.app.request('http://localhost/api/auth/setup', { method: 'POST', headers, body: JSON.stringify({ password: TEST_PASSWORD }) })).status, 409);
  const remote = await createApp({ databasePath: ':memory:', production: false, getClientAddress: () => '192.168.1.42' }); t.after(remote.close);
  assert.equal((await remote.app.request('http://localhost/api/auth/setup', { method: 'POST', headers, body: JSON.stringify({ password: TEST_PASSWORD }) })).status, 403);
});

test('repeated wrong passwords are rate limited and the window recovers', async t => {
  let now = FIXED_NOW;
  const server = await harness({ now: () => now }); t.after(server.close);
  for (let i = 0; i < 8; i++) assert.equal((await server.request('/auth/login', 'POST', { password: 'incorrect' })).status, 401);
  const blocked = await server.request('/auth/login', 'POST', { password: TEST_PASSWORD });
  assert.equal(blocked.status, 429); assert.ok(Number(blocked.headers.get('Retry-After')) > 0);
  now += 15 * 60_000 + 1;
  assert.equal((await server.request('/auth/login', 'POST', { password: TEST_PASSWORD })).status, 200);
});
