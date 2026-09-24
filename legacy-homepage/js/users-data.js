/* ============================================================
   SYLU OJ · 用户占位数据（排行榜页 level.html 与个人主页 user.html 共用）
   接入后端后由 GET /api/rank 与 GET /api/users/:username 返回，
   字段同名即可，届时本文件可整体删除。
   ============================================================ */

/* 字段说明：
   username     用户名（唯一，个人主页用 ?username= 定位）
   nickname     昵称
   college      学院
   role         user 普通用户 / admin 管理员
   joinedAt     注册时间（YYYY-MM-DD）
   solved       通过题数
   submissions  提交次数
   accepted     通过次数（通过率 = accepted / submissions）
   recent       最近提交记录（占位数据只为主要用户提供，可为空数组）
                { code, verdict, language, timeUsedMs, memoryUsedKb, minutesAgo }
   contests     参赛记录（同上）
                { title, format, rank, solved, score, minutesAgo }

   说明：个人主页「已通过」列表由 solved 题数按题号顺序取前 N 道推断
   （见 js/user.js），接入后端后改为按 submissions 表统计。 */

window.SYLU_USERS = [
  {
    username: 'chen_rui', nickname: '陈锐', college: '计算机科学与工程学院', role: 'user', joinedAt: '2025-09-01',
    solved: 16, submissions: 38, accepted: 29,
    recent: [
      { code: 'CS001-01-016', verdict: 'AC', language: 'cpp', timeUsedMs: 42, memoryUsedKb: 3276, minutesAgo: 25 },
      { code: 'CS001-01-015', verdict: 'WA', language: 'cpp', timeUsedMs: 31, memoryUsedKb: 3104, minutesAgo: 48 },
      { code: 'CS001-01-015', verdict: 'AC', language: 'cpp', timeUsedMs: 29, memoryUsedKb: 3140, minutesAgo: 55 },
      { code: 'CS001-01-012', verdict: 'AC', language: 'cpp', timeUsedMs: 118, memoryUsedKb: 5248, minutesAgo: 180 },
      { code: 'CS001-01-012', verdict: 'TLE', language: 'python', timeUsedMs: 2000, memoryUsedKb: 7424, minutesAgo: 220 },
      { code: 'CS001-01-013', verdict: 'AC', language: 'cpp', timeUsedMs: 24, memoryUsedKb: 2960, minutesAgo: 400 }
    ],
    contests: [
      { title: '2026-2027 第一学期周赛 #1', format: 'ACM', rank: 1, solved: 7, score: 0, minutesAgo: 1440 },
      { title: '第 X 届程序设计竞赛（校赛）', format: 'ACM', rank: 1, solved: 11, score: 0, minutesAgo: 12960 }
    ]
  },
  {
    username: 'sylu_2026', nickname: '算法小白', college: '信息科学与工程学院', role: 'user', joinedAt: '2025-09-08',
    solved: 15, submissions: 44, accepted: 30,
    recent: [
      { code: 'CS001-01-014', verdict: 'WA', language: 'cpp', timeUsedMs: 55, memoryUsedKb: 3420, minutesAgo: 35 },
      { code: 'CS001-01-010', verdict: 'AC', language: 'cpp', timeUsedMs: 36, memoryUsedKb: 3040, minutesAgo: 120 },
      { code: 'CS001-01-009', verdict: 'CE', language: 'cpp', timeUsedMs: 0, memoryUsedKb: 0, minutesAgo: 150 },
      { code: 'CS001-01-008', verdict: 'AC', language: 'python', timeUsedMs: 210, memoryUsedKb: 9120, minutesAgo: 300 },
      { code: 'CS001-01-007', verdict: 'RE', language: 'cpp', timeUsedMs: 18, memoryUsedKb: 2880, minutesAgo: 480 },
      { code: 'CS001-01-005', verdict: 'WA', language: 'cpp', timeUsedMs: 44, memoryUsedKb: 3200, minutesAgo: 720 }
    ],
    contests: [
      { title: '新生程序设计入门赛', format: 'OI', rank: 4, solved: 8, score: 780, minutesAgo: 2880 },
      { title: '2026-2027 第一学期周赛 #1', format: 'ACM', rank: 6, solved: 5, score: 0, minutesAgo: 1440 }
    ]
  },
  {
    username: 'zhao_min', nickname: '赵敏', college: '计算机科学与工程学院', role: 'user', joinedAt: '2025-09-08',
    solved: 14, submissions: 33, accepted: 24,
    recent: [
      { code: 'CS001-01-015', verdict: 'AC', language: 'cpp', timeUsedMs: 33, memoryUsedKb: 3180, minutesAgo: 60 },
      { code: 'CS001-01-014', verdict: 'TLE', language: 'cpp', timeUsedMs: 1005, memoryUsedKb: 4096, minutesAgo: 95 },
      { code: 'CS001-01-011', verdict: 'AC', language: 'cpp', timeUsedMs: 27, memoryUsedKb: 3010, minutesAgo: 240 },
      { code: 'CS001-01-006', verdict: 'AC', language: 'python', timeUsedMs: 180, memoryUsedKb: 8800, minutesAgo: 360 },
      { code: 'CS001-01-004', verdict: 'AC', language: 'cpp', timeUsedMs: 15, memoryUsedKb: 2980, minutesAgo: 600 }
    ],
    contests: [
      { title: '2025-2026 第二学期周赛 #12', format: 'ACM', rank: 3, solved: 6, score: 0, minutesAgo: 43200 },
      { title: '数据结构实验赛', format: 'OI', rank: 5, solved: 5, score: 520, minutesAgo: 60480 }
    ]
  },
  {
    username: 'wang_ke', nickname: '王珂', college: '信息科学与工程学院', role: 'user', joinedAt: '2025-09-12',
    solved: 12, submissions: 29, accepted: 21,
    recent: [
      { code: 'CS001-01-013', verdict: 'WA', language: 'cpp', timeUsedMs: 40, memoryUsedKb: 3300, minutesAgo: 80 },
      { code: 'CS001-01-009', verdict: 'AC', language: 'java', timeUsedMs: 260, memoryUsedKb: 38400, minutesAgo: 200 },
      { code: 'CS001-01-006', verdict: 'AC', language: 'cpp', timeUsedMs: 20, memoryUsedKb: 2960, minutesAgo: 420 },
      { code: 'CS001-01-002', verdict: 'AC', language: 'cpp', timeUsedMs: 12, memoryUsedKb: 2900, minutesAgo: 800 }
    ],
    contests: [
      { title: '新生程序设计入门赛', format: 'OI', rank: 9, solved: 6, score: 610, minutesAgo: 2880 },
      { title: '字符串专题训练', format: 'IOI', rank: 7, solved: 3, score: 300, minutesAgo: 1800 }
    ]
  },
  {
    username: 'zhtjjk', nickname: 'zhtjjk', college: '国际工程学院', role: 'user', joinedAt: '2025-09-20',
    solved: 1, submissions: 5, accepted: 1,
    recent: [
      { code: 'CS001-01-001', verdict: 'AC', language: 'cpp', timeUsedMs: 10, memoryUsedKb: 2860, minutesAgo: 30 },
      { code: 'CS001-01-002', verdict: 'WA', language: 'cpp', timeUsedMs: 9, memoryUsedKb: 2840, minutesAgo: 90 },
      { code: 'CS001-01-002', verdict: 'CE', language: 'c', timeUsedMs: 0, memoryUsedKb: 0, minutesAgo: 100 }
    ],
    contests: []
  },

  { username: 'li_hao', nickname: '李昊', college: '自动化与电气工程学院', role: 'user', joinedAt: '2025-09-05', solved: 13, submissions: 41, accepted: 27, recent: [], contests: [] },
  { username: 'sun_yi', nickname: '孙一', college: '机械工程学院', role: 'user', joinedAt: '2025-09-06', solved: 11, submissions: 35, accepted: 22, recent: [], contests: [] },
  { username: 'zhou_lin', nickname: '周琳', college: '计算机科学与工程学院', role: 'user', joinedAt: '2025-09-06', solved: 11, submissions: 26, accepted: 19, recent: [], contests: [] },
  { username: 'xiao_yu', nickname: '肖宇', college: '其他学院', role: 'user', joinedAt: '2025-09-10', solved: 10, submissions: 31, accepted: 18, recent: [], contests: [] },
  { username: 'huang_tao', nickname: '黄涛', college: '信息科学与工程学院', role: 'user', joinedAt: '2025-09-10', solved: 9, submissions: 24, accepted: 15, recent: [], contests: [] },
  { username: 'lin_xi', nickname: '林夕', college: '自动化与电气工程学院', role: 'user', joinedAt: '2025-09-11', solved: 8, submissions: 22, accepted: 14, recent: [], contests: [] },
  { username: 'gao_fan', nickname: '高帆', college: '机械工程学院', role: 'user', joinedAt: '2025-09-11', solved: 8, submissions: 30, accepted: 16, recent: [], contests: [] },
  { username: 'meng_qi', nickname: '孟琪', college: '计算机科学与工程学院', role: 'user', joinedAt: '2025-09-13', solved: 7, submissions: 19, accepted: 12, recent: [], contests: [] },
  { username: 'du_yu', nickname: '杜宇', college: '其他学院', role: 'user', joinedAt: '2025-09-14', solved: 6, submissions: 21, accepted: 11, recent: [], contests: [] },
  { username: 'feng_lei', nickname: '冯磊', college: '信息科学与工程学院', role: 'user', joinedAt: '2025-09-15', solved: 5, submissions: 16, accepted: 9, recent: [], contests: [] },
  { username: 'tang_xin', nickname: '唐欣', college: '自动化与电气工程学院', role: 'user', joinedAt: '2025-09-16', solved: 4, submissions: 13, accepted: 7, recent: [], contests: [] },
  { username: 'bai_yun', nickname: '白云', college: '机械工程学院', role: 'user', joinedAt: '2025-09-18', solved: 3, submissions: 11, accepted: 5, recent: [], contests: [] },
  { username: 'yan_ning', nickname: '闫宁', college: '其他学院', role: 'user', joinedAt: '2025-09-19', solved: 2, submissions: 9, accepted: 3, recent: [], contests: [] },
  { username: 'newbie_01', nickname: '新同学', college: '信息科学与工程学院', role: 'user', joinedAt: '2025-09-21', solved: 1, submissions: 5, accepted: 1, recent: [], contests: [] }
];
