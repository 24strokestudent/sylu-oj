# sylu-brand · SYLU 品牌插件

对应实施计划 §30–§34（Phase 7）。

## 先说结论：品牌定制 90% 不需要写插件

Hydro 原生系统设置已经覆盖了大部分品牌需求。**优先用原生设置，不要为了改个名字就动插件或改 Core**（§1.2 §76）。

### 原生设置清单（控制面板 → 系统设置）

| 想改什么 | 设置键 | 怎么设 |
|---|---|---|
| 站点名称 | `server.name` | 填 `SYLU OJ`。默认值是 `Hydro` |
| 访问地址 | `server.url` | **必须填完整地址并以 `/` 结尾**，例：`https://oj.example.edu.cn/`。填错会导致跳转和静态资源 404 |
| 默认语言 | `server.language` | `zh_CN` |
| 监听端口 | `server.port` | 默认 `8888`，由反向代理对外提供服务，保持 `127.0.0.1` |
| 反代模式 | `server.xproxy` | 前面挂了 Caddy/Nginx 时开启，否则取到的客户端 IP 会全是 127.0.0.1 |
| 导航栏 Logo | `ui-default.nav_logo_dark` | 填 `/sylu-logo.svg`，资源由本插件提供 |
| 页脚附加内容 | `ui-default.footer_extra_html` | **多行 HTML**，每行渲染成页脚一条；本站用它逐条直链 `/sylu/css/*.css` |
| 关于页正文 | `ui-default.about` | Markdown。对应 `/wiki/about` 页面 |
| 首页模块编排 | `hydrooj.homepage` | YAML 数组，本站的值来自本插件 `homepage.yaml` |
| 上传大小上限 | `server.upload` | 默认 `256m`，按需调整 |

> `ui-default.footer_extra_html` 是这次品牌改造的关键：**免责声明和非官方声明用原生设置就能上，不用改模板**。

### 建议填写的页脚内容（复制到 `ui-default.footer_extra_html`）

```html
本站为学生维护的非官方编程学习与在线评测平台，非学校官方信息系统
评测引擎 Powered by <a href="https://github.com/hydro-dev/Hydro" rel="noopener">Hydro</a>
请勿上传个人隐私数据，请勿提交恶意代码
```

### 归属声明的硬约束（§31）

Hydro 页脚模板里带有一段明确的版权声明：

```html
{# 除非您已购买了有效的企业版授权，否则您不得隐藏、修改或移除下方的版权信息。 #}
<li class="footer__extra-link-item">Powered by <a href="https://hydro.js.org">Hydro v{{ ... }}</a> ...</li>
```

所以：

- **必须保留** `Powered by Hydro` 及其有效链接，不得删除、遮挡、置灰。
- 我方内容只能**追加**为 `footer_extra_html` 的额外条目。
- 不要通过覆盖 `partials/footer.html` 模板来"顺手去掉"它——那既违反授权，也会让每次升级都产生冲突。

### Logo 与 favicon 静态资源覆盖

Hydro 启动时会把每个 addon 的 `public/` 目录按顺序复制到 `~/.hydro/static`，官方注释是 "allow resource override"。
因此把同名文件放进本目录 `public/`，即可覆盖站点图标：

| 文件 | 用途 |
|---|---|
| `favicon-32x32.png` / `favicon-16x16.png` / `favicon-96x96.png` | 浏览器标签页图标 |
| `apple-touch-icon-180x180.png` | iOS 添加到主屏 |
| `android-chrome-192x192.png` | Android 图标 |

导航栏 Logo 走 `ui-default.nav_logo_dark` 设置，不需要放文件。

放好文件后重启 Hydro 生效：`pm2 restart hydrooj`。

## 这个插件补的是什么

原生设置做不到「加一个自定义导航入口」和「一页聚合的平台须知」，所以本插件只做这几件事：

- 路由 `GET /sylu/about` —— 非官方声明 + 平台使用须知（使用须知 / 判题环境 / 反馈方式 / 隐私说明，§40）。
  页面结构在 `templates/sylu/about.html`，`index.js` 只给数据并指定模板（§25），
  样式在 `public/sylu/css/about.css`，与其他页面共用同一套设计令牌
- 顶栏导航注入一个「关于本站」入口（指向上面这个路由）
- 覆盖首页模板 `templates/main.html`，把首屏 Hero、绿色收束条和四个快捷入口变成**代码里的结构**，
  不再靠往公告里塞 HTML + 深层 CSS 选择器实现
