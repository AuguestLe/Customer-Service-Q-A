# 问一问 · AI 咨询助手

一个基于 Vue 3 和 FastAPI 的轻量级 AI 聊天项目，通过 DeepSeek API 提供中文问答，支持流式回复和本地模拟模式，适合学习前后端分离与大模型接口接入。

## 主要功能

- SSE 流式输出，逐段展示回答。
- 支持多轮对话、停止生成、失败或停止后重试。
- 支持复制回答、清空对话和示例问题快捷填入。
- 提供无需 API Key 的 Mock 模式，方便本地体验。
- 支持移动端布局、输入长度校验和服务状态提示。

## 技术栈

- 前端：Vue 3、TypeScript、Vite。
- 后端：Python、FastAPI、Uvicorn、HTTPX。
- 测试与检查：Vitest、Playwright、pytest、Ruff。
- 依赖管理：npm、uv。

## 快速开始

### 环境要求

- Node.js >= 22.12.0。
- 安装 [uv](https://docs.astral.sh/uv/getting-started/installation/)；后端要求 Python >= 3.12，仓库默认使用 Python 3.14，uv 可按需自动下载。

以下命令均在项目根目录执行。

### 安装依赖

```bash
npm install
npm run setup:api
```

### 方式一：模拟模式

无需配置密钥，同时启动前后端：

```bash
npm run dev:mock
```

打开 http://127.0.0.1:5173 即可体验。模拟回复为预置内容，不会调用真实模型。

### 方式二：接入 DeepSeek

复制 `backend/.env.example` 为 `backend/.env`，填写配置：

```dotenv
CHAT_MODE=deepseek
DEEPSEEK_API_KEY=你的_API_Key
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-flash
```

模型名称以账号实际可用模型为准，其余参数可参考示例文件。停止已运行的模拟服务后，执行：

```bash
npm run dev
```

前端地址为 http://127.0.0.1:5173，后端地址为 http://127.0.0.1:8000，前端通过 Vite 代理访问 `/api`。修改环境配置后需重启后端。

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `npm run dev:web` | 单独启动前端 |
| `npm run dev:api` | 单独启动后端 |
| `npm run build` | 类型检查并构建前端，输出到 `dist/` |
| `npm test` | 前端单元测试 |
| `npm run test:api` | 后端测试 |
| `npm run test:e2e` | Playwright 端到端测试 |
| `npm run check` | 构建、前后端单元测试及后端代码检查，不含 E2E |

E2E 测试使用本机 Google Chrome，请提前安装。建议先停止现有开发服务，再执行测试，由 Playwright 自动启动 Mock 服务。

## 项目结构

```text
src/
├── features/chat/    # 聊天页面、组件、状态管理及 SSE 请求处理
├── assets/           # 全局样式
└── App.vue           # 应用入口组件
backend/
├── app/              # API、配置、请求校验及模型流式调用
├── tests/            # 后端测试
└── .env.example      # 环境变量示例
e2e/                  # 端到端测试
```

## 注意事项

- 当前仅面向本地开发，无登录、数据库和聊天记录持久化，刷新页面会清空对话。
- 未接入企业知识库、订单系统或实时搜索，属于通用咨询助手。
- API Key 仅保存在后端环境配置中，不要提交 `.env` 或把密钥放入前端代码。
- 默认仅监听本机地址；上线前需补充鉴权、限流等安全措施，不要直接暴露到公网。
