# SYLU OJ

**在线程序设计与评测平台**

面向校内编程学习与训练的在线评测系统。核心评测引擎基于 [Hydro](https://github.com/hydro-dev/Hydro) 二次开发，
本仓库负责 **部署、品牌定制、题库迁移工具与运维**，不重新实现 OJ 核心。

[![CI](https://github.com/24strokestudent/sylu-oj/actions/workflows/ci.yml/badge.svg)](https://github.com/24strokestudent/sylu-oj/actions/workflows/ci.yml)

> **本站为学生维护的非官方编程学习与在线评测平台，非学校官方信息系统。**
> 请勿上传个人隐私数据；请勿提交恶意代码。

---

## 这个仓库是什么

我们不做"再写一个 OJ"，而是把成熟的 Hydro 用起来，只维护 Hydro 之外的那部分：

| 目录 | 职责 | 状态 |
|---|---|---|
| `deploy/` | **裸机路径**：部署前检查、安装、配置、备份、恢复演练、升级、回滚、密钥扫描 | 已在 Debian 12 真机跑通 |
| `deploy/docker/` | **容器路径**：Dockerfile + docker-compose + Caddyfile + 容器入口脚本 | CI 已构建镜像并启动整套栈探活通过 |
| `addons/sylu-brand/` | 顶栏「关于本站」入口、平台须知聚合页、SYLU Logo 与 Hydro 原生界面视觉适配 | 已部署并验证 |
| `addons/sylu-campus/` | 学号绑定与身份验证（**V1 不启用**） | 仅设计说明 |
| `tools/problem-importer/` | 题库 ZIP 预检、预览、转换为 Hydro 可导入格式 | 已交付并本地自测 |
| `test/` | Judge 验收集（AC/WA/CE/RE/TLE/MLE/OLE）、沙箱安全用例、UI 离线渲染沙箱 | 已交付 |
| `docs/` | `DEPLOY.md` 裸机部署、`DEPLOY-DOCKER.md` 容器部署、`ACCEPTANCE.md` 验收清单、`UI-FUNCTION-BASELINE.md` 前端对照 | 已交付 |
| `.github/workflows/` | CI 流水线（5 个 job，见下） | `main` 全绿 |
| `legacy-homepage/` | 改造前的静态首页（视觉参考） | 归档 |
| `legacy-server/` | 改造前的 Express 后端骨架（**停止发展**） | 归档 |

Hydro 本体、MongoDB、Judge、Sandbox 全部来自官方安装，**不在本仓库内**。

## 技术栈与边界

两条部署路径，产出同一套东西（Hydro Web + 内嵌评测机 + go-judge 沙箱 + MongoDB + Caddy）：

```
裸机路径（deploy/）
Internet → HTTPS → Caddy → Hydro (127.0.0.1:8888) → MongoDB(仅本机)
                                    └ Judge/Sandbox（go-judge，由 ~/.hydro/mount.yaml 限制挂载）

容器路径（deploy/docker/）
Internet → Caddy 容器 → Hydro 容器 (8888，仅内网) → Mongo 容器(仅内网)
                              └ go-judge（容器内，privileged + host cgroup，内置默认挂载）
```

三条硬边界（改动前请先读）：

1. **不重新造 OJ。** 用户、权限、题库、评测、比赛、作业、讨论、后台全部走 Hydro 原生能力。
2. **不魔改 Hydro Core。** 优先级固定为：Hydro 原生配置 → 原生插件/Addon → CSS/模板扩展 → 最后才考虑最小 Core Patch（必须单独记录以便升级重放）。
3. **Judge 与数据安全优先于 UI。** 先能用，再定制。

## 快速开始

本地跑一遍题库导入工具的预检与预览：

```bash
cd tools/problem-importer
node bin/sylu-import.mjs --help
```

### 路径一：裸机部署（Debian 12，需 root，线上当前用的就是这套）

```bash
sudo -i
cd /root && git clone <本仓库> sylu-oj && cd sylu-oj
bash deploy/preflight.sh          # 先体检，关键项不通过就停
bash deploy/install-hydro.sh      # 用 Hydro 官方脚本安装
bash deploy/configure.sh          # 品牌与站点配置引导
```

### 路径二：容器部署（任意装了 Docker 的 Linux）

```bash
cp deploy/docker/.env.example deploy/docker/.env
$EDITOR deploy/docker/.env        # 至少改两个数据库口令与 SITE_ADDRESS
docker compose -f deploy/docker/docker-compose.yml up -d --build
docker compose -f deploy/docker/docker-compose.yml logs -f hydro
```

两条路径的差异、取舍与注意事项见 [`docs/DEPLOY-DOCKER.md`](docs/DEPLOY-DOCKER.md)。
裸机完整步骤、版本记录、升级与回滚见 [`docs/DEPLOY.md`](docs/DEPLOY.md)。
验收标准与逐条勾选表见 [`docs/ACCEPTANCE.md`](docs/ACCEPTANCE.md)。

## 持续集成

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) 在每次 push 到 `main` 以及每个 PR 上运行：

| job | 内容 |
|---|---|
| 部署脚本回归 | `bash -n` 全部脚本 + addon JS 语法检查 + 三个 `test/deploy-*-regression.sh` |
| 题库导入工具自测 | `npm ci && npm run selftest` |
| 判题用例本地校验 | `bash test/judge-suite/check-fixtures.sh` |
| Docker 镜像构建与 compose 校验 | 构建镜像 + `docker compose config -q` |
| Docker 栈启动探活（**观察项**） | 起 `mongo` + `hydro`，探活 Web 200 与 `5050/version` |

> ⚠️ 最后一项带 `continue-on-error: true`，**它失败时整轮 CI 仍显示绿色**；而且探活只证明服务端口活着，
> **不跑判题**。沙箱隔离的结论必须来自 `test/sandbox-suite/` 的实际提交结果，不能引用探活。

## 当前状态与上线缺口

内测站：`http://101.42.27.44/`（**IP 直连，没有域名与 HTTPS**）。
已实测：注册 / 登录 / 题库 / 训练 / 比赛 / 作业 / 排名 / 状态页；SYS001 上 C++ 的 Accepted、Wrong Answer、Compile Error、Runtime Error、TLE 与 Python 的 Accepted 均跑通；网络与文件隔离探针通过。

上线前还缺（判定依据见 [`docs/ACCEPTANCE.md`](docs/ACCEPTANCE.md)，当前 **0/94 项勾选**）：

| 缺口 | 说明 |
|---|---|
| 域名 + HTTPS | 服务器位于中国大陆（腾讯云北京），**域名对外提供 Web 服务必须先 ICP 备案**，周期通常 2–4 周；2026-09-25 实测 443 端口连接超时，需先排查 |
| 正式题库 | 线上只有 2 道题（SYS001 与内置示例），正式题库尚未导入 |
| 容器路径的沙箱红线 | `test/sandbox-suite/` 的 6 个用例只在裸机跑过；容器路径不用 `mount.yaml`，隔离结论**必须重跑** |
| 异地备份副本 | 本机备份已验证；异地副本与完整恢复启动演练未做 |
| 管理后台品牌化 | `/manage` 仍是上游原样 |

> **执行版清单**（按顺序做、每项带命令与通过标准）见 [`docs/LAUNCH-CHECKLIST.md`](docs/LAUNCH-CHECKLIST.md)。
>
> 版本与变更记录见 [`CHANGELOG.md`](CHANGELOG.md)；当前内测版为 **v0.1.0-beta.1**。

## 配色

取自校徽，用法有分工，避免整页红绿棕同时大量出现：

| 颜色 | 色值 | 用途 |
|---|---|---|
| 校红 | `#b12d28` | 主要操作（按钮、链接强调） |
| 校棕 | `#231815` | 文本与导航 |
| 校绿 | `#485742` | 状态与辅助区块 |

## License

本仓库自有代码：[MIT](./LICENSE)。

Hydro 本体为 [AGPL-3.0](https://github.com/hydro-dev/Hydro/blob/master/LICENSE)，以独立进程部署、不作修改，
站点页脚保留 **Powered by Hydro** 归属声明。详见 [`LICENSES/`](LICENSES/)。

---

## 归档说明

本仓库在采用 Hydro 之前，曾有一套自研的静态前端（10 个页面）与 Express + MySQL 后端。

| 位置 | 内容 |
|---|---|
| `legacy-homepage/` | 自研静态前端：首页 / 题库 / 题目详情 / 比赛 / 讨论区 / 话题详情 / 排行榜 / 个人主页 / 登录 / 注册，含全部样式与脚本 |
| `legacy-server/` | 自研 Express 后端：12 个接口、JWT 登录态、MySQL 8 张表的建表与联调代码 |
| 分支 `archive/static-frontend` | 上述成果被合并进 `legacy-*` 之前的完整历史 |
| 分支 `archive/hydro-merge` | 采用 Hydro 那次合并的完整内容（= 合并当时的主线快照） |
| 分支 `wip/frontend-api-wiring` | 归档前最后一批工作：把页面接到真实接口（首页统计、题目详情、比赛、登录），193 行 |

`legacy-server/` 已停止发展；`legacy-homepage/` 作为视觉参考保留——其中的设计令牌与页面结构
已被 `addons/sylu-brand/` 的 Hydro 模板吸收。

参与开发请先读 [`CONTRIBUTING.md`](CONTRIBUTING.md)。
