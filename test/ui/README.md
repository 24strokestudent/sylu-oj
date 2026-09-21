# UI 离线渲染沙箱

前端重构的验收通道。本机没有可运行的 Hydro（无 Docker、无内网数据库口令），
而计划的验收标准几乎全是视觉项，所以这里用**离线渲染**替代起服务：
加载真实的上游模板 + `addons/sylu-brand/templates`，喂进 HomeHandler 形状的数据，
产出静态 HTML，再用无头 Chrome 出图。不碰任何线上机器。

## 用法

```bash
cd test/ui && npm install          # nunjucks / js-yaml / markdown-it / puppeteer-core，不进主工程依赖
node fetch-assets.js               # 从内测站抓 theme.css、iconfont 与线上 sylu-brand.css 到 out/vendor
node render.js --all               # 渲染全部场景到 out/*.html
node shot.js                       # 全场景 × 全断点出图到 out/shots
node check.js                      # 回归闸门，违反红线即 exit 1
node diag.js home-student          # 布局量测（排查"渲染出来了但看不见"这类问题）
```

## 出图：窄屏只能走 puppeteer

Windows 上的 Chrome 会把 `--window-size` 的宽度钳到一个最小值，实测
`320 / 390 / 500` 都得到 `window.innerWidth === 504`（`--headless=new`、`--headless=old`、
`--headless` 三种写法一致）。也就是说命令行出图**做不出真窄屏**：图是按 390 裁的，
排版却是 504 的，拿它下"移动端没问题"的结论是假的。

所以 `shot.js` 有两条路径：装了 `puppeteer-core` 就走 CDP 的 `setViewport`
（视口宽度等于请求宽度，`fullPage` 截整页，`deviceScaleFactor` 固定 1 以免
`diff.js` 的像素基准漂移）；没装则退回命令行，并为 `<504px` 的断点打印警告。
`node_modules` 是 gitignore 的，所以 `puppeteer-core` 必须留在 `package.json` 里——
否则换台机器 `npm install` 之后，390px 的图会静默变成 504 的裁切图。

`diag.js` 仍走命令行，量到的 `INNER_W` 因此可能是 504 而不是请求值；它用来查
"谁把页面撑宽"（`DOC_SCROLLW > INNER_W`）依然有效，不能用来断言窄屏排版。

导航用 `domcontentloaded` 而不是 `load`：上游模板里的头像是协议相对地址
`//cn.gravatar.com/…`，在 `file://` 下解析成 `file://cn.gravatar.com/…`，请求会挂住，
等 `load` 就是 60 秒超时。本站样式表在 DOMContentLoaded 前已就位，补等
`document.fonts.ready` 即可。

## 怎么证明"这次改动没改外观"

拆分 CSS、换模板这类改动，目视说"看起来一样"不算证据。两条命令：

```bash
node diff.js a.png b.png                      # 两张图逐像素差异率
node compare.js 1794a1a --widths 1440,390     # 与某 git 版本比全部场景
```

`compare.js` 从目标 ref 还原当时的样式，为每个场景造一份"旧样式孪生页"，两边出图后比像素。
本次 CSS 拆分（437 行单文件 → 5 个职责文件 + 令牌）实测 **差异 0.000%（0/4557600 像素）**。

基线页自身的可信度也用它量：`node compare.js fabcca8 --only baseline --widths 1440`
实测 **baseline-guest 0.014% / baseline-student 0.004%**（阈值 0.1%），也就是
`baseline-*` 确实等于改造前的样子，残差是文字抗锯齿级别的噪声。
这个数第一次跑出来是 2.373%：当时基线页同时挂着当前 home.css 和它的冻结快照，
同名规则互相覆盖，量到的是"改造前后各一半"的混合外观 —— 基线不忠实，所有以它为
参照的比较都会得出假结论，所以 `render.js` 的场景表用 `skipCss` 把已被整份冻结的
文件从当前样式里摘掉。

## 闸门查什么

`check.js` 分两类：

- **HARD**：渲染产物不得泄漏错误串；必须保留 `Powered by Hydro` 归属与"非官方"声明；
  addon 覆盖上游模板必须在 §49 的 A/B 级白名单内（C 级业务模板只能用 CSS）；
  `:has()` 已清零，长回来即 fail；首屏只由模板出一份 Hero，公告里不得带结构。
- **RATCHET**：`richmedia` 深层选择器、`first-child` 位置选择器两项计数只许下降。
  改造前是 53 / 51，首页模板化后 8 / 4，导航品牌改成真实 DOM 后 8 / 1 ——
  剩下的都挂在公告富文本的语义标签上（class 会被过滤器剥掉，只能按标签排版）。
- **品牌区**：站名与副标题必须由 `partials/nav.html` 渲染成真实文本节点；
  CSS 里再出现 `content: "...SYLU..."` 直接 fail（§8.2 的伪元素 hack 不许复活）。
- **装配一致性**：`public/sylu/css/` 目录、`configure.sh` 的 `CSS_ORDER`、
  `render.js` 的 `CSS_FILES` 三处必须同步——新增样式文件忘了挂链接会直接 fail。
  产物里每一条相对 `link/script/img` 引用也会解析一遍，文件不存在就 fail。
- **出图能力**：`package.json` 必须留着 `puppeteer-core`，否则窄屏出图会静默退化成
  504px 裁切（见上一节），这种"看起来通过了"的假结论要拦住。
