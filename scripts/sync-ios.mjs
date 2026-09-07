import { spawnSync } from 'node:child_process';
if (!process.env.IOS_APP_URL) {
  console.error('請先在 .env 設定 IOS_APP_URL=https://你的網站網域，再同步 iOS 專案。');
  process.exit(1);
}
const result = spawnSync(process.execPath, ['node_modules/@capacitor/cli/bin/capacitor', 'sync', 'ios'], { stdio: 'inherit', env: process.env });
process.exit(result.status ?? 1);
