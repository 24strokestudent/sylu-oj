# SYLU OJ 部署文档

> 面向：负责把 SYLU OJ 装到服务器上、并长期维护它的人。
> 目标：**照着做能装出一套能判题、能备份、能回滚的 OJ**，而不是一个只能打开首页的壳。

---

## 0. 先读这一页：Hydro 到底是怎么装的

这一点必须先讲清楚，因为后面所有运维动作都由它决定。

Hydro 官方安装脚本 `https://hydro.ac/setup.sh`（实测版本 **v3.0.1**）**不是**简单的
`npm install`。它做的事是：

| 组件 | 由谁提供 | 说明 |
| --- | --- | --- |
| Node.js / yarn / pm2 / gcc / python3 / caddy / mongodb / 各类命令行工具 | **Nix**（装在 `~/.nix-profile`） | 脚本先用 `nix.sh` 装 Nix，再 `nix-env -iA` 装这些工具 |
| **Hydro 本体** | **yarn global** | `yarn global add hydrooj @hydrooj/ui-default @hydrooj/hydrojudge @hydrooj/fps-importer @hydrooj/a11y` |
| 评测沙箱 | **go-judge**（Nix 安装后软链为 `hydro-sandbox`） | `ln -sf $(which go-judge) /usr/local/bin/hydro-sandbox` |
| 进程托管 | **pm2** | Holistic化托管 `hydrooj` / `hydrojudge` / `hydro-sandbox` / `mongodb` / `caddy` |
| 反向代理 + HTTPS | **Caddy** | 配置在 `~/.hydro/Caddyfile`，改域名后自动签发证书 |

**由此推出三条硬规则：**

1. **升级不能只升 `hydrooj`**，必须把上面那组包一起升，否则前后端版本错配。
2. **不能删 `~/.nix-profile`**，也不要试图把 Hydro 改成全局 npm 安装 —— 那会和现有工具链打架。
3. **重启要做在 pm2 上**（`pm2 restart hydrooj`），不是 `systemctl`。

---

## 1. 组件与端口一览

| 端口 | 组件 | 是否对外 | 说明 |
| --- | --- | --- | --- |
| 80 / 443 | Caddy | **是** | 唯一对外入口，负责静态文件 + 反代 + HTTPS |
| 8888 | hydrooj（Web） | 否 | 只监听 127.0.0.1，由 Caddy 反代 |
| 5050 | hydro-sandbox（go-judge） | 否 | 只监听 localhost，评测沙箱 |
| 2019 | Caddy Admin API | 否 | Caddy 管理端口 |
| 27017 | MongoDB | **绝对不可对外** | §42 硬性要求，`deploy/healthcheck.sh` 会机器判定 |

> 独立评测机（judge）另需能访问主站；若跨机部署，请只放行必要端口，不要整段开放内网。

### 目录与配置文件

| 路径 | 内容 | 备注 |
| --- | --- | --- |
| `~/.hydro/config.json` | 数据库连接串（含口令） | 官方写出来是 `644`，**要手动 `chmod 600`** |
| `~/.hydro/judge.yaml` | 评测机配置 | **官方 setup.sh v3.0.1 并不生成这个文件**（见 §6.7）；本机实测不存在 |
| `~/.hydro/Caddyfile` | 反代与域名/HTTPS | 改域名后 `caddy reload` |
| `~/.hydro/mount.yaml` | 评测沙箱挂载与资源限制 | §16 沙箱隔离的核心；**本机评测就是靠它工作的** |
| `~/.hydro/addon.json` | 插件清单 | 官方默认写入 4 个 `@hydrooj/*` 包 |
| `~/.hydro/static` | 前端静态资源 | Caddy 直接从这里读 |
| `/data/db`、`/data/file` | 数据库文件、用户上传文件 | 备份要覆盖 |
| `/data/access.log` | 访问日志 | Caddy 轮转，1GB / 72h |

---

## 2. 环境要求

