# SYLU OJ 上线清单（Launch Checklist）

> 目标：把现在这个「IP 内测」状态推到**能对外发链接**。
> 判定依据是 [`docs/ACCEPTANCE.md`](./ACCEPTANCE.md)（当前 **0/94 勾选**）；本清单是它的**执行版**——每项都写了命令和通过标准。
>
> 状态基线（2026-09-25 实测）：站点 `http://101.42.27.44/` 在线且响应 65–130 ms；公网只开 **22 / 80**，**443 关闭**；判题机在线（`/status`，Debian 12，内存 **3.5 GiB / 3.7 GiB**，Handled requests 0）；题库 **2 题**；品牌合规项齐全。

---

## 0. 三条轨道（先看这张图）

| 轨道 | 内容 | 谁做 | 耗时 | 是否关键路径 |
|---|---|---|---|---|
| **A 备案** | 域名 → 实名 → 备案 → 解析 | 服务器账号持有人 | **2–4 周** | ✅ **决定上线日** |
| **B 技术** | 沙箱红线 → 判题矩阵 → 题库 → HTTPS → 备份演练 | 技术 | 3–5 天 | 可与 A 并行 |
| **C 验收** | 门禁 7 条 → 93 项人工验收 → 证据落档 | 技术 | 1–2 天 | 必须在 A/B 之后 |

**结论**：A 一开始就启动，B 并行做，C 收尾。最快约 **3 周**后可以对外。

---

## 1. 先决条件（不解决就别往下做）

- [ ] **确认那台腾讯云服务器（`101.42.27.44`）在谁的账号下**——备案主体、域名实名、证书、续费全看这个
- [ ] 拿到三样权限：服务器 root / 云控制台 / 域名注册商
- [ ] **决定生产路径**：裸机（已真机跑通判题）还是容器（CI 验过能启动，**判题与沙箱未验**）。建议生产用裸机，容器作 CI 与备用
- [ ] **加 swap 或升配**：`/status` 显示内存 3.5 GiB / 3.7 GiB，几乎没有余量；导入题库或开比赛可能 OOM 整站
  ```bash
  free -m                                   # 先看现状
  fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
  ```

---

## 2. A 轨道 · 备案（今天启动，最慢）

- [ ] **买域名**（`.cn` / `.com`；注册商须在工信部白名单，建议就在腾讯云买）
- [ ] **域名实名认证** → **等满 3 个自然日**（这是提交备案的硬前提）
- [ ] 准备主体材料
  - 单位备案（**推荐**，学校项目）：学校授权 + 组织机构代码证
  - 个人备案：身份证，可能还要学籍/居住证明；**讨论区这类交互式内容可能被管局要求整改**
- [ ] 腾讯云备案控制台提交（服务器必须在本账号下）
- [ ] 管局审核（法定 20 个工作日以内，通常 5–15 天）
- [ ] 备案通过后：
  - [ ] **页脚展示备案号**并链接 `https://beian.miit.gov.cn/`（合规硬要求）
  - [ ] DNS 解析 `A 记录 → 101.42.27.44`
  - [ ] `dig +short <域名>` 确认解析生效

---

## 3. B 轨道 · 技术（3–5 天，可与备案并行）

### 3.1 沙箱红线（§16）——**这是红线，不过就不能上线**

- [ ] 按 [`test/sandbox-suite/README.md`](../test/sandbox-suite/README.md) 逐个提交 6 个用例并把输出记下来
- [ ] 把结果填进 `ACCEPTANCE.md` C 章的表格（用例 / 期望 / 实际 / 通过）
- [ ] **判定**：`network_test` 或 `filesystem_test` 只要有任一项成功（`CONNECTED` / `READ`）→ **Judge 不得上线**
- [ ] ⚠️ 如果最后决定用容器路径上线，**6 个用例必须在容器栈上重跑**（容器不用 `mount.yaml`，裸机结论不能套用）

### 3.2 语言矩阵与判题结果（§14 / §15）

- [ ] 用 `test/judge-suite/SYS001-AB/submissions/` 逐个提交，核对下表（`test/README.md` 有完整期望表）：

| 提交 | 语言 | 期望 | 现在验过没 |
|---|---|---|---|
| `ac.cpp` | C++17 | Accepted | ✅ 已验 |
| `wa.cpp` / `ce.cpp` / `re.cpp` / `tle.cpp` | C++17 | WA / CE / RE / TLE | ✅ 已验 |
| `ac.py` | Python 3 | Accepted | ✅ 已验 |
| `wa.py` / `re.py` | Python 3 | WA / RE | ❌ **未验** |
| `mle.cpp` / `ole.cpp` | C++17 | MLE / OLE | ⚠️ 内嵌沙箱里实际表现为 RE / TLE，**如实记录** |

- [ ] Java 链路（下一项，语言下拉里出现名字 ≠ 能跑）

### 3.3 正式题库导入（§18–§25）

- [ ] 用 `tools/problem-importer` 把正式题库转成 Hydro 包
  ```bash
  node tools/problem-importer/bin/sylu-import.mjs preflight <题库.zip>
  node tools/problem-importer/bin/sylu-import.mjs convert   <题库.zip> -o /tmp/sylu-problems.zip
  node tools/problem-importer/bin/sylu-import.mjs verify    /tmp/sylu-problems.zip
  ```
- [ ] 后台「题库 → Import From Hydro」导入，**先保持隐藏**
- [ ] 抽查 ≥3 道：题面 / 测试点数 / 时空限制与源文件一致
- [ ] 关闭内部测试题（SYS001）的公开可见

