import path from 'path';
import { execSync } from 'node:child_process';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

function getLastGitCommitIso(): string {
  try {
    return execSync('git log -1 --format=%ci', { encoding: 'utf-8' }).trim();
  } catch {
    return '';
  }
}

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      // 本機預覽：固定 3003，同網段手機可用 http://本機IP:3003
      server: {
        port: 3003,
        strictPort: true,
        host: true, // 等同 0.0.0.0，對外可連
        open: false, // 在 Cursor 內用 Simple Browser 開 http://127.0.0.1:3003
      },
      preview: {
        port: 3003,
        strictPort: true,
        host: true,
      },
      plugins: [react()],
      define: {
        __LAST_COMMIT_ISO__: JSON.stringify(getLastGitCommitIso()),
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'import.meta.env.VITE_FIREBASE_API_KEY': JSON.stringify(env.VITE_FIREBASE_API_KEY),
        'import.meta.env.VITE_FIREBASE_AUTH_DOMAIN': JSON.stringify(env.VITE_FIREBASE_AUTH_DOMAIN),
        'import.meta.env.VITE_FIREBASE_PROJECT_ID': JSON.stringify(env.VITE_FIREBASE_PROJECT_ID),
        'import.meta.env.VITE_FIREBASE_STORAGE_BUCKET': JSON.stringify(env.VITE_FIREBASE_STORAGE_BUCKET),
        'import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID': JSON.stringify(env.VITE_FIREBASE_MESSAGING_SENDER_ID),
        'import.meta.env.VITE_FIREBASE_APP_ID': JSON.stringify(env.VITE_FIREBASE_APP_ID),
        'import.meta.env.VITE_GAS_WEB_APP_URL': JSON.stringify(env.VITE_GAS_WEB_APP_URL)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
