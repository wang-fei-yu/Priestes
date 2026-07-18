#!/usr/bin/env node
/**
 * tauri-prebuild.js — Tauri 构建前脚本
 *
 * 只构建静态导出 (output:'export' → out/) 供 Tauri 前端使用。
 * API 后端由 scripts/desktop-server.js 提供（零依赖，不打包到安装包）。
 *
 * 用法：由 tauri.conf.json 的 beforeBuildCommand 自动调用
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const API_DIR = path.join(ROOT, 'src', 'app', 'api');
const API_BACKUP = path.join(ROOT, '_api_backup');
const OUT_DIR = path.join(ROOT, 'out');
const CONFIG_PATH = path.join(ROOT, 'next.config.ts');

function log(msg) {
  console.log(`\n[tauri-prebuild] ${msg}`);
}

function run(cmd) {
  log(`运行: ${cmd}`);
  execSync(cmd, { stdio: 'inherit', cwd: ROOT, env: { ...process.env } });
}

function moveDir(src, dest) {
  if (fs.existsSync(src)) {
    fs.renameSync(src, dest);
    log(`移动: ${path.basename(src)} → ${path.basename(dest)}`);
  }
}

function removeDir(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name), d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d); else fs.copyFileSync(s, d);
  }
}

// ─── 保存原始 config ───
const originalConfig = fs.readFileSync(CONFIG_PATH, 'utf-8');

try {
  log('━━━ Step 1/2: 构建静态导出 (out/) ━━━');

  // 临时移走 API 路由（export 模式不支持 API Routes）
  moveDir(API_DIR, API_BACKUP);

  // 删除旧的缓存
  removeDir(path.join(ROOT, '.next'));
  removeDir(OUT_DIR);

  // 写入 export 配置
  fs.writeFileSync(CONFIG_PATH, `import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export',
  compress: false,
  typescript: { ignoreBuildErrors: true },
  reactStrictMode: false,
  images: { unoptimized: true },
};

export default nextConfig;
`, 'utf-8');

  run('npx next build --webpack');

  // 恢复 API 路由
  moveDir(API_BACKUP, API_DIR);

  // 同步 public/ 到 out/（中文路径下 Next.js 可能漏复制）
  const publicDir = path.join(ROOT, 'public');
  if (fs.existsSync(publicDir)) {
    copyDir(publicDir, OUT_DIR);
    log('public/ → out/ 资源已同步 ✓');
  }

  if (!fs.existsSync(OUT_DIR)) {
    console.error('[tauri-prebuild] 错误: out/ 目录未生成!');
    process.exit(1);
  }

  log('━━━ Step 2/2: 恢复配置 ━━━');
  fs.writeFileSync(CONFIG_PATH, originalConfig, 'utf-8');

  log('构建完成 ✓');
} catch (err) {
  console.error('[tauri-prebuild] 构建失败:', err.message);
  if (fs.existsSync(API_BACKUP) && !fs.existsSync(API_DIR)) {
    moveDir(API_BACKUP, API_DIR);
  }
  fs.writeFileSync(CONFIG_PATH, originalConfig, 'utf-8');
  process.exit(1);
}
