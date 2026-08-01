/**
 * 流程测试 2/10：仪表盘（初始空数据状态）
 * 前置：e2e 库已由 setup-e2e 清空业务数据
 */
import { test, expect } from '@playwright/test'

test('仪表盘渲染：连击/待复习/已学单词/键盘未解锁', async ({ page }) => {
  await page.goto('/')
  // 仪表盘标题区
  await expect(page.getByText('学习概览')).toBeVisible({ timeout: 15_000 })

  // 主行动：键盘未通关 → 引导去键盘
  await expect(page.getByText('继续键盘闯关')).toBeVisible()

  // 待复习 0（新用户无到期卡；StatCard 的 label/value/unit 为分离文本节点「待复习」「0」「个」）
  await expect(page.getByText('待复习', { exact: true })).toBeVisible()
  // 已学单词 0
  await expect(page.getByText('已学单词')).toBeVisible()

  // 键盘未解锁提示（未达 WPM 门槛）
  await expect(page.getByText(/达到 \d+ 即可解锁单词等高级练习/)).toBeVisible()

  // 概览卡片：学习概览/我的成就/学习报告等导航存在
  await expect(page.getByRole('button', { name: '我的成就' })).toBeVisible()
  await expect(page.getByRole('button', { name: '错题本' })).toBeVisible()
  await expect(page.getByRole('button', { name: '设置中心' })).toBeVisible()
})
