# SYLU Problem Importer

独立题库导入工具。**不修改 Hydro Core**（实施计划 §22），只做：

```text
源题库 ZIP → 解析 → 规范化 → 预检 → 预览 → 标准程序验证 → 生成 Hydro 可导入格式
```

核心 ZIP 预检保持零运行时 ZIP 依赖；YAML 使用 `yaml` 库严格解析（重复键、别名和多行题面不能用正则可靠处理）。

## 为什么需要它

Hydro 原生就支持 ZIP 导入（题库页 → `Import From Hydro`，路由 `/problem/import/hydro`），
但原生导入对**坏数据是静默容忍**的：顶层没有 `problem.yaml` 的目录会被直接跳过，
`.in` 找不到 `.out` 会被忽略，题号非法会被重新分配。

批量导入几十道题时，这类静默行为会变成"导进去一半、少了一半测试点、没人发现"。
本工具的作用是**先在校验环节把所有问题摊开**，只在全部通过后才生成包。

## 用法

```bash
cd tools/problem-importer

# 1) 预检：只报问题，不生成任何东西
node bin/sylu-import.mjs preflight 源题库.zip

# 2) 预览：预检 + 题目清单表
node bin/sylu-import.mjs preview 源题库.zip

# 3) 验证标准程序：用包内 solution.cpp / solution.py 跑全部测试点（§25）
node bin/sylu-import.mjs verify 源题库.zip --trusted

# 4) 生成 Hydro 可导入包
node bin/sylu-import.mjs convert 源题库.zip -o hydro-import.zip
```

选项：

| 选项 | 说明 |
|---|---|
| `-o, --out <file>` | `convert` 的输出文件 |
| `--only p1000,p1001` | 只处理指定题号（按题号或源目录名匹配） |
| `--prefix p` | 给自动推导的题号加前缀，避免和已有题号冲突 |
| `--json` | 预检结果输出 JSON，便于接 CI |
| `--no-color` | 关闭颜色 |
| `--trusted` | 明确允许在本机执行包内标准程序；默认拒绝，生产验证应使用 Hydro 沙箱 |

退出码：`0` 通过（可能带警告）／`1` 有错误或被禁止发布／`2` 参数错误。

## 支持的输入结构

| 结构 | 示例 |
|---|---|
| 每题一目录（推荐） | `aplusb/problem.json` + `aplusb/1.in` + `aplusb/1.out` |
| Hydro 原生结构 | `p1001/problem.yaml` + `p1001/testdata/1.in` + `p1001/testdata/config.yaml` |
| 多层外壳目录 | `某次作业/p1000/problem.json` + `某次作业/p1000/1.in` … |
| 单题平铺 | `1.in` / `1.out` / `problem.json` 直接在压缩包根 |
| CodeOJ 导出结构 | `problem.json` 含 `title/description/input_format/output_format/time_limit/memory_limit/tags/samples`（§26） |

题面识别：`problem.json`（JSON）、`problem.yaml`（YAML 子集）里的
`content`，或由 `description + input_format + output_format + samples` **自动拼装**成 Markdown 题面。

标准程序：目录下的 `solution.cpp` / `solution.py` / `solution.java`（§20 §25）。

## 预检项（实施计划 §23 逐条对应）

安全：

- ZIP 路径穿越（`..`）、绝对路径（`/etc/...`、`C:\...`）
- 反斜杠路径分隔符、文件名含 NUL / 控制字符
- 重复路径（完全重复、大小写与 Unicode 归一化后重复）
- 符号链接条目、加密条目、不支持的压缩算法
- 单文件过大、总体积过大、**压缩炸弹**（单文件与总体压缩比）
- 非法编码（UTF-8 优先，自动回退 GBK，避免中文题面乱码）

数据：

- `.in` / `.out`（含 `.ans`）配对；缺输出为**错误**，多输出为**警告**
- 空标准答案、0 字节输入、重复测试点（内容哈希）
- 测试点数量上限、编号连续性
- 题号合法性（自动规范化并告警）、标题为空
- 时间/内存限制合法区间（支持 `1s` / `1000ms` / `256m` / `1g` / `524288k` / 纯数字 KB 或 MB）

## 生成的 Hydro 包结构

依据 Hydro 源码 `packages/hydrooj/src/model/problem.ts` 的 `ProblemModel.import`
与 `@hydrooj/common` 的测试点匹配规则生成：

```text
p1000/
├── problem.yaml            # pid / title / difficulty / tag / content（Markdown）
└── testdata/
    ├── config.yaml         # time: 1000ms / memory: 256m
    ├── 1.in
    ├── 1.out
    └── 2.in / 2.out
```

> Hydro 要求顶层每个目录下必须有 `problem.yaml`，否则该目录会被静默跳过；本工具保证一定生成。

## 导入之后（§19 题目发布流程，不要跳过）

```text
浏览器 → 题库 → Import From Hydro（/problem/import/hydro）
   ↓
勾选 hidden，保持私有   ← 禁止创建完立即公开
   ↓
逐题跑标准程序确认 100% AC
   ↓
人工检查题面
   ↓
用 WA / CE / RE / TLE 代码各测一次
   ↓
确认无误 → 取消隐藏 → 加入作业或训练
```

批量导入后建议统一置为隐藏，再逐题放开。上面 `convert` 的输出结尾会再次提醒这五步。

## 自测

```bash
node test/selftest.mjs
```

34 项断言，覆盖 §23 的每条预检规则、单位解析、题号规范化，
以及"生成的包能否被自己再解析回来"（往返一致性）。

## 与 CodeOJ 历史题库迁移（§26 §27）

不要直接迁数据库表。流程固定为：

```text
旧 CodeOJ → 导出为 ZIP（题目字段 + testcases）
          → 本工具 preflight（Validator）
          → 人工预览确认
          → convert → Hydro Import
          → 抽样运行标准程序
```

**不迁历史用户密码**（§27）：旧系统密码算法无法安全兼容，一律让用户重新注册，
或由管理员导入用户名后首次登录重设密码。
