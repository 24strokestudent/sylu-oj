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
| 登录 | `/login` | 未登录 | 账号口令登录 | 沙箱已验证（`login-guest`，仅静态结构） | 版式是 `layout/immersive.html`（无导航那套），本轮只把背景从 Hydro 风景照换成墨色令牌；模板覆盖与输入框配色留 P1 |
| 注册 | `/register` | 未登录 | 新建账号 | 未覆盖 | P1：注册表单要 captcha 服务产物才能渲染，沙箱不造假验证码 |
| 训练 | `/training` | `PERM_VIEW_TRAINING` | 训练列表与进入 | 沙箱已验证（`training-student/guest`） | C 级 CSS：进度条换成站内"通过"色；题单详情页未覆盖 |
| 比赛 | `/contest`、`/contest/:tid` | `PERM_VIEW_CONTEST`；隐藏题/分组题另需 `PERM_VIEW_HIDDEN_CONTEST`；榜单需 `PERM_VIEW_CONTEST_SCOREBOARD`，未放榜时另需 `PERM_VIEW_CONTEST_HIDDEN_SCOREBOARD`（`model/contest.ts:1051-1073`） | 列表、详情、题目列表、榜单、我的提交 | 详情页沙箱已验证（`contests-student/admin` + `contest-live/upcoming/upcoming-attended/ended-hidden/ended-open` 五种时间状态） | C 级 CSS（横幅与按钮换品牌色）；**侧栏入口按时间状态分叉已做成 `checkContestGates`**，**赛前数据层已由 Addon 模板覆盖脱敏（`checkContestDataLeak` 为 HARD，见下；这两页因此是 C 级"只准 CSS"的签核例外）**；榜单页本身需 handler 复刻，留 P1 |
| 作业 | `/homework` | `PERM_VIEW_HOMEWORK` | 列表、日历视图 | 列表沙箱已验证（`homework-student`）；详情页沙箱已验证（`homework-upcoming-student`） | 列表页只允许 CSS；日历视图需要 `calendar` 字段，已按 `handler/homework.ts:61-67` 复刻但未出图核对，P1；详情页为赛前脱敏覆盖（与比赛详情页同一例外） |
| 讨论 | `/discuss` | `PERM_VIEW_DISCUSSION` | 版块、帖子、回复 | 沙箱已验证（`discuss-student/guest`，列表页） | 只允许 CSS；帖子详情与回复树未覆盖 |
| 排名 | `/ranking` | `PERM_VIEW_RANKING` | RP 榜单 | 沙箱已验证（`ranking-student/guest`） | 只允许 CSS。`pagination.ranking` 已补进设置默认值，否则名次列渲染成 NaN |
| 用户中心 | `/home/*` | `PRIV_USER_PROFILE` | 设置、通知、域名加入 | `user/settings.html` 在白名单内未使用 | P1 |
| 管理域 | `/manage/*` | `PERM_ADMIN` 组合 | 题目/用户/域名管理 | 未覆盖（`manage.css` 已从装配名单里删掉，不留空文件） | P2，做之前先把文件加回三处名单（`render.js` / `configure.sh` / `check.js` 会互查） |
| 关于本站 | `/sylu/about` | 无（新增只读页） | 非官方声明 + 使用须知 | 沙箱已验证（`about-student`） | 结构归模板、样式归 `about.css`（§25，已完成） |

## 角色矩阵（沙箱里跑的就是这四档）

身份定义在 `test/ui/render.js` 的 `ROLES`，直接取上游复合位，不是手挑几条：

| 角色 | perm | priv | 实测到的分支差异 |
| --- | --- | --- | --- |
| guest | `PERM_BASIC` | `PRIV_REGISTER_USER` | 题库 9 题、无状态列内容；题面显示"登录后递交"；训练页无进度 |
| student | `PERM_DEFAULT` | `PRIV_DEFAULT\|PRIV_REGISTER_USER` | 题面有递交入口；题库侧栏只有 Edit/复制选中；看不到隐藏题；比赛侧栏没有「编辑比赛」 |
| teacher | `PERM_DEFAULT\|PERM_EDIT_DOMAIN\|PERM_CREATE_PROBLEM\|PERM_EDIT_PROBLEM` | 同上 | 多出「创建题目」「Hide/Unhide Selected」；**仍然看不到隐藏题**（`PERM_DEFAULT` 不含 `PERM_VIEW_PROBLEM_HIDDEN`，也不含 `PERM_VIEW_CONTEST_HIDDEN_SCOREBOARD`） |
| admin | `PERM_ALL` | `PRIV_DEFAULT` + 系统位 | 看到隐藏题 1009（带"隐藏"标）与分组比赛；导航多出「控制面板」 |

