import { defineConfig } from '@playwright/test'

// E2E 配置：测试服务固定 3100（与正式 dev 3000 隔离），全串行（SQLite 写串行）
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  globalSetup: './tests/e2e/global-setup.ts',
  use: {
    baseURL: 'http://localhost:3100',
    // 全局登录态：global-setup 登录 e2e-didi 并保存 cookie，所有 spec 免登录
    storageState: 'test-results/auth-state.json',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  reporter: [
    ['list'],
    ['html', { outputFolder: 'test-results/html-report', open: 'never' }],
  ],
})
