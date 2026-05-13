/**
 * 开源项目"新手急救包" · 后端服务
 *
 * 双模式：
 *   - 真实模式（设置了 DEEPSEEK_API_KEY）：调 DeepSeek API（deepseek-v4-flash）生成教程
 *   - Mock 模式（未设 Key）：返回基于 demo_output.md 的预设教程，便于演示
 */

const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
// 报错诊断接口可能携带 OCR 后的长文本，放宽到 4mb
app.use(express.json({ limit: "4mb" }));
app.use(express.static(__dirname));

const PORT = process.env.PORT || 8000;
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || "";
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || "deepseek-v4-flash";
const GH_TOKEN = process.env.GH_TOKEN || "";
const MOCK_MODE = !DEEPSEEK_API_KEY;

const TEMPLATE = fs.readFileSync(path.join(__dirname, "tutorial_template.md"), "utf8");
const PROMPT_DOC = fs.readFileSync(path.join(__dirname, "prompt.md"), "utf8");
const DEMO_OUTPUT = fs.readFileSync(path.join(__dirname, "demo_output.md"), "utf8");

// ------------------------- 工具函数 -------------------------

function parseRepoUrl(url) {
  const m = url.match(/github\.com\/([\w.-]+)\/([\w.-]+)/);
  if (!m) return null;
  return { owner: m[1], repo: m[2].replace(/\.git$/, "") };
}

async function gh(path) {
  const headers = { "Accept": "application/vnd.github+json" };
  if (GH_TOKEN) headers["Authorization"] = `Bearer ${GH_TOKEN}`;
  const r = await fetch(`https://api.github.com${path}`, { headers });
  if (!r.ok) throw new Error(`GitHub ${path} -> ${r.status}`);
  return r.json();
}

