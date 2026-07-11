import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.construction.management',
  appName: '建筑劳务管理系统',
  webDir: 'dist',
  
  // 服务器配置 - 直接加载远程网页
  server: {
    url: 'https://d6e3bb20-c45b-47c4-94ab-82634f5db024.dev.coze.site/',
    cleartext: true,
  },
  
  // Android 配置
  android: {
    allowMixedContent: true,
    captureInput: true,
    webContentsDebuggingEnabled: true,
  },
  
  // iOS 配置
  ios: {
    contentInset: 'automatic',
    allowsLinkPreview: false,
  },
  
  // 插件配置
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#165DFF',
      showSpinner: true,
      spinnerColor: '#ffffff',
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#165DFF',
    },
  },
};

export default config;
