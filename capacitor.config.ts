import type { CapacitorConfig } from '@capacitor/cli';
const appUrl = process.env.IOS_APP_URL;
if (appUrl && (new URL(appUrl).protocol !== 'https:' || new URL(appUrl).pathname !== '/')) {
  throw new Error('IOS_APP_URL must be an HTTPS origin, such as https://your-domain.example');
}
const config: CapacitorConfig = {
  appId: 'com.exchangelife.personal',
  appName: '交換生活',
  webDir: 'dist',
  backgroundColor: '#f6f6f4',
  ios: { contentInset: 'never', preferredContentMode: 'mobile', backgroundColor: '#f6f6f4' },
  ...(appUrl ? { server: { url: appUrl, cleartext: false, errorPath: 'connection.html' } } : {}),
};
export default config;