### 3.4 域名与 HTTPS（§41）

- [ ] 云安全组**放行 443**（现在只有 22/80）
- [ ] `~/.hydro/Caddyfile` 的站点地址改成域名 → `caddy reload`（Caddy 自动申请并续期证书）
- [ ] `server.url` 改成 `https://<域名>/` —— **必须以 `/` 结尾**，否则跳转/邮件/榜单链接全错
  ```bash
  hydrooj cli system set server.url https://<域名>/
  ```
- [ ] 验证：
  ```bash
  curl -fsS -o /dev/null -w '%{http_code}\n' https://<域名>/     # 期望 200
  echo | openssl s_client -connect <域名>:443 -servername <域名> 2>/dev/null | openssl x509 -noout -dates
  ```
- [ ] 页面上没有混合内容告警（浏览器地址栏无"不安全"提示）
- [ ] 考虑开 HSTS

### 3.5 备份与恢复（§45 / §46）

- [ ] `bash deploy/backup.sh` 本地备份成功，产物含 `data.zip` + `versions.env` + `manifest.txt`
- [ ] **配置异地副本**（`restic` 或对象存储）——现在只做了本地
- [ ] `bash deploy/restore-check.sh --file <备份.zip>` 完整演练（不只是机械校验）
- [ ] 记下 RTO（从零恢复到能判题要多久），写进 `DEPLOY.md`

### 3.6 升级与回滚演练（§47 / §49）——谨慎，单向操作

- [ ] **先手动备份**
- [ ] `bash deploy/update.sh` 跑一次，记录输出
- [ ] `bash deploy/rollback.sh` 验证能回退
- [ ] 把两个脚本从"未验证"改成"已演练 + 日期"

### 3.7 前端交互人工回归（沙箱证明不了"点得动"）

- [ ] 题库筛选 / 排序 / 分页，点进题目详情
- [ ] 提交代码 → 状态从 Pending 变到结束
- [ ] 比赛详情页：**未开赛时直链不能泄露题目**（这是签核例外，重点）
- [ ] 榜单页刷新、作业日历视图、讨论区发帖/回复
- [ ] 移动端宽度（真机浏览器，不用命令行出图）

### 3.8 上线前安全加固

- [ ] **注册不能敞开**：现在 `smtp.verify=false`、无验证码、限流较弱 → 配 SMTP 并开邮箱验证，或加强限流
- [ ] 确认 `~/.hydro/config.json` 权限 `600`；`bash deploy/secret-scan.sh` 结果干净
- [ ] 管理员专用账号 + 强密码；**停用/删除测试账号**（第一个注册的账号会自动拿到全部权限）
- [ ] 确认沙箱端口对外不可达（`27017` / `5050` / `2019` / `8888`）
- [ ] `/manage` 品牌化（可选）

---

## 4. C 轨道 · 验收落档（1–2 天）

- [ ] 跑 `ACCEPTANCE.md` §0 的 7 条门禁，把「实际 / 结论」两列填上：

```bash
bash deploy/preflight.sh
bash deploy/healthcheck.sh --gate
bash deploy/secret-scan.sh
bash deploy/configure.sh --verify --url https://<域名>/
bash test/judge-suite/check-fixtures.sh
node test/ui/check.js
node test/ui/render.js --all && node test/ui/shot.js --widths 1440,390
```

- [ ] 逐条勾完 **93 项人工验收**（A 功能 / B 判题 / C 沙箱红线 / D 安全合规 / E 备份恢复）
- [ ] 更新 `docs/DEPLOY.md` §8.1 / §8.2 的真实验证状态（含 Docker 与 CI 的结论）
- [ ] 填 `docs/DEPLOY.md` §4 的**版本记录表**（hydrooj / ui-default / hydrojudge / go-judge / Caddy / MongoDB）
- [ ] 把容器路径并进门禁：`preflight.sh` / `healthcheck.sh` / `ACCEPTANCE.md` 尚未覆盖 `deploy/docker/*`

---

## 5. 治理（10 分钟，只有仓库 owner 能做）

- [ ] **关闭 PR #1**（`feat: add website backend`，会把仓库文件全部删除，+0/−10928）
- [ ] **给 `main` 开分支保护**：Require a pull request before merging + 禁止 force push
- [ ] 清理 `.github/workflows/ci.yml` 里 `push.branches` 残留的 `ci-docker`

---

## 6. 明确"不做也能上线"的项（避免无限拖延）

- 容器路径全链路验收（除非生产改用容器）
- `/manage` 品牌化
- 前端 P1：竞赛榜单页 handler 复刻、训练/讨论详情页、`/home/*` 用户中心
- 跨机 / 独立评测机（`judge.yaml`）
- macOS 上跑不通的两个回归（`find -printf` / `mapfile`）——CI 上是绿的

---

## 7. 上线判定（全绿才发链接）

```
[ ] ACCEPTANCE.md 无 [!]，且关键项全部 [x]
[ ] C 章红线（network / filesystem）逐条通过，证据已落档
[ ] https://<域名>/ 返回 200，证书有效，无混合内容
[ ] 备份 + 异地副本 + 恢复演练各跑过一次
[ ] 注册不再敞开（邮箱验证或强限流）
[ ] 备案号已在页脚展示
[ ] 版本记录表已填写
```

任何一条不满足 → **仍属内测，不发公网链接**。