| 项 | 要求 | 原因 |
| --- | --- | --- |
| 操作系统 | **Debian 12（推荐，纯净系统）** | 官方明确不支持 CentOS/RHEL 系（内核过低）；宝塔面板会破坏环境 |
| 架构 | `x86_64` 或 `arm64` | 官方脚本只支持这两种 |
| CPU | 支持 `avx` 指令集 | 不支持会退化到 mongodb 4.4 并明显变慢 |
| 内存 | ≥ 4 GB（评测并发越大越多） | 沙箱 + MongoDB 缓存 |
| 磁盘 | ≥ 40 GB SSD | 题面、测试点、数据库、备份 |
| Swap | 建议 ≥ 2 GB | 无 Swap 时 OOM 会直接杀进程 |
| 内核 | ≥ 4.4 | 沙箱（go-judge）依赖 namespace/cgroup |
| 权限 | **root**（Hydro 安装与运维全程 root） | 官方脚本要求 |

> 在 PVE / VirtualBox 等虚拟机里装，请把 CPU 类型设为 **Host**，否则可能没有 `avx`。

---

## 3. 部署步骤

> 每一步都有对应脚本。**顺序不要跳**，尤其不要把 UI 改造提前到第 4 步之前。

### 第 0 步 · 拉代码到服务器

```bash
cd /root
git clone <你的仓库地址> sylu-oj
cd sylu-oj
git checkout hydro-integration      # 本次改造所在分支
```

### 第 1 步 · 安装前体检（§5）

```bash
bash deploy/preflight.sh
```

覆盖 15 项：系统发行版、架构与 AVX、CPU 核数、内存、Swap、磁盘、端口占用
（80/443/2019/5050/8888/27017）、已存在的冲突服务、Node 是否存在、时间同步与 DNS、
软件源、备份工具、编译器。

**只有全部通过、并生成 `${SYLU_STATE_DIR}/preflight.ok` 之后，才允许进入下一步。**
这是故意设的闸门：在没确认环境前就装，出了问题很难判断是环境还是软件。

### 第 2 步 · 安装 Hydro（§6）

```bash
bash deploy/install-hydro.sh
```

脚本会：下载并校验官方 `setup.sh` → 以 `LANG=zh` 执行 → 安装后自检
（`hydrooj` CLI、服务状态、HTTP 200、MongoDB ping、MongoDB 监听地址）→ 打印版本表。

**把这台机器的实际版本号填进下面的《版本记录表》**，升级和回滚都要靠它对照。

### 第 3 步 · 第一道 Gate（§7，人工）

```bash
bash deploy/healthcheck.sh --gate
```

脚本只能判机器项（Web / 服务 / 数据库 / 监听地址）。下面三项**必须人工做**：

- [ ] 管理员登录
- [ ] 普通用户注册
- [ ] 普通用户登录

**这三项没通过之前，禁止开始任何 UI 改造。**

#### 已实测通过（2026-09-20，主机 101.42.27.44）

Gate 用真实 HTTP 请求跑通（`curl` 打 `http://127.0.0.1:8888`），结论如下：

| 检查项 | 结果 | 证据 |
| --- | --- | --- |
| 注册链路（§10） | 通过 | `POST /register {mail}` → 302 `/register/<code>`；再 `POST /register/<code> {password,verifyPassword,uname}` → 302 `/home/settings/preference` |
| 登录链路 | 通过 | `POST /login {uname,password,rememberme}` → 302 `/` |
| 管理员会话 | 通过 | 带会话访问首页：`<title>首页 - SYLU OJ</title>`，导航含 `system-admin` 与退出入口 |
| 管理面板（管理员） | 通过 | `/manage/dashboard` → 200；`/manage/config`、`/manage/setting`、`/manage/userpriv`、`/manage/script` → 302 `/user/sudo`（Hydro 的二次验密，属正常行为） |
| 管理面板（未登录） | 通过 | `/manage/config` → 302 `/login?redirect=%2Fmanage%2Fconfig` |
| 普通用户无管理权 | 通过 | `default.priv = 16842756` = `PRIV_USER_PROFILE｜PRIV_CREATE_FILE｜PRIV_SEND_MESSAGE`；**不含** `PRIV_EDIT_SYSTEM` / `PRIV_SET_PERM` / `PRIV_JUDGE` / `PRIV_REJUDGE` / `PRIV_MANAGE_ALL_DOMAIN` / `PRIV_UNLIMITED_ACCESS` |

**两个必须知道的上游行为**（都实测踩过，详见 §6.7 §6.8）：