async function ghRaw(owner, repo, branch, file) {
  const r = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${file}`);
  return r.ok ? r.text() : null;
}

async function fetchRepoSignals(owner, repo) {
  const meta = await gh(`/repos/${owner}/${repo}`);
  const branch = meta.default_branch || "main";

  let readme = "";
  try {
    const r = await gh(`/repos/${owner}/${repo}/readme`);
    readme = Buffer.from(r.content, "base64").toString("utf8");
  } catch (e) { readme = "(未找到 README)"; }

  const depCandidates = [
    "package.json", "requirements.txt", "pyproject.toml",
    "Cargo.toml", "go.mod", "Gemfile", "pom.xml",
    "Dockerfile", ".env.example"
  ];
  const deps = {};
  await Promise.all(depCandidates.map(async (f) => {
    const c = await ghRaw(owner, repo, branch, f);
    if (c) deps[f] = c.length > 4000 ? c.slice(0, 4000) + "\n... (truncated)" : c;
  }));

  let issues = [];
  try {
    const open = await gh(`/repos/${owner}/${repo}/issues?state=open&per_page=30&sort=created`);
    const closed = await gh(`/repos/${owner}/${repo}/issues?state=closed&per_page=20&sort=reactions-+1`);
    issues = [...open, ...closed]
      .filter(i => !i.pull_request)
      .map(i => `[${i.state}|👍${i.reactions?.["+1"] || 0}] ${i.title}`);
  } catch (e) { /* 私有仓库或限速 */ }

  return {
    meta: {
      full_name: meta.full_name,
      description: meta.description,
      language: meta.language,
      stars: meta.stargazers_count,
      updated_at: meta.updated_at,
      default_branch: branch,
    },
    readme: readme.length > 12000 ? readme.slice(0, 12000) + "\n...(README truncated)" : readme,
    deps,
    issues,
  };
}

// 与 tutorial_template.md 中的 {{PLACEHOLDER}} 严格对应的字段说明
const FIELD_SPEC = `
【读者设定】你在为一位 **从未写过代码**的纯小白写教程。ta：
  - 不知道 "终端/命令行" 是什么，不会在 macOS 上打开 Terminal/iTerm
  - 不知道怎么复制一段代码到终端、怎么按回车运行
  - 看到 \`~/.zshrc\`、\`export PATH\`、\`source\`、\`sudo\`、\`grep\`、\`if [\` 这些字眼会慌
  - 不知道 \`/\`、\`~/\`、\`./\`路径是什么意思
  - 只会复制-粘贴，你要告诉 ta 在哪里点、点哪个按钮、粘贴后会看到什么
  - 看到英文报错会直接放弃，需要你把报错翻译成人话并告诉 ta "这不是你的错"

【写作铁律】生成所有字段时必须遵守：
  R1. **每一段脚本前面要有 \`echo "现在在做 XX..."\` 中文提示**，让小白看得出来进度
  R2. **出现专业名词第一次时在括号里用一句话解释**（例："curl（一个用来下载文件的命令）"）
  R3. **不要使用 \`if/then/fi\`、\`grep\`、\`awk\`、\`||\`、\`&&\` 复杂结构**，改用 \`echo\` 逻辑文字描述（如 "如果上面出现 X，说明可以继续；如果出现 Y，代表需要装它"）
  R4. **严禁在字段值里使用 \`source ~/.zshrc\`、\`export PATH=\`、\`chmod +x\`**，换成 "关闭这个终端窗口，重新打开一个" 这种表述
  R5. **不要让小白手动修改隐藏文件（\`.zshrc\`/\`.bashrc\`/\`.bash_profile\`）**，需要调 PATH 时只告诉 ta "重启终端试试"或提供一条 \`echo 'export PATH=...' >> ~/.zshrc\` 加多一条 "然后关闭重开终端"
  R6. **不要出现文件路径简写**。\`~/Documents/xxx\` 要写成 "你的 账户名下的 Documents 文件夹里的 xxx"
  R7. **所有 \`Markdown\` 列表须以中文动词开头**，如 "打开…、输入…、等待…"，不要以名词开头
  R8. **账号、Token、下载路径这些动作要拆到最细**，例如"点左上角头像 → 选 Settings"、"在右边找到 New Token 按钮"之类
  R9. **不许出现“显然”“很简单”“众所周知”“只需要”这类词**

【JSON 必须包含以下字段】键名不要变，不要多不要少：

- REPO_NAME (string)： owner/repo 格式
- PROJECT_ELEVATOR_PITCH (string)：3-4 句，用 "就像…一样" 、"可以把…变成…" 这种打比方。避免一句能留下应用场景代名词或术语。举例：不准写 "一个本地运行 LLM 的工具"，要写 "Ollama 让你在自己电脑里跑一个像 ChatGPT 一样的 AI，但不需要联网、不会泄露你问的问题"
- USE_CASES (Markdown)：3-5 项 \`- \` 列表。每项 "动词 + 场景 + 举例"，不要只写名词
- NOT_SUITABLE_FOR (Markdown)：2-4 项 \`- \` 列表，告诉小白什么场景别费劲
- REQUIRED_TOOLS_LIST (string)：需要的工具名称串，并在括号里加一句什么是（如 "终端（Mac 自带的黑底输入窗口）、Homebrew（Mac 上装软件的包管理器）"）
- SHELL_LANG (string)：\`bash\` 或 \`powershell\`
- ENV_CHECK_SCRIPT (string)：环境自检脚本（无围栏）。【面向小白设计】：
    * 只能用 \`echo\` 和最基础的查询命令（如 \`sw_vers\`、\`which xxx\`、\`xxx --version\`）
    * **禁用 \`if/then/fi\`、\`grep\`、\`awk\`、\`&&\`、\`||\`** —— 小白看不懂
    * 每检查一项前打印 \`echo "检查 XX…"\`，直接运行检查命令，让小白看原始输出自己判断
    * 脚本末尾加一段 \`echo "=== 怎么看结果？如果上面出现诸如「14.2.1」「python 3.11」这样的版本号，代表装了；如果出现 command not found，代表没装"\` 这样的文字说明
- TOOL_INSTALL_TABLE (Markdown)：表格数据行，每行严格三列用 \`|\` 分隔，格式：\`| 工具名称 | 怎么装的详细说明 | 如何验证 |\`。【严格要求】：
    * **只列项目真正缺的那些**，不要把 Mac 自带的 curl、终端这些装进去
    * “怎么装”要写最详细的中文提示，包含一个命令和 "提示输密码时输开机密码" 类的说明（如 "复制这条到终端运行：\`brew install xxx\`。提示输密码时输你开机密码"）
    * “如何验证”写一条验证命令 + 看到什么输出代表修好了
    * 如果项目什么都不缺，只需写一行：\`| 本项目无其他依赖 | 上面绑定脚本都能调起来就可以 | 跳过本表 |\`
- ONE_CLICK_INSTALL_SCRIPT (string)：一键安装脚本（无围栏）。要求：
    * 第一行是 \`#!/bin/bash\` 或等价，接下来是 \`echo "即将开始安装，预计 X 分钟，请不要关闭这个窗口”\` 这样的起拍
    * **每一个可执行命令前面都要有一行 \`echo "步骤 X/N: 正在…”\` 中文讲解**
    * 不要用 \`if [ $? -ne 0 ]\` 这种错误检查，如果需要质量提示就用 \`echo "如果上面出现红色报错，说明 …”\`
    * 末尾一定要以 \`echo "=== 完成！你现在可以做下一步了 ✅ "\` 收尾
- INSTALL_TIME_ESTIMATE (string)：如 "3-8 分钟（取决于你的网速）"
- HELLO_WORLD_COMMAND (string)：跑通示例的命令（无围栏）。如果需要进入交互模式（如 \`ollama run\`），只给一条启动命令即可
- EXPECTED_OUTPUT (string)：上述命令预期输出（无围栏）。**必须仅举 5-8 行真实看到的输出**，不要写 "可能会看到" 这种虚拟文字。交互模式的要举一个例子问答
- RERUN_COMMAND (string)：后续重新运行的命令
- ADVANCED_TIPS (Markdown)：3-5 条 \`- \` 列表。每条以动词开头，告诉小白一个具体可试的玩法，并附上命令 + 预期看到的输出
- DATA_ENTRY_POINT (string)：**不要只写路径**。写成 "在你下载的项目文件夹里找到 \`xxx/\` 这个子文件夹；它里面放的就是…" 这种描述句
- DATA_REPLACEMENT_STEPS (Markdown)：**重点字段**。【格式严格要求】必须是有序列表（4-6 项），每项以 \`1.\` / \`2.\` / \`3.\` 开头，**严禁用 \`- \`**。每步都要有具体动作：
    * 如 "打开访问购到的 PDF 文件所在文件夹"、"把 PDF 拖入项目里的 data/ 文件夹"、"重命名为 1.pdf、…"
    * 要明确告诉小白 "文件名能不能有中文/空格"、"文件大小上限"、"支持哪些格式"
    * 如果项目本身不需要“用户数据”（比如 Ollama 那种纯推理工具），则 DATA_REPLACEMENT_STEPS 要转为“换个模型/换个参数”这种 "怎么改成你想要的样子" 的动作，同样全部用 \`1./2./3.\` 有序列表
- CONFIG_FILE (string)：如 \`.env\`、\`config.yaml\`
- CONFIG_LANG (string)：\`env\`/\`yaml\`/\`json\`
- CONFIG_DIFF (string)：配置修改示例（无围栏），用 \`-\` 旧值 \`+\` 新值。每修一行后面加一个 \`# 中文注释说明这个参数是什么作用\`
- GLOSSARY (Markdown)：5-8 项，格式 \`- **术语**：一句话解释 + 举一个生活化比喻\`。**只收录本教程上文中出现过的术语**，不要添加未出现过的名词（如不要凭空出现 "波特率" 这种不相关词汇）。例：\`- **依赖**：项目跑起来需要的其他软件包，就像烤蛋糕需要面粉、鸡蛋、糖。\`
- PITFALL_1_TITLE … PITFALL_5_FIX：5 个坑，每个 4 个子字段：
    * \`TITLE\`：一句话描述坑，以 “报错什么 / 现象什么” 开头，不要用抽象名词
    * \`ERROR\`：真实报错原文（无围栏），2-4 行
    * \`REASON\`：一句话说人话原因，不超过 40 字
    * \`FIX\`：Markdown **有序列表**（3-5 步，严格以 \`1.\` / \`2.\` / \`3.\` 开头，**严禁用 \`-\`**），要求：
        - 一定要告诉小白“打开哪个软件/窗口”、“点哪里”、“粘贴这条命令”
        - 每条命令前面一句话解释 “这是干什么的”
        - 不准写 \`source ~/.zshrc\`、\`chmod +x\`、\`export PATH\` 这种需要背景知识的命令。需要调 PATH 统一写 “关闭现在这个终端窗口，重新打开一个试试”
        - 最后一步是 "验证成功"：让 ta 跑一个什么命令看到什么输出才算修好
- SCRIPT_EXT (string)： macOS/Linux=\`sh\`，Windows=\`ps1\`

总共 41 个字段。
⚠️ 所有代码/脚本字段都不要在值里加 \`\`\` 围栏。
⚠️ 5 个坑以 5 组独立扁平字段输出，不是数组。
⚠️ 所有说明文字一定是**中文**且面向 “从未写过代码的小白” 。
`;

// ------------------------- 分段生成的 3 个 FIELD_SPEC -------------------------
// 公共写作铁律（每段都会带）
const COMMON_RULES = `
【读者设定】你在为一位 **从未写过代码**的纯小白写教程。ta：
  - 不知道 "终端/命令行" 是什么，分不清终端和浏览器
  - 只会复制-粘贴，看到英文报错会直接放弃
  - 看到 \`~/.zshrc\`、\`export PATH\`、\`source\`、\`sudo\`、\`grep\` 这些字眼会慌

【写作铁律】
  R1. 每段脚本前面加 \`echo "现在在做 XX..."\` 中文提示
  R2. 出现专业名词第一次时在括号里用一句话解释
  R3. 不要用 \`if/then/fi\`、\`grep\`、\`awk\`、\`||\`、\`&&\` 复杂结构
  R4. 严禁 \`source ~/.zshrc\`、\`export PATH=\`、\`chmod +x\`，换成 "关闭这个终端窗口，重新打开一个"
  R5. 所有 Markdown 列表以中文动词开头
  R6. 不许出现 "显然""很简单""众所周知""只需要"
  R7. 代码/脚本字段不要在值里加 \`\`\` 围栏
  R8. 所有说明文字必须中文，面向纯小白
`;

// 段 1：项目认知（章节 1）
const FIELD_SPEC_PART1 = `
${COMMON_RULES}

本次只需要输出 **段 1：项目认知** 的字段。其他字段会在后续轮次生成，本轮请专心做好这 4 个：

- REPO_NAME (string)： owner/repo 格式
- PROJECT_ELEVATOR_PITCH (string)：3-4 句，用 "就像…一样"、"可以把…变成…" 这种打比方。避免一句能留下应用场景代名词或术语。举例：不准写 "一个本地运行 LLM 的工具"，要写 "Ollama 让你在自己电脑里跑一个像 ChatGPT 一样的 AI，但不需要联网、不会泄露你问的问题"
- USE_CASES (Markdown)：3-5 项 \`- \` 列表。每项 "动词 + 场景 + 举例"，不要只写名词
- NOT_SUITABLE_FOR (Markdown)：2-4 项 \`- \` 列表，告诉小白什么场景别费劲

【JSON 格式严格要求】只输出以上 4 个键，不要多不要少。值用中文。
`;

// 段 2：环境与安装（章节 3-5）
const FIELD_SPEC_PART2 = `
${COMMON_RULES}

本次只需要输出 **段 2：环境与安装** 的字段。【上下文】段 1 已经介绍了项目是干什么的，本轮请基于这个理解，针对【{{OS}}】系统给出环境检查、安装、Hello World 步骤。

- REQUIRED_TOOLS_LIST (string)：需要的工具名称串，括号里加一句什么是（如 "终端（Mac 自带的黑底输入窗口）、Homebrew（Mac 上装软件的包管理器）"）
- SHELL_LANG (string)：\`bash\` 或 \`powershell\`
- SCRIPT_EXT (string)： macOS/Linux=\`sh\`，Windows=\`ps1\`
- ENV_CHECK_SCRIPT (string)：环境自检脚本（无围栏）。【面向小白】：
    * 只能用 \`echo\` 和最基础的查询命令（\`sw_vers\`、\`which xxx\`、\`xxx --version\`）
    * 禁用 \`if/then/fi\`、\`grep\`、\`awk\`、\`&&\`、\`||\`
    * 每检查一项前 \`echo "检查 XX…"\`，让小白看原始输出
    * 末尾加一段 \`echo "=== 怎么看结果？如果上面出现 14.2.1、python 3.11 这样的版本号代表装了；如果出现 command not found 代表没装"\`
- TOOL_INSTALL_TABLE (Markdown)：表格数据行，每行严格三列 \`| 工具名称 | 怎么装的详细说明 | 如何验证 |\`。【严格】：
    * 只列项目真正缺的，不要把 Mac 自带的 curl、终端这些装进去
    * "怎么装" 给完整中文提示，包含命令和 "提示输密码时输开机密码"
    * "如何验证" 写一条命令 + 看到什么输出代表修好了
    * 项目什么都不缺时只写 \`| 本项目无其他依赖 | 上面绑定脚本都能调起来就可以 | 跳过本表 |\`
- ONE_CLICK_INSTALL_SCRIPT (string)：一键安装脚本（无围栏）。要求：
    * 第一行 \`#!/bin/bash\` 或等价；接下来 \`echo "即将开始安装，预计 X 分钟，请不要关闭这个窗口"\`
    * 每个可执行命令前都加 \`echo "步骤 X/N: 正在…"\`
    * 末尾 \`echo "=== 完成！你现在可以做下一步了 ✅"\`
- INSTALL_TIME_ESTIMATE (string)：如 "3-8 分钟（取决于你的网速）"
- HELLO_WORLD_COMMAND (string)：跑通示例的命令（无围栏）。需要交互模式时只给启动命令
- EXPECTED_OUTPUT (string)：上述命令预期输出（无围栏）。仅举 5-8 行真实看到的输出，不要写 "可能会看到"

【JSON 格式严格要求】只输出以上 9 个键，不要多不要少。
`;

// 段 3：故障排查与进阶（章节 6-9）
// 改造 v0.9：去掉 PITFALL_1~5 (20 个字段)，改为生成 ISSUES_INDEX 结构化索引，供用户诊断接口语义匹配
const FIELD_SPEC_PART3 = `
${COMMON_RULES}

本次只需要输出 **段 3：报错索引与进阶** 的字段。【上下文】前面段已经完成项目介绍和安装步骤。

本段的重点是把 Issues 区里高频报错**结构化成一个索引**（ISSUES_INDEX），以便用户后续贴报错时系统能语义匹配。同时输出自定义数据玩法、术语表。

## ISSUES_INDEX 生成原则
- 从高赞 Closed Issues + Open Issues 高频关键词中提炼 6-8 条常见报错（多了会被截断，必须严格控制在 8 条内）
- 如果 Issues 不足，用 LLM 知识补“同类项目通用坑”，并在 source 中标为 "common"
- 优先覆盖：安装报错、依赖冲突、API/Token 问题、OS 差异问题、模型资源问题
- 每条报错必须包含能被匹配的关键词（供后续语义检索使用）

## 字段清单
- ISSUES_INDEX (array)：结构化报错索引，是数组。每项是一个对象：
    {
      "id": "为该报错起的唯一 ID（英文小写下划线，如 'module_not_found_torch'）",
      "title": "一句话概括这个报错（中文，以 「报错：xxx」 或 「现象：xxx」 开头）",
      "keywords": ["关键词 1", "关键词 2", "关键词 3"],  // 3-6 个，包含报错关键词、报错类型、依赖名，用于语义匹配
      "error_pattern": "典型报错原文（英文原话，例：ModuleNotFoundError: No module named 'torch'）",
      "plain_meaning": "用中文说人话告诉小白报错意思（1-2 句）",
      "likely_causes": ["原因 1", "原因 2"],  // 1-3 条
      "fix_steps": "Markdown 有序列表 3-4 步（精简），严格 \`1./2./3.\`，严禁 \`-\`。每条命令前一句中文解释，禁用 source/chmod/export PATH。最后一步必须是 "验证成功"",
      "verify": "验证修复是否生效的一条命令 + 预期输出",
      "source": "issue" / "common" / "docs",   // 报错来源
      "issue_url": "如果来自某条 issue，写出该 issue 的 URL；没有就填 ""  
    }
- DATA_ENTRY_POINT (string)：不要只写路径。写成 "在你下载的项目文件夹里找到 \`xxx/\` 这个子文件夹；它里面放的就是…"
- DATA_REPLACEMENT_STEPS (Markdown)：有序列表 4-6 项，严格 \`1./2./3.\`，严禁 \`-\`。具体动作 + 文件名规则。如项目无用户数据需求，转为 "换模型/换参数" 的玩法
- CONFIG_FILE (string)：如 \`.env\`、\`config.yaml\`
- CONFIG_LANG (string)：\`env\`/\`yaml\`/\`json\`
- CONFIG_DIFF (string)：无围栏，\`-\` 旧值 \`+\` 新值。每行后加 \`# 中文注释\`
- RERUN_COMMAND (string)：后续重新运行的命令
- ADVANCED_TIPS (Markdown)：3-5 条 \`- \` 列表，每条以动词开头 + 命令 + 预期输出
- GLOSSARY (Markdown)：5-8 项，\`- **术语**：解释 + 生活化比喻\`。只收录前文出现过的术语

【JSON 格式要求】共 9 个键：ISSUES_INDEX (数组) + 其他 8 个字段。严格控制 ISSUES_INDEX 在 6-8 条，不要多！
`;

// 构造分段调用的 user prompt：仓库信息 + 上下文摘要 + 本段 SPEC
function buildPartUserPrompt(signals, os, url, partSpec, partLabel, contextSummary) {
  const depBlock = Object.entries(signals.deps)
    .map(([k, v]) => `### ${k}\n\`\`\`\n${v}\n\`\`\``)
    .join("\n\n") || "(未找到常见依赖文件)";

  const ctxBlock = contextSummary
    ? `\n## 【前面已生成的内容摘要】\n${contextSummary}\n`
    : "";

  return `请为【${os}】系统的小白用户生成仓库教程的《${partLabel}》。

## 仓库信息
- URL: ${url}
- 主语言: ${signals.meta.language || "未知"}
- Stars: ${signals.meta.stars}
- 最近更新: ${signals.meta.updated_at}
- 简介: ${signals.meta.description || "(无)"}

## README 内容
${signals.readme}

## 最近 Issues（用于提炼“5 个坑”，段 3 重点参考）
${signals.issues.slice(0, 40).join("\n") || "(无 Issues 数据)"}

## 依赖文件
${depBlock}
${ctxBlock}
---

${partSpec.replace(/\{\{OS\}\}/g, os)}

只输出 JSON。不要 Markdown 代码块，不要任何额外说明。`;
}

// 从段 1 生成上下文摘要，供后续段使用
function buildContextSummary(part1Json) {
  if (!part1Json) return "";
  const lines = [];
  if (part1Json.REPO_NAME) lines.push(`项目名: ${part1Json.REPO_NAME}`);
  if (part1Json.PROJECT_ELEVATOR_PITCH) lines.push(`一句话介绍: ${part1Json.PROJECT_ELEVATOR_PITCH}`);
  if (part1Json.USE_CASES) lines.push(`适用场景:\n${String(part1Json.USE_CASES).slice(0, 400)}`);
  return lines.join("\n");
}

// 单段调用 + 自动重试 1 次
async function callDeepSeekPartWithRetry(systemPrompt, userPrompt, partLabel) {
  try {
    return await callDeepSeek(systemPrompt, userPrompt);
  } catch (err) {
    console.warn(`[${partLabel}] 首次失败尝试重试: ${err.message}`);
    // 起 800ms 后重试
    await new Promise(r => setTimeout(r, 800));
    return await callDeepSeek(systemPrompt, userPrompt);
  }
}

// 原 有的 buildUserPrompt（单次调用版，保留作为兼容，不再由主流程使用）
function buildUserPrompt(signals, os, url) {
  const depBlock = Object.entries(signals.deps)
    .map(([k, v]) => `### ${k}\n\`\`\`\n${v}\n\`\`\``)
    .join("\n\n") || "(未找到常见依赖文件)";

  return `请分析以下 GitHub 仓库，并为【${os}】系统的小白用户生成教程数据。

## 仓库信息
- URL: ${url}
- 主语言: ${signals.meta.language || "未知"}
- Stars: ${signals.meta.stars}
- 最近更新: ${signals.meta.updated_at}
- 简介: ${signals.meta.description || "(无)"}

## README 内容
${signals.readme}

## 最近 Issues（用于提炼"5 个坑"）
${signals.issues.slice(0, 40).join("\n") || "(无 Issues 数据)"}

## 依赖文件
${depBlock}

---

${FIELD_SPEC}

只输出 JSON。不要 Markdown 代码块，不要任何额外说明。`;
}

function getSystemPrompt() {
  const m = PROMPT_DOC.match(/## System Prompt\s*\n```\s*\n([\s\S]*?)\n```/);
  return m ? m[1].trim() : "你是开源项目新手急救包的分析引擎。";
}

async function callDeepSeek(systemPrompt, userPrompt) {
  // DeepSeek 使用 OpenAI 兼容协议
  // 关闭思考模式以加速：deepseek-v4-flash 默认开启思考，对生成结构化教程没必要
  const r = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${DEEPSEEK_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: DEEPSEEK_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.2,
      response_format: { type: "json_object" },
      // DeepSeek V4 thinking 控制：用 output_config.effort="none" 关闭思考链
      output_config: { effort: "none" },
      // DeepSeek V4 Flash 实测 max_tokens 上限为 8192，再大会被静默削减
      max_tokens: 8000,
    }),
  });
  if (!r.ok) throw new Error(`DeepSeek API error: ${r.status} ${await r.text()}`);
  const data = await r.json();
  const choice = data.choices?.[0];
  const content = choice?.message?.content || "{}";
  const finishReason = choice?.finish_reason;

  // 直接解析
  try { return JSON.parse(content); } catch (e) { /* 继续尝试修复 */ }

  // 截断救援：尝试自动闭合 JSON
  const repaired = repairTruncatedJson(content);
  if (repaired) {
    try {
      const obj = JSON.parse(repaired);
      console.warn("[callDeepSeek] JSON 截断已自动修复，finish_reason=" + finishReason);
      return obj;
    } catch (e) { /* 修复失败 */ }
  }

  // 明确告知用户原因
  if (finishReason === "length") {
    throw new Error("AI 输出内容太长被截断了（项目太复杂）。建议：换一个更小的项目，或稍后重试。");
  }
  throw new Error("AI 返回的不是合法 JSON: " + content.slice(0, 200));
}

