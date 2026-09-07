import { createHash, randomBytes, randomUUID, scrypt, scryptSync, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { Hono, type Context } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { bodyLimit } from 'hono/body-limit';
import { getConnInfo } from '@hono/node-server/conninfo';
import { serveStatic } from '@hono/node-server/serve-static';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import type { Collection, Course, DocumentItem } from '../src/lib/types.js';
import { Store, collections } from './db.js';
import { RateService, RatesUnavailable } from './rates.js';
import { currency, isDate, loginSchema, passwordSchema, profileSchema, schemas, todayInZone } from './validation.js';

const scryptAsync = promisify(scrypt);
const SESSION_SECONDS = 30 * 24 * 60 * 60;
const UPLOAD_BYTES = 8 * 1024 * 1024;
const MUTATIONS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const COOKIE_NAME = 'exchange_session';
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

function hashPassword(password: string): string {
  const salt = randomBytes(32).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}
async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [salt, stored] = encoded.split(':');
  if (!salt || !stored || !/^[a-f0-9]{128}$/.test(stored)) return false;
  const derived = await scryptAsync(password, salt, 64) as Buffer;
  return timingSafeEqual(derived, Buffer.from(stored, 'hex'));
}
function apiError(status: 400 | 401 | 403 | 404 | 409 | 413 | 429 | 503, message: string): never {
  throw new HTTPException(status, { message });
}
function loopback(value: string): boolean { return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(value); }
function localhost(value: string): boolean { return ['localhost', '127.0.0.1', '[::1]'].includes(value); }

interface UploadRow { id: string; mime: string; name: string; bytes: Uint8Array; created_at: number }
export interface AppOptions {
  databasePath?: string;
  password?: string;
  production?: boolean;
  publicOrigins?: string[];
  fetcher?: typeof fetch;
  now?: () => number;
  getClientAddress?: (context: Context) => string;
  staticRoot?: string;
}

/** PNG, JPEG, and WebP only. SVG/HTML are deliberately never served as uploads. */
export function imageMime(bytes: Buffer): string | undefined {
  if (bytes.length >= 45 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && bytes.readUInt32BE(8) === 13 && bytes.toString('ascii', 12, 16) === 'IHDR') {
    const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
    if (width > 0 && height > 0 && width <= 12000 && height <= 12000 && width * height <= 40_000_000 && bytes.subarray(-8, -4).toString('ascii') === 'IEND') return 'image/png';
  }
  if (bytes.length >= 24 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff && bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9) {
    // Require an actual JPEG start-of-frame with bounded decoded dimensions.
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) break;
      while (bytes[offset] === 0xff) offset++;
      const marker = bytes[offset++];
      if (marker === 0xda || marker === 0xd9) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > bytes.length) break;
      const length = bytes.readUInt16BE(offset);
      if (length < 2 || offset + length > bytes.length) break;
      if ([0xc0, 0xc1, 0xc2].includes(marker) && length >= 8) {
        const height = bytes.readUInt16BE(offset + 3), width = bytes.readUInt16BE(offset + 5);
        if (width > 0 && height > 0 && width <= 12000 && height <= 12000 && width * height <= 40_000_000) return 'image/jpeg';
      }
      offset += length;
    }
  }
  if (bytes.length >= 30 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP' && bytes.readUInt32LE(4) + 8 === bytes.length) {
    const format = bytes.toString('ascii', 12, 16);
    let width = 0, height = 0;
    if (format === 'VP8X') { width = 1 + bytes.readUIntLE(24, 3); height = 1 + bytes.readUIntLE(27, 3); }
    if (format === 'VP8L' && bytes[20] === 0x2f) { const bits = bytes.readUInt32LE(21); width = (bits & 0x3fff) + 1; height = ((bits >>> 14) & 0x3fff) + 1; }
    if (format === 'VP8 ' && bytes.toString('hex', 23, 26) === '9d012a') { width = bytes.readUInt16LE(26) & 0x3fff; height = bytes.readUInt16LE(28) & 0x3fff; }
    if (width > 0 && height > 0 && width <= 12000 && height <= 12000 && width * height <= 40_000_000) return 'image/webp';
  }
  return undefined;
}