1. **`@hydrooj/a11y` 会把 uid 2 自动提成超级管理员。**
   所以"第一个注册的用户"天然就是超管 —— 这是 Hydro 的引导机制，不是漏洞。
   结果：**别拿随便一个测试账号当第一个用户**，否则它会悄悄拿到 `PRIV_ALL(-1)`。
   本机处理方式：按 §8 建了专用的 `system-admin`（uid 3）并 `setSuperAdmin`，
   临时验证账号已用官方脚本停用：
   ```bash
   hydrooj cli user setSuperAdmin 3                      # 指定超管
   hydrooj cli script cleanUserEffect '{"uid":2}'        # 停用（priv 置 0，登录 403）
   ```

2. **注册是「两步 token」流程，测试期免邮箱验证。**
   运行 `deploy/configure.sh --test-registration --site-url http://<IP>/` 后，
   `smtp.verify=false`，第一步 POST 会**直接 302 到 `/register/<code>`**，
   不发送邮箱验证码。恢复正式验证时，再开启 `smtp.verify` 并配置 SMTP。

管理员账号：`system-admin`（uid 3）。首次部署生成的密码写在服务器
`/root/.sylu-oj/admin-credentials.txt`（权限 600，仅 root 可读）。

### 第 4 步 · 域名与 HTTPS（§41）

编辑 `~/.hydro/Caddyfile`，把默认的 `:80` 改成你的域名，然后：

```bash
cd ~/.hydro && caddy reload
```

Caddy 会自动申请并续期 Let's Encrypt 证书。注意：

- 域名要**先解析到本机**，且运营商可能拦截未备案域名；
- 安全组/防火墙放行 80 与 443；
- 生产环境**必须**走 HTTPS（§41）。

### 第 5 步 · 站点设置与品牌落地（§30–§34、§40）

```bash
bash deploy/configure.sh --install-addon
# --install-addon 会同时应用品牌设置、CSS 链接并等待 Hydro 就绪
```

这一步做两件事：**打印控制面板里要改的原生设置清单**，以及（可选）登记 `sylu-brand` 插件。

核心设置（登录管理员 → 控制面板 → 系统设置）：

| 设置项 | 值 | 注意 |
| --- | --- | --- |
| `server.name` | `SYLU OJ` | 别写"沈阳理工大学官方 OJ" |
| `server.url` | `https://<域名>/` | **必须以 `/` 结尾**，否则跳转/邮件/榜单链接全错 |
| `server.language` | `zh_CN` | |
| `ui-default.nav_logo_dark` | Logo 地址 | 原生支持，不用改模板 |
| `ui-default.footer_extra_html` | 非官方声明 | 免责声明走这里，零插件 |
| `ui-default.about` | 使用须知等 | Markdown |

> **不要删除页脚的 `Powered by Hydro`**：上游模板明确要求保留（除非购买企业授权），§31 同此。

### 第 6 步 · 评测机配置（§8、§14）

**先确认这台机器是哪种评测形态** —— 它决定你到底要不要碰 `judge.yaml`：

| 形态 | 特征 | 要配 `judge.yaml` 吗 |
| --- | --- | --- |
| **内嵌评测机**（官方 `setup.sh` 默认装法，**本机就是这种**） | pm2 里有 `hydro-sandbox`；`@hydrooj/hydrojudge` 作为 addon 跑在 hydrooj 进程内；沙箱监听 `localhost:5050` | **不需要** |
| 独立 / 远端评测机 | 单独跑 `hydrojudge` 进程；`judge.yaml` 里配 `server_url` / `uname` / `password` | 需要 |

判断依据就在 `@hydrooj/hydrojudge/src/config.ts`：

```js
let config = global.Hydro
    ? JudgeSettings({})                          // 跑在 hydrooj 进程内 → 只用默认值
    : (() => { /* 读 ~/.hydro/judge.yaml */ })();  // 独立进程 → 才读 judge.yaml
```

内嵌形态下生效的是 `JudgeSettings({})` 的默认值，关键的几项：

- `sandbox_host = http://localhost:5050` ← 正好对上 `hydro-sandbox` 的监听地址
- `disable = false`（内置评测机默认开启）
- `memoryMax = 512m`、`processLimit = 32`、`parallelism = 2`、`total_time_limit = 60`

