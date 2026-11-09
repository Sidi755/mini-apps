# 技能图谱

中文 Codex Skills 检索工具，初始目录包含 103 个条目。支持搜索、分类、来源筛选、收藏分组、备份导入导出、最多三个技能对比，以及 GitHub 来源状态检查。

## 本地运行

需要 Node.js 22+。在此目录执行 npm start，打开 http://127.0.0.1:4173。
普通网页运行无需依赖安装和密钥。收藏、自定义来源及同步结果保存在浏览器 localStorage，不上传到数据库；换浏览器前可以导出备份。

同步依赖 api.github.com 和 raw.githubusercontent.com，可能遇到网络故障与匿名限流。初始目录支持离线浏览，来源核实不代表技能已经过运行安全审计。

## 检查和构建

```sh
npm run check
npm run build
npm install
npx playwright install chromium
npm run check:plugin
npm run check:library
```

前两条无需安装依赖；浏览器测试需要 Playwright。可用 PLAYWRIGHT_EXECUTABLE_PATH 指定已有 Chromium 浏览器。

## 文件和部署

- web/：可直接交给静态托管的页面、数据和脚本。
- worker/index.js：可选 Worker 服务与 /mcp 接口。
- scripts/build-worker.mjs：输出 dist/server/index.js，包含页面和 MCP 资源。
- scripts/check-*.mjs：搜索、协议及浏览器交互回归检查。

静态托管发布 web/ 即可，但不提供 /mcp。Worker 部署需兼容 Cloudflare Workers 的运行环境。构建前设置 SITE_ORIGIN 为自己的 HTTPS 域名；未设置时工具返回本地地址。环境变量由 shell/CI 注入，不会自动读取 .env。

Sites 项目 ID、账号授权、插件注册和定时任务不随代码迁移。部署到自己的 Sites 时须单独创建项目配置；普通本地运行不需要它们。

## 来源版本

源码基于原站第 6 个发布版本（应用版本 1.3.0），提交 50ea43bd2a347e99789ff9f9db260865a9a02c04。分享版移除原站部署身份，调整构建与测试可移植性，并将定时任务说明改为未配置。
