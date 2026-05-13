# 🚑 开源项目 · 新手急救包

> 输入 GitHub 仓库 URL → 选择操作系统 → 拿到一份针对你的"傻瓜级"使用教程，遇到报错还能直接贴进去让 AI 诊断。

## 这是什么？

GitHub 上有很多好用的项目，但是对于一个想要使用相关项目的小白来说，往往卡在了读懂项目和环境配置这一步。
本产品工具用 AI 把任何 GitHub 项目读取为新手也能轻松跟着做的分步教程，降低这些GitHub项目的使用门槛，帮助更多编程新手快速理解项目并借助项目完成自己的需求。

- ✅ 针对你操作系统（macOS / Windows / Linux）的环境自检与一键安装脚本
- ✅ 跑通项目的第一个示例
- ✅ **内置 AI 报错诊断面板**：遇到问题时贴报错文字或截图，使用三层匹配（项目 Issues → AI 推断 → 联网搜索）完美解决99%报错问题并给出通俗易懂的解决方案
- ✅ 把项目用到你自己的数据上的实操步骤：真正掌握和使用优秀项目

## 在线 Demo

> 本项目已在 Perplexity上部署了一份只读 Demo，用户可以使用该链接进行体验：
> https://www.perplexity.ai/computer/a/kai-yuan-xiang-mu-xin-shou-ji-zZBWmvqySKuISAF7xOvdLQ

## 项目结构

```
.
├── index.html              前端单页（Tailwind CDN + 原生 JS）
├── server.js               Node 后端：GitHub API + DeepSeek + Perplexity 搜索
├── package.json            依赖清单
├── tutorial_template.md    教程模板（含 {{PLACEHOLDER}} 占位符）
├── prompt.md               给 AI 的提示词（system + user）
├── .env.example            环境变量样例
├── .gitignore
└── README.md
```

## 如何把本项目配置到本地

### 1. 安装依赖

```bash
git clone <你刚 fork 或新建的仓库地址>
cd <仓库名>
npm install
```

### 2. 配置环境变量和API

```bash
cp .env.example .env
# 然后用任意编辑器打开 .env，至少填上 DEEPSEEK_API_KEY
```

| 变量名 | 必需 | 说明 |
|--------|------|------|
| `DEEPSEEK_API_KEY` | 是 | DeepSeek API Key，[在这里申请](https://platform.deepseek.com/)。留空则进入演示模式。 |
| `DEEPSEEK_MODEL` | 否 | 默认 `deepseek-v4-flash` |
| `GH_TOKEN` | 否 | GitHub Personal Access Token，[在这里生成](https://github.com/settings/tokens)，勾选 `public_repo` 读权限即可。不填也能用，但 GitHub API 限额会从 5000 次/小时降为 60 次/小时。 |
| `PORT` | 否 | 默认 8000 |

### 3. 启动

```bash
# 方式 A：直接读 .env（推荐，需要 Node 20+）
node --env-file=.env server.js

# 方式 B：手动 export（适用所有 Node 版本）
export DEEPSEEK_API_KEY=你的key
node server.js
```

服务起来后，浏览器打开 http://localhost:8000

## 三层报错诊断说明

第 6 章是 AI 诊断面板，用户贴报错后按以下顺序匹配：

| 来源 | 触发条件 | 来源徽章颜色 |
|------|---------|-------------|
| 🟦 项目 Issues 命中 | 报错精确匹配生成时构建的 `ISSUES_INDEX` 条目 | 蓝色 |
| 🟨 AI 推断 | LLM 高置信度直接给修复建议 | 黄色 |
| 🟨 AI 推断（参考） | LLM 不太确定时；用作兜底 | 黄色 |
| 🟩 联网搜索 | LLM 不确定 → 调 `pplx` CLI 搜公网资料 → LLM 再汇总 | 绿色 |

> **注意**：第 3 层「联网搜索」依赖 Perplexity 内部 `pplx` CLI，**普通环境没有这个工具**，会自动降级为 🟨「AI 推断（参考）」+ 提示信息。如果你想启用真正的联网搜索，可以把 `server.js` 里的 `pplxSearch()` 替换为以下任一公开 API：
> - Perplexity Sonar API：`https://api.perplexity.ai/chat/completions`
> - Tavily：`https://api.tavily.com/search`
> - SerpAPI：`https://serpapi.com/`

## API 端点

- `POST /api/generate` — 流式（NDJSON）生成教程，需要 `{ url, os }`
- `POST /api/diagnose-v2` — 流式诊断报错，需要 `{ error_text, context, issues_index, repo_info }`
- `GET /api/health` — 健康检查，返回 `{ ok, mock, model }`

## 已知限制

- 教程生成约 30–90 秒，受 DeepSeek API 响应速度影响
- 截图识别用 Tesseract.js（浏览器端 OCR），中文识别准确率有限，建议优先粘贴文字
- GitHub API 未配 token 时容易触发 60 次/小时限额

## License

MIT