**本机实测（2026-09-20）：**

```bash
ls ~/.hydro/judge.yaml          # → 不存在（官方 setup.sh v3.0.1 不生成这个文件）
curl -s -o /dev/null -w '%{http_code}' http://localhost:5050/version    # → 200
pm2 describe hydro-sandbox | grep 'script args'
#   -c "ulimit -s unlimited && hydro-sandbox -mount-conf /root/.hydro/mount.yaml -http-addr=localhost:5050"
```

数据库里能查到已成功的评测记录（`status:1` = Accepted，`score:100`，`lang:"cc"`），
说明「提交 → 沙箱 → 判分」整条链路是通的。

**结论：这台机器上不存在"默认口令 `examplepassword` 没改"的风险 —— 因为压根没有 judge.yaml。**
`deploy/secret-scan.sh` 里对 `examplepassword` 的检查，在纯内嵌评测机的机器上会自然报"未命中"，这是正常的。

**真正要守的安全边界是沙箱端口（§16）。**
`sandbox_host` 走的是**明文 HTTP 且不做认证** —— 谁能连上 5050，谁就能在沙箱里跑任意代码。
所以 5050 必须只听 `127.0.0.1`。本机实测：

```bash
ss -ltnp | grep 5050      # → 127.0.0.1:5050 与 [::1]:5050，没有 0.0.0.0
```

**想改内嵌评测机的参数怎么办？** 实测结论是：**没有官方设置入口**。
`@hydrooj/hydrojudge` 没有注册任何 Hydro 系统设置（`grep -rn SystemSetting` 在其源码里无结果），
`hydrooj cli system get judge.sandbox_host` 读出来也是 `undefined`。
所以别指望 `hydrooj cli system set judge.*` 能生效。真要调，只有两条路：

1. 改上游代码走 `overrideConfig`（属于 Core Patch，要按 §1.2 留 `.patch`）；
2. 把评测机拆成独立部署，那时才用 `judge.yaml`，也才有"改默认口令"这件事。

> `deploy/healthcheck.sh` 与 `deploy/secret-scan.sh` 只做只读探测，不会去写评测机配置。

### 第 7 步 · 题目导入（§18–§25）

```bash
node tools/problem-importer/bin/sylu-import.mjs preflight <题库.zip>   # 只做安全检查
node tools/problem-importer/bin/sylu-import.mjs preview   <题库.zip>   # 预览解析结果
node tools/problem-importer/bin/sylu-import.mjs convert   <题库.zip> -o out.zip  # 转成 Hydro 格式
```

生成的标准包可直接在 Hydro 题库里「导入题目」。详见 `tools/problem-importer/README.md`。

### 第 8 步 · 备份与异地副本（§45）

```bash
bash deploy/backup.sh

# 异地（必做，§45 要求至少一份异地副本）
export SYLU_RESTIC_REPO=s3:https://s3.example.com/sylu-oj
export SYLU_RESTIC_PASS="$(cat /root/.restic-pass)"
bash deploy/backup.sh --offsite
```

配置定时任务（`crontab -e`，root）：

```cron
30 3 * * * cd /root/sylu-oj && bash deploy/backup.sh >> /var/log/sylu-oj-backup.log 2>&1
```

保留策略：**7 份每日 + 4 份每周**，自动清理更旧的。

### 第 9 步 · 上线前验收（§58–§64、§72）

```bash
bash deploy/secret-scan.sh      # 密钥 / 危险实现扫描（§44 §69）
bash deploy/healthcheck.sh      # 日常巡检
bash deploy/configure.sh --verify --url https://<你的域名>/
```

然后逐项走 `docs/ACCEPTANCE.md`。**全部通过才允许上线。**

---

## 4. 版本记录表（装完请如实填写）

> 升级、回滚、排查问题时，这张表比记忆可靠。
> **`db.ver` 是升级/回滚的安全闸门**（见 §6.6 与 §5.5），必须一并记录。

**首次安装实测记录**（主机 `101.42.27.44`，记录时间 2026-09-20 19:53 +0800）：

