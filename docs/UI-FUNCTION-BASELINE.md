# UI 功能基线（Phase 0 · 计划 §35）

这不是设计文档，是**改造前后逐项对照的台账**：每一行都要能回答"这个页面在改造中
允许动什么、动没动、用什么证明"。判定依据一律给到源码位置或命令，不接受"看起来没问题"。

配套的可执行部分在 `test/ui/`（离线渲染沙箱 + 闸门 + 出图），本文只记它管不到的语义。

## 口径

- **权限**列写的是**后端**要求，不是前端判断。前端只是这些权限的投影：
  模板里的 `{% if hasPerm(...) %}` 选哪条分支。所以"页面上少了个按钮"要么是权限没到，
  要么是夹具错了 —— 两者都能被沙箱截图区分开（见 `checkTierC`）。
  位定义照抄 `packages/common/permission.ts`，整表复刻在 `test/ui/lib/hydro.js`。
- **当前状态**只有三种取值：`沙箱已验证`（`out/shots/` 里有对应图且闸门通过）、
  `线上人工待验`（结构没覆盖，但交互/数据只有真站能证明）、`未覆盖`（本轮范围外，无证据）。
- **改造后要求**写的是这一轮（P0，§59 的 1-10 项）的承诺，超出部分标为 P1/P2。

## 页面台账

| 页面 | 路由 | 后端权限（模板分支依据） | 主要功能 | 当前状态 | 改造后要求 |
| --- | --- | --- | --- | --- | --- |
| 首页 | `/` | `PERM.PERM_VIEW` | 公告、最新题目、排行榜、快捷入口 | 沙箱已验证（`home-guest/student/teacher/admin`、`baseline-*`） | 首屏归 `templates/main.html`，公告只出纯文本；不再依赖深层 CSS（§9，已完成） |
| 题库 | `/p` | `PERM_VIEW_PROBLEM`；隐藏题另需 `PERM_VIEW_PROBLEM_HIDDEN`（`handler/problem.ts:46-48`） | 搜索、排序、分页、标签开关、随机题 | 沙箱已验证（`problems-guest/student/teacher/admin`） | C 级：只挂 `oj.css`，模板不覆盖；隐藏题可见性有闸门（§10，已完成） |
| 题目详情 | `/p/:pid` | `PERM_VIEW_PROBLEM`；递交需 `PERM_SUBMIT_PROBLEM` | 题面、样例、标签、讨论/题解入口、递交面板 | 沙箱已验证（`problem-guest/student/admin`，仅静态结构） | C 级 CSS（§11）；递交面板/编辑器须线上人工回归 |
| 提交记录 | `/record` | `PERM_VIEW_RECORD`（`1n<<70n`，学生默认含） | 按用户/题目/比赛/语言/状态筛选 | 沙箱已验证（`records-student`） | C 级 CSS + 窄屏列压缩（§13）；筛选表单须线上人工回归 |
| 提交详情 | `/record/:rid` | `PERM_VIEW_RECORD` + `user.own()` 决定能否看他人代码 | 状态、子任务、编译/评测输出、代码 | 沙箱已验证（`record-student`） | C 级 CSS（§14）；输出折叠行为须线上人工回归 |
| 登录 | `/login` | 未登录 | 账号口令登录 | 未覆盖（无场景） | 白名单已留 `login.html`，本轮未做，P1 |
| 注册 | `/register` | 未登录 | 新建账号 | 未覆盖 | P1 |
| 训练 | `/training` | `PERM_VIEW_TRAINING` | 训练列表与进入 | 未覆盖 | 只允许 CSS；状态色/分页已随全局组件生效，需截图后再定 |
| 比赛 | `/contest` | `PERM_VIEW_CONTEST` | 列表、详情、榜单 | 未覆盖 | 只允许 CSS。**禁止**为统一外观提前显示隐藏题/榜单/赛后数据 |
| 作业 | `/homework` | `PERM_VIEW_HOMEWORK` | 列表、详情、榜单 | 未覆盖 | 同上 |
| 讨论 | `/discuss` | `PERM_VIEW_DISCUSSION` | 版块、帖子、回复 | 未覆盖 | 只允许 CSS，P1 |
| 排名 | `/ranking` | `PERM_VIEW_RANKING` | RP 榜单 | 未覆盖 | 只允许 CSS，P1 |
| 用户中心 | `/home/*` | `PRIV_USER_PROFILE` | 设置、通知、域名加入 | `user/settings.html` 在白名单内未使用 | P1 |
| 管理域 | `/manage/*` | `PERM_ADMIN` 组合 | 题目/用户/域名管理 | 未覆盖（`manage.css` 已从装配名单里删掉，不留空文件） | P2，做之前先把文件加回三处名单（`render.js` / `configure.sh` / `check.js` 会互查） |
| 关于本站 | `/sylu/about` | 无（新增只读页） | 非官方声明 + 使用须知 | 沙箱已验证（`about-student`） | 结构归模板、样式归 `about.css`（§25，已完成） |

