# LICENSES

本仓库同时涉及两套授权，请分别对待。

## 本仓库自有代码 — MIT

`LICENSE`（仓库根目录）适用于本仓库自行编写的代码：
`deploy/`、`addons/`、`tools/`、`test/`、`docs/`、`legacy-homepage/`。

```
MIT License · Copyright (c) 2026 24strokestudent
```

## Hydro 本体 — AGPL-3.0

Hydro（`hydro-dev/Hydro`）以 **GNU Affero General Public License v3.0** 授权。

我们的使用方式与合规要点：

- Hydro 通过官方安装脚本部署为**独立进程**，位于 `/root/.hydro` 与全局 npm 目录，**不在本仓库内**。
- 我们**不修改** Hydro Core。品牌定制通过原生系统设置与 Addon 完成。
- 若未来确需对 Hydro Core 打补丁，该补丁视为 AGPL 衍生作品，**必须单独公开**（见 `docs/DEPLOY.md` 的 Core Patch 记录表）。
- AGPL 第 13 条：通过网络提供服务时，须向使用者提供对应源码。我们通过页脚保留的
  **Powered by Hydro** 链接指向上游源码仓库以满足归属与来源要求；该声明**不得删除**。

官方仓库：<https://github.com/hydro-dev/Hydro>

## 第三方测试数据与题库

导入校内自有题库或外部题库时（见 `tools/problem-importer/`），请自行确认其授权许可。
本仓库**不内置**任何第三方题目数据。