export async function createApp(options: AppOptions = {}) {
  const production = options.production ?? process.env.NODE_ENV === 'production';
  const password = options.password ?? process.env.APP_PASSWORD;
  if (password !== undefined && !passwordSchema.safeParse({ password }).success) throw new Error('APP_PASSWORD must contain 12–256 characters.');
  if (production && !password) throw new Error('Production requires APP_PASSWORD with at least 12 characters.');
  const now = options.now ?? Date.now;
  const publicOrigins = new Set((options.publicOrigins ?? (process.env.APP_ORIGIN ?? '').split(',').filter(Boolean)).map(value => {
    const parsed = new URL(value.trim());
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) throw new Error('APP_ORIGIN must contain only HTTP(S) origins without credentials, paths, queries, or fragments.');
    if (production && parsed.protocol !== 'https:' && !localhost(parsed.hostname)) throw new Error('APP_ORIGIN must use HTTPS in production.');
    return parsed.origin;
  }));
  if (production && !publicOrigins.size) throw new Error('Production requires APP_ORIGIN with the public HTTPS origin.');
  const store = new Store(options.databasePath ?? process.env.DATABASE_PATH ?? resolve('data', 'exchange-life.sqlite'));
  if (password && !(await verifyPassword(password, store.getSetting('password') ?? ''))) {
    store.setSetting('password', hashPassword(password));
    store.db.exec('DELETE FROM sessions');
  }
  const rates = new RateService(store, options.fetcher, now);
  const app = new Hono();
  const attempts = new Map<string, { count: number; start: number }>();
  const dummyPassword = hashPassword(randomBytes(32).toString('hex'));

  function clientAddress(c: Context): string {
    if (options.getClientAddress) return options.getClientAddress(c);
    try { return getConnInfo(c).remote.address ?? 'unknown'; } catch { return 'unknown'; }
  }
  function setupAllowed(c: Context): boolean {
    const origin = c.req.header('Origin');
    return !production && !password && localhost(new URL(c.req.url).hostname) && loopback(clientAddress(c)) && (!origin || localhost(new URL(origin).hostname));
  }
  function authenticated(c: Context): boolean {
    const token = getCookie(c, COOKIE_NAME);
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return false;
    const row = store.db.prepare('SELECT expires_at FROM sessions WHERE token_hash=?').get(hashToken(token)) as { expires_at: number } | undefined;
    return !!row && row.expires_at > now();
  }
  function setSession(c: Context) {
    store.db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now());
    // Replace this browser's old session and cap long-lived sessions for the private account.
    const previous = getCookie(c, COOKIE_NAME);
    if (previous) store.db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hashToken(previous));
    store.db.exec('DELETE FROM sessions WHERE token_hash IN (SELECT token_hash FROM sessions ORDER BY expires_at DESC LIMIT -1 OFFSET 19)');
    const token = randomBytes(32).toString('hex');
    store.db.prepare('INSERT INTO sessions(token_hash,expires_at) VALUES(?,?)').run(hashToken(token), now() + SESSION_SECONDS * 1000);
    setCookie(c, COOKIE_NAME, token, { httpOnly: true, secure: production || new URL(c.req.url).protocol === 'https:', sameSite: 'Lax', path: '/', maxAge: SESSION_SECONDS });
  }
  function rateLimit(c: Context) {
    const cutoff = now() - 15 * 60 * 1000;
    for (const [key, entry] of attempts) if (entry.start < cutoff) attempts.delete(key);
    for (const [key, limit] of [[`address:${clientAddress(c)}`, 8], ['global', 30]] as const) {
      const entry = attempts.get(key) ?? { count: 0, start: now() };
      entry.count++;
      attempts.set(key, entry);
      if (entry.count > limit) {
        c.header('Retry-After', String(Math.max(1, Math.ceil((entry.start + 15 * 60 * 1000 - now()) / 1000))));
        apiError(429, '嘗試次數過多，請 15 分鐘後再試');
      }
    }
  }
  async function json<T>(c: Context, schema: z.ZodType<T>): Promise<T> {
    if (!c.req.header('Content-Type')?.toLowerCase().startsWith('application/json')) apiError(400, '請使用 JSON 格式');
    let data: unknown;
    try { data = await c.req.json(); } catch { apiError(400, 'JSON 格式不正確'); }
    const parsed = schema.safeParse(data);
    if (!parsed.success) apiError(400, parsed.error.issues[0]?.message ?? '欄位格式不正確');
    return parsed.data;
  }
  function requireCollection(c: Context): Collection {
    const collection = c.req.param('collection');
    if (!collections.includes(collection as Collection)) apiError(404, '找不到此資料類別');
    return collection as Collection;
  }
  function requireId(c: Context): string {
    const parsed = z.string().uuid().safeParse(c.req.param('id'));
    if (!parsed.success) apiError(404, '找不到此項目');
    return parsed.data;
  }
  function removeUnusedImage(id: string | undefined) {
    if (id && !store.list<DocumentItem>('documents').some(item => item.imageId === id)) store.db.prepare('DELETE FROM uploads WHERE id=?').run(id);
  }

  app.use('*', async (c, next) => {
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('X-Frame-Options', 'DENY');
    c.header('Referrer-Policy', 'same-origin');
    c.header('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
    if (production) c.header('Strict-Transport-Security', 'max-age=31536000');
    await next();
  });
  app.use('/api/*', async (c, next) => {
    c.header('Cache-Control', 'no-store');
    const origin = c.req.header('Origin');
    let validOrigin = !origin;
    if (origin) {
      try { validOrigin = publicOrigins.has(origin) || (!production && origin === new URL(c.req.url).origin); } catch { validOrigin = false; }
    }
    if (!validOrigin) apiError(403, '此來源不允許存取私人資料');
    if (origin && publicOrigins.has(origin)) {
      c.header('Access-Control-Allow-Origin', origin);
      c.header('Access-Control-Allow-Credentials', 'true');
      c.header('Vary', 'Origin');
    }
    if (c.req.method === 'OPTIONS') {
      c.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
      c.header('Access-Control-Allow-Headers', 'Content-Type,X-Requested-With');
      return c.body(null, 204);
    }
    if (MUTATIONS.has(c.req.method) && c.req.header('X-Requested-With') !== 'ExchangeLife') apiError(403, '請透過應用程式操作');
    if (c.req.header('Sec-Fetch-Site') === 'cross-site' && (!origin || !publicOrigins.has(origin))) apiError(403, '此來源不允許存取私人資料');
    await next();
  });
  const uploadLimit = bodyLimit({ maxSize: UPLOAD_BYTES + 64 * 1024, onError: c => c.json({ error: '上傳檔案不得超過 8 MB' }, 413) });
  const jsonLimit = bodyLimit({ maxSize: 128 * 1024, onError: c => c.json({ error: '資料內容過大' }, 413) });
  app.use('/api/*', (c, next) => (c.req.path === '/api/uploads' ? uploadLimit : jsonLimit)(c, next));

  app.get('/api/auth/status', c => c.json({ authenticated: authenticated(c), configured: !!store.getSetting('password'), setupAllowed: setupAllowed(c) }));
  app.post('/api/auth/setup', async c => {
    if (!setupAllowed(c)) apiError(403, '首次設定僅允許在本機開發環境進行，正式環境請設定 APP_PASSWORD');
    rateLimit(c);
    const { password: initialPassword } = await json(c, passwordSchema);
    if (store.getSetting('password')) apiError(409, '密碼已設定，請直接登入');
    store.setSetting('password', hashPassword(initialPassword));
    setSession(c);
    return c.json({ authenticated: true }, 201);
  });
  app.post('/api/auth/login', async c => {
    rateLimit(c);
    const { password: attempt } = await json(c, loginSchema);
    const encoded = store.getSetting('password');
    const matches = await verifyPassword(attempt, encoded ?? dummyPassword);
    if (!encoded || !matches) apiError(401, '密碼不正確或帳戶尚未設定');
    setSession(c);
    return c.json({ authenticated: true });
  });
  app.post('/api/auth/logout', c => {
    const token = getCookie(c, COOKIE_NAME);
    if (token) store.db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hashToken(token));
    deleteCookie(c, COOKIE_NAME, { path: '/', httpOnly: true, secure: production, sameSite: 'Lax' });
    return c.body(null, 204);
  });
  app.use('/api/*', async (c, next) => {
    if (!authenticated(c)) apiError(401, '請先登入以存取私人資料');
    await next();
  });

  app.get('/api/data', c => c.json(store.data()));
  app.put('/api/profile', async c => {
    const profile = await json(c, profileSchema);
    if (profile.baseCurrency !== store.profile().baseCurrency && store.list('expenses').length) apiError(409, '已有記帳資料時無法變更本位幣，以免混合不同幣別的統計');
    store.setSetting('profile', JSON.stringify(profile));
    return c.json(profile);
  });
  app.get('/api/rates', async c => {
    const base = currency.safeParse(c.req.query('base'));
    const quote = currency.safeParse(c.req.query('quote'));
    const date = c.req.query('date');
    if (!base.success || !quote.success || (date !== undefined && (!isDate(date) || date > todayInZone(now(), store.profile().timeZone)))) apiError(400, '請提供有效的幣別與日期，日期不可晚於今天');
    return c.json(await rates.get(base.data, quote.data, date));
  });
  app.get('/api/export', c => {
    const originals = (store.db.prepare('SELECT id,mime,name,bytes,created_at FROM uploads ORDER BY created_at').all() as unknown as UploadRow[]).map(row => ({ id: row.id, name: row.name, mime: row.mime, createdAt: new Date(row.created_at).toISOString(), encoding: 'base64', data: Buffer.from(row.bytes).toString('base64') }));
    c.header('Content-Disposition', `attachment; filename="exchange-life-${new Date(now()).toISOString().slice(0, 10)}.json"`);
    return c.json({ format: 'exchange-life', version: 1, exportedAt: new Date(now()).toISOString(), ...store.data(), originals });
  });

  app.post('/api/uploads', async c => {
    let form: FormData;
    try { form = await c.req.formData(); } catch { apiError(400, '請使用表單上傳圖片'); }
    const file = form.get('image');
    if (!(file instanceof File)) apiError(400, '請選擇證件圖片');
    if (file.size <= 0 || file.size > UPLOAD_BYTES) apiError(413, '圖片大小必須介於 1 位元組及 8 MB 之間');
    const bytes = Buffer.from(await file.arrayBuffer());
    const mime = imageMime(bytes);
    if (!mime || mime !== file.type.toLowerCase()) apiError(400, '圖片格式無效，請使用 JPEG、PNG 或 WebP 圖片');
    const id = randomUUID();
    const name = file.name.replace(/[\x00-\x1f\x7f/\\]/g, '_').slice(0, 200) || 'document-image';
    store.db.prepare('INSERT INTO uploads(id,mime,name,bytes,created_at) VALUES(?,?,?,?,?)').run(id, mime, name, bytes, now());
    return c.json({ id }, 201);
  });
  app.get('/api/uploads/:id', c => {
    const id = requireId(c);
    const row = store.db.prepare('SELECT id,mime,name,bytes,created_at FROM uploads WHERE id=?').get(id) as unknown as UploadRow | undefined;
    if (!row) apiError(404, '找不到圖片');
    c.header('Content-Type', row.mime);
    c.header('Content-Disposition', `inline; filename="document.${row.mime.split('/')[1]}"`);
    c.header('Content-Security-Policy', "default-src 'none'; sandbox");
    return c.body(new Uint8Array(row.bytes));
  });
  app.delete('/api/uploads/:id', c => {
    const id = requireId(c);
    if (!store.db.prepare('SELECT id FROM uploads WHERE id=?').get(id)) apiError(404, '找不到圖片');
    if (store.list<DocumentItem>('documents').some(item => item.imageId === id)) apiError(409, '圖片仍由證件使用，請先移除證件中的圖片');
    store.db.prepare('DELETE FROM uploads WHERE id=?').run(id);
    return c.body(null, 204);
  });

  async function save(c: Context) {
    const collection = requireCollection(c);
    const id = c.req.method === 'PUT' ? requireId(c) : randomUUID();
    const previous = store.get<DocumentItem>(collection, id);
    if (c.req.method === 'PUT' && !previous) apiError(404, '找不到此項目');
    // Each branch is validated with its own schema; conversion fields from clients are stripped.
    const item = { ...await json(c, schemas[collection] as z.ZodType<Record<string, unknown>>), id } as Record<string, unknown> & { id: string };
    if (collection === 'expenses') {
      const profile = store.profile();
      if ((item.date as string) > todayInZone(now(), profile.timeZone)) apiError(400, '支出日期不能晚於今天');
      const rate = await rates.get(item.currency as string, profile.baseCurrency, item.date as string);
      if (rate.stale) apiError(503, '目前只能取得過期匯率，請稍後再儲存這筆支出');
      item.rate = rate.rate;
      item.baseAmount = Math.round(((item.amount as number) * rate.rate + Number.EPSILON) * 100) / 100;
      item.baseCurrency = profile.baseCurrency;
      item.rateDate = rate.date;
      if (store.profile().baseCurrency !== profile.baseCurrency) apiError(409, '本位幣剛剛變更，請重新儲存支出');
      if (!Number.isFinite(item.baseAmount) || (item.baseAmount as number) > 1_000_000_000_000) apiError(400, '換算後金額超出上限');
    }
    if (collection === 'exchanges' && (item.date as string) > todayInZone(now(), store.profile().timeZone)) apiError(400, '換匯日期不能晚於今天');
    if (collection === 'documents' && item.imageId && !store.db.prepare('SELECT id FROM uploads WHERE id=?').get(item.imageId as string)) apiError(400, '證件圖片不存在，請重新上傳');
    if (collection === 'courses') {
      const course = item as unknown as Course;
      if (store.list<Course>('courses').some(other => other.id !== id && other.weekday === course.weekday && other.startPeriod <= course.endPeriod && other.endPeriod >= course.startPeriod)) apiError(409, '這個時段已有課程，請調整星期或節次');
    }
    // Recheck the original snapshot after awaited body/rate reads so older requests cannot overwrite newer saves.
    if (c.req.method === 'PUT') {
      const current = store.get(collection, id);
      if (!current) apiError(404, '此項目已刪除，請重新整理');
      if (JSON.stringify(current) !== JSON.stringify(previous)) apiError(409, '此項目剛剛更新，請重新整理後再儲存');
    }
    store.save(collection, item, now());
    if (collection === 'documents' && previous?.imageId !== item.imageId) removeUnusedImage(previous?.imageId);
    return c.json(item, c.req.method === 'POST' ? 201 : 200);
  }
  app.post('/api/:collection', save);
  app.put('/api/:collection/:id', save);
  app.delete('/api/:collection/:id', c => {
    const collection = requireCollection(c), id = requireId(c);
    const item = store.get<DocumentItem>(collection, id);
    if (!item) apiError(404, '找不到此項目');
    store.delete(collection, id);
    if (collection === 'documents') removeUnusedImage(item.imageId);
    return c.body(null, 204);
  });
  app.all('/api/*', c => c.json({ error: '找不到此 API' }, 404));

  if (production || options.staticRoot) {
    const root = options.staticRoot ?? './dist';
    app.use('/*', serveStatic({ root }));
    app.get('*', serveStatic({ path: `${root}/index.html` }));
  }
  app.onError((error, c) => {
    if (error instanceof HTTPException) return c.json({ error: error.message }, error.status);
    if (error instanceof RatesUnavailable) return c.json({ error: error.message }, 503);
    // Never log request bodies, passwords, document metadata, or private record contents.
    console.error('[exchange-life] Request failed:', error instanceof Error ? error.name : 'UnknownError');
    return c.json({ error: '伺服器暫時無法完成操作，請稍後再試' }, 500);
  });
  return { app, store, rates, close: () => store.close() };
}
