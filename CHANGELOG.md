# 更新日志

本项目遵循[语义化版本](https://semver.org/lang/zh-CN/)。
`0.x` 阶段的 `-beta.N` 表示**仅供内测**：接口、数据与部署方式都可能变，**不要对外发链接**。

---

## [v0.1.0-beta.1] — 2026-09-25 · 首个内测版

采用 Hydro 二次开发后的第一个**可运行**版本：能注册登录、能判题、能备份回滚。

**当前形态是 IP 内测**：`http://101.42.27.44/`（**没有域名，没有 HTTPS**，443 端口关闭）。
对外上线还差的项见下方「已知问题」与 [`docs/LAUNCH-CHECKLIST.md`](docs/LAUNCH-CHECKLIST.md)。

### 已实测可用

- **注册 / 登录**：Hydro 原生两步 token 流程；测试期免邮箱验证；密码最少 6 位
- **页面**：首页 / 题库 / 训练 / 比赛 / 作业 / 排名 / 状态页均可访问；`/manage` 未登录正确跳登录
- **判题链路**：C++ 的 Accepted、Wrong Answer、Compile Error、Runtime Error、Time Limit Exceeded，以及 Python 的 Accepted，均在真机跑通
- **品牌落地**：页脚保留 `Powered by Hydro` 归属、每页有「学生维护的非官方平台」声明、SYLU Logo 与校色令牌生效
- **CI 全绿**（5 个 job）：部署脚本回归 / 题库导入工具自测 / 判题用例本地校验 / Docker 镜像构建与 compose 校验 / Docker 栈启动探活（观察项）

### 版本构成（真机实测记录）

| 组件 | 版本 |
|---|---|
| 操作系统 | Debian GNU/Linux 12 (bookworm)，内核 6.1.0-20-amd64，x86_64 |
| hydrooj | **5.0.7** |
| `@hydrooj/ui-default` | 4.58.5 |
| `@hydrooj/hydrojudge` | 4.0.6 |
| go-judge / hydro-sandbox | v1.12.3 |
| MongoDB | v7.0.28 |
| Caddy | 2.11.4 |
| Node.js / yarn / pm2 | v24.19.0 / 1.22.22 / 6.0.14 |
| **db.ver** | **97** |

> 这五个 `@hydrooj/*` 包必须整组一起升级，`db.ver` 是升级/回滚的安全闸门。

### 已知问题（**不要当成已完成**）

| 项 | 现状 |
|---|---|
| 题库 | 只有 **2 道题**（内部验收题 SYS001 + 内置示例），正式题库未导入 |
| 讨论区 | **未创建讨论版块**，`/discuss` 空，发帖入口不可达 |
| 找回密码 | `POST /lostpass` 返回 **500** —— SMTP 未配置（同时导致注册无法做邮箱验证） |
| 域名 / HTTPS | 无域名；**443 端口关闭**，无证书 |
| 服务器内存 | 3.5–3.6 GiB / 3.7 GiB，**余量很小**，导入题库或开比赛有 OOM 风险 |
| 验收 | [`docs/ACCEPTANCE.md`](docs/ACCEPTANCE.md) **0/91 项勾选**；§0 七条机器门禁证据表为空 |
| 容器路径 | 镜像可构建、栈可启动探活，但**沙箱隔离与判题未验证**（未用 `mount.yaml`，裸机结论不能套用） |
| 升级 / 回滚 | `deploy/update.sh` / `rollback.sh` **未演练**（升级会推进 `db.ver`，属单向操作） |
| 管理后台 | `/manage` 仍是上游原样，未做品牌化 |

### 升级与回滚

- 本版为首次发布，**没有升级路径**
- 回滚方式：切回上一个提交或分支（`archive/static-frontend` 保留采用 Hydro 之前的自研前端）

### 归档内容

`legacy-homepage/`（自研静态前端 10 页）与 `legacy-server/`（Express 后端）**已停止发展**，仅作视觉与实现参考。
分支 `archive/static-frontend`、`archive/hydro-merge`、`wip/frontend-api-wiring` 保留完整历史。

### 相关文档

| 文档 | 用途 |
|---|---|
| [`docs/DEPLOY.md`](docs/DEPLOY.md) | 裸机部署与运维（线上当前用的这套） |
| [`docs/DEPLOY-DOCKER.md`](docs/DEPLOY-DOCKER.md) | 容器（Docker Compose）部署 |
| [`docs/LAUNCH-CHECKLIST.md`](docs/LAUNCH-CHECKLIST.md) | 上线执行清单（按顺序、带命令） |
| [`docs/ACCEPTANCE.md`](docs/ACCEPTANCE.md) | 验收清单（上线判定依据） |
| [`test/sandbox-suite/README.md`](test/sandbox-suite/README.md) | 沙箱红线 6 用例操作流程 |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | 贡献指南与 CI 说明 |
