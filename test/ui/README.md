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

上游模板来自 `.ref/Hydro`（gitignore 的只读参考）。找不到时设 `SYLU_HYDRO_REF` 指向
`Hydro/packages/ui-default/templates` 的父目录。

## 场景

| 名称 | 模板 | 身份 | 用途 |
| --- | --- | --- | --- |
| `baseline-guest` | 仅上游 | 未登录 | 改造前基线 |
| `baseline-student` | 仅上游 | 学生 | 改造前基线 |
| `home-guest/student/teacher/admin` | 上游 + addon | 四档权限 | 改造后效果 |

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