| 项 | 版本 / 值 | 记录时间 |
| --- | --- | --- |
| 操作系统 | Debian GNU/Linux 12 (bookworm) | 2026-09-20 |
| 内核 | 6.1.0-20-amd64 | 2026-09-20 |
| 架构 | x86_64 | 2026-09-20 |
| Node.js | v24.19.0（npm 11.17.0） | 2026-09-20 |
| yarn | 1.22.22 | 2026-09-20 |
| pm2 | 6.0.14 | 2026-09-20 |
| **hydrooj** | **5.0.7** | 2026-09-20 |
| `@hydrooj/ui-default` | 4.58.5 | 2026-09-20 |
| `@hydrooj/hydrojudge` | 4.0.6 | 2026-09-20 |
| MongoDB | v7.0.28（mongosh 2.9.1） | 2026-09-20 |
| go-judge / hydro-sandbox | v1.12.3 | 2026-09-20 |
| Caddy | 2.11.4 | 2026-09-20 |
| **db.ver（数据库迁移标记）** | **97** | 2026-09-20 |
| 官方 setup.sh 版本 | v3.0.1（脚本内自报） | 2026-09-20 |

> 说明：`hydrooj`、`@hydrooj/ui-default`、`@hydrooj/hydrojudge`、`@hydrooj/fps-importer`、
> `@hydrooj/a11y` 由官方脚本**整组**安装，升级时也必须整组一起升（见 §5.4）。

自动记录版：

```bash
cat /root/.sylu-oj/versions-latest.env
```

**怎么查这些值（都别用 `hydrooj --version`）**：

```bash
# hydrooj 版本：直接读包描述文件
node -p "require('$(yarn global dir)/node_modules/hydrooj/package.json').version"

# db.ver：直连 Mongo 只读查询（最可靠）
URI="$(node -p 'JSON.parse(require("fs").readFileSync(process.env.HOME+"/.hydro/config.json","utf8")).uri')"
mongosh "$URI" --quiet --eval 'db.system.findOne({_id:"db.ver"}).value'
```

> **`hydrooj --version` 会挂死。** hydrooj CLI 没有 `--version` 选项，
> 传进去会被当作子命令解析失败，随后掉进交互式 REPL 等 stdin，
> 在脚本里表现为永久挂起（`timeout` 杀掉时退出码 124）。
> `deploy/lib/common.sh` 里的 `hydro_version()` / `hydro_pkg_version()` 已改为读 package.json。

---

## 5. 日常运维

### 5.1 健康巡检

```bash
bash deploy/healthcheck.sh            # Web / 服务 / 数据库 / 磁盘 / 内存 / 备份新鲜度
bash deploy/healthcheck.sh --gate     # 第一道 Gate
bash deploy/healthcheck.sh --upgrade  # 升级后验收
```

退出码 `0` 全通过，`1` 有失败项 —— 可直接接监控。

### 5.2 备份

```bash
bash deploy/backup.sh                 # 本地每日
bash deploy/backup.sh --offsite       # 额外推一份异地（restic）
```

备份内容由 `hydrooj backup --withAddons` 生成：MongoDB dump + `/data/file` + 插件。
备份本身包含完整性校验（`unzip -tq`）。

### 5.3 恢复演练（§46）

```bash
bash deploy/restore-check.sh
```

脚本会校验 zip、把 dump 恢复到**临时库** `hydro_restorecheck_<时间戳>`（**绝不碰生产库**）、
核对集合数、再删掉临时库。

> **备份命令退出 0 ≠ 备份可用。** 只有定期演练、并确认
> 「恢复 → 启动 → 登录 → 打开题目 → 看提交记录」都成功，才算这份备份靠谱。

### 5.4 升级（§47）

```bash
bash deploy/update.sh --dry-run       # 先看要做什么
bash deploy/update.sh                 # 备份 → 升级 → 验收
bash deploy/update.sh --to 5.0.8      # 指定版本
```

脚本流程：快照 → **强制备份** → 应用 esbuild 兼容处理 → `yarn global add` →
重新施加核心补丁 → `pm2 restart` → 等待就绪 → **判定是否发生数据库迁移** → 升级后验收。

### 5.5 回滚（§49）

```bash
bash deploy/rollback.sh --list                    # 先看有哪些回滚点
bash deploy/rollback.sh --to-previous             # 回到上一次升级前的代码版本
bash deploy/rollback.sh --from-backup <zip>       # 用备份整体恢复
```

