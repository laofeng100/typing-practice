/**
 * Playwright 全局 setup：登录 e2e-didi 并保存 storageState，供所有 spec 复用
 * 正式库零接触（baseURL 固定 3100 测试服务）
 */
import { request } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { E2E_BASE_URL, AUTH_STATE_PATH, LOGIN_USER_ID } from './helpers'

export default async function globalSetup() {
  const ctx = await request.newContext({ baseURL: E2E_BASE_URL })
  const res = await ctx.post('/api/auth', { data: { userId: LOGIN_USER_ID } })
  if (!res.ok()) {
    const body = await res.text()
    throw new Error(`[global-setup] 登录失败 ${res.status()}: ${body}`)
  }
  mkdirSync('test-results', { recursive: true })
  await ctx.storageState({ path: AUTH_STATE_PATH })
  await ctx.dispose()
  console.log('[global-setup] e2e-didi 登录成功，storageState 已保存')
}
