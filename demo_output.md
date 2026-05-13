# 🚑 ollama/ollama 新手急救包

> 适用系统：**macOS** ｜ 项目地址：https://github.com/ollama/ollama ｜ 生成时间：2026-05-11

---

## 1. 这个项目是干什么的？（30 秒看懂）

Ollama 是一个能在你 Mac 本地运行大语言模型（比如 Llama 3、Qwen、DeepSeek）的工具。你不需要联网、不需要 API Key，下载一次模型后就能离线和 AI 聊天，所有数据都留在你电脑里。

**适合用它解决的问题：**
- 想在本地跑 ChatGPT 类的 AI，但不想付费或泄露隐私数据
- 给自己写的小工具加 AI 能力（如总结、翻译、问答）
- 在断网环境（飞机、内网）里仍然能用 AI
- 想试用各种开源大模型，对比效果

**不适合的场景：**
- 你只有 8GB 内存的 Intel Mac（跑稍大模型会爆内存）
- 需要最顶尖的对话效果（本地小模型仍弱于 GPT-4 / Claude）
- 想做大规模并发服务（Ollama 默认是单机单用户用法）

---

## 2. 开始前 · 环境自检（3 分钟）

把下面这段代码复制到**终端**（按 `Cmd+空格`，输入 `Terminal` 回车打开），它会自动检查你电脑上的环境。

### macOS 环境自检脚本

```bash
echo "—— Ollama 环境自检 ——"

# 1. 系统版本（macOS 12+ 推荐）
SW=$(sw_vers -productVersion)
echo "macOS 版本：$SW"

# 2. 芯片类型（决定走 Metal 加速还是 CPU）
ARCH=$(uname -m)
if [ "$ARCH" = "arm64" ]; then
  echo "✅ Apple Silicon（M 系列芯片）— 性能最佳"
else
  echo "⚠️  Intel 芯片 — 能跑，但会比较慢"
fi

# 3. 可用内存（≥8GB 才推荐）
MEM=$(sysctl -n hw.memsize | awk '{print int($1/1024/1024/1024)}')
echo "内存：${MEM} GB"
[ $MEM -lt 8 ] && echo "❌ 内存 <8GB，跑 7B 模型会卡，建议只跑 1B-3B 模型"

# 4. 磁盘剩余空间（每个模型 2-8GB）
DISK=$(df -g / | awk 'NR==2 {print $4}')
echo "磁盘可用：${DISK} GB"
[ $DISK -lt 20 ] && echo "❌ 建议至少留 20GB 给模型文件"

# 5. Homebrew（可选，方便后续安装）
command -v brew >/dev/null && echo "✅ 已安装 Homebrew" || echo "ℹ️  未装 Homebrew（不装也能用 Ollama）"
```

**这一步在做什么？** 检查你 Mac 的系统版本、芯片、内存、磁盘是否够跑 AI 模型。这些是项目运行的"地基"。

### 如果某项缺失，按下表安装：

| 缺什么 | 怎么装（macOS） | 验证命令 |
|--------|----------------|---------|
| 内存不够 | 没法升级，只能选小模型（如 `qwen2:1.5b`） | — |
| 磁盘不够 | 清理 `~/Downloads` 或外接硬盘 | `df -g /` |
| Homebrew（可选） | 把这行粘进终端：`/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"` | `brew --version` |

---

## 3. 一键安装（推荐新手用）

打开**文本编辑器**（如 TextEdit，记得切到"纯文本"模式：格式 → 制作纯文本），把下面内容粘进去，存为 `install.sh`，放到桌面。

```bash
#!/bin/bash
set -e

echo "==> 步骤 1/4：下载 Ollama 安装包"
# 这一步在做什么：从官网拉最新的 Mac 版安装包
curl -L -o ~/Downloads/Ollama.dmg https://ollama.com/download/Ollama-darwin.zip

echo "==> 步骤 2/4：预创建 CLI 目录（绕过 Issue #11263 的常见报错）"
# 这一步在做什么：新版 macOS 默认没有 /usr/local/bin，Ollama 装命令行工具会失败，提前创好
sudo mkdir -p /usr/local/bin

echo "==> 步骤 3/4：解压并移动到应用程序文件夹"
# 这一步在做什么：把 App 放到标准位置，让 Spotlight 能搜到
unzip -o ~/Downloads/Ollama.dmg -d /Applications/

echo "==> 步骤 4/4：首次启动（会弹窗让你输密码安装命令行工具）"
open /Applications/Ollama.app

echo ""
echo "✅ 装完啦！等 30 秒，菜单栏右上角会出现羊驼图标。"
echo "然后另开一个终端窗口，运行：  ollama run qwen2:1.5b"
```

