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
| 前端页面 | 首页、题库、题目详情、注册、登录、排行榜、个人主页、比赛、讨论区已完成 | 提交与判题、题单训练、静态文案页 |
| 后端 API | `server/` 目前只有 `package.json`，还没有 `server.js` | 按[接口契约](#后端接口契约)实现接口 |
| 数据落库 | 未开始                                           | 用户、题目、提交记录、话题等表结构 |
| 文档与题解 | 持续需要                                          | 使用帮助、常见问题、题解内容 |

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
│   ├── level.html                # 排行榜
│   ├── talk.html                 # 讨论区
│   ├── login.html                # 登录
│   ├── register.html             # 注册
│   ├── css/
│   │   ├── normalize.css         # 第三方重置样式
│   │   └── main.css              # 全站样式（各页面共用，按页分节注释）
│   ├── js/
│   │   ├── main.js               # 全站交互：页脚年份 / 导航滚动 / 移动端菜单 / 数字滚动
│   │   ├── loader.js             # 玫瑰曲线加载动画
│   │   ├── auth.js               # 注册页逻辑
│   │   ├── login.js              # 登录页逻辑
│   │   ├── level.js              # 排行榜逻辑
│   │   ├── talk.js               # 讨论区逻辑
│   │   ├── plugins.js            # 第三方插件占位（目前只有 console 兜底）
│   │   └── vendor/               # Modernizr
│   └── 沈阳理工大学-logo.svg
└── server/                       # 后端（开发中，仅有 package.json）
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

九个页面的接口调用已经写好，只差后端。前端在 `demoMode: true` 时使用占位数据；后端实现后把对应脚本的 `demoMode` 改成 `false` 即可联调，也支持在控制台热切换：

```js
SYLU_AUTH_CONFIG.demoMode  = false;                                  // 注册
SYLU_LOGIN_CONFIG.demoMode = false;                                  // 登录
SYLU_LEVEL_CONFIG.demoMode = false; SYLU_LEVEL_CONFIG.reload();      // 排行榜
SYLU_TALK_CONFIG.demoMode  = false; SYLU_TALK_CONFIG.reload();       // 讨论区
SYLU_COMP_CONFIG.demoMode  = false; SYLU_COMP_CONFIG.reload();       // 比赛
SYLU_BANK_CONFIG.demoMode  = false; SYLU_BANK_CONFIG.reload();       // 题库
SYLU_PROBLEM_CONFIG.demoMode = false; SYLU_PROBLEM_CONFIG.reload();   // 题目详情
SYLU_USER_CONFIG.demoMode    = false; SYLU_USER_CONFIG.reload();      // 个人主页
```

| 页面 | 方法 | 路径 | 请求体 | 成功返回 |
|---|---|---|---|---|
| 注册 | `POST` | `/api/auth/register` | `{ username, nickname, studentId, college, email, password }` | 任意 JSON（`200` / `201`） |
| 登录 | `POST` | `/api/auth/login` | `{ loginId, password, remember }` | 任意 JSON（如 `{ token }`） |
| 排行榜 | `GET` | `/api/rank` | 无 | `[...]` 或 `{ list: [...] }` |
| 讨论区 | `GET` | `/api/topics` | 无 | `[...]` 或 `{ topics: [...] }` |
| 比赛 | `GET` | `/api/contests` | 无 | `[...]` 或 `{ contests: [...] }` |
| 题库 | `GET` | `/api/problems` | 无 | `[...]` 或 `{ problems: [...] }` |
| 题目详情 | `GET` | `/api/problems?code=CS001-01-001` | 无 | 单题对象或 `[...]` |
| 个人主页 | `GET` | `/api/users/:username` | 无 | 单用户对象 |
| 提交记录 | `GET` | `/api/users/:username/submissions` | `?page=1` | `[...]` 或 `{ list: [...] }` |
| 比赛记录 | `GET` | `/api/users/:username/contests` | 无 | `[...]` |
| 提交代码 | `POST` | `/api/submissions` | `{ problemCode, language, sourceCode }` | 任意 JSON（`201`） |

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

**错误约定**：统一返回 `{ "message": "给用户看的中文提示" }`，前端会优先显示它；没有 `message` 时按状态码兜底（`401` → 用户名或密码错误、`403` → 账号不可用、`429` → 尝试过于频繁、`5xx` → 服务器异常）。

**会话**：请求都带 `credentials: 'same-origin'`，建议用同域 Cookie 保存会话。

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
- [ ] 没有把真实账号、数据库口令、JWT 密钥等敏感信息写进代码

> 想帮忙补自动化测试？目前的验证方式是「jsdom 加载真实页面 + 真实脚本，模拟输入并断言渲染结果与错误分支」。欢迎把它固化进仓库并接上 `npm test`。

## 贡献者

按 Git 提交历史统计（`git shortlog -sne`，截至 2026-09）：

| 贡献者 | 提交数 | 主要贡献 |
|---|---|---|
| [24strokestudent](https://github.com/24strokestudent) | 6 | 项目搭建、首页、注册 / 登录、排行榜、讨论区 |

欢迎把你的名字加进来——PR 被合并后，顺手更新本表即可。

## License

本项目采用 [MIT](./LICENSE) 许可。