**回滚前必须理解这件事（否则可能把站点搞成起不来）：**

Hydro 在启动时自动执行数据库迁移（`packages/hydrooj/src/service/migration.ts`），
每跑一个迁移就把版本号写进 `db.ver`，**迁移是单向的**。
旧版本代码启动时会发现 `db.ver` 比它认识的更大，于是拒绝启动：

```
You are likely trying to apply a downgrade.
This version of Hydro is not compatible with newer data version.
To prevent data corruption, the startup has been aborted.
```

因此：

- **没有发生迁移**（`db.ver` 未变）→ 可以安全地只回滚代码（`--code` / `--to-previous`）。
- **发生了迁移**（`db.ver` 变大）→ **不能只回滚代码**，必须用升级前的备份整体恢复
  （`--from-backup`）。`rollback.sh` 会自动检查这一点并阻止危险操作。

### 5.6 查看日志

```bash
pm2 logs hydrooj --lines 200
pm2 logs hydrojudge --lines 200
pm2 logs hydro-sandbox --lines 100
pm2 list
```

---

## 6. 已知的上游行为与坑（照做能少走弯）

### 6.1 `--withAddons` 恢复可能不生效（命名不一致）

Hydro 的备份与恢复对插件清单用了**两个不同的文件名**：

- `hydrooj backup --withAddons` 打包的是 `~/.hydro/addon.json`
- `hydrooj restore --withAddons` 读取的是解包目录下的 `addons.json`

两者名字不同，所以**插件配置可能没有被恢复**。
`deploy/rollback.sh --from-backup` 会在恢复后提示你人工核对：

```bash
cat ~/.hydro/addon.json
hydrooj addon list
```

### 6.2 核心补丁每次升级都会丢

按 §1.2，我们优先用「原生设置 → Addon → 模板扩展」，**尽量不打核心补丁**。
如果确实必须打，请把补丁文件放进 `deploy/patches/*.patch`，
`deploy/update.sh` 会在升级后自动重新施加（用官方 `hydrooj patch` 命令）。
升级后请务必确认补丁仍然生效。

### 6.3 `server.url` 必须以 `/` 结尾

漏了会表现为：登录后跳转异常、榜单/邮件里的链接指向错误地址。很难第一眼看出来。

### 6.4 不要用宝塔面板

官方脚本会检测到宝塔并警告「可能无法正常工作」，开发者明确声明对因此造成的数据丢失不负责。
请使用纯净 Debian 12。

### 6.5 CentOS 及其变种不支持

内核过低，沙箱跑不起来。不要尝试。

### 6.6 时区与时间同步

评测的时间限制、比赛时间都依赖系统时间。`deploy/preflight.sh` 会检查 NTP/DNS，
装完请确认 `timedatectl` 显示的是 `Asia/Shanghai` 且已同步。

### 6.7 内嵌评测机没有 `judge.yaml`（别去找默认口令）

官方 `setup.sh` 默认装出来的是**内嵌评测机**：`@hydrooj/hydrojudge` 跑在 hydrooj 进程里，
沙箱是独立的 `hydro-sandbox` 进程监听 `localhost:5050`。
这种情况下 `judge.yaml` **不会生成、也不需要**，配置直接取 `JudgeSettings({})` 的默认值。
详见 §3 第 6 步。

### 6.8 第一个注册的用户会自动变成超级管理员

上游 `@hydrooj/a11y` 插件里有这么一段（`node_modules/@hydrooj/a11y/index.ts`）：

```js
ctx.on('handler/after/UserRegisterWithCode#post', async (that) => {
    if (that.session.uid === 2) await UserModel.setSuperAdmin(2);
});
```

所以 **uid 2（第一个真实注册用户）会被自动赋予 `PRIV_ALL`（`priv = -1`）**。
这是 Hydro 的引导机制（官方欢迎文案里"用 `hydrooj cli user setSuperAdmin 2`"就是这么被自动化的），
**不是漏洞**。但要记住：

- **别拿随便一个测试账号去当"第一个用户"**，它会悄悄拿到全部权限。
- 规范做法：第一个账号就建成专用维护号（本机是 `system-admin`），
  再显式指定超管：`hydrooj cli user setSuperAdmin <uid>`。