然后回到终端，运行：

```bash
chmod +x ~/Desktop/install.sh
~/Desktop/install.sh
```

**这一步在做什么？**
1. 下载 Ollama 官方安装包（约 200MB）
2. 提前创建 `/usr/local/bin` 目录（这是 90% 新手报错"command not found"的根因）
3. 把 App 放进应用程序文件夹
4. 启动 App，让它自动注册命令行工具

⏱️ 预计耗时：3-5 分钟（取决于网速）

---

## 4. 跑通第一个示例（Hello World）

等菜单栏出现羊驼图标后，**新开一个终端窗口**，运行：

```bash
ollama run qwen2:1.5b "你好，请用一句话介绍你自己"
```

**预期看到的结果：**

```
pulling manifest
pulling 8de95da6...  100% ▕████████████████▏ 934 MB
pulling 62fbfd9e...  100% ▕████████████████▏  68 B
verifying sha256 digest
writing manifest
success

你好！我是阿里云开发的 Qwen2 大语言模型，可以回答问题、写文章和聊天。
```

✅ 看到上面这样的输出，恭喜，你的 Mac 已经能本地跑 AI 模型了。

> 💡 第一次运行会下载模型（约 1GB），之后再跑就是秒开。

---

## 5. ⚠️ 5 个新手最常踩的坑

> 这一节是从 Ollama Issues 区高频报错总结。**遇到报错先来这里查，能省 80% 时间。**

