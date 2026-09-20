# deploy/patches/ —— 核心补丁（Core Patch）存放处

这个目录的存在，是为了让「不得不改 Hydro 核心」这件事**有记录、可重放**。

## 为什么需要它

实施计划 §1.2 定下的优先级是：

```
Hydro 原生配置  →  Addon  →  CSS/模板扩展  →  最小核心改动（最后手段）
```

前三者都能在升级后保留；**核心改动会在每次 `yarn global add` 升级时被覆盖掉**。
所以只要我们打了核心补丁，就必须把补丁文件留在这里 ——
`deploy/update.sh` 会在升级完成后自动把本目录下的 `*.patch` 重新施加一遍。

## 怎么用

1. 在服务器上改好 Hydro 源码后，生成补丁：

   ```bash
   # 在 hydrooj 的安装目录下（yarn global dir 里的 node_modules/hydrooj）
   cd "$(yarn global dir)/node_modules/hydrooj"
   diff -u 原文件 改后文件 > /root/sylu-oj/deploy/patches/0001-说明.patch
   ```

   文件名建议用 `0001-`、`0002-` 前缀，保证按顺序施加。

2. 用官方命令验证补丁能打上（**先用 `--dry-run`**）：

   ```bash
   hydrooj patch deploy/patches/0001-说明.patch --dry-run
   ```

3. 提交到仓库，并在下面登记一行。

## 补丁登记表

> 每打一个核心补丁，就在这里记一行。**没有登记的核心改动视为意外改动。**

| 编号 | 文件 | 目的 | 为什么不能用原生配置/Addon 解决 | 上游相关 issue / commit |
| --- | --- | --- | --- | --- |
| （暂无） | | | | |

## 注意

- `hydrooj patch` **会忽略补丁里的 `package.json` 改动**（上游行为，见
  `packages/hydrooj/src/commands/patch.ts`），所以别指望用补丁改依赖。
- 补丁能打上不代表逻辑正确 —— 升级后仍要跑 `docs/ACCEPTANCE.md` 的验收。
- 如果某个补丁连续两次升级都冲突，说明应该重新评估：
  是不是有原生的办法能达到同样效果（回到 §1.2 的优先级第一层）。
- 本目录当前为空是**好事**：说明目前所有需求都靠原生配置和 Addon 满足了。
