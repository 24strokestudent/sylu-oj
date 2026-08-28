# SYLU OJ · 沈阳理工大学在线评测系统

沈阳理工大学在线评测系统（SYLU OJ）——面向全校师生的在线编程评测平台。

> 前端为纯静态页面（HTML/CSS/JS，无框架依赖），后端待开发。

## 项目结构

```
sylu-oj/
├── frontend/          # 前端页面（纯静态，可直接部署）
│   ├── index.html     # 首页
│   ├── css/           # 样式（normalize + main）
│   ├── js/            # 脚本（main.js 交互 / loader.js 加载动画）
│   └── 沈阳理工大学-logo.svg
└── server/            # 后端（开发中）
```

## 前端本地运行

方式一（最简单）：直接双击 `frontend/index.html` 用浏览器打开。

方式二（parcel 开发服务器，支持热更新）：

```bash
cd frontend
npm install
npm run dev
```

## 配色

校色取自校徽：

| 颜色 | 色值 | 用途 |
|---|---|---|
| 校红 | `#b12d28` | 按钮行动色 |
| 校棕 | `#231815` | 文字/导航 |
| 校绿 | `#485742` | 区块背景（统计条、页脚） |

## 部署

- GitHub Pages：Settings → Pages → Source 选择 `frontend` 目录（部署后访问 `https://<用户名>.github.io/sylu-oj/`）
- 正式上线：部署到云服务器（阿里云等），前端由 nginx 托管，后端对接 `/api` 接口

## License

[MIT](./LICENSE)
