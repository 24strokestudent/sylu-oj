/* ============================================================
   SYLU OJ · 讨论区占位数据（列表页 talk.html 与详情页 topic.html 共用）
   接入后端后由 GET /api/topics 与 GET /api/topics/:id 返回，
   字段同名即可，届时本文件可整体删除。
   ============================================================ */

/* 字段说明：
   id            话题 id（详情页用 ?id= 定位）
   title         标题
   category      分类：题解 / 求助 / 公告 / 闲聊
   author        作者昵称
   authorUsername 作者用户名（用于链接到个人主页；系统管理员不在用户数据里，留空）
   college       学院
   problem       关联题目编号（可空）
   replies       回复数（列表页显示的总数）
   views         浏览数
   likes         点赞数
   createdAgo    发布于多少分钟前
   lastReplyAgo  最后回复于多少分钟前
   body          正文（用 \n\n 分段）
   replyList     回复列表（占位数据只提供少量回复，见下方 note）

   说明：列表页的 replies 是「总数」，而 replyList 只是占位示例（2-4 条），
   详情页会明确标注这一点；接入后端后由 /api/topics/:id/replies 分页返回。 */

window.SYLU_TOPICS = [
  {
    id: 1,
    title: '「A+B 问题」的三种读入方式与性能对比',
    category: '题解',
    author: '陈锐',
    authorUsername: 'chen_rui',
    college: '计算机科学与工程学院',
    problem: 'CS001-01-005',
    replies: 12,
    views: 240,
    likes: 18,
    createdAgo: 2880,
    lastReplyAgo: 45,
    body: '这道题本身很简单，但读入方式值得单独说一次。我用三种写法各提交了 5 次取平均：cin 关闭同步流约 12ms，scanf 约 9ms，手写快读约 6ms。\n\n数据量小的时候差别可以忽略，但到了 10^6 级别，cin 不关同步会明显拖慢。建议平时用 cin 配合 ios::sync_with_stdio(false) 就够，卡常数时再上手写快读。\n\n另外提醒一点：cin.tie(0) 最好一起写，否则 endl 会强制刷新缓冲区，比读入本身更伤性能。',
    replyList: [
      { id: 101, author: '周琳', authorUsername: 'zhou_lin', college: '计算机科学与工程学院', body: '补充一点，cin.tie(0) 也要一起写，不然 endl 会强制刷新缓冲区。', minutesAgo: 45, likes: 6 },
      { id: 102, author: '新同学', authorUsername: 'newbie_01', college: '信息科学与工程学院', body: '快读的模板能贴一下吗？我一直没记牢 getchar 的写法。', minutesAgo: 30, likes: 2 },
      { id: 103, author: '陈锐', authorUsername: 'chen_rui', college: '计算机科学与工程学院', body: '已经补在正文最后了，注意负数要单独判断符号。', minutesAgo: 18, likes: 4, isOwner: true }
    ]
  },
  {
    id: 2,
    title: '评测结果是 Runtime Error，本地能过，求帮忙看看',
    category: '求助',
    author: '新同学',
    authorUsername: 'newbie_01',
    college: '信息科学与工程学院',
    problem: 'CS001-01-003',
    replies: 8,
    views: 156,
    likes: 3,
    createdAgo: 180,
    lastReplyAgo: 12,
    body: '本地跑样例都是对的，提交之后一直 RE，题目是 CS001-01-003（最大公约数与最小公倍数）。\n\n我全程用的 int，是不是溢出了？还是除零了？代码贴在下面，麻烦帮忙看一下。\n\nint g = gcd(a, b); cout << g << " " << a / g * b << endl;',
    replyList: [
      { id: 201, author: '陈锐', authorUsername: 'chen_rui', college: '计算机科学与工程学院', body: '大概率是溢出：a / g * b 在 a、b 都接近 10^9 时会超出 int 范围，换成 long long 就好。', minutesAgo: 12, likes: 5 },
      { id: 202, author: '赵敏', authorUsername: 'zhao_min', college: '计算机科学与工程学院', body: '也有可能是除以 0。题目虽然说正整数，但建议还是加一句判断更稳。', minutesAgo: 25, likes: 2 }
    ]
  },
  {
    id: 3,
    title: '2026 秋季学期 OJ 平台升级公告',
    category: '公告',
    author: '系统管理员',
    authorUsername: '',
    college: '其他学院',
    problem: '',
    replies: 3,
    views: 512,
    likes: 9,
    createdAgo: 10080,
    lastReplyAgo: 4320,
    body: '平台已完成秋季学期升级，主要变化如下：\n\n1. 新增讨论区与排行榜页面；\n2. 题库支持按难度与知识点筛选；\n3. 评测机正在接入中，预计近期开放提交。\n\n升级期间历史提交记录不受影响。如遇到页面异常，请在本帖回复或联系管理员。',
    replyList: [
      { id: 301, author: '白云', authorUsername: 'bai_yun', college: '机械工程学院', body: '排行榜终于有了，赞一个。', minutesAgo: 4320, likes: 3 },
      { id: 302, author: '唐欣', authorUsername: 'tang_xin', college: '自动化与电气工程学院', body: '请问判题什么时候能用？想早点开始刷题。', minutesAgo: 2880, likes: 1 }
    ]
  },
  {
    id: 4,
    title: '并查集路径压缩的两种写法与复杂度分析',
    category: '题解',
    author: '赵敏',
    authorUsername: 'zhao_min',
    college: '计算机科学与工程学院',
    problem: 'CS001-01-004',
    replies: 9,
    views: 198,
    likes: 14,
    createdAgo: 1440,
    lastReplyAgo: 120,
    body: '路径压缩有两种常见写法：递归版和迭代版。\n\n递归版代码简洁，但层数很深时有爆栈风险；迭代版要先找到根，再回头把路径上的父指针全部改掉，代码稍长但更安全。\n\n配合按秩合并后，单次操作的均摊复杂度是反阿克曼函数，在实际数据规模下可以当成常数看待。',
    replyList: [
      { id: 401, author: '周琳', authorUsername: 'zhou_lin', college: '计算机科学与工程学院', body: '迭代版还有个技巧是路径减半，代码更短，效果也够用。', minutesAgo: 120, likes: 4 },
      { id: 402, author: '新同学', authorUsername: 'newbie_01', college: '信息科学与工程学院', body: '按秩合并就是按 size 合并吗？', minutesAgo: 240, likes: 1 },
      { id: 403, author: '赵敏', authorUsername: 'zhao_min', college: '计算机科学与工程学院', body: '按秩（rank）或按 size 都行，效果接近，选一个顺手的就好。', minutesAgo: 200, likes: 3, isOwner: true }
    ]
  },
  {
    id: 5,
    title: '大家平时都用什么编辑器写题？',
    category: '闲聊',
    author: '白云',
    authorUsername: 'bai_yun',
    college: '机械工程学院',
    problem: '',
    replies: 21,
    views: 330,
    likes: 11,
    createdAgo: 720,
    lastReplyAgo: 30,
    body: '想统计一下大家平时都用什么写题。我自己是 VS Code 加插件，但听说不少人还在用 Dev-C++，也有人用 CLion。\n\n主要想了解哪个调试最顺手，尤其是单步看数组的时候。',
    replyList: [
      { id: 501, author: '王珂', authorUsername: 'wang_ke', college: '信息科学与工程学院', body: 'VS Code 配 cpptools，断点调试够用了，还能看 STL 容器。', minutesAgo: 30, likes: 5 },
      { id: 502, author: '李昊', authorUsername: 'li_hao', college: '自动化与电气工程学院', body: '还是习惯 Dev-C++，启动快，写小题目不折腾。', minutesAgo: 45, likes: 2 },
      { id: 503, author: '唐欣', authorUsername: 'tang_xin', college: '自动化与电气工程学院', body: '用 IDE 自带的模板，省得每次写头文件。', minutesAgo: 60, likes: 1 }
    ]
  },
  {
    id: 6,
    title: '为什么浮点数比较总是 WA？',
    category: '求助',
    author: '闫宁',
    authorUsername: 'yan_ning',
    college: '其他学院',
    problem: 'CS001-01-002',
    replies: 6,
    views: 121,
    likes: 2,
    createdAgo: 300,
    lastReplyAgo: 90,
    body: '题目里要判断两个实数是否相等，我写的是 if (a == b)，结果一直 WA。改成 fabs(a - b) < 1e-6 之后就过了。\n\n这是为什么？是编译器的问题吗？',
    replyList: [
      { id: 601, author: '陈锐', authorUsername: 'chen_rui', college: '计算机科学与工程学院', body: '不是编译器的问题。浮点数在二进制里存不下精确值，两个理论上相等的数可能差 1e-16，用 == 必然不可靠。', minutesAgo: 90, likes: 6 },
      { id: 602, author: '赵敏', authorUsername: 'zhao_min', college: '计算机科学与工程学院', body: 'eps 一般按题目要求的精度选，常见是 1e-6 或 1e-8，比要求再小一到两个数量级比较稳。', minutesAgo: 110, likes: 3 }
    ]
  },
  {
    id: 7,
    title: '二分答案的边界处理模板（附例题）',
    category: '题解',
    author: '周琳',
    authorUsername: 'zhou_lin',
    college: '计算机科学与工程学院',
    problem: 'CS001-01-005',
    replies: 15,
    views: 287,
    likes: 23,
    createdAgo: 4320,
    lastReplyAgo: 60,
    body: '二分最容易错在边界，我固定用这个模板：\n\nwhile (l < r) { mid = (l + r) >> 1; if (check(mid)) r = mid; else l = mid + 1; }\n\n这样写不会死循环，也不需要额外判断。注意 mid 用的是下取整，如果写成 (l + r + 1) >> 1，取整方向就反了，必须同时调整 l、r 的更新方式，两者混用一定死循环。',
    replyList: [
      { id: 701, author: '陈锐', authorUsername: 'chen_rui', college: '计算机科学与工程学院', body: '这个模板我一直在用，配合单调性判断很稳，推荐背下来。', minutesAgo: 60, likes: 7 },
      { id: 702, author: '冯磊', authorUsername: 'feng_lei', college: '信息科学与工程学院', body: '取整方向那段能再展开说说吗？我总是搞混。', minutesAgo: 120, likes: 1 },
      { id: 703, author: '周琳', authorUsername: 'zhou_lin', college: '计算机科学与工程学院', body: '记一句话就够：check 为真时保留 mid，就用下取整。', minutesAgo: 100, likes: 5, isOwner: true }
    ]
  },
  {
    id: 8,
    title: '第 X 届程序设计竞赛报名开启',
    category: '公告',
    author: '系统管理员',
    authorUsername: '',
    college: '其他学院',
    problem: '',
    replies: 5,
    views: 402,
    likes: 7,
    createdAgo: 8640,
    lastReplyAgo: 2880,
    body: '第 X 届程序设计竞赛即日起开始报名，面向全校本科生。\n\n赛制：ACM，时长 5 小时，12 道题。\n报名方式：在比赛页面点击报名按钮，截止时间见比赛详情。\n\n赛后开放题解与榜单，欢迎各年级同学参加。',
    replyList: [
      { id: 801, author: '李昊', authorUsername: 'li_hao', college: '自动化与电气工程学院', body: '请问是组队还是个人赛？', minutesAgo: 2880, likes: 2 },
      { id: 802, author: '系统管理员', authorUsername: '', college: '其他学院', body: '个人赛，机房统一安排座位，具体安排见赛前通知。', minutesAgo: 2600, likes: 1, isOwner: true }
    ]
  },
  {
    id: 9,
    title: '内存超限该怎么优化？',
    category: '求助',
    author: '冯磊',
    authorUsername: 'feng_lei',
    college: '信息科学与工程学院',
    problem: 'CS001-01-004',
    replies: 4,
    views: 88,
    likes: 1,
    createdAgo: 240,
    lastReplyAgo: 150,
    body: '题目内存限制 256MB，我开了 int dp[5000][5000]，直接 MLE。\n\n这个规模应该怎么优化？是不是必须换算法？',
    replyList: [
      { id: 901, author: '周琳', authorUsername: 'zhou_lin', college: '计算机科学与工程学院', body: '5000×5000 个 int 就是 100MB，开两维很容易爆。能滚动数组就先滚成一维。', minutesAgo: 150, likes: 3 },
      { id: 902, author: '陈锐', authorUsername: 'chen_rui', college: '计算机科学与工程学院', body: '或者看数据范围够不够用 short，能省一半。', minutesAgo: 180, likes: 1 }
    ]
  },
  {
    id: 10,
    title: '前缀和与差分：从入门到熟练',
    category: '题解',
    author: '王珂',
    authorUsername: 'wang_ke',
    college: '信息科学与工程学院',
    problem: 'CS001-01-003',
    replies: 11,
    views: 205,
    likes: 16,
    createdAgo: 5760,
    lastReplyAgo: 240,
    body: '前缀和解决「区间和查询」，差分解决「区间修改」，共同点是先做一次预处理，把区间操作降到 O(1)。\n\n选哪个看操作比例：查询多、修改少就用前缀和；修改多、查询少就用差分。\n\n两者还能一起用在二维矩阵上，处理子矩阵修改与查询。',
    replyList: [
      { id: 1001, author: '闫宁', authorUsername: 'yan_ning', college: '其他学院', body: '差分的还原是不是求一次前缀和？', minutesAgo: 240, likes: 2 },
      { id: 1002, author: '王珂', authorUsername: 'wang_ke', college: '信息科学与工程学院', body: '对，差分数组求一次前缀和就回到原数组，这也是它好写的原因。', minutesAgo: 200, likes: 4, isOwner: true }
    ]
  },
  {
    id: 11,
    title: '新生赛都准备得怎么样了',
    category: '闲聊',
    author: '唐欣',
    authorUsername: 'tang_xin',
    college: '自动化与电气工程学院',
    problem: '',
    replies: 17,
    views: 190,
    likes: 8,
    createdAgo: 1440,
    lastReplyAgo: 20,
    body: '新生赛马上开始了，大家准备得怎么样？\n\n我最近在补基础语法和简单模拟，感觉进度还是慢。有没有推荐的刷题顺序？',
    replyList: [
      { id: 1101, author: '新同学', authorUsername: 'newbie_01', college: '信息科学与工程学院', body: '同为新生，正在按题号顺序刷。', minutesAgo: 20, likes: 1 },
      { id: 1102, author: '孟琪', authorUsername: 'meng_qi', college: '计算机科学与工程学院', body: '建议先把简单题刷完再碰中等，不然容易劝退。', minutesAgo: 35, likes: 3 },
      { id: 1103, author: '唐欣', authorUsername: 'tang_xin', college: '自动化与电气工程学院', body: '谢谢，我先把题库里的简单题过一遍。', minutesAgo: 50, likes: 1, isOwner: true }
    ]
  },
  {
    id: 12,
    title: '编译错误看不懂，求翻译一下这几行',
    category: '求助',
    author: '孟琪',
    authorUsername: 'meng_qi',
    college: '计算机科学与工程学院',
    problem: 'CS001-01-001',
    replies: 2,
    views: 64,
    likes: 0,
    createdAgo: 90,
    lastReplyAgo: 55,
    body: '编译器报了好长一串，我只看到 expected \';\' before \'}\' token。\n\n是不是少了一个分号？但报错的行号看起来是我写好的那一行。',
    replyList: [
      { id: 1201, author: '陈锐', authorUsername: 'chen_rui', college: '计算机科学与工程学院', body: '就是少分号。编译器通常把错误报在漏掉分号的下一行，往上一行看就行。', minutesAgo: 55, likes: 4 }
    ]
  },
  {
    id: 13,
    title: '动态规划状态设计的通用思路',
    category: '题解',
    author: '李昊',
    authorUsername: 'li_hao',
    college: '自动化与电气工程学院',
    problem: 'CS001-01-005',
    replies: 13,
    views: 265,
    likes: 19,
    createdAgo: 7200,
    lastReplyAgo: 480,
    body: '设计状态我一般走三步：\n\n1. 想清楚「阶段」是什么，也就是按什么顺序推进；\n2. 想清楚状态量需要哪些维度，够用就好；\n3. 写出转移方程，再检查边界。\n\n最常见的坑是状态定义不完整，转移时发现缺信息。宁可多一维，也不要让状态有歧义。',
    replyList: [
      { id: 1301, author: '赵敏', authorUsername: 'zhao_min', college: '计算机科学与工程学院', body: '多一维的代价是空间，滚动数组可以救回来。', minutesAgo: 480, likes: 5 },
      { id: 1302, author: '王珂', authorUsername: 'wang_ke', college: '信息科学与工程学院', body: '有没有推荐的入门题单？', minutesAgo: 600, likes: 1 },
      { id: 1303, author: '李昊', authorUsername: 'li_hao', college: '自动化与电气工程学院', body: '从 0-1 背包和最长上升子序列开始就够了，先把一维写熟。', minutesAgo: 540, likes: 3, isOwner: true }
    ]
  },
  {
    id: 14,
    title: '关于新生账号统一注册的通知',
    category: '公告',
    author: '系统管理员',
    authorUsername: '',
    college: '其他学院',
    problem: '',
    replies: 1,
    views: 356,
    likes: 4,
    createdAgo: 12960,
    lastReplyAgo: 12000,
    body: '本学期新生账号将统一注册，请使用本人学号与学院邮箱完成注册。\n\n若提示学号已被占用，请联系管理员核实，不要使用他人学号注册。\n\n注册后建议尽快到个人主页确认学院信息是否正确。',
    replyList: [
      { id: 1401, author: '孟琪', authorUsername: 'meng_qi', college: '计算机科学与工程学院', body: '请问邮箱必须是学校邮箱吗？', minutesAgo: 12000, likes: 1 }
    ]
  }
];
