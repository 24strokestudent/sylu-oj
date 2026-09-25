# test/sandbox-suite/ · 沙箱隔离验收

`§16` 的上线红线用例。**6 个探针必须在真实 Hydro 沙箱里逐个提交**，结果记进 `docs/ACCEPTANCE.md` 的 C 章表格。

> 红线：`network_test` 或 `filesystem_test` 只要有**任一项成功**（`CONNECTED` / `READ`），
> **Judge 一律不得上线**。这不是"建议优化"，是上线门槛。

## 0. 为什么不能在本机跑

这 6 个用例验证的是 **go-judge 沙箱**的行为，依赖 Linux 的 namespace / cgroup。
macOS 上跑不出真结论（Docker Desktop 的 Linux VM 也不行——判决结果不可作为验收证据）。

| 目标环境 | 怎么跑 |
|---|---|
| **裸机生产路径**（Nix + pm2，线上正在用的） | 直接在服务器上按本文档走 |
| **容器路径**（`deploy/docker/`） | 在**干净的 Linux** 上起栈后按本文档走；容器不用 `~/.hydro/mount.yaml`，裸机结论**不能套用** |

> ⚠️ **别在线上那台机器上同时跑容器栈**：实测该机内存 3.5 GiB / 3.7 GiB，再起一套 mongo + hydro 会 OOM，把内测站一起拖挂。
> 另开一台（≥2C4G，支持 avx，内核 ≥4.4）或先加 swap / 升配。

## 1. 起栈（容器路径）

```bash
git clone git@github.com:24strokestudent/sylu-oj.git && cd sylu-oj
cp deploy/docker/.env.example deploy/docker/.env

# 口令必须改（占位值 change-me-* 不会被 compose 拦住）
sed -i "s/^MONGO_ROOT_PASSWORD=.*/MONGO_ROOT_PASSWORD=$(openssl rand -hex 12)/" deploy/docker/.env
sed -i "s/^HYDRO_MONGO_PASSWORD=.*/HYDRO_MONGO_PASSWORD=$(openssl rand -hex 12)/" deploy/docker/.env

# 临时把 8888 映射到回环，便于 SSH 隧道访问（临时文件，别提交）
cat > deploy/docker/access.override.yml <<'YAML'
services:
  hydro:
    ports:
      - "127.0.0.1:18888:8888"
YAML

# 只起 mongo + hydro：沙箱测试用不到 Caddy，也就不碰 80/443
docker compose -f deploy/docker/docker-compose.yml -f deploy/docker/access.override.yml \
  up -d --build mongo hydro
docker compose -f deploy/docker/docker-compose.yml logs -f hydro   # 等到「基础设置写入完成」
```

裸机路径跳过这步，直接用线上环境。

## 2. 建隧道并登录

```bash
ssh -N -L 18888:127.0.0.1:18888 root@<服务器IP>
# 浏览器打开 http://localhost:18888
```

**第一个注册的账号会自动成为超级管理员**——先注册专用维护号 + 强密码，别拿测试账号占位。密码至少 6 位。

## 3. 建一道探针题

| 字段 | 值 |
|---|---|
| 题号 | `SYS-SANDBOX` |
| 标题 | 沙箱隔离探针（内部验收） |
| 时间限制 | **1000 ms** |
| 内存限制 | **256 MB** |
| 测试数据 | 1 个点：`1.in` 空文件；`1.out` 内容 `ALL-BLOCKED`（故意不匹配，逼出程序输出） |
| 可见性 | 隐藏 |

## 4. 抓影响面基线（别省这步）

`§16` 的期望不只要判决对，还要**机器没被拖垮**。每个用例提交前后各跑一次：

```bash
docker stats --no-stream; free -m; df -h /var/lib/docker
```

## 5. 6 个用例与判定

| 用例 | 语言 | 期望 | 判定要点 |
|---|---|---|---|
| `network_test.py` | Python 3 | WA（看内容） | 输出**不得出现 `CONNECTED`**；4 行都应是 `blocked ...`。**任一 `CONNECTED` → 红线不过** |
| `filesystem_test.cpp` | C++17 | WA（看内容） | 见下方逐行判定 |
| `infinite_loop.cpp` | C++17 | **TLE** | 1–2 秒内出结果、不长期 Pending；跑完 hydro 的 CPU 回落 |
| `memory_alloc.cpp` | C++17 | **MLE** | 内嵌沙箱上可能显示 `Memory Exceeded` 或 RE，**如实记录**；容器不能被拖到 OOM |
| `output_flood.cpp` | C++17 | **OLE** | 部分版本报 TLE（`test/README.md` 已注明）；关键看 `df -h` 前后无变化 |
| `fork_test.cpp` | C++17 | WA | 记录输出是 `done` 还是 `fork failed at N`（**N 就是实际子进程上限**） |

### `filesystem_test.cpp` 要逐行判，不能一刀切

| 路径 | 要求 |
|---|---|
| `/etc/shadow`、`/root/.ssh/id_rsa`、`/root/.ssh/authorized_keys`、`/root/.hydro/config.json`、`/data/file` | **必须 `blocked`**。出现 `READ` → 🔴 红线不过 |
| `/etc/passwd` | 能读**属正常**（容器基础镜像自带），但要瞄一眼内容；若是宿主机的真实用户表就要记录 |
| `/proc/1/environ`、`/proc/self/environ` | **逐字检查有没有 `MONGO_URI`、数据库口令、`HYDRO_*`**。容器路径下 PID 1 是 entrypoint，其环境里就带着 `MONGO_URI`，而裸机没有这个暴露面——**读到口令 = 真实泄漏，必须单独修并记录** |

## 6. 记录模板（填进 `docs/ACCEPTANCE.md` C 章）

| 用例 | 期望 | 实际 | 通过 |
|---|---|---|---|
| `infinite_loop.cpp` | TLE，评测机不被拖死 | | |
| `memory_alloc.cpp` | MLE，评测机内存不被拖垮 | | |
| `fork_test.cpp` | 子进程数受沙箱限制 | | |
| `network_test.py` | 外网 + 本机 MongoDB / Hydro 端口全部被拦 | | |
| `filesystem_test.cpp` | 读不到 `/etc/shadow`、`/root/.ssh/*`、`~/.hydro/config.json`、`/data/file` | | |
| `output_flood.cpp` | OLE，不会写满磁盘 | | |

另外记：机器规格、内核版本、沙箱参数（是否用 `mount.yaml` / `SYLU_SANDBOX_TMPFS` / `HYDRO_SHM_SIZE`）、日期。

## 7. （可选，很值）把它变成可回归的闸门

第一轮确认隔离成立后，把**通过时的那份输出**粘进 `1.out`，再提交一次 → 应该变成 **Accepted**。
以后任何人动了沙箱参数，提交一次看到 AC 就知道没破坏隔离。

## 8. 收尾

```bash
docker compose -f deploy/docker/docker-compose.yml -f deploy/docker/access.override.yml down -v
rm deploy/docker/access.override.yml
```

> `down -v` 会删数据卷，测试环境无所谓；**别在有数据的机器上随手加 `-v`**。
