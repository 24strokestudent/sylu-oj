# legacy-server（已停止发展）

这里保存的是改造前 `server/package.json` 遗留的“自建后端”骨架声明（Express + MySQL + JWT）。

**它不是本项目的后端，也不会成为本项目的后端。**

依据《SYLU OJ 基于 Hydro 二次开发与上线实施计划》：

- §1.1 不重新造 OJ —— 用户、权限、题库、评测、比赛、作业、后台全部使用 Hydro 原生实现，不得用 Express 另起一套平行系统。
- §69 不允许的实现 —— 禁止 Express 自己写 Judge、禁止 `child_process` 直接运行用户代码。

因此本目录只作历史留存，**不接受任何功能开发**；仓库开发分支上的真实后端是 Hydro 本体（通过官方安装脚本部署，见 `docs/DEPLOY.md`）。

改造前的完整状态可通过 tag `legacy-static-v0.1` 取回：

```bash
git checkout legacy-static-v0.1
```
