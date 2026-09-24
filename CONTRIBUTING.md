# 贡献指南 · Contributing to SYLU OJ

本项目是 **[Hydro](https://github.com/hydro-dev/Hydro) 的二次开发仓库**：OJ 核心（判题、沙箱、比赛、题库、讨论）用上游 Hydro，
本仓库只维护 Hydro 之外的部分——部署运维、品牌定制、题库迁移工具与验收体系。

> 第一次参与？先读 [README](./README.md) 了解项目边界与快速开始；部署细节见 [`docs/DEPLOY.md`](./docs/DEPLOY.md)。

## 目录

- [可以贡献什么](#可以贡献什么)
- [仓库结构](#仓库结构)
- [本机能做什么、不能做什么](#本机能做什么不能做什么)
- [本机开发闭环：UI 离线渲染沙箱](#本机开发闭环ui-离线渲染沙箱)
- [硬性红线](#硬性红线)
- [代码风格与约定](#代码风格与约定)
- [提交信息规范](#提交信息规范)
- [分支与合并流程](#分支与合并流程)
- [提交前自检](#提交前自检)
- [当前待办](#当前待办)
- [归档说明](#归档说明)
- [贡献者](#贡献者)
- [License](#license)

## 可以贡献什么

| 方向 | 现状 | 适合入手 |
|---|---|---|
| 品牌与模板 `addons/sylu-brand/` | 8 处模板覆盖 + 7 份职责 CSS + 关于页 | 更细的 C 级页面适配、管理后台 `/manage` |
| 部署与运维 `deploy/` | 9 个脚本 + 核心补丁机制 | 真机 smoke test、跨机评测机 |
| 判题验收 `test/judge-suite/` | AC/WA/CE/RE/TLE/MLE/OLE 用例齐备 | 更多题型、交互题、特判 |
| UI 验收 `test/ui/` | 离线渲染 + 出图 + 像素比对 | 补齐未覆盖的场景 |
| 导题工具 `tools/problem-importer/` | 预检 / 预览 / verify | 更多题库格式、批量校验 |
| 文档与题解 | 持续需要 | `DEPLOY.md` / `ACCEPTANCE.md` 更新、题解内容 |
| 归档代码 `legacy-*` | **已停止发展** | 只作参考，不要在上面加功能 |

## 仓库结构

```
sylu-oj/
├── addons/
│   ├── sylu-brand/          # 品牌插件（本轮主线）：模板覆盖 + public/sylu/css/*.css
│   └── sylu-campus/         # 学号绑定与身份验证（设计稿，V1 不启用）
├── deploy/                  # 部署与运维：preflight/install-hydro/configure/healthcheck/backup/restore-check/update/rollback/secret-scan
│   ├── lib/common.sh
│   └── patches/             # 核心补丁（必须留 .patch，update.sh 升级后重放）
├── test/
│   ├── judge-suite/         # 判题结果验收集（SYS001-AB：AC/WA/CE/RE/TLE/MLE/OLE）
│   ├── sandbox-suite/       # 沙箱安全隔离用例
│   └── ui/                  # UI 离线渲染沙箱（本机开发主战场）
├── tools/problem-importer/  # 题库 ZIP 预检 → 转换 → 导入 Hydro
├── docs/                    # DEPLOY.md / ACCEPTANCE.md / UI-FUNCTION-BASELINE.md
├── legacy-homepage/         # 归档：自研静态前端 10 页（视觉参考，停止发展）
├── legacy-server/           # 归档：自研 Express 后端（停止发展）
└── LICENSES/
```

## 本机能做什么、不能做什么

| | 说明 |
|---|---|
| ✅ **能** | 离线渲染沙箱（`test/ui`）、导题工具、判题用例自检（需 `g++` / `python3`） |
| ❌ **不能** | 完整 Hydro：判题沙箱 `go-judge` 依赖 Linux 的 namespace/cgroup，还要 MongoDB。**真机验证必须在 Debian 12 服务器上做**（见 `docs/DEPLOY.md`） |

> 结论：**本机能证明"渲染成什么样"，证明不了"点起来对不对"**。交互行为（筛选表单、编辑器、榜单刷新）必须上内测站人工验收。

## 本机开发闭环：UI 离线渲染沙箱

```bash
cd test/ui
npm install                     # nunjucks / js-yaml / markdown-it / puppeteer-core（独立依赖，不进主工程）

# 准备上游只读参考副本（.ref/ 已 gitignore）。版本要与线上一致：ui-default 4.58.5
mkdir -p ../../.ref/Hydro/packages/ui-default
npm pack @hydrooj/ui-default@4.58.5
tar xzf hydrooj-ui-default-4.58.5.tgz -C ../../.ref/Hydro/packages/ui-default --strip-components=1

node fetch-assets.js            # 从内测站抓 theme.css 与 iconfont 到 out/vendor
node render.js --all            # 渲染全部场景 → out/*.html（当前 34 个）
node check.js                   # 回归闸门：HARD 红线 + RATCHET 历史债
node shot.js                    # 全场景 × 全断点出图 → out/shots（发现横向溢出即 exit 1）
node diag.js home-student       # 布局量测（查"渲染出来了但看不见"）
node compare.js <git-ref>       # 与某版本比像素（证明"这次改动没改外观"）
```

- 上游参考也可以用 `SYLU_HYDRO_REF=/path/to/Hydro` 指定（该目录下要有 `packages/ui-default/templates`）
- **没有本机 Chrome 时**：`shot.js` 会退回命令行出图，而命令行**做不出真窄屏**（Chrome 把宽度钳到 504px），此时 `<504px` 的图不能作为"移动端没问题"的证据
- `fetch-assets.js` 依赖内测站可达；抓不到就先 `render.js --all`（HTML 能出，样式可能不全）

## 硬性红线

以下来自 `addons/sylu-brand/README.md`、`docs/UI-FUNCTION-BASELINE.md` 与 `test/ui/check.js`，**任何改动都不许踩**：

1. **保留 `Powered by Hydro` 归属与其有效链接**——不得删除、遮挡、置灰；我方内容只能作为附加项追加（页脚走 `ui-default.footer_extra_html` 原生设置）
2. 每个页面必须保留「学生维护的非官方平台」声明
3. **不改 Hydro 核心**。优先级：`Hydro 原生设置 → Addon → CSS/模板扩展 → 最小核心补丁（最后手段）`。真改了核心，必须把补丁留在 `deploy/patches/*.patch`（升级会被 `yarn global add` 覆盖，`update.sh` 会重放）
4. **C 级业务页（题库/题面/记录/比赛/作业/训练/讨论/排名）只准挂 CSS**，不覆盖上游模板；覆盖上游模板必须在 `test/ui/check.js` 的 `ALLOWED_OVERRIDES` 白名单内（当前签核例外只有 `contest_detail.html` / `homework_detail.html` 的赛前脱敏，由 `checkOverrideDrift` 逐行盯住）
5. **`:has()` 已清零**，长回来即 red（`DEBT_FORBIDDEN`）
6. **颜色只有一个出处 `tokens.css`**，组件文件里不写十六进制（RATCHET：历史债 14 处，只许减少）
7. **导航净空只有一个出处 `--sylu-nav-h`**（值须与 `theme.css` 的 `.nav{height}` 一致），别处不要写死像素
8. **不提交密钥**：`.env` / `*.key` / `*.pem` / `secrets/` 等已在 `.gitignore`；改完配置跑一次 `bash deploy/secret-scan.sh`

## 代码风格与约定

- **优先动 addon 模板与 CSS，不动上游模板**；确需覆盖上游模板时，只写"最小 delta"，其余与上游逐字一致（便于升级时对齐）
- **CSS 按职责分文件**：`tokens` / `base` / `shell` / `home` / `about` / `oj` / `responsive`。新样式放进对应文件，不要新开文件；首页与关于页的版面改动写进 `home.css` / `about.css`
- **样式加载方式**：addon 的 `public/` 会被 Hydro 静态托管，再由 `ui-default.footer_extra_html` 逐条 `<link>` 引入。用直链，别用 `@import`（会串行阻塞且绕过版本号）
- **部署脚本**：`bash -n`（最好再 `shellcheck`）通过、幂等、关键项不通过就退出、**不自动破坏既有服务**
- **工具**：`tools/` 用 Node ESM（`.mjs`），改完跑自带 `selftest`
- **不要写行内 `style` 与内联 `<script>`**（`legacy-*` 里的历史写法不要模仿——那正是被替换掉的一版）

## 提交信息规范

沿用 **conventional commits + 中文描述**：

```
<type>: <简短描述>
```

| type | 用途 |
|---|---|
| `feat` | 新功能、新页面、新场景 |
| `fix` | 修缺陷 |
| `refactor` | 重构，行为不变 |
| `style` | 只改样式 |
| `test` | 验收用例、沙箱、闸门 |
| `docs` | 文档 |
| `chore` | 构建、依赖、目录、脚本 |

示例：`fix(brand): 未开赛详情页不再把题号序列化进浏览器`、`test(ui): 把"比赛数据不提前泄露"做成闸门`

## 分支与合并流程

1. 从 `main` 拉分支：`git switch -c feat/xxx`
2. 本地跑 `node test/ui/render.js --all && node test/ui/check.js`
3. 提 PR：说明改了哪些**场景/页面**，CSS 或模板改动**附 `node compare.js <ref>` 的像素结论**（不要用"看起来一样"）
4. 至少一位维护者 review 后合并
5. **不要强推 `main`**

## 提交前自检

- [ ] `node test/ui/render.js --all && node test/ui/check.js` 全绿（若某条是既有失败，在 PR 里写明并附复现）
- [ ] 改了 CSS / 模板：给出 `node compare.js <ref>` 的像素差异（阈值参考：样式拆分那次实测 0.000%）
- [ ] 改了判题相关：`bash test/judge-suite/check-fixtures.sh`（必要时加 `--with-heavy`）
- [ ] 改了配置或脚本：`bash deploy/secret-scan.sh`
- [ ] 部署脚本用 `bash -n` 过一遍
- [ ] 没有提交 `.ref/`、`test/ui/out/`、`node_modules`、`.env`
- [ ] 交互类改动**上内测站人工验收过**（沙箱证明不了可点性）

## 当前待办

| 优先级 | 事项 | 依据 |
|---|---|---|
| 🔴 | `test/ui/check.js` 有 1 项未通过：`contest-upcoming-student` 未渲染参赛表单（侧栏整块为空，缺 `data-contest-attend`），导致该场景前几条断言失去意义 | 本机跑 `check.js` 复现 |
| 🟠 | 真机 smoke test 未做：未开赛比赛直链的后端闸门、榜单页、题单详情、讨论详情 | `docs/UI-FUNCTION-BASELINE.md` |
| 🟠 | 管理后台 `/manage` 仍是上游原样（未做品牌化） | `addons/sylu-brand/README.md` |
| 🟡 | C 级页面里"必须动 DOM 才能做"的条目（通过率列、难度文字分级、状态/时间筛选下拉、"只看我的"）本轮未做 | `test/ui/README.md` |
| 🟡 | 独立 / 跨机评测机（`judge.yaml`）尚未配置，当前是内嵌评测机 | `docs/DEPLOY.md` §6 |
| ⬜ | 上游参考副本 `.ref/Hydro` 未纳入任何脚本，新人需按本文件手动准备 | 本文档 |

> 另有 PR #1（`chore: remove final repository file` 等 2 个提交）会把仓库文件全部删除，**建议关闭、不要合并**。

## 归档说明

采用 Hydro 之前，本项目有一套自研的静态前端（10 个页面）与 Express + MySQL 后端，现已归档：

| 位置 | 内容 |
|---|---|
| `legacy-homepage/` | 首页 / 题库 / 题目详情 / 比赛 / 讨论区 / 话题详情 / 排行榜 / 个人主页 / 登录 / 注册，含全部样式与脚本 |
| `legacy-server/` | 12 个接口的 Express 后端、JWT 登录态、MySQL 表设计 |
| 分支 `archive/static-frontend` | 归档前的完整历史 |

**已停止发展**，只作视觉与实现参考；其中 `legacy-homepage/css/main.css` 的设计令牌与页面结构已被 `addons/sylu-brand/` 的模板与 `tokens.css` 吸收。
本文件此前那一版（静态前端 + Express 架构的约定）已不再适用，需要时从 `archive/static-frontend` 分支取。

## 贡献者

| 贡献者 | 主要贡献 |
|---|---|
| [24strokestudent](https://github.com/24strokestudent) | 项目搭建、自研静态前端 10 页与 Express 后端（现归档）、贡献指南与接口契约 |
| [kangwu zhou](https://github.com/kangwu-zhou) | Hydro 二次开发：部署与运维脚本、品牌插件、导题工具、判题与 UI 验收体系 |

## License

本项目采用 [MIT](./LICENSE)；`LICENSES/` 下另有 Hydro 相关授权说明。