- 想停用某个账号，用官方脚本把它降为 `priv = 0`（登录会被拒）：
  ```bash
  hydrooj cli script cleanUserEffect '{"uid":2}'
  ```
  Hydro **没有**删除用户文档的 CLI，别直接 `db.user.deleteOne()` 删 —— 会留下
  `domain.user` / `oauth` 等孤儿引用（§56：一律走官方接口）。

### 6.9 `hydrooj --version` 会把脚本挂死

hydrooj CLI **没有** `--version` 这个选项。传进去会被当成子命令解析失败，
随后掉进交互式 REPL 等 stdin，在非交互脚本里表现为**永久挂起**
（`timeout` 杀掉时退出码 `124`）。本仓库的 `deploy/install-hydro.sh` 曾经就卡在这里。

取版本号请直接读包描述文件：

```bash
node -p "require('$(yarn global dir)/node_modules/hydrooj/package.json').version"
```

**顺带一个解析坑**：`hydrooj cli` 会把日志和返回值混在同一个 stdout 流里，
而且每行日志前面还带 `"<序号> <时间>"` 前缀，例如：

```
Process 45781 running as master          ← 行首数字是 PID
Using mongodb external event bus
20 19:51:02   common [I] Locale init: …   ← 行首的 20 非常容易被误当成 db.ver
97                                        ← 这才是 system get db.ver 的真实结果
```

所以**不要**用 `grep -oE '[0-9]+' | head -1` 抠数字（会抓到 PID），
也不要 `tail -1`（会拿到日志尾巴）。`deploy/lib/common.sh` 里的做法是：
优先直连 MongoDB 只读查询，兜底才走 CLI 并用 `grep -xE '[0-9]+' | tail -1` 取最后一行纯数字。

### 6.10 测试期注册免邮箱验证（仍保留两步表单）

`/register` 不是一次 POST 就建号，而是：

1. `POST /register {mail}` → 生成 token；
   测试期使用 `deploy/configure.sh --test-registration --site-url http://<IP>/` 把 `smtp.verify` 写为 `false`，因此直接 **302 到 `/register/<code>`**，
   不发送邮箱验证码；
2. `POST /register/<code> {password, verifyPassword, uname}` → 建号并自动登录。

页面会明确提示“测试期间无需邮箱验证码”。普通 `--apply` 保留现有验证设置；恢复时用 `hydrooj cli system set smtp.verify true` 并配置 SMTP，重启后页面自动恢复发送验证邮件。第一步仍受 Hydro 原生注册限流约束：
同一邮箱短时间重复提交可能返回错误页；测试时使用未注册邮箱即可。
写自动化脚本连续注册多个账号时，务必用**不同的邮箱**。

---

## 7. 故障排查速查

| 现象 | 优先排查 |
| --- | --- |
| 首页 502 / 打不开 | `pm2 list` 看 `hydrooj` 是否 online；`pm2 logs hydrooj` |
| 首页能开但样式全丢 | Caddy 的 `root` 是否指向 `~/.hydro/static`；`pm2 list` 看 caddy |
| 提交后一直 Pending | `pm2 logs hydrojudge`；检查 `~/.hydro/judge.yaml` 的 `server_url` 和口令 |
| 判题全部 RE / 沙箱报错 | 检查 `~/.hydro/mount.yaml`、`/dev/shm` 大小、内核 ≥ 4.4 |
| 短信/邮件链接地址错 | `server.url` 是否完整且以 `/` 结尾 |
| 升级后站点起不来 | 大概率是降级保护 → 用 `rollback.sh --from-backup` 恢复 |
| 数据库连不上 | `~/.hydro/config.json` 的 URI；`pm2 list` 看 mongodb |
| 磁盘告警 | `deploy/healthcheck.sh`；清理 `/data` 旧日志与旧备份 |

---

## 8. 诚实说明：哪些验证过、哪些没有

**2026-09-20：本文档的部署流程已在真实 Debian 12 服务器（`101.42.27.44`）上跑通第一轮。**
下方区分「真机实测通过」与「仍待验证」，不混为一谈。

### 8.1 真机实测通过（Debian 12 / Hydro 5.0.7）

