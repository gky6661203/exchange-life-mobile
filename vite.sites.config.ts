import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { cloudflare } from '@cloudflare/vite-plugin';
import hosting from './.openai/hosting.json';
import { sites } from './build/sites-vite-plugin';

export default defineConfig({
  plugins: [
    react(), tailwindcss(), sites(),
    cloudflare({ config: {
      main: './worker/index.ts', compatibility_flags: ['nodejs_compat'],
      d1_databases: [{ binding: hosting.d1, database_name: 'exchange-life-db', database_id: '00000000-0000-4000-8000-000000000000' }],
      r2_buckets: [{ binding: hosting.r2, bucket_name: 'exchange-life-uploads' }],
    } }),
  ],
  build: { target: 'es2022' },
});