- **导航净空**：Hydro 的顶栏是 `position:fixed` 且用 `margin-bottom:-2.8125rem`
  抵消了自己的占位，不占文档流，所以每个页面必须让出 `--sylu-nav-h`。
  关于页出图时量到的"标题被导航压住"就是这条被写成了死数 28px（< 导航 45px），
  是本站样式带进线上的真 bug，不是沙箱失真。断言三处：`.main` 的 `padding-top`
  引用令牌、撤让位的 `@media` 只许出现在 600px 及以下（上游正是在 600px 把顶栏
  收进抽屉、改由处在文档流里的 `.header--mobile` 占位）、品牌链接锁一行高且
  logo 不比导航高。

上游模板来自 `.ref/Hydro`（gitignore 的只读参考）。找不到时设 `SYLU_HYDRO_REF` 指向
`Hydro/packages/ui-default/templates` 的父目录。

## fixtures/：冻结的改造前样式

首页模板化之后，`public/sylu/css/` 里那套"按 DOM 位置猜公告"的样式被整体删除了；
导航品牌改成真实 DOM 之后，shell.css 里往第一个 li 塞伪元素的那段也删了。
但 `baseline-*` 场景的存在意义就是复刻**删除之前**的线上页面，所以它们以冻结快照的形式
留在测试目录里，只挂给 `baseline-*`，不随 addon 发布，也不计入 RATCHET 统计：

| 文件 | 冻结自 | 取回方式 |
| --- | --- | --- |
| `legacy-home.css` | home.css @ fabcca8（全文） | `git show fabcca8:addons/sylu-brand/public/sylu/css/home.css` |
| `legacy-shell-nav.css` | shell.css 的导航段（品牌伪元素 hack + 28px 净空 + 42px logo）@ 9c4d01f | `git show 9c4d01f:addons/sylu-brand/public/sylu/css/shell.css` |
| `legacy-responsive.css` | responsive.css @ fabcca8（全文） | `git show fabcca8:addons/sylu-brand/public/sylu/css/responsive.css` |

全文冻结的两份在基线场景里是**替换**而不是追加（场景表的 `skipCss` 会把当前版
home.css / responsive.css 摘掉）；`legacy-shell-nav.css` 是几段，所以 shell.css
照常加载，由它在后面把导航 hack 与 28px 净空覆盖回改造前的值。
挂载后的层叠顺序仍是 tokens → base → shell(+导航段冻结) → home → responsive，
与改造前一致。

这样拆分的依据是 CSS 拆分那轮实测的 0.000% 像素差：新令牌/新分片 + 冻结的位置规则
= 改造前的外观，两者可以叠加而不是互相覆盖。

## 场景

| 名称 | 模板 | 身份 | 公告 | 用途 |
| --- | --- | --- | --- | --- |
| `baseline-guest` | 仅上游 | 未登录 | 含 Hero HTML | 复刻线上现状 |
| `baseline-student` | 仅上游 | 学生 | 含 Hero HTML | 复刻线上现状 |
| `home-guest/student/teacher/admin` | 上游 + addon | 四档权限 | 纯文本 | 改造后效果 |

`baseline-*` 用 `HERO_BULLETIN`（改造前 `configure.sh` 往公告里塞的那段 HTML 的冻结副本），
因为线上现状就是"整块首屏塞进公告"；`home-*` 用纯文本公告，首屏改由模板承载。
两者用的是同一份数据源，差异只在渲染管线，这样才能验证 LEGACY 段样式是否被完整保留。

实测：`<div class="sylu-hero">` 经 `|content` 过滤后 `class` 全部消失（`sylu-hero` 出现 0 次），
`<em>` 等内容保留 —— 这就是首页样式只能按 `.richmedia > div:first-child` 猜 DOM 的根因。

四档身份的 PERM/PRIV 取自上游真实位定义，用来验证"改 UI 不会给学生发权限"：
导航项在四档下应各不相同，且 `关于本站` 只在加载 addon 时出现。

## 沙箱与线上必须对齐的五处

少任何一处都会得到"看起来是坏的"或"看起来是好的"的假结论：

1. **theme.css** —— 没有它页面等于无样式 HTML，故 `fetch-assets.js` 拉线上编译产物。
2. **样式层叠顺序** —— 上游 theme.css 在前，本站样式在后，与线上一致。
3. **`hasjs` + `.visible`** —— `layout/html5.html:51` 的内联脚本把 `nojs` 换成 `hasjs`，
   theme.css 随即 `.hasjs .section{opacity:0}`；真正的 `.visible` 由 `hydro.ts:108` 在
   页面初始化后加上。沙箱不加载 entry.js，所以 render.js 注入一段等价的 reveal shim。
   少了它，症状是"导航正常、正文一片空白"——已被这个坑浪费过一轮排查。
4. **静态资源绝对路径** —— `/sylu-logo.svg` 这类由 `server.ts:114-120` 从各 addon 的
   `public/` 挂到 web 根；`file://` 解析不到，render.js 仅在文件确实存在时改写为相对路径。
5. **iconfont** —— `.icon-*` 的 `content` 是私用区码点，缺 `hydro-icons` 字体会全部渲染成
   豆腐块，"用 Hydro 已有图标"就无从验收。`fetch-assets.js` 会解析 theme.css 的
   `@font-face` 把字体一并拉到 `out/vendor/`。

## 边界

- 这是**渲染**沙箱，不是**运行**沙箱：点击、表单、评测轮询、MDE 编辑器都不在覆盖范围内。
  交互链路仍须在内测站人工回归。
- 数据是 `lib/data.js` 造的仿真校园数据，不含假统计数字。
- `lib/hydro.js` 是上游模板运行时的复刻（filters / globals / PERM / PRIV / url()），
  文件头标注了每处依据的上游源码位置；上游升级后需重新比对。
