import assert from 'node:assert/strict';
import { createApp, type AppOptions } from '../server/app.js';

export const TEST_PASSWORD = 'Only-for-tests-2026!';
export const FIXED_NOW = Date.parse('2026-09-06T12:00:00Z');
export const fakeRates: typeof fetch = async input => {
  const url = new URL(String(input));
  const base = url.searchParams.get('base')!, quote = url.searchParams.get('quotes')!;
  const end = Date.parse(`${url.searchParams.get('to')}T00:00:00Z`);
  const rows = [];
  for (let time = Date.parse(`${url.searchParams.get('from')}T00:00:00Z`); time <= end; time += 86_400_000) {
    const day = new Date(time);
    if (day.getUTCDay() !== 0 && day.getUTCDay() !== 6) rows.push({ date: day.toISOString().slice(0, 10), base, quote, rate: 7.8123 });
  }
  return Response.json(rows);
};

export async function harness(options: AppOptions = {}) {
  const backend = await createApp({ databasePath: ':memory:', production: false, password: TEST_PASSWORD, getClientAddress: () => '127.0.0.1', now: () => FIXED_NOW, fetcher: fakeRates, ...options });
  let cookie = '';
  const origin = options.production ? options.publicOrigins?.[0] ?? 'https://exchange.example' : 'http://localhost';
  async function request(path: string, method = 'GET', value?: unknown, extraHeaders: Record<string, string> = {}) {
    const headers = new Headers({ 'X-Requested-With': 'ExchangeLife', Origin: origin, ...extraHeaders });
    if (cookie) headers.set('Cookie', cookie);
    const body = value instanceof FormData ? value : value === undefined ? undefined : JSON.stringify(value);
    if (value !== undefined && !(value instanceof FormData)) headers.set('Content-Type', 'application/json');
    return backend.app.request(`http://localhost/api${path}`, { method, headers, body });
  }
  async function login() {
    const response = await request('/auth/login', 'POST', { password: options.password ?? TEST_PASSWORD });
    assert.equal(response.status, 200);
    cookie = response.headers.get('Set-Cookie')!.split(';')[0];
    return response;
  }
  return { ...backend, request, login, get cookie() { return cookie; }, setCookie(value: string) { cookie = value; } };
}
