# TuoIM 前端

TuoIM 即时通讯系统的 **Web 前端**：一个纯静态的 HTML / CSS / JS 单页应用，无构建依赖，开箱即用。通过 HTTP 调用后端 API、WebSocket 接收实时消息推送，支持登录注册、好友管理、单聊、群聊、图片消息、个人资料等功能。

> 🔗 **后端仓库（TuoIM 服务端）**：
>
> - Gitee：<https://gitee.com/tuoxie423/tuo-im.git>
> - GitHub：<https://github.com/Tuoxie423/TuoIM>
>
> 本前端仅提供界面与交互，所有数据都来自后端接口，**运行前请先启动后端**。

---

## ✨ 功能特性

| 模块 | 能力 |
|---|---|
| 🔐 账号 | 手机号 + 密码登录 / 注册，JWT 自动存 `localStorage` |
| 🤝 好友 | 按手机号搜索、发起申请、同意 / 拒绝申请、好友列表（含在线状态）、未读申请数 |
| 💬 单聊 | 文本 / 图片消息、历史消息加载、WebSocket 实时收发 |
| 👥 群聊 | 建群、发消息、群成员列表、加人、踢人、更换群头像 |
| 👤 个人中心 | 查看资料、修改昵称 / 性别、上传头像、退出登录 |
| 😀 表情 | 内置 emoji 面板 |
| 📱 响应式 | 适配移动端（聊天页侧边栏与聊天区切换显示） |

---

## 🛠 技术栈

| 层 | 技术 | 说明 |
|---|---|---|
| 页面结构 | 原生 HTML | 无框架 |
| 样式 | 原生 CSS | `style.css` |
| 交互逻辑 | 原生 JavaScript | `app.js`，无构建、无打包 |
| 实时通信 | WebSocket | `ws://…:8081/ws`，客户端 30s 心跳 |
| HTTP 请求 | Fetch API | 统一封装在 `api()` |
| 本地静态服务 | Python `http.server` | `serve.py`，带 no-cache 头 |

---

## 📂 目录结构

```
web/
├── index.html   # 页面骨架（登录页 / 聊天页 / 各弹窗）
├── app.js       # 全部交互逻辑（API 封装、WebSocket、渲染）
├── style.css    # 样式
├── serve.py     # 本地静态服务器（禁用缓存，便于调试）
└── README.md
```

---

## 🚀 快速开始

### 1. 先启动后端

前端依赖后端提供的接口，请先按后端 README 启动 TuoIM 服务：

- **HTTP API**：`localhost:8080`
- **WebSocket**：`localhost:8081`

### 2. 启动前端

前端是纯静态文件，本地开发用 `serve.py` 起一个 no-cache 静态服务器（改动代码后浏览器不会缓存旧版本）：

```bash
cd web
python serve.py
```

启动后浏览器访问：<http://localhost:8000>

> 也可以直接用 `Live Server` 等任意静态服务器打开，或用 `file://` 直接双击 `index.html`（此时 HOST 会回退为 `localhost`）。

---

## ⚙️ 前后端连接配置

连接地址在 [app.js](app.js) 顶部，按当前访问的域名自动推断：

```js
const HOST = location.protocol === 'file:' ? 'localhost' : location.hostname;
const API = `http://${HOST}:8080/api`;   // 后端 HTTP API
const WS  = `ws://${HOST}:8081/ws`;       // 后端 WebSocket
```

- **本机访问**：`localhost:8000` → 自动连 `localhost:8080` / `localhost:8081`，无需改动。
- **局域网 / 部署**：把 HOST 改成后端实际部署的地址即可（例如反向代理或内网 IP）。

---

## 🔌 鉴权说明

后端使用 JWT 鉴权，前端登录后把 token 存入 `localStorage`：

- HTTP 请求：通过 `Authorization: Bearer <token>` 头携带；
- WebSocket：token 通过 URL query 携带（`/ws?token=…`）。

---

## 📡 依赖的后端接口

| 分类 | 接口 |
|---|---|
| 账号 | `/api/register`、`/api/login`、`/api/users/info` |
| 好友 | `/api/users/search`、`/api/friend/*` |
| 单聊 | `/api/room/get_or_create`、`/api/chat/send`、`/api/chat/history` |
| 群聊 | `/api/group/*` |
| 文件 | `/api/file/upload` |
| 实时 | `ws://…:8081/ws` |

完整接口文档见后端仓库的 README 与 Swagger 文档。