`PERM_DEFAULT` 里有 `PERM_EDIT_CONTEST_SELF` 而**没有** `PERM_EDIT_CONTEST`
（`permission.ts:110-153`），所以学生侧栏不该出现「编辑比赛」；
沙箱里学生确实出现的「提前结束比赛」是 `contest_sidebar.html:120` 的自助入口
（条件只有"已参加 + 进行中 + 非作业"），不是管理权限，两者不要混为一谈。

### 比赛的时间状态 × 身份：侧栏里到底该出现什么

`checkContestGates` 逐条断言的就是这张表（"链接"指 `/contest/:tid/problems` 与
`/contest/:tid/scoreboard` 两个入口）：

| 夹具时间线 | 身份 | 题目列表 | 成绩表 | 依据 |
| --- | --- | --- | --- | --- |
| 进行中（ACM） | student | 有 | 有 | `isOngoing` + `showScoreboard` |
| 未开始（OI，榜隐藏） | student | 无 | 无 | 三条时间判定全 false，且无隐藏榜权限 |
| 未开始（OI，榜隐藏） | student（已报名） | **有** | 无 | 入口判断只看 `tsdoc.attend`（`contest_sidebar.html:44` 的 else 分支），不看 `beginAt`；点进去由 `ContestProblemListHandler` 抛 `ContestNotLiveError` 拦 |
| 已结束、榜未公布（OI） | student | 有 | **无** | `canShowScoreboard` false，`canViewHiddenScoreboard` 也 false |
| 已结束、榜未公布（OI） | admin | 有 | 有 | 有隐藏榜权限。但走的是"成绩表"还是"成绩表（隐藏）"那一条分支，取决于 `contest_sidebar.html:131` 传给第三个参数的到底是什么——那里写的是大写 `False`，在 nunjucks 里是一次未定义符号查找，落到 JS 默认值 `allowPermOverride = true`。所以这一格只断言"有链接"，不断言文案（同一模板的 `homework_sidebar.html:49` 用的是小写 `false`） |
| 已结束、榜已公布（OI） | student | 有 | 有 | `isDone` 且未 `keepScoreboardHidden` |

这张表的意义是反向的：**普通学生不能因为 UI 改造多出任何一个入口**。
`checkTierC` 把"隐藏题只出现在 admin 页"钉成断言，且正例反例都查——
只查"学生看不到"的话，把夹具改成永远过滤掉也能通过，那就不是在测权限，是在测自己。

最后一列写的是 `model.contest` 的判断链，而它成立的前提是运行时真的把 `handler` 传进了
那些 `.call(handler, …)`。这件事由 `checkRuntimeParity` 单独守住，
原因见 `test/ui/README.md`「比赛可见性」一节——上一版沙箱在这点上与线上不一致，
而失真方向恰好是"权限判定恒为 false"，会让上面这些"无"变成自我确认。

### 未开赛的数据层：链接藏住了，数据曾经没藏住（已关闭，待真机复验）

上表只描述链接。**数据层曾经不满足"不得提前出现"**：`contest_detail.html:6-7` 把整份 `tdoc`
塞进 `UiContext`，`layout/html5.html:66-69` 又把它序列化到 `window.UiContextNew`，
而序列化的 replacer（`backendlib/template.ts:21-26`）只丢 `_` 前缀的键。
修复前沙箱实测（学生身份、开赛前六天）产物里含：

| 字段 | 值 | 是否该在开赛前下发给非 owner 学生 |
| --- | --- | --- |
| `pids` | `[1001,1003,1005]` | 否——精确题号 |
| `privateFiles` | 附件名 / size / etag | 否——handler 已把 `body.files` 判成空（`handler/contest.ts:178`），tdoc 里这份却没判 |
| `_code`（报名口令） | 不出现 | 由 `_` 前缀被 replacer 剥掉，闸门仍然盯住它 |

这是上游 5.0.7 的既有行为（源码链已逐段核对，非本站改出）。**处理方式是 Addon 模板覆盖**
（用户签核的方案 A），不是改 Core：`addons/sylu-brand/templates/` 下新增
`contest_detail.html`、`homework_detail.html`，整份逐字照抄上游，只在
`{{ set(UiContext, 'tdoc', …) }}` 之前插一段脱敏。约束与代价：

- **这两页是 C 级"只准 CSS"的例外**，例外本身要能被机器查：`ALLOWED_OVERRIDES` 登记 +
  `checkOverrideDrift` 逐行比对（去掉我们那一段之后，与上游剩下的行必须行数相同、逐字相同）。
  上游模板一改，闸门立刻红，
  升级 Hydro 时就得手动重新对齐——这是选这条路的已知代价，不是可以忽略的细节。
