import type { CapacitorConfig } from '@capacitor/cli';
// Android shell: `npm run android` from the repo root builds the PWA and opens it in Android Studio.
const config: CapacitorConfig = {
  appId: 'ke.duka.system', appName: 'Duka System', webDir: 'dist',
  android: { backgroundColor: '#121417' },
  server: { androidScheme: 'https' },
};
export default config;