## 角色矩阵（沙箱里跑的就是这四档）

身份定义在 `test/ui/render.js` 的 `ROLES`，直接取上游复合位，不是手挑几条：

| 角色 | perm | priv | 实测到的分支差异 |
| --- | --- | --- | --- |
| guest | `PERM_BASIC` | `PRIV_REGISTER_USER` | 题库 9 题、无状态列内容；题面显示"登录后递交" |
| student | `PERM_DEFAULT` | `PRIV_DEFAULT\|PRIV_REGISTER_USER` | 题面有递交入口；题库侧栏只有 Edit/复制选中；看不到隐藏题 |
| teacher | `PERM_DEFAULT\|PERM_EDIT_DOMAIN\|PERM_CREATE_PROBLEM\|PERM_EDIT_PROBLEM` | 同上 | 多出「创建题目」「Hide/Unhide Selected」；**仍然看不到隐藏题** |
| admin | `PERM_ALL` | `PRIV_DEFAULT` + 系统位 | 看到隐藏题 1009（带"隐藏"标）；导航多出「控制面板」 |

这张表的意义是反向的：**普通学生不能因为 UI 改造多出任何一个入口**。
`checkTierC` 把"隐藏题只出现在 admin 页"钉成断言，且正例反例都查——
只查"学生看不到"的话，把夹具改成永远过滤掉也能通过，那就不是在测权限，是在测自己。

## 截图基线与复现

```bash
cd test/ui && npm install
node fetch-assets.js            # 拉上游编译产物 theme.css + iconfont 到 out/vendor
node render.js --all            # 16 个场景 → out/*.html
node shot.js --widths 1440,1024,768,390   # 全断点出图，溢出即 exit 1
node check.js                   # 13 项闸门（其中 3 项是只降不升的计数）
node compare.js HEAD            # 与上一版逐像素比（tier C 的差异是本轮刻意改出来的）
```

产物命名 `out/shots/<场景>@<宽度>.png`，`out/` 整体 gitignore——
截图是**证据**不是**资产**，不进仓库，需要留档时手动归档到验收记录里。

`compare.js` 默认跳过 `baseline-*`：孪生页会用 ref 的当前样式覆盖 `fixtures/` 里的
冻结快照，比出来的是"快照 vs 现版"，不是改动量（实测稳定 25%）。
要看基线页本身，用 `--only baseline` 并配冻结那天对应的 ref（如 `fabcca8`）。

## 已知做不到 / 不该做的

计划里设想过但**必须动 DOM** 才能做到的条目（通过率列、难度文字分级、状态/时间筛选下拉、
"只看我的"、CE/TLE/MLE 逐状态配色），逐条原因见 `test/ui/README.md`
「计划里靠 CSS 落不了地的条目」。共同点：C 级不许覆盖模板，
而用伪元素 `content` 塞文案或写死假统计数字来"看起来像"，分别违反 §8.2 和 §29。