- **判据抄后端，不自己发明**：脱敏条件分别是 `handler/contest.ts:179` 与
  `handler/homework.ts:116-121` 里那两条判断的模板写法（作业多一条"未参加且未结束"），
  豁免权限也照抄（`own(tdoc)` / `PERM_EDIT_CONTEST` / `PERM_VIEW_HOMEWORK_HIDDEN_SCOREBOARD`）。
  客户端看到的与页面渲染出来的因此不会互相矛盾。
- **用白名单而不是黑名单**：只下发 `docId / title / rule / beginAt / endAt / duration` 六个字段。
  一来 `assign` 是 `Object.assign`（`backendlib/template.ts`），拿它做"删字段"会把 `tdoc` 本身改掉，
  `homework_detail.html:43` 之后还要循环 `tdoc.pids`；二来上游以后加的新字段不会默认漏出去。
  六个字段是客户端真实依赖的并集（`pages/contest.page.ts:10-11`、`contest_scoreboard.page.ts:64-65`、
  `problem_detail.page.tsx:149,280`），少一个倒计时就坏。
- **闸门是双向的**：`checkContestDataLeak` 既断言三个未开赛场景的 `UiContextNew.tdoc`
  键集 ⊆ 白名单且不含 `pids/privateFiles/_code`，也断言进行中场景**仍带非空 `pids`**——
  只查前者的话，把脱敏改成"永远清空"也能通过，那就不是在测安全，是在测自己。
  基线已清零，所以这一项是 HARD 而不是 RATCHET，并且两个方向都各自证伪过一次。

**在真机 smoke test 之前，"比赛数据不会提前泄露"仍然只对沙箱渲染产物负责。**
这一轮关掉的是**题号清单与私有附件元数据**，不是"赛前信息一点都不出现"：
侧栏的「题目 N」是上游服务端渲染的题数（`partials/contest_sidebar.html:191` 的
`tdoc.pids.length`、`partials/homework_sidebar.html:87` 的 `tdoc['pids']|length`），
脱敏只换 `UiContext` 的入参，管不到这一行。要连题数一起藏，就得把覆盖段落扩大到侧栏、
并把它加进 `checkOverrideDrift` 的 `require` 名单——那是又一次扩大例外范围的决定，
不在本轮范围内，先记在这里。

"直接敲 URL"那一层另有后端闸门：`ContestProblemListHandler` 抛
`ContestNotLiveError` / `ContestNotAttendedError`，`ContestScoreboardHandler` 重跑
`canShowScoreboard` 并检查 `isNotStarted`。两条链路的 provenance 一起写清楚：
**后端源码闸门：已确认（读 `.ref/Hydro` 的 5.0.7 源码）；Addon 模板层：沙箱已验证；
真实部署链路：仍需真机 smoke test。**

#### 这段模板为什么写成那样（nunjucks 3.2.4 的两个坑）

沙箱与上游用的是同一个 nunjucks 3.2.4，下面这些写法在别处看着正常，在这里直接把解析器打翻，
报错还甩到远处的下一个 `,` 或 `?` 上（`parseSignature` / `parseAggregate: expected comma after expression`），
从错误信息根本倒推不回原因，实测踩过：

- `{% set x = ({...}) %}`——**带括号的字典字面量**当 set 的值，解析失败。要用 `{% set x = {...} %}`。
- `{{ f(a, (b and c) ? d : e) }}`——**call 参数位上、条件是括号的三元**，解析失败。
  `{{ f(a, b ? c : d) }}` 和 `{{ f(a, (b ? c : d)) }}` 都没问题，所以别在最外层套括号。
- `and` / `or` / `?` 之前换行会解析失败；多行字典字面量内部换行可以。
- `{% if %}` 里的 `{% set %}` 在块结束后**仍然可见**（这点与直觉相反，已用渲染验证），
  所以上面的 `tdocClient` 能在 `endif` 之后直接用。
- 探测脚本必须放在 `test/ui/` 下跑：`nunjucks` 在那里才解析得到，且 `UiContext` / `model` /
  `handler` / `perm` 是环境 **globals**，用原生环境做探针会得到与线上不同的结论。

## 截图基线与复现

```bash
cd test/ui && npm install
node fetch-assets.js            # 拉上游编译产物 theme.css + iconfont 到 out/vendor
node render.js --all            # 33 个场景 → out/*.html
node shot.js --widths 1440,1024,768,390   # 全断点出图，溢出即 exit 1
node check.js                   # 19 项闸门通过（另有 3 项是只降不升的计数）
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
（C 级目前只有两个签核例外：`contest_detail.html`、`homework_detail.html` 的赛前脱敏，
理由与代价见「未开赛的数据层」一节；这两条例外**不**构成"其它 C 页也能覆盖"的先例。）