// 尝试修复被截断的 JSON：补全字符串引号、数组/对象闭合符
function repairTruncatedJson(s) {
  if (!s || typeof s !== "string") return null;
  let str = s.trim();
  // 找到最后一个看起来完整的位置：截断点之前的最后一个 } 或 ]
  // 先按字符走一遍栈，跟踪括号和引号状态
  const stack = [];
  let inStr = false;
  let escape = false;
  let lastSafe = -1;
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (escape) { escape = false; continue; }
    if (c === "\\") { escape = true; continue; }
    if (inStr) {
      if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; continue; }
    if (c === "{" || c === "[") stack.push(c);
    else if (c === "}" || c === "]") {
      stack.pop();
      if (stack.length === 0) lastSafe = i;
    }
  }
  // 如果在字符串中被截断：闭引号 + 闭所有还没关的括号
  let repaired = str;
  if (inStr) repaired += '"';
  // 去掉末尾可能的逗号、半个键名
  repaired = repaired.replace(/,\s*$/, "").replace(/:\s*$/, ": \"\"").replace(/,\s*"[^"]*$/, "");
  // 闭合剩余括号
  for (let i = stack.length - 1; i >= 0; i--) {
    repaired += stack[i] === "{" ? "}" : "]";
  }
  return repaired;
}

