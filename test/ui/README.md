# UI 离线渲染沙箱

前端重构的验收通道。本机没有可运行的 Hydro（无 Docker、无内网数据库口令），
而计划的验收标准几乎全是视觉项，所以这里用**离线渲染**替代起服务：
加载真实的上游模板 + `addons/sylu-brand/templates`，喂进 HomeHandler 形状的数据，
产出静态 HTML，再用无头 Chrome 出图。不碰任何线上机器。

## 用法

```bash
cd test/ui && npm install          # 只装 nunjucks / js-yaml / markdown-it，不进主工程依赖
node fetch-assets.js               # 从内测站抓 theme.css 与线上 sylu-brand.css 到 out/vendor
node render.js --all               # 渲染全部场景到 out/*.html
node shot.js                       # 全场景 × 全断点出图到 out/shots
node check.js                      # 回归闸门，违反红线即 exit 1
node diag.js home-student          # 布局量测（排查"渲染出来了但看不见"这类问题）
```

## 怎么证明"这次改动没改外观"

拆分 CSS、换模板这类改动，目视说"看起来一样"不算证据。两条命令：

```bash
node diff.js a.png b.png                      # 两张图逐像素差异率
node compare.js 1794a1a --widths 1440,390     # 与某 git 版本比全部场景
```

`compare.js` 从目标 ref 还原当时的样式，为每个场景造一份"旧样式孪生页"，两边出图后比像素。
本次 CSS 拆分（437 行单文件 → 5 个职责文件 + 令牌）实测 **差异 0.000%（0/4557600 像素）**。

## 闸门查什么

`check.js` 分两类：

- **HARD**：渲染产物不得泄漏错误串；必须保留 `Powered by Hydro` 归属与"非官方"声明；
  addon 覆盖上游模板必须在 §49 的 A/B 级白名单内（C 级业务模板只能用 CSS）。
- **RATCHET**：`richmedia` 深层选择器、`first-child` 位置选择器、`:has()` 隐藏业务模块
  三项计数只许下降，基线取改造前实测值。
- **装配一致性**：`public/sylu/css/` 目录、`configure.sh` 的 `CSS_ORDER`、
  `render.js` 的 `CSS_FILES` 三处必须同步——新增样式文件忘了挂链接会直接 fail。

上游模板来自 `.ref/Hydro`（gitignore 的只读参考）。找不到时设 `SYLU_HYDRO_REF` 指向
`Hydro/packages/ui-default/templates` 的父目录。

## 场景

| 名称 | 模板 | 身份 | 公告 | 用途 |
| --- | --- | --- | --- | --- |
| `baseline-guest` | 仅上游 | 未登录 | 含 Hero HTML | 复刻线上现状 |
| `baseline-student` | 仅上游 | 学生 | 含 Hero HTML | 复刻线上现状 |
| `home-guest/student/teacher/admin` | 上游 + addon | 四档权限 | 纯文本 | 改造后效果 |

`baseline-*` 用 `HERO_BULLETIN`（`deploy/configure.sh` 里那段公告原文），
因为线上现状就是"整块首屏塞进公告"；`home-*` 用纯文本公告，首屏改由模板承载。
两者用的是同一份数据源，差异只在渲染管线，这样才能验证 LEGACY 段样式是否被完整保留。

实测：`<div class="sylu-hero">` 经 `|content` 过滤后 `class` 全部消失（`sylu-hero` 出现 0 次），
`<em>` 等内容保留 —— 这就是首页样式只能按 `.richmedia > div:first-child` 猜 DOM 的根因。

四档身份的 PERM/PRIV 取自上游真实位定义，用来验证"改 UI 不会给学生发权限"：
导航项在四档下应各不相同，且 `关于本站` 只在加载 addon 时出现。

## 沙箱与线上必须对齐的四处

少任何一处都会得到"看起来是坏的"或"看起来是好的"的假结论：

1. **theme.css** —— 没有它页面等于无样式 HTML，故 `fetch-assets.js` 拉线上编译产物。
2. **样式层叠顺序** —— 上游 theme.css 在前，本站样式在后，与线上一致。
3. **`hasjs` + `.visible`** —— `layout/html5.html:51` 的内联脚本把 `nojs` 换成 `hasjs`，
   theme.css 随即 `.hasjs .section{opacity:0}`；真正的 `.visible` 由 `hydro.ts:108` 在
   页面初始化后加上。沙箱不加载 entry.js，所以 render.js 注入一段等价的 reveal shim。
   少了它，症状是"导航正常、正文一片空白"——已被这个坑浪费过一轮排查。
4. **静态资源绝对路径** —— `/sylu-logo.svg` 这类由 `server.ts:114-120` 从各 addon 的
   `public/` 挂到 web 根；`file://` 解析不到，render.js 仅在文件确实存在时改写为相对路径。

## 边界

- 这是**渲染**沙箱，不是**运行**沙箱：点击、表单、评测轮询、MDE 编辑器都不在覆盖范围内。
  交互链路仍须在内测站人工回归。
- 数据是 `lib/data.js` 造的仿真校园数据，不含假统计数字。
- `lib/hydro.js` 是上游模板运行时的复刻（filters / globals / PERM / PRIV / url()），
  文件头标注了每处依据的上游源码位置；上游升级后需重新比对。
