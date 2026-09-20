# test/

判题与沙箱的验收用例。**这些不是"单元测试"，而是上线前的验收证据。**

```text
test/
├── judge-suite/          §15 判题结果验收集（AC/WA/CE/RE/TLE/MLE/OLE）
│   ├── SYS001-AB/        内部系统测试题
│   ├── check-fixtures.sh 本地校验"用例本身写对了"
│   └── build.sh          打成 Hydro 可导入包
└── sandbox-suite/        §16 沙箱安全隔离用例
```

## 为什么要有本地校验

上线时如果判题结果不对，有两种可能：**用例写错了**，或者**Judge 坏了**。
`check-fixtures.sh` 的作用就是把这两者分开：

| 本地校验 | 服务器判题 | 结论 |
|---|---|---|
| 全绿 | 异常 | 问题在 Hydro / Judge / 沙箱 |
| 有红 | — | 先修用例，别去动服务器 |

它**不是**判题机的替代品。TLE / MLE / OLE 的最终判定必须在 Hydro 沙箱里做。

```bash
bash test/judge-suite/check-fixtures.sh              # 编译期 + 输出比对
bash test/judge-suite/check-fixtures.sh --with-heavy # 额外跑 TLE/MLE/OLE/RE
```

## SYS001 预期结果表（§15）

在 Hydro 里提交下面这些代码，结果必须逐一吻合：

| 提交文件 | 语言 | 预期结果 | 说明 |
|---|---|---|---|
| `submissions/ac.cpp` | C++17 | **Accepted** | 标准解法 |
| `submissions/wa.cpp` | C++17 | **Wrong Answer** | 输出 a-b |
| `submissions/ce.cpp` | C++17 | **Compile Error** | 缺少分号与右括号 |
| `submissions/re.cpp` | C++17 | **Runtime Error** | 除零 / 空指针解引用 |
| `submissions/tle.cpp` | C++17 | **Time Limit Exceeded** | 非阻塞死循环 |
| `submissions/mle.cpp` | C++17 | **Memory Limit Exceeded** | 持续申请内存 |
| `submissions/ole.cpp` | C++17 | **Output Limit Exceeded** | 无限输出（部分版本可能报 TLE） |
| `submissions/ac.py` | Python 3 | **Accepted** | 验证 Python 链路 |
| `submissions/wa.py` | Python 3 | **Wrong Answer** | |
| `submissions/re.py` | Python 3 | **Runtime Error** | 数组越界 |

> `ole.cpp` 在部分版本上会被判 TLE 而不是 OLE —— 这属于 Hydro 的行为差异，
> 记录实际结果即可，不要为了"看起来一致"去改判题逻辑。

**不能只看语言下拉框里出现名字**（§14）：C / C++17 / Python 3 三种语言
都必须实际跑过上面这张表，Java 作为下一项同样处理。

## Sandbox 用例（§16）

| 用例 | 期望 |
|---|---|
| `infinite_loop.cpp` | 判 TLE，评测机不被拖死 |
| `memory_alloc.cpp` | 判 MLE，评测机内存不被拖垮 |
| `fork_test.cpp` | 子进程数受沙箱限制 |
| `network_test.py` | 连接外网与本机 MongoDB / Hydro 端口**全部被拦** |
| `filesystem_test.cpp` | 读不到 `/etc/shadow`、`/root/.ssh/*`、`~/.hydro/config.json`、`/data/file` |
| `output_flood.cpp` | 判 OLE，不会写满磁盘 |

**红线**：只要 `filesystem_test` 或 `network_test` 有任何一项成功，
**Judge 一律不得上线**（§16）。这不是"建议优化"，是上线门槛。