function renderTemplate(template, data, extra) {
  const merged = { ...data, ...extra };
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) =>
    merged[k] !== undefined ? String(merged[k]) : `(缺失字段: ${k})`
  );
}

// ------------------------- Mock 教程生成 -------------------------

function buildMockTutorial(url, os) {
  const parsed = parseRepoUrl(url);
  const repoName = parsed ? `${parsed.owner}/${parsed.repo}` : "未知仓库";
  const today = new Date().toISOString().slice(0, 10);

  // 把 demo_output.md 的头部替换为当前用户输入，主体内容保持不变
  const header = `# 🚑 ${repoName} 新手急救包

> 适用系统：**${os}** ｜ 项目地址：${url} ｜ 生成时间：${today}

> ⚠️ **Mock 模式提示**：当前后端未配置 DeepSeek API Key，下方内容是基于 ollama/ollama 的预设示例教程，用于演示产品形态。配置真实 Key 后，每个 GitHub 仓库都会生成专属定制内容。

---
`;

  // 截掉 demo_output 的原始头部（前两个 --- 之间），拼上新头部
  const body = DEMO_OUTPUT.replace(/^# 🚑[\s\S]*?---\n/, "");
  return header + body;
}

// ------------------------- 路由 -------------------------

app.post("/api/generate", async (req, res) => {
  const { url, os } = req.body || {};
  if (!url || !os) return res.status(400).json({ error: "需要 url 和 os 字段" });
  if (!["macOS", "Windows", "Linux"].includes(os))
    return res.status(400).json({ error: "OS 必须是 macOS / Windows / Linux" });

  const parsed = parseRepoUrl(url);
  if (!parsed) return res.status(400).json({ error: "无效的 GitHub URL" });

  // ---- NDJSON 流式响应 ----
  // 原因：DeepSeek 反应往往 60-90s，反向代理会在闲置 60s 后断流。
  // 方案：接口先以 200 + 分块响应开路，每 10s 发一个 {"type":"heartbeat"} 代码衡，最后一行是 {"type":"result","markdown":"..."}。
  // 前端读流，逐行解析，拿 result 那行渲染。
  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("X-Accel-Buffering", "no"); // nginx/代理不要缓冲
  // 立即 flush headers，让代理拿到首字节
  res.flushHeaders && res.flushHeaders();

  const send = (obj) => {
    try { res.write(JSON.stringify(obj) + "\n"); } catch (e) { /* socket closed */ }
  };

  // 心跳定时器，防代理超时
  const heartbeat = setInterval(() => {
    send({ type: "heartbeat", ts: Date.now() });
  }, 10000);

  try {
    send({ type: "progress", step: "start", msg: "开始生成" });

    // Mock 模式：返回预设教程；延迟 ~7s 让前端进度条能跑完 5 步
    if (MOCK_MODE) {
      await new Promise(r => setTimeout(r, 7000));
      send({ type: "result", markdown: buildMockTutorial(url, os), mock: true });
      return;
    }

    send({ type: "progress", step: "fetch_repo", msg: "读仓库信息" });
    const signals = await fetchRepoSignals(parsed.owner, parsed.repo);

    const systemPrompt = getSystemPrompt();

    // ---- 分段串行调用 ----
    // 段 1：项目认知
    send({ type: "progress", step: "part1", msg: "段 1/3：项目介绍" });
    const part1 = await callDeepSeekPartWithRetry(
      systemPrompt,
      buildPartUserPrompt(signals, os, url, FIELD_SPEC_PART1, "段 1：项目认知", ""),
      "part1",
    );
    send({ type: "progress", step: "part1_done", msg: "段 1/3 完成 ✓" });

    // 段 2：环境与安装
    const ctxSummary = buildContextSummary(part1);
    send({ type: "progress", step: "part2", msg: "段 2/3：环境检查与安装" });
    const part2 = await callDeepSeekPartWithRetry(
      systemPrompt,
      buildPartUserPrompt(signals, os, url, FIELD_SPEC_PART2, "段 2：环境与安装", ctxSummary),
      "part2",
    );
    send({ type: "progress", step: "part2_done", msg: "段 2/3 完成 ✓" });

    // 段 3：故障排查与进阶
    send({ type: "progress", step: "part3", msg: "段 3/3：5 个坑与进阶玩法" });
    const part3 = await callDeepSeekPartWithRetry(
      systemPrompt,
      buildPartUserPrompt(signals, os, url, FIELD_SPEC_PART3, "段 3：故障排查与进阶", ctxSummary),
      "part3",
    );
    send({ type: "progress", step: "part3_done", msg: "段 3/3 完成 ✓" });

    // 合并三段结果
    const json = { ...part1, ...part2, ...part3 };

    send({ type: "progress", step: "render", msg: "渲染教程" });
    const markdown = renderTemplate(TEMPLATE, json, {
      OS: os,
      REPO_URL: url,
      REPO_NAME: json.REPO_NAME || signals.meta.full_name,
      GENERATED_AT: new Date().toISOString().slice(0, 10),
    });
    send({ type: "result", markdown, raw: json });
  } catch (err) {
    console.error(err);
    send({ type: "error", error: err.message });
  } finally {
    clearInterval(heartbeat);
    res.end();
  }
});

// ------------------------- 报错诊断 -------------------------

const DIAGNOSE_SYSTEM_PROMPT = `你是一位非常耐心、说话像朋友一样的开源项目报错诊断专家。
你的用户是【从未写过代码】的纯小白：ta 不知道终端是什么，看到英文报错就慌，只会复制粘贴。

你的任务：拿到 ta 粘贴的报错信息（可能是文字、可能是截图 OCR 出来的英文+乱码），
用最通俗的中文告诉 ta：
1) 这报错到底是在说什么（翻译成人话）
2) 错在哪里、为什么（猜原因，给出最可能的 1-3 种）
3) 一步一步怎么修（傻瓜级动作）

【写作铁律】
- 全程中文，不要英文（除了必须保留的命令和报错关键词）
- 不要说"显然""很简单""只需要"这种伤人话
- 修复步骤一定用有序列表 1./2./3.，每步告诉 ta：打开什么软件、点哪里、复制粘贴什么命令、回车后会看到什么
- 命令前用一句话解释"这是干啥的"
- 不要让 ta 改隐藏文件（.zshrc/.bashrc）；要调 PATH 就让 ta"关闭终端重新打开"
- 如果信息不够判断，老实说"我不太确定，建议你做以下检查"，给出 2-3 个排查动作
- 如果截图 OCR 文本明显乱码或不含报错关键词，直接告诉用户"我没看清你的报错，可不可以把报错文字直接复制粘贴过来？"

【输出 JSON，仅包含以下字段】
{
  "summary": "一句话说明这报错在抱怨什么（30 字内，给小白看的）",
  "plain_meaning": "用 2-4 句中文把报错翻译成人话，可以打比方",
  "likely_causes": ["最可能的原因 1（一句话）", "原因 2", ...],  // 1-3 条
  "fix_steps": "Markdown 有序列表（用 1./2./3.），3-7 步，每步是具体动作",
  "verify": "修完以后跑什么、看到什么算成功（一句话或一条命令）",
  "severity": "info | warning | error",  // info=轻微，warning=要处理但不致命，error=必须修
  "confidence": "high | medium | low"  // 你对这次诊断的把握
}
只输出 JSON，不要 Markdown 代码块。`;

async function callDeepSeekDiagnose(errorText, context) {
  const userMsg = `用户在跑开源项目的时候遇到了一个报错，请帮 ta 诊断。

${context ? `## 上下文\n${context}\n\n` : ""}## 报错内容
${errorText}

请按 system prompt 要求输出 JSON。`;

  const r = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${DEEPSEEK_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: DEEPSEEK_MODEL,
      messages: [
        { role: "system", content: DIAGNOSE_SYSTEM_PROMPT },
        { role: "user", content: userMsg },
      ],
      temperature: 0.2,
      response_format: { type: "json_object" },
      output_config: { effort: "none" },
      max_tokens: 4000,
    }),
  });
  if (!r.ok) throw new Error(`DeepSeek API error: ${r.status} ${await r.text()}`);
  const data = await r.json();
  const content = data.choices?.[0]?.message?.content || "{}";
  try { return JSON.parse(content); }
  catch { throw new Error("AI 返回的不是合法 JSON"); }
}

function buildMockDiagnose(errorText) {
  return {
    summary: "演示模式 · 这是一个示例诊断结果",
    plain_meaning: `（Mock 模式）你贴的报错是：\n${errorText.slice(0, 200)}${errorText.length > 200 ? "..." : ""}\n\n配置 DeepSeek API Key 后，这里会显示 AI 翻译成人话的解释。`,
    likely_causes: [
      "演示用占位原因 1：某个依赖没装好",
      "演示用占位原因 2：环境变量配置不对",
    ],
    fix_steps: "1. **配置真实 API Key**：在后端环境变量中设置 DEEPSEEK_API_KEY\n2. **重启服务**：让后端重新加载配置\n3. **再试一次**：刷新页面，重新贴报错",
    verify: "看到这段文字变成 AI 真实分析就代表成功了",
    severity: "info",
    confidence: "high",
  };
}

app.post("/api/diagnose", async (req, res) => {
  const { error_text, context } = req.body || {};
  if (!error_text || typeof error_text !== "string" || error_text.trim().length < 3) {
    return res.status(400).json({ error: "请提供报错文字（至少 3 个字符）" });
  }

  // 同样用 NDJSON 流，防代理超时
  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders && res.flushHeaders();

  const send = (obj) => { try { res.write(JSON.stringify(obj) + "\n"); } catch (e) {} };
  const heartbeat = setInterval(() => send({ type: "heartbeat", ts: Date.now() }), 10000);

  try {
    send({ type: "progress", msg: "AI 正在阅读报错" });
    let result;
    if (MOCK_MODE) {
      await new Promise(r => setTimeout(r, 3000));
      result = buildMockDiagnose(error_text);
    } else {
      result = await callDeepSeekDiagnose(error_text.slice(0, 8000), context);
    }
    send({ type: "result", diagnosis: result, mock: MOCK_MODE });
  } catch (err) {
    console.error("diagnose error:", err);
    send({ type: "error", error: err.message });
  } finally {
    clearInterval(heartbeat);
    res.end();
  }
});

// ------------------------- 三重保障诊断接口 v2 -------------------------
// 输入：error_text + issues_index (可选) + repo_info (可选)
// 步骤：
//   1. 有 issues_index → AI 语义匹配在档报错库
//   2. 未命中 → 常规 LLM 诊断
//   3. LLM 说不准（low confidence） → pplx 搜索 + AI 重新整理

const MATCH_SYSTEM_PROMPT = `你是一个报错语义匹配助手。将用户贴的报错与一份预生成的项目报错索引对照，判断是否存在高置信度的匹配项。

输出 JSON：
{
  "matched": true/false,        // 只有报错关键词、堆栈跟踪、报错类型三者中至少两者与某条索引项高度重叠才设为 true
  "matched_id": "...",          // 匹配上的索引项 id，未匹配填 ""
  "confidence": "high|medium|low",
  "reasoning": "一句话说为什么匹配/不匹配（中文）"
}

严格要求：只输出 JSON，不要价何其他文字。如果报错与索引项都不像，必须 matched=false。`;

async function matchAgainstIssuesIndex(errorText, issuesIndex) {
  if (!Array.isArray(issuesIndex) || issuesIndex.length === 0) return null;

  // 索引压缩：只发 id/title/keywords/error_pattern 给匹配模型，节 token
  const indexCompact = issuesIndex.map(it => ({
    id: it.id,
    title: it.title,
    keywords: it.keywords,
    error_pattern: it.error_pattern,
  }));

  const userMsg = `## 项目预生成的报错索引
${JSON.stringify(indexCompact, null, 2)}

## 用户贴的报错
${errorText.slice(0, 2000)}

请输出匹配结果 JSON。`;

  const r = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${DEEPSEEK_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: DEEPSEEK_MODEL,
      messages: [
        { role: "system", content: MATCH_SYSTEM_PROMPT },
        { role: "user", content: userMsg },
      ],
      temperature: 0.1,
      response_format: { type: "json_object" },
      output_config: { effort: "none" },
      max_tokens: 500,
    }),
  });
  if (!r.ok) throw new Error(`DeepSeek match API error: ${r.status}`);
  const data = await r.json();
  const content = data.choices?.[0]?.message?.content || "{}";
  try { return JSON.parse(content); } catch { return null; }
}

// pplx 搜索调用
const { execFile } = require("child_process");
function pplxSearch(query) {
  return new Promise((resolve, reject) => {
    const child = execFile("pplx", ["search", "web", query], {
      timeout: 30000,
      maxBuffer: 4 * 1024 * 1024,
      env: { ...process.env },
    }, (err, stdout, stderr) => {
      if (err) return reject(new Error(`pplx 搜索失败: ${err.message}`));
      try {
        const obj = JSON.parse(stdout);
        const hits = (obj.hits || []).slice(0, 5).map(h => ({
          title: h.title,
          url: h.url,
          domain: h.domain,
          summary: (h.summary || "").slice(0, 800),
        }));
        resolve(hits);
      } catch (e) { reject(new Error("pplx 搜索返回不是合法 JSON")); }
    });
  });
}

const SEARCH_SYNTHESIS_PROMPT = `你是一位耐心的报错诊断专家。帮用户看了几个联网搜到的资料后，用最通俗的中文告诉 ta 怎么修。

【铁律】
- 全程中文；不说 "显然""简单""只需要"
- fix_steps 用 \`1./2./3.\` 有序列表，每步具体动作（打开哪个软件、点哪里、输什么命令）
- 禁用 \`source ~/.zshrc\`、\`chmod +x\`、\`export PATH\` 这种需要背景知识的命令
- 最后一步是 "验证成功"

输出 JSON：
{
  "summary": "一句话说明报错意思（中文，30 字内）",
  "plain_meaning": "2-4 句中文解释",
  "likely_causes": ["原因 1", "原因 2"],
  "fix_steps": "Markdown 有序列表 3-7 步，严格 \`1./2./3.\`",
  "verify": "一句话说怎么验证修好了",
  "severity": "info|warning|error",
  "confidence": "high|medium|low",
  "references": [{"title": "...", "url": "https://..."}]   // 使用了哪几个搜搜索结果，最多 3 个
}`;

async function synthesizeFromSearch(errorText, hits) {
  const userMsg = `## 用户报错
${errorText.slice(0, 2000)}

## 联网搜到的资料
${hits.map((h, i) => `### [${i+1}] ${h.title}\nURL: ${h.url}\n${h.summary}`).join("\n\n")}

请根据上述资料出一份面向小白的诊断。`;

  const r = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${DEEPSEEK_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: DEEPSEEK_MODEL,
      messages: [
        { role: "system", content: SEARCH_SYNTHESIS_PROMPT },
        { role: "user", content: userMsg },
      ],
      temperature: 0.2,
      response_format: { type: "json_object" },
      output_config: { effort: "none" },
      max_tokens: 3000,
    }),
  });
  if (!r.ok) throw new Error(`DeepSeek synthesize error: ${r.status}`);
  const data = await r.json();
  const content = data.choices?.[0]?.message?.content || "{}";
  const parsed = JSON.parse(content);
  // 兼底：如果 LLM 没输出 references，直接用 hits 填补
  if (!Array.isArray(parsed.references) || parsed.references.length === 0) {
    parsed.references = hits.slice(0, 3).map(h => ({ title: h.title, url: h.url }));
  }
  return parsed;
}

// 提取报错关键词供搜索
function extractSearchQuery(errorText, repoInfo) {
  // 取前 300 字符，压缩多行空白
  const compact = errorText.slice(0, 300).replace(/\s+/g, " ").trim();
  const repo = repoInfo?.repo_name ? `${repoInfo.repo_name} ` : "";
  return `${repo}${compact} solution`.slice(0, 200);
}

app.post("/api/diagnose-v2", async (req, res) => {
  const { error_text, context, issues_index, repo_info } = req.body || {};
  if (!error_text || typeof error_text !== "string" || error_text.trim().length < 3) {
    return res.status(400).json({ error: "请提供报错文字（至少 3 个字符）" });
  }

  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders && res.flushHeaders();

  const send = (obj) => { try { res.write(JSON.stringify(obj) + "\n"); } catch (e) {} };
  const heartbeat = setInterval(() => send({ type: "heartbeat", ts: Date.now() }), 10000);

  try {
    if (MOCK_MODE) {
      send({ type: "progress", stage: "matching", msg: "检查项目报错库" });
      await new Promise(r => setTimeout(r, 2000));
      const mock = buildMockDiagnose(error_text);
      send({ type: "result", diagnosis: mock, source: "mock", mock: true });
      return;
    }

    // ---- 阶段 1：在档 Issues 匹配 ----
    if (Array.isArray(issues_index) && issues_index.length > 0) {
      send({ type: "progress", stage: "matching", msg: `检查项目 Issues 报错库（${issues_index.length} 条）` });
      try {
        const match = await matchAgainstIssuesIndex(error_text, issues_index);
        if (match && match.matched && match.confidence !== "low" && match.matched_id) {
          const hit = issues_index.find(it => it.id === match.matched_id);
          if (hit) {
            // 转成诊断输出格式
            const diagnosis = {
              summary: hit.title,
              plain_meaning: hit.plain_meaning,
              likely_causes: hit.likely_causes || [],
              fix_steps: hit.fix_steps,
              verify: hit.verify || "",
              severity: "warning",
              confidence: match.confidence,
              references: hit.issue_url ? [{ title: "原始 Issue", url: hit.issue_url }] : [],
            };
            send({ type: "result", diagnosis, source: "issues_index", matched_id: hit.id, reasoning: match.reasoning });
            return;
          }
        }
        send({ type: "progress", stage: "matching_done", msg: "项目内未找到同样报错，交给 AI 推断" });
      } catch (e) {
        console.warn("match 阶段出错，跳过:", e.message);
      }
    }

    // ---- 阶段 2：LLM 推断 ----
    send({ type: "progress", stage: "llm", msg: "AI 正在推断报错" });
    let llmResult;
    try {
      llmResult = await callDeepSeekDiagnose(error_text.slice(0, 8000), context);
    } catch (e) {
      console.warn("LLM 诊断失败，直接走搜索:", e.message);
      llmResult = null;
    }

    // 如果 LLM 诊断高置信度，直接返回
    if (llmResult && llmResult.confidence && llmResult.confidence !== "low") {
      send({ type: "result", diagnosis: llmResult, source: "llm" });
      return;
    }

    // ---- 阶段 3：联网搜索兑底 ----
    send({ type: "progress", stage: "searching", msg: "AI 不太确定，正在联网搜资料" });
    try {
      const query = extractSearchQuery(error_text, repo_info);
      const hits = await pplxSearch(query);
      if (hits.length === 0) {
        // 搜不到，还是返 LLM 结果（哪怕低置信）
        if (llmResult) {
          send({ type: "result", diagnosis: llmResult, source: "llm_low_confidence" });
          return;
        }
        throw new Error("搜索未返回结果且 LLM 也失败了");
      }
      send({ type: "progress", stage: "synthesizing", msg: `找到 ${hits.length} 条资料，AI 正在整理` });
      const synthesized = await synthesizeFromSearch(error_text, hits);
      send({ type: "result", diagnosis: synthesized, source: "web_search", search_hits_count: hits.length });
    } catch (e) {
      console.warn("搜索兑底失败:", e.message);
      if (llmResult) {
        send({ type: "result", diagnosis: llmResult, source: "llm_low_confidence", search_error: e.message });
      } else {
        throw e;
      }
    }
  } catch (err) {
    console.error("diagnose-v2 error:", err);
    send({ type: "error", error: err.message });
  } finally {
    clearInterval(heartbeat);
    res.end();
  }
});

app.get("/api/health", (_, res) => res.json({ ok: true, mock: MOCK_MODE, model: MOCK_MODE ? null : DEEPSEEK_MODEL }));

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚑 新手急救包 running at http://0.0.0.0:${PORT}`);
  console.log(`Mode: ${MOCK_MODE ? "MOCK (no DEEPSEEK_API_KEY)" : `LIVE · ${DEEPSEEK_MODEL}`}`);
});
