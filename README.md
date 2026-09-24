# SYLU OJ · 沈阳理工大学在线评测系统

沈阳理工大学在线评测系统（SYLU OJ）——面向全校师生的在线编程评测平台。

> 前端为纯静态页面（HTML/CSS/JS，无框架依赖，可直接部署）；后端为 Node.js + Express + MySQL，已实现 12 个接口，判题机待开发。

## 项目结构

```
sylu-oj/
├── frontend/                    # 前端（纯静态，可直接部署）
│   ├── index.html               # 首页
│   ├── bank.html                # 题库
│   ├── problem.html             # 题目详情
│   ├── competition.html         # 比赛
│   ├── talk.html                # 讨论区
│   ├── topic.html               # 话题详情
│   ├── level.html               # 排行榜
│   ├── user.html                # 个人主页
│   ├── login.html               # 登录
│   ├── register.html            # 注册
│   ├── css/                     # normalize.css + main.css（全站样式，按页分节注释）
│   ├── js/
│   │   ├── main.js              # 全站交互：页脚年份 / 导航 / 登录态 / 数字滚动
│   │   ├── loader.js            # 玫瑰曲线加载动画
│   │   ├── auth.js login.js     # 注册 / 登录
│   │   ├── bank.js problem.js   # 题库 / 题目详情
│   │   ├── competition.js       # 比赛
│   │   ├── talk.js topic.js     # 讨论区 / 话题详情
│   │   ├── level.js user.js     # 排行榜 / 个人主页
│   │   └── *-data.js            # problems / users / topics 占位数据（接后端后可删）
│   └── 沈阳理工大学-logo.svg
└── server/                      # 后端（Node.js + Express + MySQL）
    ├── server.js                # 路由入口
    ├── db.js                    # mysql2 连接池
    ├── middleware/auth.js       # JWT 登录态校验
    ├── routes/auth.js           # 注册 / 登录
    ├── .env.example             # 环境变量模板（复制为 .env 后填值）
    └── package.json
```

## 前端本地运行

方式一（最简单）：直接双击 `frontend/index.html` 用浏览器打开。

方式二（parcel 开发服务器，支持热更新）：

```bash
cd frontend
npm install
npm run dev
```

## 后端本地运行

需要本机已安装并启动 MySQL 8+。

```bash
cd server
npm install
cp .env.example .env        # 填写数据库口令与 JWT_SECRET

# 建库建账号（示例，口令自己换）
#   CREATE DATABASE sylu_oj DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
#   CREATE USER 'sylu_oj'@'localhost' IDENTIFIED BY '你的口令';
#   GRANT ALL PRIVILEGES ON sylu_oj.* TO 'sylu_oj'@'localhost';

npm start                   # 默认 http://localhost:3000
```

验证：`curl http://localhost:3000/api/ping` 应返回 `{"message":"数据库连通",...}`。

前端每个页面脚本都有 `demoMode` 开关：`true` 用本地占位数据（无需后端），`false` 调用接口。
要联调就把它改成 `false`，并让 `endpoint` 指向后端地址。**注意：目前有 8 个脚本硬编码了
`http://localhost:3000`，部署前需改为相对路径 `/api`（配合 nginx 反代）。**

## 配色

校色取自校徽：

| 颜色 | 色值 | 用途 |
|---|---|---|
| 校红 | `#b12d28` | 按钮行动色 |
| 校棕 | `#231815` | 文字/导航 |
| 校绿 | `#485742` | 区块背景（统计条、页脚） |

## 部署

- **前端（纯静态）**：GitHub Pages → Settings → Pages → Source 选择 `frontend` 目录；或任意静态托管
- **后端**：Node 进程用 `pm2` / `systemd` 守护；MySQL 同机部署，只监听 `127.0.0.1`，公网只开 80 / 443
- **nginx**：托管 `frontend/` 静态文件，并把 `/api` 反向代理到 `http://127.0.0.1:3000`
- **备份**：`mysqldump` + cron 每日一次，保留最近 7 份（并留一份异地/本地副本）

## 当前进度

| 模块 | 状态 |
|---|---|
| 前端 10 个页面 | ✅ 完成（风格统一、响应式、无障碍与 XSS 防护逐页核对） |
| 后端 12 个接口 | ✅ 完成（Express + mysql2 + JWT） |
| 数据库 8 张表 | ✅ 已建表并灌入种子数据 |
| **判题机** | ⬜ 未开始——「提交代码 → 判题 → 回写结果」这条链路尚未打通 |
| 提交页 / 判题结果页 | ⬜ 未开始（题目详情页的提交框界面已就绪） |
| 静态文案页 | ⬜ 未开始（使用帮助 / 常见问题 / 关于本站 / 联系我们 / 用户协议 / 隐私政策） |
| 题单训练 | ⬜ 未开始 |

待办清单见 [CONTRIBUTING.md 的「当前待办」](./CONTRIBUTING.md#当前待办)。

## 贡献

欢迎参与！提 PR 前请先阅读 [贡献指南（CONTRIBUTING.md）](./CONTRIBUTING.md)，其中有目录约定、代码风格、后端接口契约与提交规范。

## License

[MIT](./LICENSE)