### 坑 1：`command not found: ollama`（最常见！）
**报错长这样：**
```
zsh: command not found: ollama
```
**原因：** 新版 macOS 默认不存在 `/usr/local/bin/` 目录，Ollama 装命令行工具时静默失败了（[Issue #11263](https://github.com/ollama/ollama/issues/11263)）。
**解决方法：**
```bash
sudo mkdir -p /usr/local/bin
# 然后从菜单栏退出 Ollama，重新打开 Ollama.app（会重新尝试装 CLI）
```

### 坑 2：`Error: listen tcp 127.0.0.1:11434: bind: address already in use`
**报错长这样：**
```
Error: listen tcp 127.0.0.1:11434: bind: address already in use
```
**原因：** Ollama 已经在后台跑了（菜单栏的羊驼图标），你又在终端运行 `ollama serve` 就重复了（[Issue #707](https://github.com/ollama/ollama/issues/707)）。
**解决方法：**
```bash
# 方法 A（推荐）：直接用 ollama run/list，不用手动 serve
ollama list

# 方法 B：如果一定要手动 serve，先杀掉菜单栏的进程
pkill -f "Ollama"
# 然后再 serve
ollama serve
```

### 坑 3：装完点击 App 没反应 / 闪退
**报错长这样：**
没有报错，但 Dock 里图标转一下就消失，菜单栏没有羊驼图标（[Issue #2280](https://github.com/ollama/ollama/issues/2280)）。
**原因：** 旧版残留或权限问题。
**解决方法：**
```bash
# 1) 完全卸载
rm -rf /Applications/Ollama.app
rm -rf ~/.ollama
rm -rf ~/Library/Application\ Support/Ollama

# 2) 重新下载安装
curl -L -o ~/Downloads/Ollama.zip https://ollama.com/download/Ollama-darwin.zip
unzip -o ~/Downloads/Ollama.zip -d /Applications/

# 3) 第一次启动用终端直接调起可执行文件，能看到日志
/Applications/Ollama.app/Contents/MacOS/Ollama
```

### 坑 4：跑模型时报 Metal / GPU 错误
**报错长这样：**
```
ggml_metal_init: error: failed to create Metal library
Internal Server: model failed to load
```
**原因：** 你的 macOS 版本太新（如 26.x）和 Ollama 嵌入的 Metal shader 不兼容（[Reddit 讨论](https://www.reddit.com/r/ollama/comments/1smexbv/)）。
**解决方法：**
```bash
# 方法 A：升级到最新 Ollama 版本（多半官方已修）
brew upgrade ollama   # 如果用 brew 装的
# 或者去官网下最新版重装

# 方法 B：临时强制走 CPU
OLLAMA_NUM_GPU=0 ollama run qwen2:1.5b
```

### 坑 5：下载模型卡住 / 超慢
**报错长这样：**
```
pulling 8de95da6...  3% ▕█▏  ... (几小时不动)
```
**原因：** 国内访问 ollama.com 拉镜像可能受网络影响。
**解决方法：**
```bash
# 方法 A：开代理后重试
export HTTPS_PROXY=http://127.0.0.1:7890   # 改成你代理的端口
ollama pull qwen2:1.5b

# 方法 B：直接下载 GGUF 文件，导入本地
# 1) 从 HuggingFace 镜像下载 .gguf 文件（如 hf-mirror.com）
# 2) 写一个 Modelfile：
echo 'FROM /path/to/your-model.gguf' > Modelfile
# 3) 导入
ollama create my-model -f Modelfile
ollama run my-model
```

---

## 6. 🎯 把项目用到你自己的数据上

> 跑通官方示例只是第一步，下面教你怎么把 Ollama"嫁接"到你自己的项目里。

### 第 1 步：确定你的应用场景

Ollama 启动后会在 `http://localhost:11434` 暴露一个 API。你的程序（Python / Node / 网页前端都行）就是通过这个地址调用 AI 的。

### 第 2 步：用 Python 调用本地 Ollama（最常见用法）

新建一个 `chat.py` 文件：

```python
# 这一步在做什么：通过 HTTP 调用本地 Ollama，让它处理你自己的文本
import requests

# 把这里换成你自己的数据
my_text = "请帮我总结这段话：今天市场部门讨论了 Q3 营销活动..."

resp = requests.post("http://localhost:11434/api/generate", json={
    "model": "qwen2:1.5b",      # 改成你 ollama list 里看到的模型名
    "prompt": my_text,
    "stream": False,
})
print(resp.json()["response"])
```

运行：
```bash
pip3 install requests
python3 chat.py
```

### 第 3 步：批量处理你的数据（进阶）

如果你有一份 Excel 表格要让 AI 逐行处理：

```python
import pandas as pd, requests

df = pd.read_excel("我的数据.xlsx")     # 改成你的文件
df["AI总结"] = df["原文"].apply(lambda x: requests.post(
    "http://localhost:11434/api/generate",
    json={"model":"qwen2:1.5b","prompt":f"一句话总结：{x}","stream":False}
).json()["response"])
df.to_excel("处理结果.xlsx", index=False)
```

### 第 4 步：换更强的模型

```bash
# 看看有哪些模型可下载
# 浏览：https://ollama.com/library

# 推荐几个：
ollama pull qwen2.5:7b        # 阿里 Qwen，中文最好，需 8GB 内存
ollama pull llama3.2:3b       # Meta Llama，英文强，3GB 内存够
ollama pull deepseek-r1:7b    # DeepSeek 推理模型，擅长数学
```

### 💡 进阶提示
- **Web UI**：装个 [Open WebUI](https://github.com/open-webui/open-webui)，给 Ollama 套上类似 ChatGPT 的界面。
- **手机访问**：把 `OLLAMA_HOST` 设为 `0.0.0.0:11434`，同一 WiFi 下手机也能用。
- **省内存**：跑完模型用 `ollama stop <模型名>` 释放显存。

---

## 7. 还是搞不定？求助清单

| 问题类型 | 去哪里问 |
|---------|---------|
| 报错没找到答案 | [Ollama Issues](https://github.com/ollama/ollama/issues) — 先用关键词搜，多半别人遇到过 |
| 想问"该怎么用" | [Ollama Discussions](https://github.com/ollama/ollama/discussions) |
| 中文问答 | 把报错信息贴到 Perplexity / ChatGPT，附带"我用的是 macOS"一起问 |

---

## 📌 附录：术语小词典

- **CLI**：命令行工具（Command Line Interface），就是在终端里敲字执行的程序。
- **API**：应用接口，你的程序和 Ollama 沟通的"通道"，地址固定是 `http://localhost:11434`。
- **模型 / Model**：AI 的"大脑文件"，本质是几个 GB 的二进制文件。
- **量化 / Quantization**：把大模型压缩变小的技术。`qwen2:1.5b-q4_K_M` 里的 `q4` 就是 4-bit 量化版。
- **Metal**：苹果芯片的 GPU 加速框架，Apple Silicon 上跑模型默认走它。
- **Modelfile**：类似 Dockerfile，用来自定义模型的配置文件。
- **GGUF**：一种开源模型文件格式，跨工具通用。

---

*本教程由"新手急救包"自动生成，基于 ollama/ollama 的 README、官方 FAQ 与 Issues 高频问题综合分析。*
