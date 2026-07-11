# 建筑劳务管理系统 - 移动应用

这是一个将建筑劳务管理系统打包成移动应用的项目。

## 在线预览

访问地址：应用已部署，可在浏览器中预览移动端效果。

## 项目说明

本项目使用 **React + Capacitor** 技术栈，将网页应用打包成移动应用：
- 通过 WebView 全屏加载目标网页
- 支持全屏展示，隐藏浏览器地址栏
- 支持下拉刷新、页面跳转
- 与网页版数据完全同步

## 本地开发

```bash
# 安装依赖
pnpm install

# 启动开发服务器
pnpm dev

# 构建生产版本
pnpm build

# 预览构建结果
pnpm preview
```

## 打包 Android APK

### 方式一：使用 Android Studio（推荐）

1. **安装前提条件**
   - 安装 [Node.js](https://nodejs.org/) (v18+)
   - 安装 [Android Studio](https://developer.android.com/studio)
   - 配置 ANDROID_HOME 环境变量

2. **添加 Android 平台**
   ```bash
   # 构建项目
   pnpm build
   
   # 添加 Android 平台
   npx cap add android
   
   # 同步项目
   npx cap sync android
   
   # 打开 Android Studio
   npx cap open android
   ```

3. **构建 APK**
   - 在 Android Studio 中，点击 **Build > Build Bundle(s) / APK(s) > Build APK(s)**
   - APK 文件位于 `android/app/build/outputs/apk/debug/app-debug.apk`

### 方式二：使用命令行

```bash
# 构建 Android APK（需要配置好 Android SDK）
cd android
./gradlew assembleDebug

# APK 输出位置
# android/app/build/outputs/apk/debug/app-debug.apk
```

## 项目配置

### capacitor.config.ts

```typescript
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.construction.management',
  appName: '建筑劳务管理系统',
  webDir: 'dist',
  
  // 直接加载远程网页
  server: {
    url: 'https://d6e3bb20-c45b-47c4-94ab-82634f5db024.dev.coze.site/',
    cleartext: true,
  },
  
  android: {
    allowMixedContent: true,
    captureInput: true,
    webContentsDebuggingEnabled: true,
  },
};

export default config;
```

## 应用图标

将以下图标文件放入 `public/` 目录：
- `icon-192.png` - 192x192 像素
- `icon-512.png` - 512x512 像素

## 技术栈

- **React 19** - 前端框架
- **Vite** - 构建工具
- **Capacitor** - 移动应用打包
- **TypeScript** - 类型安全

## 注意事项

1. **网络连接**：应用需要网络连接才能正常使用
2. **登录状态**：登录状态与网页版同步，存储在浏览器 Cookie 中
3. **离线支持**：当前版本不支持离线使用
