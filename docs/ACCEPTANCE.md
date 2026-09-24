# SYLU OJ 验收清单

> 这份清单是**上线判定依据**，不是"建议做的优化项"。
> 每一项都必须有**可复现的证据**（命令输出、截图、链接），不接受"应该没问题"。
>
> 打勾规则：`[x]` 通过 · `[!]` 有问题待修 · `[ ]` 未做
> **只要存在 `[!]` 或关键项为 `[ ]`，就不允许上线。**

```
使用顺序：部署（docs/DEPLOY.md）→ 本清单 → 全绿 → 上线
```

---

## 0. 机器可判定项（先跑，让脚本把能判的先判掉）

```bash
bash deploy/preflight.sh                 # §5  环境体检
bash deploy/healthcheck.sh --gate        # §7  第一道 Gate
bash deploy/secret-scan.sh               # §44 密钥与 §69 危险实现扫描
bash deploy/configure.sh --verify --url https://<你的域名>/   # §65 线上页面检查
bash test/judge-suite/check-fixtures.sh  # 本地校验用例本身写对了
node test/ui/check.js                    # §8 §9 §12 前端红线：模板覆盖范围、选择器债务、品牌归属、比赛入口与赛前数据
node test/ui/render.js --all && node test/ui/shot.js --widths 1440,390   # 出图，横向溢出即 fail
```

| 命令 | 期望 | 实际 | 结论 |
| --- | --- | --- | --- |
| `preflight.sh` | 无失败项，生成 `preflight.ok` | | |
| `healthcheck.sh --gate` | 退出码 0 | | |
| `secret-scan.sh` | 退出码 0，无高危 | | |
| `configure.sh --verify` | 无 FAIL | | |
| `check-fixtures.sh` | 全绿 | | |
| `test/ui/check.js` | 退出码 0（离线渲染，不需要起服务） | | |
| `test/ui/shot.js` | 退出码 0，即各断点均无横向溢出 | | |

前端改造的逐项对照（页面 / 路由 / 权限 / 主要功能 / 状态 / 要求）在
`docs/UI-FUNCTION-BASELINE.md`；沙箱怎么用、以及哪些计划条目靠 CSS 落不了地，
在 `test/ui/README.md`。这两份与上面的命令一起构成前端验收的证据链，缺一份就等于该项没有证据。

> 脚本判不了的（人脑才知道对不对的），在下面各章逐项人工过。

---

## A. 功能验收（计划 §58–§60 验收域）

全部走 **Hydro 原生功能**。任何一项"自己写了一套"都算不通过（§1.1）。

### A1 用户与权限

- [ ] 游客可以浏览首页、题库列表、题目详情（不需要登录）
- [ ] 游客**不能**提交代码（会被引导登录）
- [ ] 新用户可正常注册，注册后身份是**普通用户**
- [ ] 前端**无法**通过改参数把自己变成管理员/教师
      （证据：改 `role=admin` / `isAdmin=true` 之类参数后，权限无变化）
- [ ] 管理员可登录后台并访问系统设置
- [ ] 教师权限由管理员在控制面板授予（不是靠前端）
- [ ] 存在一个专用 `system-admin` 维护账号，且**不使用弱口令**，也**不与学生账号共用**（§8）

### A2 题目与测试数据

- [ ] 能创建题目（标题 / 题面 / 输入输出说明 / 样例 / 数据范围）
- [ ] 能上传测试点，题目详情里能看到测试点数量与配置
- [ ] 通过 `tools/problem-importer` 转换的题库包能**批量导入成功**
- [ ] 导入后题目数量、题面、测试点与源文件一致（抽查 ≥ 3 道）
- [ ] 时间 / 内存限制按题目独立生效（抽 2 道改限制验证）

### A3 提交与判题

- [ ] 提交代码能进入评测队列，状态能看到变化（Pending → Judging → 结束）
- [ ] 提交记录能按用户 / 题目筛选
- [ ] 源码可查看（或按设置隐藏），不会串号看到别人的代码
- [ ] 判题结果与 `test/` 里的预期一致（详见 B 章）

### A4 作业与比赛

