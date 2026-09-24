/* ============================================================
   SYLU OJ · 题库占位数据（题库页 bank.html 与题目详情页 problem.html 共用）
   接入后端后由 GET /api/problems 与 GET /api/problems/:code 返回，
   字段同名即可，届时本文件可整体删除。
   ============================================================ */

/* 字段说明：
   code           题号（唯一）
   title          标题
   difficulty     难度：简单 / 中等 / 困难
   tags           知识点数组
   submissions    提交次数（与 accepted 一起算通过率）
   accepted       通过次数
   status         当前用户的提交状态：solved 已通过 / attempted 尝试过 / none 未尝试
                  （登录后应随用户变化，未登录时全部为 none）
   timeLimitMs    时间限制（毫秒）
   memoryLimitMb  内存限制（MB）
   description    题目描述
   inputFormat    输入格式
   outputFormat   输出格式
   samples        样例数组：[{ input, output }]
   hint           提示（可为空字符串）

   16 道题的提交与通过合计分别为 235 / 137，与首页统计条一致。 */

window.SYLU_PROBLEMS = [
  {
    code: 'CS001-01-001',
    title: 'A+B 问题',
    difficulty: '简单',
    tags: ['模拟'],
    submissions: 30,
    accepted: 22,
    status: 'solved',
    timeLimitMs: 1000,
    memoryLimitMb: 256,
    description: '输入两个整数 a 和 b，输出它们的和。这是最基础的输入输出练习，用来确认你的提交环境与判题流程是否正常。',
    inputFormat: '一行，两个整数 a 和 b（-10^9 ≤ a, b ≤ 10^9），用空格分隔。',
    outputFormat: '一行，一个整数，表示 a + b。',
    samples: [{ input: '1 2', output: '3' }],
    hint: 'a + b 可能超出 32 位整数范围，建议使用 long long。'
  },
  {
    code: 'CS001-01-002',
    title: '闰年判断',
    difficulty: '简单',
    tags: ['模拟'],
    submissions: 26,
    accepted: 18,
    status: 'solved',
    timeLimitMs: 1000,
    memoryLimitMb: 256,
    description: '给定一个年份，判断它是否为闰年。闰年的条件是：能被 4 整除但不能被 100 整除，或者能被 400 整除。',
    inputFormat: '一行，一个正整数 y（1 ≤ y ≤ 9999）。',
    outputFormat: '如果是闰年输出 yes，否则输出 no。',
    samples: [{ input: '2000', output: 'yes' }],
    hint: '注意运算符优先级，判断条件建议加括号。'
  },
  {
    code: 'CS001-01-003',
    title: '最大公约数与最小公倍数',
    difficulty: '简单',
    tags: ['数学'],
    submissions: 22,
    accepted: 16,
    status: 'solved',
    timeLimitMs: 1000,
    memoryLimitMb: 256,
    description: '给定两个正整数 a 和 b，求它们的最大公约数与最小公倍数。',
    inputFormat: '一行，两个正整数 a 和 b（1 ≤ a, b ≤ 10^9），用空格分隔。',
    outputFormat: '一行，两个整数，分别为最大公约数和最小公倍数，用空格分隔。',
    samples: [{ input: '12 18', output: '6 36' }],
    hint: '最小公倍数 = a / gcd(a, b) * b，先除后乘可以避免中间结果溢出。'
  },
  {
    code: 'CS001-01-004',
    title: '斐波那契数列',
    difficulty: '简单',
    tags: ['数学'],
    submissions: 20,
    accepted: 14,
    status: 'solved',
    timeLimitMs: 1000,
    memoryLimitMb: 256,
    description: '求斐波那契数列的第 n 项。其中 f(1) = f(2) = 1，f(n) = f(n-1) + f(n-2)。',
    inputFormat: '一行，一个正整数 n（1 ≤ n ≤ 90）。',
    outputFormat: '一行，一个整数，表示 f(n)。',
    samples: [{ input: '10', output: '55' }],
    hint: 'n 较大时结果会超出 int 范围，请使用 long long。'
  },
  {
    code: 'CS001-01-005',
    title: '质数判断',
    difficulty: '中等',
    tags: ['数学'],
    submissions: 24,
    accepted: 9,
    status: 'attempted',
    timeLimitMs: 1000,
    memoryLimitMb: 256,
    description: '判断一个正整数 n 是否为质数。质数是指只能被 1 和它自身整除、且大于 1 的整数。',
    inputFormat: '一行，一个正整数 n（1 ≤ n ≤ 10^12）。',
    outputFormat: '如果 n 是质数输出 yes，否则输出 no。',
    samples: [{ input: '97', output: 'yes' }],
    hint: '只需试除到 sqrt(n)；注意 1 不是质数。'
  },
  {
    code: 'CS001-01-006',
    title: '字符串反转',
    difficulty: '简单',
    tags: ['字符串'],
    submissions: 18,
    accepted: 13,
    status: 'solved',
    timeLimitMs: 1000,
    memoryLimitMb: 256,
    description: '给定一个不含空格的字符串，把它反转后输出。',
    inputFormat: '一行，一个不含空格的字符串 s（长度不超过 1000）。',
    outputFormat: '一行，反转后的字符串。',
    samples: [{ input: 'abcde', output: 'edcba' }],
    hint: '可以直接倒序输出，也可以用双指针原地交换。'
  },
  {
    code: 'CS001-01-007',
    title: '统计单词个数',
    difficulty: '中等',
    tags: ['字符串'],
    submissions: 16,
    accepted: 12,
    status: 'attempted',
    timeLimitMs: 1000,
    memoryLimitMb: 256,
    description: '给定一行只含字母和空格的字符串，统计其中单词的个数。单词之间可能有多个连续空格，行首行尾也可能有空格。',
    inputFormat: '一行字符串（长度不超过 1000），只包含英文字母和空格。',
    outputFormat: '一行，一个整数，表示单词的个数。',
    samples: [{ input: 'hello   world  oop', output: '3' }],
    hint: '统计从空格进入非空格的次数即可，注意用 getline 读入整行。'
  },
  {
    code: 'CS001-01-008',
    title: '冒泡排序',
    difficulty: '简单',
    tags: ['排序'],
    submissions: 15,
    accepted: 7,
    status: 'none',
    timeLimitMs: 1000,
    memoryLimitMb: 256,
    description: '给定 n 个整数，将它们从小到大排序后输出。',
    inputFormat: '第一行一个整数 n（1 ≤ n ≤ 1000）；第二行 n 个整数，绝对值不超过 10^9，用空格分隔。',
    outputFormat: '一行，n 个整数，从小到大排列，用空格分隔。',
    samples: [{ input: '5\n3 1 4 1 5', output: '1 1 3 4 5' }],
    hint: '本题数据量很小，冒泡排序足够；也可以直接调用标准库的排序函数。'
  },
  {
    code: 'CS001-01-009',
    title: '二分查找',
    difficulty: '中等',
    tags: ['二分'],
    submissions: 12,
    accepted: 9,
    status: 'none',
    timeLimitMs: 1000,
    memoryLimitMb: 256,
    description: '给定一个长度为 n 的升序数组和 q 次询问，每次询问一个整数 x，回答 x 在数组中的下标（从 1 开始编号），若不存在则输出 -1。',
    inputFormat: '第一行两个整数 n 和 q（1 ≤ n, q ≤ 10^5）；第二行 n 个严格升序的整数；接下来 q 行，每行一个整数 x。',
    outputFormat: '共 q 行，每行一个整数表示该次询问的答案。',
    samples: [{ input: '5 2\n1 3 5 7 9\n3\n8', output: '2\n-1' }],
    hint: '直接用二分查找把每次询问降到 O(log n)。'
  },
  {
    code: 'CS001-01-010',
    title: '前缀和入门',
    difficulty: '中等',
    tags: ['前缀和'],
    submissions: 11,
    accepted: 5,
    status: 'attempted',
    timeLimitMs: 1000,
    memoryLimitMb: 256,
    description: '给定一个长度为 n 的整数数组，回答 q 次区间和询问。',
    inputFormat: '第一行两个整数 n 和 q（1 ≤ n, q ≤ 10^5）；第二行 n 个整数；接下来 q 行，每行两个整数 l 和 r（1 ≤ l ≤ r ≤ n）。',
    outputFormat: '共 q 行，每行一个整数，表示区间 [l, r] 内所有元素的和。',
    samples: [{ input: '5 2\n1 2 3 4 5\n1 3\n2 5', output: '6\n14' }],
    hint: '预处理前缀和数组，每次询问 O(1) 回答；注意答案可能超出 int。'
  },
  {
    code: 'CS001-01-011',
    title: '并查集入门',
    difficulty: '中等',
    tags: ['并查集'],
    submissions: 10,
    accepted: 4,
    status: 'none',
    timeLimitMs: 1000,
    memoryLimitMb: 256,
    description: '有 n 个元素，初始时每个元素自成一个集合。需要支持两种操作：把两个元素所在的集合合并；查询两个元素是否属于同一个集合。',
    inputFormat: '第一行两个整数 n 和 m（1 ≤ n, m ≤ 10^5）；接下来 m 行，每行三个整数 op、x、y。op = 1 表示合并 x 与 y 所在集合，op = 2 表示询问 x 与 y 是否在同一集合。',
    outputFormat: '对每个 op = 2 的询问输出一行，在同一集合输出 yes，否则输出 no。',
    samples: [{ input: '3 3\n1 1 2\n2 1 2\n2 1 3', output: 'yes\nno' }],
    hint: '路径压缩加上按秩合并，单次操作近似 O(1)。'
  },
  {
    code: 'CS001-01-012',
    title: '最短路（Dijkstra）',
    difficulty: '困难',
    tags: ['图论'],
    submissions: 9,
    accepted: 3,
    status: 'none',
    timeLimitMs: 2000,
    memoryLimitMb: 256,
    description: '给定 n 个点、m 条边的无向带权图，边权均为非负整数，求 1 号点到 n 号点的最短距离。若无法到达则输出 -1。',
    inputFormat: '第一行两个整数 n 和 m（1 ≤ n ≤ 10^5，0 ≤ m ≤ 2×10^5）；接下来 m 行，每行三个整数 u、v、w（0 ≤ w ≤ 10^9），表示一条连接 u 与 v、权值为 w 的边。',
    outputFormat: '一行，一个整数，表示 1 号点到 n 号点的最短距离；若不可达输出 -1。',
    samples: [{ input: '3 3\n1 2 2\n2 3 3\n1 3 10', output: '5' }],
    hint: '用优先队列优化的 Dijkstra，复杂度 O(m log n)；距离数组要用 long long。'
  },
  {
    code: 'CS001-01-013',
    title: '0-1 背包',
    difficulty: '中等',
    tags: ['动态规划'],
    submissions: 8,
    accepted: 2,
    status: 'none',
    timeLimitMs: 1000,
    memoryLimitMb: 256,
    description: '有 n 件物品和一个容量为 V 的背包，第 i 件物品的体积为 w_i、价值为 v_i，每件物品最多选取一次，求能获得的最大总价值。',
    inputFormat: '第一行两个整数 n 和 V（1 ≤ n ≤ 1000，1 ≤ V ≤ 10000）；接下来 n 行，每行两个整数 w_i 和 v_i。',
    outputFormat: '一行，一个整数，表示最大总价值。',
    samples: [{ input: '3 5\n2 3\n3 4\n4 5', output: '7' }],
    hint: 'dp[j] 表示容量为 j 时的最大价值，体积维度需要倒序枚举以免重复选取。'
  },
  {
    code: 'CS001-01-014',
    title: '最长上升子序列',
    difficulty: '困难',
    tags: ['动态规划'],
    submissions: 6,
    accepted: 1,
    status: 'attempted',
    timeLimitMs: 1000,
    memoryLimitMb: 256,
    description: '给定一个长度为 n 的整数序列，求它的最长严格上升子序列的长度。子序列不要求连续。',
    inputFormat: '第一行一个整数 n（1 ≤ n ≤ 10^5）；第二行 n 个整数，绝对值不超过 10^9。',
    outputFormat: '一行，一个整数，表示最长严格上升子序列的长度。',
    samples: [{ input: '6\n1 7 3 5 9 4', output: '4' }],
    hint: '朴素动态规划是 O(n^2)，可以用贪心加二分优化到 O(n log n)。'
  },
  {
    code: 'CS001-01-015',
    title: '拓扑排序',
    difficulty: '困难',
    tags: ['图论'],
    submissions: 5,
    accepted: 1,
    status: 'none',
    timeLimitMs: 1000,
    memoryLimitMb: 256,
    description: '给定 n 个点、m 条边的有向图，输出它的任意一个拓扑序。若图中存在环，则输出 -1。',
    inputFormat: '第一行两个整数 n 和 m（1 ≤ n ≤ 10^5，0 ≤ m ≤ 2×10^5）；接下来 m 行，每行两个整数 u、v，表示一条从 u 指向 v 的有向边。',
    outputFormat: '一行，n 个整数表示一个拓扑序，用空格分隔；若存在环则输出 -1。',
    samples: [{ input: '3 2\n1 2\n1 3', output: '1 2 3' }],
    hint: '统计每个点的入度，把入度为 0 的点依次入队处理。'
  },
  {
    code: 'CS001-01-016',
    title: '字符串哈希',
    difficulty: '困难',
    tags: ['字符串'],
    submissions: 3,
    accepted: 1,
    status: 'none',
    timeLimitMs: 2000,
    memoryLimitMb: 512,
    description: '给定两个字符串 s 和 t，判断 t 是否为 s 的子串。',
    inputFormat: '两行，第一行为字符串 s，第二行为字符串 t；两者长度均不超过 10^6，只包含小写字母。',
    outputFormat: '若 t 是 s 的子串输出 yes，否则输出 no。',
    samples: [{ input: 'helloworld\nworld', output: 'yes' }],
    hint: '预处理 s 的哈希值，用滚动哈希在 O(n + m) 时间内比较每个等长子串。'
  }
];