- 覆盖 `templates/partials/homepage/discussion_nodes.html`，只多加了一条"没有版块就不渲染"的判断
- 覆盖 `templates/partials/nav.html`，**只把第一个导航项换成有 DOM 的品牌区**
  （Logo + 站名 + 副标题），其余 130 多行与上游逐字一致；上游若改动该文件，
  整份重新对齐再重放这一处 delta，别只改本地副本
- `homepage.yaml` 是首页模块编排的内容，部署时原样写入 `hydrooj.homepage`
- `public/sylu/css/oj.css` 给题库、题面、提交记录、提交详情换上同一套设计语言
  （卡片、状态色、表格、标签、搜索键、题面排版、窄屏列压缩）。**只挂样式，不改结构、
  不覆盖这四个页面的上游模板**（§49 C 级），因此选择器全部来自上游模板原文类名，
  上游升级时需要对齐；`test/ui/check.js` 的 `checkTierC` 会盯住渲染结果
- 通过 `public/sylu/css/*.css` 适配 Hydro 原有导航、首页卡片、侧栏和页脚。
  题库与提交记录换了视觉语言但没换结构；比赛、作业与管理后台仍完全是上游原样

它**不碰**用户系统、题库、Judge。模板只覆盖上列四份（`main.html`、
`partials/homepage/discussion_nodes.html`、`partials/nav.html`、`sylu/about.html`），
且都是 addon 覆盖而非改 Hydro 源码（§49 A/B 级）；题库、记录、比赛、作业、讨论、
排名与后台仍然完全使用上游模板。

## 样式是怎么加载的

`ctx.injectUI()` 只支持 `ProblemAdd|Notification|Nav|UserDropdown|DomainManage|ControlPanel`
六类挂载点，**没有注入 CSS/JS 的能力**；把全局样式打进 `entry.js` 需要走
`frontend/*.page.tsx` + `builder.ts buildUI()` 的构建链。本插件不引入构建步骤，
所以用的是另一条受支持的路：`public/` 下的文件会被 `server.ts` 以 web 根路径静态托管
（`/sylu/css/tokens.css` 就是这么来的），再由 `ui-default.footer_extra_html` 逐条 `<link>` 引入。

拆成多份而不是合成一份，是为了让"改哪块看哪块"和 git 归因一致：

| 文件 | 负责 |
|---|---|
| `tokens.css` | 设计令牌，颜色的唯一出处 |
| `base.css` | 全站底色与字体、主行动按钮 |
| `shell.css` | 导航、页脚、主内容区 |
| `home.css` | 首页版面、公告排版、首屏 |
| `about.css` | 关于本站页（`templates/sylu/about.html` 的专用样式） |
| `oj.css` | 题库 / 题面 / 提交记录 / 提交详情：C 级页面，只挂样式不碰模板 |
| `responsive.css` | 全部断点，移动端改造只看这里 |

导航是 `position:fixed` 且不占文档流（上游用 `margin-bottom:-2.8125rem` 抵消了自己的占位），
所以让出导航高度这件事只有一个出处：`tokens.css` 的 `--sylu-nav-h`。
`test/ui/check.js` 会盯住 `.main` 的 `padding-top`、品牌链接行高与 logo 尺寸，
写死像素或把让位撤在 600px 以上的断点里都会 fail。

直链而非 `@import`：`@import` 会串行阻塞渲染，且绕过版本号导致改样式后客户端拿旧缓存。

## 部署

```bash
# 1. 先改文案（站点名、反馈方式、备案号、须知正文）
vi /root/sylu-oj/addons/sylu-brand/brand.js

# 2. 注册插件
hydrooj addon add /root/sylu-oj/addons/sylu-brand

# 3. 重启
pm2 restart hydrooj          # 或 systemctl restart hydro

# 4. 验证
curl -sI http://127.0.0.1:8888/sylu/about | head -1        # 期望 200
```

卸载：`hydrooj addon remove /root/sylu-oj/addons/sylu-brand` 后重启。

## 验证清单（Phase 7 验收）

- [ ] 顶栏出现「关于本站」，且点击不是死链接
- [ ] `/sylu/about` 返回 200，正文含非官方声明
- [ ] 页脚出现非官方声明，且 `Powered by Hydro` 链接仍在、可点
- [ ] 站点名称已变为 `SYLU OJ`（浏览器标签页标题）
- [ ] 顶栏站名与副标题能在 DevTools 的 DOM 里读到（`.sylu-brand__name` / `.sylu-brand__tagline`），
      不是伪元素 content；读屏软件也能念出来（§8.2）
