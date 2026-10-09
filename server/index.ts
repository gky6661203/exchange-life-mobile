import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { serveStatic } from '@hono/node-server/serve-static';
import { createAccountBackend } from './account-backend.js';

const port = Number(process.env.PORT ?? 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a valid TCP port.');
const { fetch: apiFetch, close } = createAccountBackend();
const app = new Hono();
app.all('/api/*', c => apiFetch(c.req.raw));
app.use('*', serveStatic({ root: './dist' }));
app.get('*', serveStatic({ path: './dist/index.html' }));
const server = serve({ fetch: app.fetch, port, hostname: process.env.HOST ?? '0.0.0.0' });
console.log(`Exchange Life API is listening on port ${port}.`);
let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  server.close(() => { close(); process.exit(0); });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);




