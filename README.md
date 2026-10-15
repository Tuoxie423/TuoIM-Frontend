# TuoIM 前端

TuoIM 即时通讯系统的 **Web 前端**：纯静态 HTML / CSS / JS 单页应用，无构建依赖，通过 HTTP 调用后端 API、WebSocket 接收实时消息，支持登录注册、好友、单聊、群聊、图片消息、个人资料等。

> 🔗 **后端仓库（TuoIM 服务端）**：
>
> - Gitee：<https://gitee.com/tuoxie423/tuo-im.git>
> - GitHub：<https://github.com/Tuoxie423/TuoIM>
>
> 本前端仅提供界面与交互，所有数据都来自后端接口，**运行前请先启动后端**。

---

## 🛠 技术栈

原生 HTML + CSS + JavaScript，无框架、无构建；WebSocket 实时通信，Fetch 调 HTTP API。

## 📂 目录结构

```
web/
├── index.html   # 页面骨架
├── app.js       # 交互逻辑（API 封装、WebSocket、渲染）
├── style.css    # 样式
├── serve.js     # 本地静态服务器（禁用缓存，便于调试）
└── README.md
```

---

## 🚀 快速开始

### 1. 启动后端

先按后端 README 启动服务：HTTP API `localhost:8080`，WebSocket `localhost:8081`。

### 2. 调试

```bash
cd web
node serve.js
```

浏览器访问 <http://localhost:8000>。连接地址在 [app.js](app.js) 顶部按当前域名自动推断，本机无需改动。

### 3. 部署

生产用 nginx 托管静态文件并反向代理后端：

```nginx
server {
    listen 80;
    server_name your-domain.com;
    root /path/to/web;

    location / {
        try_files $uri $uri/ /index.html;
    }
    location /api/ {
        proxy_pass http://127.0.0.1:8080;
    }
    location /ws {
        proxy_pass http://127.0.0.1:8081;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

> `serve.js` 也能直接部署，但要自己用 pm2 / systemd 常驻进程、配 HTTPS，静态资源与反向代理都得靠脚本扛，出问题不好排查；生产用 nginx 更省心，`serve.js` 定位就是本地调试。
