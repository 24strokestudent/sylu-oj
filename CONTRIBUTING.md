# 贡献指南 · Contributing to SYLU OJ

感谢你有兴趣为 **SYLU OJ（沈阳理工大学在线评测系统）** 出一份力。
这份文档说明本项目的目录约定、代码风格、接口契约与提交流程，照着做能让你的改动更快被合并。

> 第一次参与？先读 [README](./README.md) 了解项目定位与本地运行方式。

## 目录

- [可以贡献什么](#可以贡献什么)
- [本地运行](#本地运行)
- [目录结构](#目录结构)
- [代码风格与约定](#代码风格与约定)
- [新增一个页面的检查清单](#新增一个页面的检查清单)
- [后端接口契约](#后端接口契约)
- [提交信息规范](#提交信息规范)
- [分支与合并流程](#分支与合并流程)
- [提交前自检](#提交前自检)
- [贡献者](#贡献者)
- [License](#license)

## 可以贡献什么

| 方向 | 现状                                            | 适合入手 |
|---|-----------------------------------------------|---|
| 前端页面 | 10 个页面已完成（首页 / 题库 / 题目详情 / 比赛 / 讨论区 / 话题详情 / 排行榜 / 个人主页 / 登录 / 注册） | 提交页与判题结果页、题单训练、静态文案页 |
| 后端 API | 12 个接口已实现（见[接口契约](#后端接口契约)） | `/api/submissions`、判题机、给 GET 路由补 try/catch |
| 数据库 | 8 张表已建并灌入种子数据 | 测试点表、统计汇总表 |
| **判题机** | 未开始 | 取任务 → 编译 → 限时限内存运行 → 输出比对 → 回写 `verdict` |
| 文档与题解 | 持续需要 | 使用帮助、常见问题、题解内容 |

前端目前是**纯静态页面**：无框架、无构建步骤，双击 `frontend/index.html` 就能跑。

## 本地运行

方式一（最简单）：直接双击 `frontend/index.html` 用浏览器打开。

方式二（parcel 开发服务器，支持热更新）：

```bash
cd frontend
npm install
npm run dev
```

> 注意 `package.json` 里 parcel 的入口只有 `index.html`，其余页面（`level.html`、`talk.html`、`login.html`、`register.html`）对 parcel 来说只是静态文件。想在开发服务器下逐个调页面，用任意静态服务器（如 `python3 -m http.server`）指向 `frontend/` 更省事。

## 目录结构

```
sylu-oj/
├── frontend/                     # 前端（纯静态，可直接部署）
│   ├── index.html                # 首页
│   ├── bank.html problem.html    # 题库 / 题目详情
│   ├── competition.html          # 比赛
│   ├── talk.html topic.html      # 讨论区 / 话题详情
│   ├── level.html user.html      # 排行榜 / 个人主页
│   ├── login.html register.html  # 登录 / 注册
│   ├── css/
│   │   ├── normalize.css         # 第三方重置样式
│   │   └── main.css              # 全站样式（各页面共用，按页分节注释）
│   ├── js/
│   │   ├── main.js               # 全站交互：页脚年份 / 导航 / 登录态 / 数字滚动
│   │   ├── loader.js             # 玫瑰曲线加载动画
│   │   ├── auth.js login.js      # 注册 / 登录
│   │   ├── bank.js problem.js    # 题库 / 题目详情
│   │   ├── competition.js        # 比赛
│   │   ├── talk.js topic.js      # 讨论区 / 话题详情（发帖弹窗逻辑在 talk.js）
│   │   ├── level.js user.js      # 排行榜 / 个人主页
│   │   ├── problems-data.js      # 16 道题的完整题面（题库页与详情页共用）
│   │   ├── users-data.js         # 19 位用户（排行榜与个人主页共用）
│   │   ├── topics-data.js        # 14 个话题正文 + 回复（列表页与详情页共用）
│   │   ├── plugins.js            # 第三方插件占位（目前只有 console 兜底）
│   │   └── vendor/               # Modernizr
│   └── 沈阳理工大学-logo.svg
└── server/                       # 后端（Node.js + Express + MySQL）
    ├── server.js                 # 路由入口（12 个接口）
    ├── db.js                     # mysql2 连接池
    ├── middleware/auth.js        # JWT 登录态校验
    ├── routes/auth.js            # 注册 / 登录
    ├── .env.example              # 环境变量模板（.env 已被 gitignore）
    └── package.json
```

## 代码风格与约定

### 通用

- 编码 UTF-8、缩进 2 空格、LF 换行、去行尾空格、文件末尾留空行——`.editorconfig` 已配置，主流编辑器会自动生效
- 注释与界面文案统一用**中文**
- **不引入前端框架、构建工具或 CDN 依赖**。本项目刻意保持「纯静态、无框架、可直接双击打开」，`parcel` 仅是可选开发服务器，页面不得依赖它才能运行

### HTML：每页骨架保持一致

1. `<!doctype html>` + `<html class="no-js" lang="zh-CN">`
2. head 必备项：`charset` / `title` / `description` / `viewport` / `og:title|type|url|image` / `manifest` + `apple-touch-icon` + `favicon` / `normalize.css` + `main.css` / `theme-color`
   - `title` 格式：`页面名 · SYLU OJ | 沈阳理工大学在线评测系统`（首页写 `SYLU OJ · 沈阳理工大学在线评测系统`）
3. body 顺序固定：加载动画 `#preloader` → `<header class="navbar">` → `<main>` → `<footer class="footer">`
4. 页脚的 `<span id="year"></span>` 由 `main.js` 自动填年份，**不要写死**
5. 子页面导航里没有首页那些锚点区块，用 `index.html#latest` 这种跨页锚点；当前页加 `class="active"`
6. 汉堡按钮必须是 `<button type="button" ...>`（`<button>` 默认 `type` 是 `submit`）
7. 脚本在 `</body>` 前按固定顺序引入：`modernizr` → `plugins.js` → `loader.js` → `main.js` → 本页脚本

### CSS

- 只维护 `css/main.css` 一个样式表，不要新增零散样式文件
- 颜色一律用 `:root` 变量（`--brand-red` / `--brown` / `--green-*` / `--muted` / `--border` / `--shadow` / `--radius`），不要写死色值——校色取自校徽：红 `#b12d28` / 棕 `#231815` / 绿 `#485742`
- 优先复用已有类：`.container` `.btn*` `.section-title` `.page-head` `.field` `.input-wrap` `.panel` `.tag*` `.table-scroll`；公共组件不要复制一套新样式
- 新页面的样式**追加到 `main.css` 末尾**，并加分节注释：

  ```css
  /* ============================================================
     页面名（文件名）
     ============================================================ */
  ```

- 响应式断点统一用 `@media (max-width: 980px)` 与 `@media (max-width: 620px)`
- 不写行内 `style`（JS 动态宽度除外，如通过率进度条）
- ⚠️ **给元素设了 `display` 就要显式处理 `[hidden]`**：UA 的 `[hidden] { display: none }` 优先级更低，
  被 `display: grid` / `inline-block` 覆盖后 `hidden` 属性会失效。项目里已按需补了
  `.problem-layout[hidden]`、`.state-card[hidden]`、`.btn[hidden]`，新增同类元素时要一起补

### JavaScript

- 原生 ES5 写法，一个文件一个 IIFE，用 `var` + `function`：

  ```js
  (function () {
    'use strict';
    /* ---------- 配置 ---------- */
    var CONFIG = { endpoint: '/api/xxx', demoMode: true };
  })();
  ```

- 小节注释用 `/* ---------- 小节名 ---------- */`
- **接口数据一律用 `document.createElement` + `textContent` 渲染，禁止用 `innerHTML` 拼接口数据**（防 XSS）
- 接口访问集中在文件顶部的 `CONFIG`（`endpoint` / `demoMode` / `minDelayMs` …），并暴露配置 + 重载入口，便于联调与演示：

  ```js
  CONFIG.reload = load;
  window.SYLU_XXX_CONFIG = CONFIG;
  ```

- 网络错误与 HTTP 错误分开处理，用 `.then(onOk, onNetworkError)` 双回调写法；**不要用 `err instanceof TypeError` 判断网络错误**（跨 realm 会失效）
- 错误提示优先使用后端返回的 `message` / `error`，缺失时再按状态码兜底
- 动效要照顾 `prefers-reduced-motion`（`main.css` 里已有全局降级规则）

## 新增一个页面的检查清单

- [ ] 复制已有页面骨架（推荐 `level.html` / `talk.html`），head、导航、页脚、加载动画保持一致
- [ ] 导航里所有互链都指向真实文件名，当前页 `class="active"`；子页面用 `index.html#锚点`
- [ ] 从首页可达：必要时同步更新 `index.html` 的导航 / 功能卡片链接
- [ ] 新样式追加到 `main.css` 并加页面分节注释
- [ ] 新脚本命名为 `js/页面名.js`，按固定顺序在 `</body>` 前引入
- [ ] 接口数据走 `CONFIG` + `demoMode`，并暴露 `window.SYLU_*_CONFIG`
- [ ] 占位数据集中放在脚本顶部，加注释「接入后端后由接口返回」
- [ ] 无障碍与规范：`id` 唯一、每个表单控件有 `<label for>` 或 `aria-label`、`img` 有 `alt`、`button` 有 `type`、表格用 `<th scope="col">`
- [ ] 在 980px / 620px 两个断点下检查布局（宽表格套 `.table-scroll` 横向滚动）
- [ ] 页脚年份、加载动画、移动端汉堡菜单三者正常

## 后端接口契约

前端的接口调用已全部写好，后端已实现其中 12 个（下表用「状态」列标注）。

每个页面脚本都有 `demoMode` 开关：`true` 用本地占位数据（无需后端），`false` 调用接口。可在控制台热切换：

⚠️ 目前 8 个脚本已是 `demoMode: false` 且把 `endpoint` 硬编码成了 `http://localhost:3000`——
**部署前必须改成相对路径 `/api`**（配合 nginx 反代）。

```js
SYLU_AUTH_CONFIG.demoMode  = false;                                  // 注册
SYLU_LOGIN_CONFIG.demoMode = false;                                  // 登录
SYLU_LEVEL_CONFIG.demoMode = false; SYLU_LEVEL_CONFIG.reload();      // 排行榜
SYLU_TALK_CONFIG.demoMode  = false; SYLU_TALK_CONFIG.reload();       // 讨论区
SYLU_COMP_CONFIG.demoMode  = false; SYLU_COMP_CONFIG.reload();       // 比赛
SYLU_BANK_CONFIG.demoMode  = false; SYLU_BANK_CONFIG.reload();       // 题库
SYLU_PROBLEM_CONFIG.demoMode = false; SYLU_PROBLEM_CONFIG.reload();   // 题目详情
SYLU_USER_CONFIG.demoMode    = false; SYLU_USER_CONFIG.reload();      // 个人主页
SYLU_TOPIC_CONFIG.demoMode   = false; SYLU_TOPIC_CONFIG.reload();     // 话题详情
```

| 页面 | 方法 | 路径 | 请求体 | 成功返回 | 状态 |
|---|---|---|---|---|---|
| 连通性 | `GET` | `/api/ping` | 无 | `{ message, result }` | ✅ |
| 注册 | `POST` | `/api/auth/register` | `{ username, nickname, studentId, college, email, password }` | `{ id, username }` | ✅ |
| 登录 | `POST` | `/api/auth/login` | `{ loginId, password }`（`loginId` 可为用户名 / 邮箱 / 学号） | `{ token, username, nickname }` | ✅ |
| 题库 | `GET` | `/api/problems` | 无 | `[...]` | ✅ |
| 题目详情 | `GET` | `/api/problems?code=CS001-01-001` | 无 | 单题对象或 `[...]` | ⬜ |
| 排行榜 | `GET` | `/api/rank` | 无 | `[...]` | ✅ |
| 比赛 | `GET` | `/api/contests` | 无 | `[...]` | ✅ |
| 比赛报名 | `POST` | `/api/contests/:id/register` | 无（需登录） | 任意 JSON | ✅ |
| 讨论区 | `GET` | `/api/topics` | 无 | `[...]` | ✅ |
| 话题详情 | `GET` | `/api/topics/:id` | 无 | `{ ...话题, replies: [...] }` | ✅ |
| 发帖 | `POST` | `/api/topics` | `{ title, category, content }`（需登录） | `{ ok, id }` | ✅ |
| 回复 | `POST` | `/api/topics/:id/replies` | `{ body }`（需登录） | 任意 JSON | ✅ |
| 点赞 | `POST` | `/api/topics/:id/like` | 无（需登录） | `{ likes }` | ✅ |
| 个人主页 | `GET` | `/api/users/:username` | 无 | 单用户对象 | ✅ |
| 提交记录 | `GET` | `/api/users/:username/submissions` | `?page=1` | `[...]` 或 `{ list: [...] }` | ⬜ |
| 比赛记录 | `GET` | `/api/users/:username/contests` | 无 | `[...]` | ⬜ |
| 提交代码 | `POST` | `/api/submissions` | `{ problemCode, language, sourceCode }` | `{ id }`（`201`） | ⬜ |

**登录态**：需要登录的接口用 `Authorization: Bearer <token>`（`token` 由 `/api/auth/login` 返回，
前端存在 `localStorage` 的 `sylu_token`，用户名存在 `sylu_user`）。后端中间件 `middleware/auth.js`
校验失败时返回 `401 { error }`。

**列表接口的字段**（以各脚本 `normalize()` 为准，缺失字段有默认值，不会白屏）：

- 排行榜：`username`（或 `loginId`）、`nickname`、`college`、`solved`、`submissions`、`accepted`
- 讨论区：`id`、`title`、`category`（`题解` / `求助` / `公告` / `闲聊`）、`author`、`college`、`problem`、`replies`、`views`、`likes`、`createdAgo`、`lastReplyAgo`
  - 后两个字段是**「多少分钟前」的数值**，前端据此渲染相对时间；若后端改为返回绝对时间戳，需要同步调整 `talk.js` 的 `normalize()` 与 `relativeTime()`
- 比赛：`title`、`format`（`ACM` / `OI` / `IOI`）、`desc`、`problems`、`participants`、`startOffset`、`durationMinutes`
  - 可选 `status`（`ongoing` / `upcoming` / `ended`）；缺省时前端按 `startOffset` 与 `durationMinutes` 推导状态
- 题库：`code`、`title`、`difficulty`（`简单` / `中等` / `困难`）、`tags`（数组，也接受逗号分隔字符串）、`submissions`、`accepted`、`status`
  - `status`（`solved` / `attempted` / `none`）依赖登录态，未登录时应返回 `none`
- 个人主页 / 用户：`username`、`nickname`、`college`、`role`（`user` / `admin`）、`joinedAt`、`solved`、`submissions`、`accepted`、`recent`（最近提交）、`contests`（参赛记录）
  - 提交记录字段：`code`、`verdict`（`AC` / `WA` / `TLE` / `MLE` / `RE` / `CE` / `PE` / `OLE` / `SE` / `PD` / `JD`）、`language`、`timeUsedMs`、`memoryUsedKb`、`minutesAgo`
  - 个人主页以 `?username=` 定位；**源码只有本人可见**，取源码的接口必须鉴权

**错误约定**：后端目前返回 `{ "error": "给用户看的中文提示" }`；前端读取时写成 `data.message || data.error`，
两种字段都能显示。**建议新接口统一用 `message`**，老接口可保持不变（前端已兼容）。

**登录态**：JWT 放在 `Authorization: Bearer <token>` 头里，不用 Cookie；因此跨域调试时
`Access-Control-Allow-Origin` 要允许前端来源（`.env` 里有 `CORS_ORIGIN`，但 `server.js` 目前是
`app.use(cors())` 全开，上线前应收窄）。

**推荐实现栈**（`server/package.json` 已备好依赖）：Express + `mysql2` + `jsonwebtoken` + `bcryptjs`，加 `helmet` / `cors` / `express-rate-limit`；数据库与 JWT 密钥放 `server/.env`（勿提交），路由统一挂 `/api` 前缀。

## 提交信息规范

历史提交中英文混用，推荐统一为 **conventional commits + 中文描述**：

```
<type>: <简短描述>
```

| type | 用途 |
|---|---|
| `feat` | 新页面、新功能 |
| `fix` | 修复缺陷 |
| `style` | 只改样式或格式，不改逻辑 |
| `refactor` | 重构，行为不变 |
| `docs` | 文档 |
| `chore` | 构建、依赖、目录调整 |

示例：

```
feat: 排行榜页 level（搜索 / 学院筛选 / 三种排序）
fix: 移动端导航按钮补上 type="button"
docs: 补充贡献指南与后端接口契约
```

正文建议写清「改了什么 + 为什么」；涉及接口的，注明契约是否变化。

## 分支与合并流程

1. 从 `main` 拉分支：`git switch -c feat/problem-list`
2. 小步提交，提交前过一遍下面的[自检清单](#提交前自检)
3. 推送分支并发起 PR，说明改动页面 / 接口与验证方式
4. 至少一位维护者 review 后合并到 `main`
5. **不要强推 `main`**；部署方式见 README 的「部署」一节

## 提交前自检

本项目目前**没有自动化测试**（`frontend/package.json` 里的 `npm test` 还是占位脚本）。改动后请至少人工确认：

- [ ] 打开改动涉及的每个页面，浏览器控制台**无报错**
- [ ] 加载动画正常淡出，不会卡在黑色首屏
- [ ] 页脚年份正确，导航在各页面之间互跳正常
- [ ] 表单：空值与非法格式能被拦截并给出提示；合法数据能走完整流程（`demoMode` 下会显示成功态）
- [ ] 列表页：搜索、筛选、排序、空结果状态各试一遍
- [ ] 窄屏（`< 620px`）下布局不溢出，宽表格可横向滚动
- [ ] 无 `console.log` / `debugger` / 调试用 `alert` 残留
- [ ] 没有把真实账号、数据库口令、JWT 密钥等敏感信息写进代码（`.env` 已被 gitignore，只提交 `.env.example`）
- [ ] 新增的**后端 async 路由也包在 `try/catch` 里**（Express 4 不会自动捕获，漏了会让进程直接退出）
- [ ] 前端没有新增硬编码的 `http://localhost:3000`（统一走 `CONFIG.endpoint`，部署前改为相对路径 `/api`）
- [ ] 后端改动了字段时，同步更新本文档的[接口契约](#后端接口契约)

> 想帮忙补自动化测试？目前的验证方式是「jsdom 加载真实页面 + 真实脚本，模拟输入并断言渲染结果与错误分支」。欢迎把它固化进仓库并接上 `npm test`。

## 当前待办

按优先级排列，欢迎认领：

| 优先级 | 事项 | 说明 |
|---|---|---|
| 🔴 | 给 7 个 GET 路由补 `try/catch` | `server.js` 里 `/api/ping`、`/api/problems`、`/api/contests`、`/api/rank`、`/api/topics`、`/api/topics/:id`、`/api/users/:username`——数据库异常目前会变成 unhandled rejection，Node 18+ 会终止进程 |
| 🟠 | 前端端点改为相对路径 | 8 个脚本硬编码 `http://localhost:3000`，部署前抽成统一配置（或直接写 `/api`） |
| 🟠 | 发帖弹窗的键盘与焦点行为 | `Esc` 关闭、点击遮罩关闭、打开时聚焦首个字段、关闭后归还焦点、`Tab` 限制在弹窗内；另需锁定背景滚动 |
| 🟡 | `:root` 补 `--overlay` 变量 | 遮罩目前写死 `rgba(35, 24, 21, 0.5)`（即校棕加透明度） |
| 🟡 | `/api/topics/:id` 收窄 `SELECT t.*` | 改成显式列名，避免返回无关字段 |
| ⬜ | 判题机 | 「提交 → 编译 → 限时运行 → 比对 → 回写 verdict」，是功能闭环的最后一块 |
| ⬜ | 静态文案页 | 使用帮助 / 常见问题 / 关于本站 / 联系我们 / 用户协议 / 隐私政策（页脚与表单里的死链来源） |

## 贡献者

按 Git 提交历史统计（`git shortlog -sne`，截至 2026-09）：

| 贡献者 | 提交数 | 主要贡献 |
|---|---|---|
| [24strokestudent](https://github.com/24strokestudent) | 6 | 项目搭建、首页、注册 / 登录、排行榜、讨论区 |

欢迎把你的名字加进来——PR 被合并后，顺手更新本表即可。

## License

本项目采用 [MIT](./LICENSE) 许可。