- [ ] `git status` 中 Hydro Core 目录无任何改动（§72）
- [ ] 手机宽度下该页面排版正常（§65）
- [ ] 任意非首页页面（`/sylu/about`、题库、提交记录）的首行不被顶栏遮住：
      DevTools 里 `.main` 的 `padding-top` 计算值应 ≥ 顶栏高度（45px）
- [ ] `/sylu/about` 与首页共用同一份 `layout/basic.html`：顶栏、页脚、
      `Powered by Hydro` 都在，说明页不是另起的一张 HTML

C 级页面（沙箱只证明"渲染成什么样"，证明不了"点起来对不对"，以下必须上内测站）：

- [ ] `/p` 题库：搜索、排序、分页、标签展开开关都还能用
- [ ] `/p/<pid>` 题面：递交面板（Mitorch 编辑器）能打开能提交，样例块复制按钮正常
- [ ] `/record` 记录列表：筛选表单（按用户/题目/比赛/语言/状态）能提交并生效
- [ ] `/record/<rid>` 提交详情：编译输出折叠/展开、子任务表格、下载代码
- [ ] 学生账号看不到隐藏题，也看不到「隐藏/移除选中」等管理项（沙箱已断言渲染分支，线上再确认一次）
- [ ] 手机宽度下题库/记录表格无横向滚动条（`node test/ui/shot.js` 已把这一步做成出图断言）

## 加载失败的排查

Hydro 的插件加载器**逐个隔离**：某个 addon 加载失败只会弹出警告通知并写入日志，**不会让站点崩溃**（见 `entry/common.ts` 的 `getLoader`）。所以最坏情况是"没生效"，而不是"打不开"。

排查顺序：

```bash
pm2 logs hydrooj --lines 100 | grep -i sylu      # 看 [sylu-brand] 的日志
```

1. 日志出现 `无法解析 hydrooj 本体` → 在插件目录装依赖：`cd /root/sylu-oj/addons/sylu-brand && yarn add hydrooj`，再重启。
   也可以用环境变量显式指定：在 `~/.hydro/env` 里加 `SYLU_HYDRO_CORE=/path/to/hydrooj`。
2. 日志出现 `duplicate script`／`Route` 报错 → 说明路由名 `sylu_about` 与已有插件冲突，改 `index.js` 里的路由名。
3. 完全没有 `[sylu-brand]` 日志 → 插件没被加载，检查 `cat ~/.hydro/addon.json` 里是否有本插件的绝对路径。

> 本插件在 Windows 上完成了静态语法检查，但**尚未在真实 Hydro 实例上验证过**（本地无 Debian/Hydro 环境）。
> 上线前请按上面清单逐项验证，并如实记录结果——不要把它标记为"已完成"。

## 视觉适配边界

本插件只覆盖品牌层：颜色、间距、首页信息卡片、导航状态和页脚。

- **A/B 级**（首页外壳、导航、登录、用户设置、关于页）：结构归 addon 模板，样式归 `*.css`。
- **C 级**（题库、题面、提交记录、提交详情）：只有 `oj.css` + `responsive.css`，
  模板一份没覆盖。所以计划里设想过、但必须动 DOM 才能做到的条目（通过率列、
  难度文字分级、状态/时间筛选下拉、"只看我的"、CE/TLE/MLE 逐状态配色）本轮不做，
  逐条原因见 `test/ui/README.md` 的「计划里靠 CSS 落不了地的条目」。
- **未动**（比赛、作业、训练、讨论、排名、管理后台）：继续使用 Hydro 原生外观，
  避免破坏成熟功能和升级路径。判题状态色、分页、侧栏菜单这类共享组件是全局规则，
  这些页面上线时会顺带换成品牌配色——属于预期内的一致性，不是回归。

改动前后的视觉差异用 `node test/ui/compare.js <ref>` 量，不是靠目视：
`home-*` 与 `about-student` 相对上一版应当 ≈0（本轮没碰它们），
C 级四组页面则是本轮刻意改出来的差异。
每个页面允许动什么、动到哪一步、用什么证明，记在 `docs/UI-FUNCTION-BASELINE.md`。