| 部分 | 验证状态 |
| --- | --- |
| `deploy/preflight.sh` | ✅ 真机跑完，32 项通过 / 0 失败 |
| `deploy/install-hydro.sh` | ✅ 官方 `setup.sh` 装完；4 个 pm2 进程 online；HTTP 200 |
| `deploy/configure.sh --apply` | ✅ 真机写入 5 项设置（0 失败），首页标题已变 `SYLU OJ`、页脚声明已出现 |
| §7 第一道 Gate | ✅ 注册 / 登录 / 管理员会话 / 管理面板权限，全部用真实 HTTP 请求验证（见 §3 第 3 步） |
| `deploy/lib/common.sh` 版本探测 | ✅ `hydro_version` / `hydro_pkg_version` / `hydro_db_ver` 三个函数在真机上秒回 |
| 评测链路 | ✅ 数据库中存在 `status:1`（Accepted）`score:100` 的记录；`localhost:5050/version` 返回 200 |
| 沙箱与数据库隔离 | ✅ 实测 `27017` / `5050` / `2019` / `8888` **全部只听 127.0.0.1**，对外入口为 80/443，SSH 为 22 |
| `tools/problem-importer` | ✅ 已实测：自测 47 项断言全通过；端到端 preflight/convert/verify 跑通 |
| `test/judge-suite` 题面与用例 | ✅ 已实测：本地校验 10 项全通过（含 WA/AC 判定） |
| `deploy/secret-scan.sh` | ✅ 已实测：在仓库上运行，结果干净 |

### 8.2 仍待真机验证

| 部分 | 状态 | 原因 |
| --- | --- | --- |
| `deploy/update.sh`（§47 升级） | ⚠️ 未验证 | 需要真的发一次新版本才能试；**且升级会推进 `db.ver`，属单向操作** |
| `deploy/rollback.sh`（§49 回滚） | ⚠️ 只验证了 `--list` 只读模式 | 同上 |
| `deploy/restore-check.sh`（§46 恢复演练） | ✅ 机械校验通过 | 2026-09-24 使用最新本地备份恢复到临时库，20 个 BSON 集合与题目/提交数据齐全；完整启动演练仍需单独环境 |
| `deploy/backup.sh` + 异地副本 | ⚠️ 本地已验证 | 2026-09-24 本地备份成功，异地副本仍需配置 |
| 域名与 HTTPS（§41） | ⚠️ 临时 IP 入口 | `http://101.42.27.44/` 可用；443 已监听但裸 IP 内部证书不适合作为生产 HTTPS，**上线前必须配置域名证书** |
| `addons/sylu-brand` 插件 | ✅ 已安装并验证 | `/sylu/about`、导航「关于本站」、`/sylu/css/*.css`、`/sylu-logo.svg` 均已生效；Hydro 原生题库/提交/比赛/后台结构保留 |
| 题库正式导入（§18–§25） | ⚠️ 未执行 | 站点还没有任何正式题目 |

**IP 内测状态**：`http://101.42.27.44/` 已可用，首页、题库、训练、比赛、作业、排名、登录、注册和状态页均已实测。Hydro、MongoDB、Caddy、内嵌 Sandbox 均正常，SYS001 已实测 C++ Accepted、Wrong Answer、Compile Error、Runtime Error、TLE、Python Accepted，并完成网络与文件隔离探针验证；MLE/OLE 在当前内嵌 Sandbox 中分别表现为 Runtime Error/Memory Exceeded，已如实记录。2026-09-24 本地备份和临时库机械恢复校验通过，异地副本与完整恢复启动演练仍待配置，当前仍属于 IP 内测，不宣称公网生产上线。

IP 内测仍保留以下上线前工作：配置域名与 HTTPS、异地备份副本、完整人工恢复启动演练、教师作业与比赛链路验收，以及逐项执行沙箱网络测试。
上线判定请看 `docs/ACCEPTANCE.md`（§72）。

如与文档不符，以**脚本的实际输出**为准，并回来更新本文档。

---

## 9. 参考

- Hydro 官方文档：https://hydro.js.org/
- Hydro 源码：https://github.com/hydro-dev/Hydro （AGPL-3.0）
- 许可与合规说明：见仓库 `LICENSES/README.md`
- 验收清单：见 `docs/ACCEPTANCE.md`
