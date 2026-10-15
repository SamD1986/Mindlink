#!/usr/bin/env node
/**
 * 验收画布欢迎页与宣纸底纹（2026-10-15 用户需求）。
 *
 * 前置条件：pnpm dev 已运行、Electron 窗口已打开。
 * 检查点：
 * 1. 左栏固定入口 4 项（home/wiki/skills/settings）
 * 2. 上栏无标签条（`.top-bar-tabs` 不存在）
 * 3. 画布欢迎页居中（`.workbench-brand` 可见）
 * 4. 宣纸底纹层存在（`.workbench-backdrop-texture`）
 * 5. Home 按钮点击后回到空画布（关闭当前布局）
 */

import { chromium } from 'playwright';

const PORT = 9444;

async function verify() {
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
  const contexts = browser.contexts();
  if (contexts.length === 0) throw new Error('No contexts');
  const pages = contexts[0].pages();
  if (pages.length === 0) throw new Error('No pages');
  const page = pages[0];

  // 1. 左栏固定入口 4 项
  const entries = await page.locator('[data-left-entry]').count();
  console.log(`左栏固定入口: ${entries} 项 ${entries === 4 ? '✓' : '✗ 期待 4'}`);

  // 2. 上栏无标签条
  const tabs = await page.locator('.top-bar-tabs').count();
  console.log(`标签条: ${tabs === 0 ? '已移除 ✓' : `仍存在 ${tabs} 个 ✗`}`);

  // 3. 画布欢迎页居中
  const brand = await page.locator('.workbench-brand').count();
  console.log(`画布欢迎页: ${brand === 1 ? '可见 ✓' : '缺失 ✗'}`);

  // 4. 宣纸底纹层存在
  const texture = await page.locator('.workbench-backdrop-texture').count();
  console.log(`宣纸底纹: ${texture === 1 ? '存在 ✓' : '缺失 ✗'}`);

  // 5. Home 按钮点击后回到空画布
  await page.click('[data-left-entry="home"]');
  await page.waitForTimeout(300);
  const brandAfter = await page.locator('.workbench-brand').count();
  console.log(`Home 按钮: ${brandAfter === 1 ? '关闭布局 ✓' : '未生效 ✗'}`);

  await browser.close();
  const pass = entries === 4 && tabs === 0 && brand === 1 && texture === 1 && brandAfter === 1;
  console.log(pass ? '\n✅ 全部通过' : '\n❌ 部分失败');
  process.exit(pass ? 0 : 1);
}

verify().catch((err) => {
  console.error(err);
  process.exit(1);
});
