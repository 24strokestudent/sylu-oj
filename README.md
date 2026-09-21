# SYLU OJ

**在线程序设计与评测平台**

面向校内编程学习与训练的在线评测系统。核心评测引擎基于 [Hydro](https://github.com/hydro-dev/Hydro) 二次开发，
本仓库负责 **部署、品牌定制、题库迁移工具与运维**，不重新实现 OJ 核心。

> **本站为学生维护的非官方编程学习与在线评测平台，非学校官方信息系统。**
> 请勿上传个人隐私数据；请勿提交恶意代码。

---

## 这个仓库是什么

我们不做"再写一个 OJ"，而是把成熟的 Hydro 用起来，只维护 Hydro 之外的那部分：

| 目录 | 职责 | 状态 |
|---|---|---|
| `deploy/` | 部署前检查、安装、配置、备份、恢复演练、升级、回滚、密钥扫描 | 已交付（需在 Debian 12 服务器执行） |
| `addons/sylu-brand/` | 顶栏「关于本站」入口、平台须知聚合页、SYLU Logo 与 Hydro 原生界面视觉适配 | 已部署并验证 |
| `addons/sylu-campus/` | 学号绑定与身份验证（**V1 不启用**） | 仅设计说明 |
| `tools/problem-importer/` | 题库 ZIP 预检、预览、转换为 Hydro 可导入格式 | 已交付并本地自测 |
| `test/` | Judge 验收集（AC/WA/CE/RE/TLE/MLE/OLE）与沙箱安全用例 | 已交付 |
| `docs/` | `DEPLOY.md` 部署与运维、`ACCEPTANCE.md` 验收清单 | 已交付 |
| `legacy-homepage/` | 改造前的静态首页（视觉参考） | 归档 |
| `legacy-server/` | 改造前的 Express 后端骨架（**停止发展**） | 归档 |

Hydro 本体、MongoDB、Judge、Sandbox 全部来自官方安装，**不在本仓库内**。

## 技术栈与边界

```
Internet → HTTPS → Caddy/Nginx → Hydro (127.0.0.1:8888) → MongoDB(仅本机)
                                                          └ Judge/Sandbox（容器隔离）
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

在服务器上从零部署（Debian 12，需 root）：

```bash
sudo -i
cd /root && git clone <本仓库> sylu-oj && cd sylu-oj
bash deploy/preflight.sh          # 先体检，关键项不通过就停
bash deploy/install-hydro.sh      # 用 Hydro 官方脚本安装
bash deploy/configure.sh          # 品牌与站点配置引导
```

完整步骤、版本记录、升级与回滚流程见 [`docs/DEPLOY.md`](docs/DEPLOY.md)。
验收标准与逐条勾选表见 [`docs/ACCEPTANCE.md`](docs/ACCEPTANCE.md)。

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