- [ ] 能创建作业，把题目加进去，能看到作业内题目
- [ ] 学生提交后作业里能看到自己的成绩 / 通过状态
- [ ] 能创建比赛，比赛题目在学生视角正常显示
- [ ] 比赛期间榜单正常刷新；比赛结束后榜单冻结 / 排名正确
- [ ] 未开赛比赛：侧栏入口按上游规则分叉（沙箱 `checkContestGates` 已断言，这里查真机）。
      注意**这一项不是安全断言**：未开赛且未报名时两个入口都不出现，但**已报名的学生会看到题目列表入口**
      （`contest_sidebar.html:44` 的 else 分支只看 `tsdoc.attend`，不看 `beginAt`）——
      那是"点进去会被后端拦"的 UX 死路，不是数据泄露。真正的安全断言是下面两条：拿不到题面/榜单数据。
- [ ] 未开赛比赛直接敲 `/contest/:tid/problems`、`/scoreboard` 被后端拦：
      预期 `ContestNotLiveError` / `ContestNotAttendedError`（`ContestScoreboardHandler` 重跑
      `canShowScoreboard` 并查 `isNotStarted`）。**后端源码闸门：已确认（5.0.7）；真实部署链路：仍需真机 smoke test**
- [ ] 未开赛比赛的详情页 HTML 里不应出现赛前题号与私有附件名。
      判据：`curl -s <详情页> | grep -o '"pids":\[[^]]*\]'` 应为空。
      沙箱 `checkContestDataLeak`（HARD）已实测脱敏后的 `window.UiContextNew.tdoc`
      只剩 `docId / title / rule / beginAt / endAt / duration` 六个字段，
      `contest-upcoming-*` 与 `homework-upcoming-student` 三个场景都不含 `pids`、`privateFiles`、`_code`，
      且进行中的 `contest-live-student` 仍带非空 `pids`（防止"一律清空"式的假通过）。
      实现是最小 Addon 模板覆盖 + `checkOverrideDrift` 漂移闸门，
      链路见 `docs/UI-FUNCTION-BASELINE.md`「未开赛的数据层」一节。
      **沙箱已验证 ≠ 真机已验证**：本项在下面的 curl 于真实部署跑过之前不勾选。

### A5 讨论与其它

- [ ] 讨论区能发帖、回帖
- [ ] 管理员能删除违规帖
- [ ] 「关于本站」入口可打开（启用 `sylu-brand` 插件时）

### A6 管理员后台

- [ ] 能看到用户列表、题目列表、提交记录、系统设置
- [ ] 能封禁 / 解封用户
- [ ] 系统设置改动**立即生效**（改 `server.name` 后刷新首页应变化）

---

## B. 语言与判题验收（§14 §15）

### B1 语言矩阵（§14）

**不能只看下拉框里有没有名字** —— 必须实际跑通。

| 语言 | 判定要求 | 状态 |
| --- | --- | --- |
| C | 实际提交并判题成功 | |
| C++17 | 实际提交并判题成功 | |
| Python 3 | 实际提交并判题成功 | |
| Java 17 | 实际提交并判题成功（如本版本启用） | |

- [ ] 四种（或实际启用的）语言**都真的跑过一遍**，且结果正确
- [ ] 未启用的语言在下拉框里不出现，或明确标注不可用

### B2 SYS001 判题结果对照（§15）

在题库里导入 `test/judge-suite/SYS001-AB/`（或用 `build.sh` 打成的包），
然后逐条提交 `submissions/` 下的代码，结果必须**逐一吻合**：

| 提交文件 | 语言 | 预期结果 | 实际结果 | 通过 |
| --- | --- | --- | --- | --- |
| `ac.cpp` | C++17 | Accepted | | |
| `wa.cpp` | C++17 | Wrong Answer | | |
| `ce.cpp` | C++17 | Compile Error | | |
| `re.cpp` | C++17 | Runtime Error | | |
| `tle.cpp` | C++17 | Time Limit Exceeded | | |
| `mle.cpp` | C++17 | 当前内嵌 Sandbox 实际为 Runtime Error | 已实测；不能作为 MLE 证据 | |
| `ole.cpp` | C++17 | Output Limit Exceeded | | |
| `ac.py` | Python 3 | Accepted | | |
| `wa.py` | Python 3 | Wrong Answer | | |
| `re.py` | Python 3 | Runtime Error | | |

- [ ] 全部吻合（或差异已记录并确认属于版本行为差异）

