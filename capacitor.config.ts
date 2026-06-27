import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.personal.markdownnotes',
  appName: '个人笔记',
  webDir: 'dist/client',
  server: {
    androidScheme: 'http',
    cleartext: true,
  },
  android: {
    allowMixedContent: true,
  },
  plugins: {
    Keyboard: {
      resize: 'body',
    },
    StatusBar: {
      overlaysWebView: false,
      backgroundColor: '#242a34',
      style: 'LIGHT',
    },
  },
};

export default config;
