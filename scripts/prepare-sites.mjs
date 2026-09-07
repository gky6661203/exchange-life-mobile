import { cp, mkdir, rm } from 'node:fs/promises';
await rm('dist/server', { recursive: true, force: true });
await mkdir('dist/server', { recursive: true });
await cp('dist/exchange_life/index.js', 'dist/server/index.js');
await cp('dist/exchange_life/wrangler.json', 'dist/server/wrangler.json');