> 当前内嵌 Sandbox 中，`mle.cpp` 实测为 Runtime Error，`ole.cpp` 实测为 Memory Exceeded；这两个结果不能证明 MLE/OLE 分类已通过。需要独立评测机或明确支持对应资源状态的 Sandbox 后再补验。
> `ole.cpp` 在部分版本会被判 **TLE** 而不是 OLE —— 这属于 Hydro 的行为差异。
> **如实记录实际结果**，不要为了"看起来一致"去改判题逻辑。

### B3 判题稳定性

- [ ] 连续提交同一份 AC 代码 5 次，5 次都是 Accepted
- [ ] 同时提交 3 份 TLE 代码，评测机不卡死、其它提交仍能正常判
- [ ] 判题机重启后，队列里的提交能继续被处理
      （**内嵌评测机形态**：`pm2 restart hydrooj hydro-sandbox`；
      独立评测机形态才是 `pm2 restart hydrojudge`。本机是前者，见 DEPLOY.md §6.7）

---

## C. 沙箱安全验收（§16）—— **红线**

用 `test/sandbox-suite/` 里的用例逐个提交：

| 用例 | 期望 | 实际 | 通过 |
| --- | --- | --- | --- |
| `infinite_loop.cpp` | 判 TLE，评测机不被拖死 | | |
| `memory_alloc.cpp` | 判 MLE，评测机内存不被拖垮 | | |
| `fork_test.cpp` | 子进程数受沙箱限制 | | |
| `network_test.py` | 连接外网、本机 MongoDB、Hydro 端口**全部被拦** | | |
| `filesystem_test.cpp` | 读不到 `/etc/shadow`、`/root/.ssh/*`、`~/.hydro/config.json`、`/data/file` | | |
| `output_flood.cpp` | 判 OLE，不会写满磁盘 | | |

> ### 🚨 红线
> **只要 `filesystem_test` 或 `network_test` 有任何一项成功，Judge 一律不得上线。**
> 这不是"建议优化"，是上线门槛（§16）。
> 沙箱隔离由 `~/.hydro/mount.yaml` + go-judge 提供，出问题先查这里。

---

## D. 安全与合规验收（§41 §42 §44 §69 §30 §31）

### D1 网络与传输

- [ ] 生产入口是 **HTTPS**，HTTP 自动跳转 HTTPS（§41）
- [ ] 证书有效，且剩余有效期 > 14 天（`healthcheck.sh` 会检查）
- [ ] **MongoDB 只监听 `127.0.0.1`**（§42）—— `healthcheck.sh` 会机器判定
- [ ] 8888 / 5050 / 2019 / 27017 **均未对公网开放**（外部 `nmap` 或云安全组核对）
- [ ] 安全组只放行必要端口（80/443，必要时 SSH 限制来源 IP）

### D2 凭据与密钥

- [ ] `deploy/secret-scan.sh` 无高危项（§44）
- [ ] 没有密钥 / 口令 / 私钥被提交进仓库
- [ ] `~/.hydro/config.json` 权限为 `600`（官方写出来是 `644`，**要手动改**）
- [ ] `~/.hydro` 目录权限为 `700`
- [ ] 如果是**独立/远端评测机**部署：`~/.hydro/judge.yaml` 权限 `600`、
      **默认口令 `examplepassword` 已修改**、`server_url` 已改成自己的域名
      （不是 `https://hydro.ac/`）
- [ ] 如果是**内嵌评测机**部署（官方 `setup.sh` 默认，**本机即此形态**）：
      `judge.yaml` 不存在属正常，**改判**——确认沙箱端口只在本机监听：
      ```bash
      ss -ltnp | grep 5050     # 必须只有 127.0.0.1 / ::1，不能有 0.0.0.0
      ```
      （原因见 DEPLOY.md §6.7：`sandbox_host` 是明文 HTTP 且无认证，暴露即等于 RCE）
- [ ] 数据库用的是独立账号 + 强口令（不是 root 空口令）
- [ ] 没有**多余的超级管理员**：除专用维护号外，不应有 `priv = -1` 的用户
      （只读查一下；上游 `@hydrooj/a11y` 会把 **uid 2 自动提成超管**，见 DEPLOY.md §6.8）
      ```bash
      URI=$(node -p 'JSON.parse(require("fs").readFileSync(process.env.HOME+"/.hydro/config.json","utf8")).uri')
      mongosh "$URI" --quiet --eval 'db.user.find({},{_id:1,uname:1,priv:1}).toArray().forEach(u=>print(JSON.stringify(u)))'
      # priv = -1 才是超级管理员；priv = 0 是已停用
      ```

