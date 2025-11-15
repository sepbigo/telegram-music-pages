
# 完整部署指南 — Worker API + Pages 前端 + CI/CD

## 概览
- 前端静态文件放在 `/public`，使用 Cloudflare Pages 部署。
- 后端 API 使用 Cloudflare Worker（`/worker/worker.js`），通过 D1 和 KV 存储元数据与管理员信息。
- CI/CD 使用 GitHub Actions：push 到 `main` 会触发部署 — Wrangler 发布 Worker，Pages 通过 `cloudflare/pages-action` 发布（需要在 GitHub Secrets 中设置 Cloudflare 凭证）。

## 准备工作
1. 在 Cloudflare 控制台创建 D1 数据库，记下 `database_name` 并在 `wrangler.toml` 中绑定为 `MUSIC_D1`。
2. 在 Cloudflare KV 中创建命名空间并在 Pages & Worker 中绑定为 `MUSIC_KV`（可选，但推荐）。
3. 在 Cloudflare 仪表盘创建 Worker，或使用 Wrangler 部署（我们在仓库中包含 `wrangler.toml`）。
4. 在项目的 Pages 设置中添加环境变量 `API_BASE_URL`，值为你的 Worker 域名（例如 `https://your-worker.YOUR_DOMAIN.workers.dev`）。

## 本地开发
- 安装 Wrangler： `npm install -g wrangler`
- 本地运行 Worker： `npm run dev`（使用 `wrangler dev`）

## 初始化 D1
运行： `./init_d1.sh`（确保已在 wrangler 中配置 MUSIC_D1 binding）

## 创建管理员（一次性）
使用 `ADMIN_SECRET`（在 Pages & Worker 环境变量中设置），调用：
```
curl -X POST https://<your-worker-domain>/api/admin/create \
  -H "Content-Type: application/json" \
  -d '{"admin_secret":"<ADMIN_SECRET>","username":"admin","password":"YourStrongPassword"}'
```

## 设置 Telegram Webhook
```
https://api.telegram.org/bot<YOUR_TOKEN>/setWebhook?url=https://<your-worker-domain>/webhook
```

## CI/CD
1. 在 GitHub 仓库中添加 Secrets:
   - `CF_API_TOKEN` — Cloudflare API token（需要 Pages / Workers 权限）
   - `CF_ACCOUNT_ID`
   - `CF_PAGES_PROJECT_NAME`
2. 工作流文件：`.github/workflows/deploy.yml`（已包含在仓库），用于在 push 到 `main` 时自动部署 Worker（wrangler）和 Pages（pages-action）。

## 前端配置
前端会读取 `window.API_BASE_URL`（由 Pages 环境或 CI 注入）。如果为空，前端会使用相对路径调用 `/api/*`（适用于把 Worker 路由映射到同域时）。

## 安全与注意
- 生产请使用更强的密码哈希（bcrypt/scrypt）和 HTTPS（Cloudflare 提供）。
- Worker 里的 `TELEGRAM_BOT_TOKEN`、`ADMIN_SECRET`、`CF_API_TOKEN` 等应通过 secrets 管理，不要硬编码。
- 对于高流量，请考虑缓存策略与转码需求。