### D3 禁止实现复核（§69）

- [ ] 没有自研评测逻辑（提交一律进 Hydro 原生评测队列）
- [ ] 没有用 `child_process` / `eval` 执行用户提交的代码
- [ ] 没有绕过 Hydro 直接读写数据库的旁路代码（§56）
- [ ] `legacy-server/`（旧 Express 后端）**没有**在服务器上运行
      （证据：`ss -ltnp` 里没有旧服务端口；pm2 列表里没有它）

### D4 品牌与版权合规（§30 §31 §40）

- [ ] 站点名称显示为 **SYLU OJ**
- [ ] 页面明确声明**非学校官方信息系统**（学生维护）
- [ ] 页脚 **`Powered by Hydro` 保留完好**（上游许可要求，不得删除）
- [ ] 仓库 `LICENSES/README.md` 说明了自有代码（MIT）与 Hydro（AGPL-3.0）的关系
- [ ] 若对外分发 / 提供网络服务，已确认 AGPL-3.0 的源码提供义务得到满足
- [ ] 页面上没有使用学校官方徽标造成"官方系统"的误认

---

## E. 备份与恢复验收（§45 §46）

### E1 备份

- [ ] `bash deploy/backup.sh` 能成功产出 zip，且 `unzip -tq` 校验通过
- [ ] 备份包含数据库 dump + `/data/file`（+ 插件，使用 `--withAddons`）
- [ ] 已配置定时任务（每日至少一次）
- [ ] 保留策略生效：7 份每日 + 4 份每周
- [ ] **至少一份异地副本**（restic 推到异地/对象存储）（§45）
- [ ] 磁盘剩余空间充足（`healthcheck.sh` 检查；高危线 10%）

### E2 恢复演练（§46，必做）

- [ ] `bash deploy/restore-check.sh` 能跑通（恢复到临时库、核对、清理）
- [ ] 完整演练一次：从备份恢复 → 启动 → 登录 → 打开题目 → 查看提交记录 → **全部成功**
- [ ] 记录本次演练时间与结果：`____________`

> **备份命令退出 0 ≠ 备份可用。** 没有演练过的备份，不算备份。

### E3 恢复后核对（已知上游坑）

- [ ] 核对 `~/.hydro/addon.json` —— `--withAddons` 恢复可能因命名不一致而漏掉插件
- [ ] 若有插件缺失，按 `deploy/configure.sh --install-addon` 重新添加

---

## F. 升级与回滚验收（§47 §48 §49）

- [ ] `bash deploy/update.sh --dry-run` 能正常输出计划，不做任何修改
- [ ] 升级前**强制备份**生效（未备份时脚本会拦截）
- [ ] 升级后脚本正确判定「是否发生数据库迁移」（`db.ver` 对比）
- [ ] `bash deploy/rollback.sh --list` 能列出回滚点
- [ ] 演练一次：`rollback.sh --to-previous`（或在测试环境演练）能回到旧版本
- [ ] 团队知道：**一旦 `db.ver` 变大，只能靠备份整体恢复，不能只回退代码**（详见 `docs/DEPLOY.md` §5.5）
- [ ] 若有核心补丁，位于 `deploy/patches/`，且升级后能自动重新施加

---

## G. 内容质量验收（§65）

- [ ] 首页无占位文本（`foo` / `example.com` / `TODO` / `lorem`）
- [ ] 首页**无写死的假统计数字**（如"注册用户 3 万"）—— 未接真实数据就删掉（§29 §65）
- [ ] 所有关键路由可达，**无死链接**（404）：
      `/p` `/ranking` `/contest` `/homework` `/user/register` `/user/login`
- [ ] 「关于本站」内容完整：使用须知 / 判题环境 / 反馈方式 / 隐私说明 / 非官方声明
- [ ] 页脚 / 关于页明确提示：**请勿上传隐私数据、请勿提交恶意代码**
- [ ] 题面中无错别字、无未替换的模板变量
- [ ] 联系 / 反馈渠道真实可用

---

## H. 运维与交接（计划 §60–§64 验收域）

- [ ] `docs/DEPLOY.md` 与本机实际环境一致（版本记录表已填写）
- [ ] 日志可查：`pm2 logs hydrooj` / `pm2 logs hydro-sandbox`（以及 `caddy` / `mongodb`）均正常输出
- [ ] 已配置日志轮转（`pm2-logrotate`，官方安装已装）
- [ ] `bash deploy/healthcheck.sh` 已接入定时任务或监控，异常有人收到
- [ ] 已指定至少一名运维负责人，并完成一次交接讲解
- [ ] 已备份关键凭据（数据库口令、评测机口令、restic 口令）到**安全离线**位置
      —— **不要**放在仓库里
- [ ] 已明确：出故障时的联系人与处理时限
- [ ] 团队知道「回滚优先于硬修」：验收不过先回滚，再慢慢查（§49）

---

## I. 上线判定（§72 Go-Live Definition）

> 满足以下**全部**条件，才可对外宣布上线。

### I1 硬性门槛（缺一不可）

| # | 门槛 | 依据 | 由谁确认 |
| --- | --- | --- | --- |
| 1 | 第一道 Gate 全过（管理员登录 + 普通用户注册 + 登录） | §7 | ✅ 2026-09-20 实测通过 |
| 2 | `healthcheck.sh --gate` 退出码 0 | §7 §51 | |
| 3 | 语言矩阵全部实测通过（C / C++17 / Python 3 / Java 17） | §14 | |
| 4 | SYS001 判题结果表**全部吻合** | §15 | |
| 5 | **沙箱红线**：`network_test` 与 `filesystem_test` 全部被拦 | §16 | |
| 6 | 生产走 HTTPS，证书有效 | §41 | |
| 7 | MongoDB 只监听 127.0.0.1，且未对公网开放 | §42 | ✅ 2026-09-20 实测通过 |
| 8 | `secret-scan.sh` 无高危 | §44 | ✅ 2026-09-20 实测通过 |
| 8b | **按评测形态核对默认口令**：独立评测机→`judge.yaml` 的 `examplepassword` 已改；内嵌评测机→无该文件，改为核对沙箱端口未暴露（DEPLOY.md §6.7） | §8 §16 | ✅ 内嵌形态，沙箱仅听 127.0.0.1 |
| 8c | 没有多余的超管账号（上游会把 uid 2 自动提权，DEPLOY.md §6.8） | §8 | ✅ uid 3 为唯一超管 |
| 9 | 备份可用 + **已完成一次真实恢复演练** | §45 §46 | |
| 10 | 回滚路径已验证（`rollback.sh --list` 可用；知道迁移后不能只回代码） | §49 | |
| 11 | 无 §69 禁止实现 | §69 | |
| 12 | 无假数据、无死链接、无占位文本 | §65 | |
| 13 | 页脚保留 `Powered by Hydro`；页面声明非官方 | §31 §30 | ✅ 2026-09-20 实测通过 |

> **当前状态：允许 IP 内测，不允许公网生产上线。**
> 已达成：Hydro 装好、品牌落地、IP 首页与关键路由可达、题库导入、C++/Python 判题、WA/TLE、MongoDB/沙箱端口隔离、网络与文件访问探针验证。
> 仍缺：生产域名与受信任 HTTPS 证书、异地备份副本、完整人工恢复启动演练、教师作业/比赛链路、Java 等运行时以及 MLE/OLE/RE/CE 全量人工判题矩阵。
> 逐项状态见 `docs/DEPLOY.md` §8。

### I2 上线判定结论

```
□ 允许上线
□ 有条件上线（列出遗留项、责任人、期限、风险）
□ 不允许上线（列出阻断项）
```

遗留项与整改计划：

| # | 遗留项 | 风险 | 责任人 | 期限 |
| --- | --- | --- | --- | --- |
| | | | | |
| | | | | |

### I3 签署

| 角色 | 姓名 | 结论 | 日期 |
| --- | --- | --- | --- |
| 技术负责人 | | | |
| 运维负责人 | | | |
| 课程/业务负责人 | | | |

---

## 附：一句话记住三条底线

1. **沙箱拦不住，一律不上线**（§16）。
2. **备份没演练过，等于没有备份**（§46）。
3. **验收不过先回滚，别硬修**；`db.ver` 一旦变大，只能整体恢复（§49）。
