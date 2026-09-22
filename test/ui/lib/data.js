'use strict';

/**
 * 页面数据夹具
 *
 * 形状严格对齐上游 handler 交给模板的变量，而不是我凭空设计的 mock：
 *   - 首页：hydrooj/src/handler/home.ts:147-177（contents[i].sections[j] = [name, payload]）
 *   - 各 payload 形状由各 homepage partial 的取值方式反推（partials/homepage/*.html）
 * 数据内容用"看起来像校内 OJ"的真实语义填充，但不含任何写死的统计数字（ACCEPTANCE §29 §65）。
 */

const { PERM, PRIV, STATUS, model } = require('./hydro');

const HEX = '0123456789abcdef';
let seq = 0;
/** 生成 24 位 hex，模拟 MongoDB ObjectId 的字符串形态 */
function oid(daysAgo = 0) {
    seq += 1;
    const ts = Math.floor((Date.now() - daysAgo * 86400 * 1000) / 1000).toString(16);
    return (ts + String(seq).padStart(4, '0') + Hex(14)).slice(0, 24);
}
function Hex(n) {
    let s = '';
    for (let i = 0; i < n; i++) s += HEX[(i * 7 + seq * 3) % 16];
    return s;
}
const d = (offsetDays, hour = 12) => {
    const x = new Date();
    x.setDate(x.getDate() + offsetDays);
    x.setHours(hour, 30, 0, 0);
    return x;
};

/** udoc：components/user.html 会调 hasPriv/hasPerm */
function user(uid, uname, extra = {}) {
    const u = {
        _id: uid,
        uname,
        displayName: extra.displayName || uname,
        email: `${uname}@example.edu.cn`,
        avatar: '',
        rp: extra.rp || 0,
        bio: extra.bio || '',
        level: extra.level || 0,
        badge: extra.badge || '',
        theme: 'default',
        timeZone: 'Asia/Shanghai',
        domains: [],
        // 编辑器偏好：problem_detail.html:6 把它们塞进 UiContext 供 scratchpad 用
        viewLang: extra.viewLang || 'zh',
        codeLang: extra.codeLang || 'cc',
        codeTemplate: extra.codeTemplate || { cc: '#include <iostream>\nusing namespace std;\n' },
        // _dudoc：domain user doc，problem_sidebar_normal.html 用 .join 判断"加入域名才能提交"
        _dudoc: extra._dudoc || { join: true, role: 'default' },
        _perm: extra.perm === undefined ? PERM.PERM_VIEW_PROBLEM : extra.perm,
        _priv: extra.priv === undefined ? PRIV.PRIV_USER_PROFILE : extra.priv,
        hasPerm(...perms) { return perms.some((p) => (this._perm & p) === p); },
        hasPriv(...privs) { return privs.some((p) => (this._priv & p) === p); },
        // model/user.ts:125-130 逐字移植。题库侧栏用它区分"自己的题"与"有编辑权限"，
        // 缺这个方法的话 problem_sidebar_normal.html:97 直接抛错，整页渲染不出来。
        own(doc, arg1 = false) {
            if (typeof arg1 === 'bigint' && !this.hasPerm(arg1)) return false;
            return (typeof arg1 === 'boolean' && arg1)
                ? doc.owner === this._id
                : doc.owner === this._id || (doc.maintainer || []).includes(this._id);
        },
    };
    return u;
}

// ---------------------------------------------------------------- 首页数据
const STUDENT = user(1001, 'zhangsan', { rp: 120, bio: '计算机 24 级', level: 1 });
const TEACHER = user(1002, 'li-laoshi', { rp: 300, bio: '任课教师', level: 3 });

const P = (pid, title, daysAgo = 1, tag = [], diff = 3) => ({
    docId: oid(daysAgo),
    pid: String(pid),
    title,
    content: '给定两个整数 A 和 B，计算 A+B 的值。',
    ownerUid: 1002,
    tag,
    diff,
    _id: oid(daysAgo),
    updateAt: d(-daysAgo),
    isHidden: false,
});

function recentProblems() {
    const pdocs = [
        P(1001, 'A+B Problem', 0, ['入门', '模拟'], 1),
        P(1002, '数组求和', 1, ['数组'], 2),
        P(1003, '最大子段和', 2, ['动态规划'], 5),
        P(1004, '周期串', 3, ['字符串'], 4),
        P(1005, '最短路径', 4, ['图论', 'dijkstra'], 7),
        P(1006, '高精度加法', 5, ['字符串', '模拟'], 3),
    ];
    return [pdocs, {}];
}

function starredProblems() {
    return [[P(1003, '最大子段和', 6, ['动态规划'], 5), P(1005, '最短路径', 8, ['图论'], 7)]];
}

function contests() {
    const tdocs = [
        {
            docId: oid(0), _id: oid(0), title: '2026 新生程序设计练习赛', rule: 'acm',
            beginAt: d(-0, 18), endAt: d(0, 21), duration: 3, attend: 42, pids: [],
        },
        {
            docId: oid(-3), _id: oid(-3), title: '数据结构专题月赛', rule: 'oi',
            beginAt: d(5, 9), endAt: d(5, 14), duration: 5, attend: 17, pids: [],
        },
        {
            docId: oid(-20), _id: oid(-20), title: '校赛选拔（已结束）', rule: 'acm',
            beginAt: d(-20, 18), endAt: d(-20, 21), attend: 88, pids: [],
        },
    ];
    const tsdict = {};
    tdocs.forEach((t, i) => { tsdict[t.docId] = { attend: i === 0 ? 1 : 0 }; });
    return [tdocs, tsdict];
}

function homeworks() {
    const htdocs = [
        {
            docId: oid(0), _id: oid(0), title: 'C 语言程序设计 · 第三次作业', rule: 'homework',
            beginAt: d(-4, 8), endAt: d(7, 23), penaltySince: d(7, 23), content: '循环与数组。', pids: [],
        },
        {
            docId: oid(-10), _id: oid(-10), title: 'C 语言程序设计 · 第二次作业', rule: 'homework',
            beginAt: d(-14, 8), endAt: d(-7, 23), penaltySince: d(-7, 23), content: '分支结构。', pids: [],
        },
    ];
    const htsdict = {};
    htdocs.forEach((t, i) => { htsdict[t.docId] = { attend: i === 0 ? 1 : 0 }; });
    return [htdocs, htsdict];
}

function trainings() {
    const tdocs = [
        {
            docId: oid(0), _id: oid(0), title: '基础语法训练', content: '顺序、分支、循环的基础题单。',
            dag: [{ _id: 1, title: '顺序结构', pids: [1001, 1002] }, { _id: 2, title: '循环', pids: [1003, 1006] }],
            attend: 63,
        },
        {
            docId: oid(-9), _id: oid(-9), title: '动态规划入门', content: '从最大子段和到背包。',
            dag: [{ _id: 1, title: '线性 DP', pids: [1003] }, { _id: 2, title: '背包', pids: [1007, 1008] }],
            attend: 21,
        },
    ];
    const tsdict = {
        [tdocs[0].docId]: { enroll: true, done: false, donePids: [1001, 1002, 1003] },
        [tdocs[1].docId]: { enroll: false, done: false, donePids: [] },
    };
    return [tdocs, tsdict];
}

function discussions() {
    const problemOid = oid(30);
    const ddocs = [
        {
            _id: oid(0), title: 'P1003 最大子段和的一种写法', nReply: 12, views: 240,
            owner: 1001, updateAt: d(0, 19), parentType: 10, parentId: problemOid, highlight: false,
        },
        {
            _id: oid(1), title: '为什么这个样例一直 WA', nReply: 5, views: 88,
            owner: 1003, updateAt: d(0, 18), parentType: 10, parentId: problemOid, highlight: false,
        },
        {
            _id: oid(2), title: '建议题目列表支持按通过率排序', nReply: 2, views: 41,
            owner: 1004, updateAt: d(-1, 21), parentType: 20, parentId: 'feedback', highlight: false,
        },
    ];
    const vndict = {
        10: { [problemOid]: { title: '最大子段和' } },
        20: { feedback: { title: '反馈建议' } },
        30: {},
    };
    return [ddocs, vndict];
}

function discussionNodes() {
    return [
        { docId: 'qa', content: '问答' },
        { docId: 'solution', content: '题解' },
        { docId: 'feedback', content: '反馈建议' },
        { docId: 'contest', content: '比赛' },
    ];
}

function ranking() {
    return [1001, 1002, 1003];
}

/** 首页公告：正文只放真实信息，Hero 属于模板，不再由 bulletin 承载（§38 §50）。
 *  与 deploy/configure.sh 的 SYLU_BULLETIN 保持一致；不写具体赛事与截止日期，
 *  那是当期信息，也属于未发生的假数据。 */
const BULLETIN = [
    '## 开始使用',
    '',
    '题库、训练题单、比赛与讨论区都在顶部导航；登录后即可提交代码，评测结果实时返回。',
    '',
    '## 评测环境',
    '',
    '提交会在隔离沙箱中运行。编译器、时间限制和内存限制以题目页面显示为准；遇到题面或评测异常，请在讨论区反馈提交记录编号。',
].join('\n');

/** 改造前形态：整块 Hero 塞在公告 HTML 里（configure.sh 在首页模板化之前的 SYLU_BULLETIN，
 *  现已改成正文，这段作为冻结副本保留）。
 *  只用于 baseline-* 场景复现线上现状，并驱动 home.css 的 LEGACY 段——
 *  这些规则按 DOM 位置生效，因为 markdown 过滤器会把 class 剥掉。 */
const HERO_BULLETIN = [
    '<div class="sylu-hero">',
    '  <div>',
    '    <p class="sylu-hero-kicker">WELCOME TO SYLU OJ</p>',
    '    <h1>欢迎来到<em>沈阳理工</em> OJ 网</h1>',
    '    <p class="sylu-hero-desc">一个面向全校师生的在线编程评测平台：多语言判题、比赛系统、题单训练与讨论社区。</p>',
    '    <div class="sylu-hero-actions"><a href="/p">开始刷题</a><a href="/training">浏览训练</a></div>',
    '  </div>',
    '  <div class="sylu-code-window"><div class="sylu-code-bar">main.cpp</div><pre><code>#include &lt;iostream&gt;',
    'using namespace std;',
    'int main() {',
    '  int a, b;',
    '  cin &gt;&gt; a &gt;&gt; b;',
    '  cout &lt;&lt; a + b &lt;&lt; endl;',
    '  return 0;',
    '}</code></pre><div class="sylu-code-result">● Accepted · 在线评测</div></div>',
    '</div>',
    '',
    '<p>判题 · 比赛 · 训练 · 交流，一站式编程学习平台。</p>',
    '',
    '### 核心功能',
    '',
    '- [浏览题库](/p)：按标签和难度查找题目，提交代码并查看评测结果。',
    '- [训练](/training)：进入题单，按计划持续练习。',
    '- [比赛](/contest)：参加站内比赛，实时查看排名。',
    '- [讨论社区](/discuss)：交流解题思路，反馈题面与评测问题。',
    '',
    '### 评测环境',
    '',
    '提交会在隔离沙箱中运行。编译器、时间限制和内存限制以题目页面显示为准；遇到题面或评测异常，请在讨论区反馈提交记录编号。',
].join('\n');

const Udict = {
    1001: user(1001, 'zhangsan', { rp: 1532, bio: '计算机 24 级，喜欢图论', level: 3 }),
    1002: user(1002, 'li-laoshi', { rp: 1480, bio: '任课教师', level: 5, badge: '教师#b12d28#ffffff' }),
    1003: user(1003, 'wangwu', { rp: 1327, bio: '自动化 25 级', level: 2 }),
    1004: user(1004, 'zhaoliu', { rp: 980, level: 1 }),
};

/**
 * 复刻 HomeHandler.get() 的产物：contents = [{ width, sections: [[name, payload]] }]
 * getters[name](limit) 的映射关系同 home.ts:152-166
 */
function homepageContents({ role = 'student', config }) {
    const getters = {
        bulletin: () => true,
        contest: contests,
        homework: homeworks,
        training: trainings,
        discussion: discussions,
        ranking: ranking,
        starred_problems: starredProblems,
        recent_problems: recentProblems,
        discussion_nodes: discussionNodes,
        hitokoto: () => true,
        suggestion: () => true,
        problem_search: () => true,
    };
    return config.map((column) => ({
        width: column.width,
        sections: Object.keys(column).filter((k) => k !== 'width').map((name) => {
            const fn = getters[name];
            if (!fn) return [name, column[name]];
            if (name === 'bulletin') return [name, true];
            if (role === 'guest' && ['homework', 'starred_problems'].includes(name)) return [name, []];
            const res = fn();
            return [name, Array.isArray(res) && res.length === 1 ? res[0] : res];
        }),
    }));
}

/**
 * 题库 / 题面 / 提交记录夹具（计划 §10 §11 §12）
 *
 * 这份夹具只服务沙箱渲染，不会出现在任何生产页面上。分两层看：
 *   - 形状（字段名、嵌套、类型）不是设计出来的，逐个对齐上游 handler 交给模板的
 *     response.body：problem.ts:183-193（题库列表）、problem.ts:355-368（题面）、
 *     record.ts:119-133（记录列表）、record.ts:218-220（记录详情）。
 *     形状错了 → 模板走 `{% else %}` 分支 → 我截到的是"缺数据的页面"，
 *     在它上面写出来的 CSS 也就是错的。
 *   - 取值是"像校内 OJ"的语义，不是统计口径。线上题目数、通过率、判题结果都来自
 *     数据库；这里没有写死任何"全站共有 N 道题 / 通过率 x%"的汇总数（ACCEPTANCE §29）。
 */

/** ProblemDoc（PROJECTION_LIST ∪ config）。pid 与 docId 同号，和站内现有编号习惯一致。 */
function problemDoc(pid, title, extra = {}) {
    const days = extra.days === undefined ? 30 : extra.days;
    return {
        docId: pid,
        _id: oid(days),
        domainId: 'system',
        pid: String(pid),
        title,
        owner: extra.owner === undefined ? 1002 : extra.owner,
        maintainer: [],
        tag: extra.tag || [],
        difficulty: extra.difficulty === undefined ? 3 : extra.difficulty,
        nSubmit: extra.nSubmit || 0,
        nAccept: extra.nAccept || 0,
        hidden: !!extra.hidden,
        isHidden: !!extra.hidden,
        updateAt: d(-days),
        // 单一语言题面：content 是非 JSON 字符串，content 过滤器因此走 markdown 渲染分支
        content: extra.content || [
            '### 题目描述', '', extra.desc || '输入两个整数 A 和 B，你的程序需要输出它们的和。', '',
            '### 输入', '', '一行两个整数 A 和 B，以空格分隔。', '',
            '### 输出', '', '一行一个整数，表示 A+B 的结果。', '',
            '### 样例输入', '', '```', '1 2', '```', '',
            '### 样例输出', '', '```', '3', '```',
        ].join('\n'),
        html: false,
        data: extra.data === undefined ? [{ filename: '1.in', size: 8 }, { filename: '1.out', size: 4 }] : extra.data,
        config: Object.assign({
            type: 'default',
            subType: '',
            timeMin: 1000,
            timeMax: 1000,
            memoryMin: 256,
            memoryMax: 256,
            langs: ['cc', 'cc.cc14', 'java', 'py', 'py.py3'],
            hackable: false,
        }, extra.config),
    };
}

const PROBLEMS = [
    problemDoc(1001, 'A + B Problem', { tag: ['入门', '模拟'], difficulty: 1, nSubmit: 412, nAccept: 328, days: 120, desc: '输入两个整数 A 和 B，你的程序需要输出它们的和。' }),
    problemDoc(1002, '两个数的差', { tag: ['入门'], difficulty: 1, nSubmit: 208, nAccept: 176, days: 118, desc: '输入两个整数 A 和 B，输出 A-B。' }),
    problemDoc(1003, '最大子段和', { tag: ['动态规划', '线性结构'], difficulty: 5, nSubmit: 96, nAccept: 41, days: 64, desc: '给定长度为 n 的整数序列，求连续子段和的最大值。' }),
    problemDoc(1004, '周期串', { tag: ['字符串'], difficulty: 4, nSubmit: 73, nAccept: 22, days: 52, desc: '一个字符串可以由某个子串重复若干次构成，求最短的这样一个子串。' }),
    problemDoc(1005, '最短路径', { tag: ['图论', 'dijkstra'], difficulty: 7, nSubmit: 58, nAccept: 12, days: 41, desc: '给出一张带权无向图，求起点到终点的最短距离。' }),
    problemDoc(1006, '高精度加法', { tag: ['字符串', '模拟'], difficulty: 3, nSubmit: 141, nAccept: 87, days: 33, desc: '两个不超过 200 位的非负整数相加，输出结果。' }),
    problemDoc(1007, '0-1 背包', { tag: ['动态规划', '背包'], difficulty: 6, nSubmit: 88, nAccept: 30, days: 21, desc: 'n 件物品放入承重为 W 的背包，求可选物品的最大价值。' }),
    problemDoc(1008, '区间合并', { tag: ['排序', '贪心'], difficulty: 4, nSubmit: 64, nAccept: 35, days: 12, desc: '给定若干个闭区间，输出合并后的不相交区间。' }),
    // 未发布的题：题库列表与题面都要能表现出"隐藏"状态（plan §10 的可见性不提前泄露）
    problemDoc(1009, '校赛选拔 · 待发布', { tag: ['模拟'], difficulty: 5, nSubmit: 0, nAccept: 0, days: 2, hidden: true }),
    // owner 是当前学生：用来验证 problem_sidebar_normal.html:97 的 own(pdoc, PERM_EDIT_PROBLEM_SELF)
    problemDoc(1010, '我自己出的练习题', { owner: 1001, tag: ['模拟'], difficulty: 2, nSubmit: 15, nAccept: 9, days: 5 }),
];

/** 提交记录。_id 是 ObjectId 十六进制串（datetimeSpan 与 record_detail 的链接都靠它）。 */
function recordDoc(pid, uid, status, extra = {}) {
    return {
        _id: extra.oid || oid(extra.days === undefined ? 0 : extra.days),
        domainId: 'system',
        pid,
        uid,
        lang: extra.lang || 'cc',
        status,
        score: extra.score === undefined ? 0 : extra.score,
        time: extra.time || 0,
        memory: extra.memory || 0,
        contest: extra.contest || null,
        files: extra.files || {},
        code: extra.code || '',
        compilerTexts: extra.compilerTexts || [],
        judgeTexts: extra.judgeTexts || [],
        testCases: extra.testCases || [],
        subtasks: extra.subtasks || {},
        judgeAt: extra.judgeAt || null,
        hackTarget: extra.hackTarget || null,
        progress: extra.progress,
    };
}

const CODE_CPP = [
    '#include <iostream>',
    'using namespace std;',
    'int main() {',
    '    int a, b;',
    '    cin >> a >> b;',
    '    cout << a + b << endl;',
    '    return 0;',
    '}',
].join('\n');

/** 一条判得比较完整的记录：有编译警告、分组测试点、逐点信息，用来压测 record_detail 的表格 */
const RICH_RECORD = recordDoc(1003, 1001, 2, {
    score: 60,
    time: 15,
    memory: 3584,
    lang: 'cc',
    code: CODE_CPP,
    days: 1,
    judgeAt: d(-1, 13),
    compilerTexts: ['main.cpp: In function ‘int main()’:\nmain.cpp:5:9: warning: unused variable ‘c’ [-Wunused-variable]'],
    judgeTexts: [
        { message: 'Wrong Answer on test 7', params: [] },
        'Runtime Error (signal 11) on test 8',
    ],
    subtasks: {
        1: { status: 1, score: 30, type: 'min' },
        2: { status: 2, score: 30, type: 'min' },
    },
    testCases: [
        { id: 1, subtaskId: 1, status: 1, time: 4, memory: 3200, score: 15 },
        { id: 2, subtaskId: 1, status: 1, time: 6, memory: 3328, score: 15 },
        { id: 3, subtaskId: 2, status: 1, time: 11, memory: 3456, score: 15 },
        { id: 4, subtaskId: 2, status: 2, time: 15, memory: 3584, score: 0, message: { message: 'Expected 42, got 41', params: [] } },
    ],
});

/** 题库列表页 body（problem.ts:183-193） */
function problemList({ role = 'student', udoc = null } = {}) {
    // 隐藏题的可见性照抄上游查询条件（handler/problem.ts:46-48）：
    // 没有 PERM_VIEW_PROBLEM_HIDDEN 的人，查询里就被加上 {hidden:false}。
    // 夹具如果无条件过滤掉隐藏题，"越权看到隐藏题"这类回归就测不出来，
    // 所以这里按权限过滤，并且给 admin 留一条能看到的路。
    const canViewHidden = !!udoc && udoc.hasPerm(PERM.PERM_VIEW_PROBLEM_HIDDEN);
    const pdocs = PROBLEMS.filter((p) => !p.hidden || canViewHidden);
    const psdict = {};
    // problem.getListStatus 只返回"这个用户提交过"的条目，其余 pid 缺键；
    // problem_list.html 用 psdoc.rid 判断要不要画状态格子，所以缺键本身就是要测的分支。
    if (role !== 'guest') {
        const mine = {
            1001: { status: 1, score: 100, time: 6, memory: 3200 },
            1003: { status: 2, score: 60, time: 15, memory: 3584 },
            1006: { status: 3, score: 20, time: 1000, memory: 4096 },
        };
        Object.keys(mine).forEach((pid) => {
            psdict[pid] = Object.assign({ docId: +pid, domainId: 'system', rid: RICH_RECORD._id, star: +pid === 1003 }, mine[pid]);
        });
    }
    return {
        page: 1,
        pcount: pdocs.length,
        ppcount: 1,
        pcountRelation: 'eq',
        pdocs,
        psdict,
        qs: '',
        sort: 'default',
    };
}

/** 题面页 body（problem.ts:355-368） */
function problemDetailBody({ pid = 1003, role = 'student' } = {}) {
    const pdoc = PROBLEMS.find((p) => p.docId === pid);
    const status = { 1: { status: 1, score: 100 }, 2: { status: 2, score: 60 } }[pid] || null;
    return {
        pdoc,
        udoc: Udict[pdoc.owner] || user(pdoc.owner, `user${pdoc.owner}`),
        psdoc: role === 'guest' || !status ? { star: false, status: 0 } : Object.assign({ star: false, domainId: 'system' }, status),
        title: pdoc.title,
        solutionCount: 2,
        discussionCount: 3,
        tdoc: null,
        owner_udoc: null,
        mode: 'normal',
        // 题面侧栏的「相关」区块读这三个（由 problem/get 扩展注入），没有关联时是空数组
        tdocs: [],
        ctdocs: [],
        htdocs: [],
    };
}

/** 提交记录列表 body（record.ts:119-133） */
function recordListBody() {
    const rdocs = [
        recordDoc(1001, 1001, STATUS.STATUS_ACCEPTED, { score: 100, time: 6, memory: 3200, days: 0 }),
        recordDoc(1003, 1003, STATUS.STATUS_WRONG_ANSWER, { score: 60, time: 15, memory: 3584, days: 0, lang: 'py.py3' }),
        recordDoc(1005, 1004, STATUS.STATUS_TIME_LIMIT_EXCEEDED, { score: 40, time: 1002, memory: 5120, days: 0, code: CODE_CPP, judgeAt: d(0, 13) }),
        recordDoc(1006, 1002, STATUS.STATUS_COMPILE_ERROR, { days: 1, code: CODE_CPP, compilerTexts: ['main.cpp:3:1: error: expected ‘;’ before ‘}’ token'] }),
        recordDoc(1008, 1001, STATUS.STATUS_JUDGING, { days: 1, progress: 45 }),
        recordDoc(1007, 1003, STATUS.STATUS_RUNTIME_ERROR, { score: 0, time: 3, memory: 8192, days: 1, lang: 'java' }),
    ];
    const pdict = {};
    const udict = {};
    rdocs.forEach((r) => {
        pdict[r.pid] = PROBLEMS.find((p) => p.docId === r.pid);
        udict[r.uid] = Udict[r.uid];
    });
    return {
        page: 1,
        rdocs,
        tdoc: null,
        pdict,
        udict,
        all: false,
        allDomain: false,
        filterPid: null,
        filterTid: null,
        filterUidOrName: null,
        filterLang: null,
        filterStatus: null,
        notification: [],
    };
}

/** 提交记录详情 body（record.ts:218-220） */
function recordDetailBody() {
    return {
        rdoc: RICH_RECORD,
        udoc: Udict[RICH_RECORD.uid],
        pdoc: PROBLEMS.find((p) => p.docId === RICH_RECORD.pid),
        tdoc: null,
        rev: null,
        allRevs: {},
        judge_udoc: user(1000, 'judge-node-01', { perm: 0n, priv: 0 }),
    };
}

/**
 * ---------------------------------------------------------------- 比赛 / 作业 / 训练 / 讨论 / 排名
 *
 * 这一节对应台账里原先"未覆盖"的几行。同样只对齐形状不编统计：
 *   - 比赛列表 contest.ts:66-77、比赛详情 contest.ts:166-184、作业列表 homework.ts:70-77、
 *     训练列表 training.ts:92-97、讨论列表 discussion.ts:86-91、排名 domain.ts:35-39、
 *     登录 user.ts:57-63。
 *   - 每条比赛的时间都是刻意挑的：进行中 / 未开始 / 已结束但榜单隐藏 / 已结束且榜单公开。
 *     check.js 的 checkContestGates 就是拿这四条时间线去问侧栏"该不该有那个链接"，
 *     所以改这些偏移量等于改断言，要一起改。
 */

/** Tdoc 的最小可用形状：只放模板真的读到的字段，其余留空数组/null。 */
function contestDoc(docId, title, rule, beginAt, endAt, extra = {}) {
    return {
        docId,
        _id: oid(30),
        domainId: 'system',
        title,
        content: extra.content || '本次比赛面向全校本科生，采用线上形式。请提前检查编译环境。',
        owner: extra.owner === undefined ? 1002 : extra.owner,
        maintainer: [],
        assign: extra.assign || [],
        rule,
        beginAt,
        endAt,
        penaltySince: extra.penaltySince || null,
        pids: extra.pids || [1001, 1003, 1005],
        duration: extra.duration,
        attend: extra.attend === undefined ? 24 : extra.attend,
        rated: !!extra.rated,
        keepScoreboardHidden: !!extra.keepScoreboardHidden,
        allowPrint: false,
        allowTeam: false,
        _code: extra._code || null,
        privateFiles: extra.privateFiles || [],
    };
}

// 一条形状完整的私有附件（common/types.ts:68-77 的 FileInfo）。
// 夹具故意带上它，而不是留空数组：handler 已经按 attend + 开赛时间把它判成空
// （handler/contest.ts:178），页面上因此看不到 Files 区块；但 tdoc 整份进 UiContextNew，
// 文件名照样落到浏览器。留空数组就测不出这件事，闸门会变成一句空话。
const PRIVATE_FILE = {
    _id: 'system/t/c00000000000000000000002/file/private/generator.sbp',
    name: 'generator.sbp',
    size: 4213,
    etag: '9f2c4e1a7b3d05e8',
    lastModified: new Date('2026-09-15T02:11:00.000Z'),
};

const CONTEST_DOCS = {
    // acm：进行中且本人已参加。showScoreboard = now > beginAt，所以此刻榜单入口应当出现。
    live: contestDoc('c00000000000000000000001', '2026 新生程序设计练习赛', 'acm', d(-1, 18), d(0, 21), { attend: 42, rated: true }),
    // oi：还有六天开始。未开始的比赛既不该有题目列表入口，也不该有榜单入口。
    upcoming: contestDoc('c00000000000000000000002', '数据结构专题月赛', 'oi', d(6, 9), d(6, 14), {
        attend: 17, keepScoreboardHidden: true, privateFiles: [PRIVATE_FILE],
    }),
    // oi：已结束但教师勾了"隐藏榜单"。榜单入口仍不该对学生出现（管理员看到的是"(隐藏)"变体）。
    endedHidden: contestDoc('c00000000000000000000003', '校赛第一轮（榜单未公布）', 'oi', d(-12, 9), d(-10, 12), { keepScoreboardHidden: true }),
    // oi：已结束且榜单公开。
    endedOpen: contestDoc('c00000000000000000000004', '程序设计基础结课赛', 'oi', d(-30, 9), d(-28, 12), { attend: 63 }),
};

/** tsdocAsPublic() 的产物（contest.ts:107-115）：只挑列出的那几个字段。 */
function contestStatus(tdoc, attend) {
    return attend ? { attend: true, subscribe: false, startAt: tdoc.beginAt } : null;
}

/** 比赛列表 body（contest.ts:66-77） */
function contestListBody({ udoc = null } = {}) {
    // 分组可见性照抄 contest.ts:47-53 的查询条件：
    // 没有 PERM_VIEW_HIDDEN_CONTEST 的人只看得到"未设分组（assign 为空）或与自己有关"的比赛。
    // 这里复刻的是 assign 那一支，用来证明"指定分组的比赛不会出现在别人列表里"。
    const canViewHidden = !!udoc && udoc.hasPerm(PERM.PERM_VIEW_HIDDEN_CONTEST);
    const tdocs = Object.values(CONTEST_DOCS).filter((t) => canViewHidden || !t.assign.length);
    const tsdict = {};
    if (udoc) tsdict[CONTEST_DOCS.live.docId] = { attend: true };
    return { page: 1, tpcount: 1, qs: '', rule: '', tdocs, tsdict, groups: [], group: '', q: '' };
}

/** 指定分组的那条只在 admin 场景出现，用来跑上面那个过滤器的正反两面。 */
CONTEST_DOCS.grouped = contestDoc(
    'c00000000000000000000005', '图论专题训练赛（仅 2024 级）', 'acm',
    d(2, 18), d(2, 21), { assign: ['2024 级'], attend: 3 },
);

/** 比赛详情 body（contest.ts:166-184）。state 取 CONTEST_DOCS 的键名。
 *  attend 覆盖"本人是否已参赛"：默认只有进行中的那场参赛，
 *  未开始 + 已报名是另一种组合（侧栏会给出题目列表入口，见 checkContestGates）。 */
function contestDetailBody(state, { udoc = null, attend = state === 'live' } = {}) {
    const tdoc = CONTEST_DOCS[state];
    if (!tdoc) throw new Error(`没有 ${state} 号比赛夹具，可用：${Object.keys(CONTEST_DOCS).join(', ')}`);
    return {
        tdoc,
        tsdoc: contestStatus(tdoc, attend),
        udict: { [tdoc.owner]: Udict[tdoc.owner] || user(tdoc.owner, `user${tdoc.owner}`) },
        team_vdocs: [],
        // handler 的这一行是带条件判断的：未开赛或没报名时给空数组（contest.ts:178）。
        // 模板据此不渲染 Files 区块——但 tdoc.privateFiles 仍会随 UiContextNew 下发，
        // 这个反差正是 checkContestDataLeak 要盯的东西。
        files: attend && state !== 'upcoming' ? (tdoc.privateFiles || []) : [],
        urlForFile: () => '#',
    };
}

/** 未发布的作业。私有附件故意给满：作业详情页的题目表格此时是空的（见 homeworkDetailBody），
 *  但 tdoc 整份进 UiContextNew，pids 与附件元数据照样落到浏览器。 */
const HOMEWORK_DOCS = {
    upcoming: contestDoc('h00000000000000000000003', '数据结构 · 第五次作业（尚未开放）', 'homework', d(3, 8), d(9, 23), {
        attend: 6,
        // 侧栏第 6 行直接对 penaltySince 调 .getTime()，留 null 会在模板里抛错。
        // 线上作业都由出题老师填这一项，夹具照填，别让它变成沙箱才有的问题。
        penaltySince: d(12, 23),
        content: '本次作业覆盖二叉树与图，开放领取后请在截止前提交。',
        privateFiles: [{
            _id: 'system/t/h00000000000000000000003/file/private/skeleton.cpp',
            name: 'skeleton.cpp', size: 1840, etag: '3ad7b52c9e10f46b',
            lastModified: new Date('2026-09-18T06:30:00.000Z'),
        }],
    }),
};

/** 作业详情 body（homework.ts:93-133）。
 *  handler 在 :116-121 有一道闸门：未开始、或"没领取且未结束"，且不是 owner
 *  也没有 PERM_VIEW_HOMEWORK_HIDDEN_SCOREBOARD 时直接 return，pdict/psdict/rdict
 *  三个键因此不存在，模板第 21 行的 {% if pdict %} 走不到，页面只显示"请领取作业"。
 *  这份 body 就是这个对照组：主体什么都没有，tdoc 里却带着题目清单。 */
function homeworkDetailBody(state = 'upcoming', { attend = false } = {}) {
    const tdoc = HOMEWORK_DOCS[state];
    if (!tdoc) throw new Error(`没有 ${state} 号作业夹具，可用：${Object.keys(HOMEWORK_DOCS).join(', ')}`);
    return {
        tdoc,
        tsdoc: contestStatus(tdoc, attend),
        udict: { [tdoc.owner]: Udict[tdoc.owner] || user(tdoc.owner, `user${tdoc.owner}`) },
        ddocs: [],
        page: 1,
        dpcount: 0,
        dcount: 0,
    };
}

/** 作业列表 body（homework.ts:58-77）。calendar 的构造规则同 :61-67。 */
function homeworkListBody() {
    const htdocs = [
        contestDoc('h00000000000000000000001', 'C 语言程序设计 · 第三次作业', 'homework', d(-4, 8), d(7, 23), {
            penaltySince: d(5, 23), attend: 51, content: '本轮作业覆盖循环与数组，超出 penaltySince 后仍有分档扣分。',
        }),
        contestDoc('h00000000000000000000002', 'C 语言程序设计 · 第二次作业', 'homework', d(-21, 8), d(-14, 23), {
            penaltySince: d(-16, 23), attend: 58, content: '分支结构。',
        }),
    ];
    const calendar = htdocs.map((tdoc) => {
        const cal = Object.assign({}, tdoc, { url: `/homework/${tdoc.docId}` });
        if (model.contest.isExtended(tdoc) || model.contest.isDone(tdoc)) {
            cal.endAt = tdoc.endAt;
            cal.penaltySince = tdoc.penaltySince;
        } else {
            cal.endAt = tdoc.penaltySince;
        }
        return cal;
    });
    return { tdocs: htdocs, calendar, tpcount: 1, page: 1, qs: '', groups: [], group: '', q: '' };
}

/** 训练列表 body（training.ts:92-97）。tdict 需要能按 docId 反查，故补上 docId 字段。 */
function trainingListBody({ role = 'student' } = {}) {
    const [tdocs, tsdict] = trainings();
    const tdict = {};
    for (const tdoc of tdocs) tdict[tdoc.docId] = tdoc;
    Object.keys(tsdict).forEach((key) => { tsdict[key].docId = key; });
    return {
        tdocs, page: 1, tpcount: 1, q: '',
        tsdict: role === 'guest' ? {} : tsdict,
        tdict: role === 'guest' ? {} : tdict,
    };
}

/** 讨论列表 body（discussion.ts:86-91）。vnode 给空对象 → 侧栏走"节点列表"分支。 */
function discussionListBody() {
    const [ddocs, vndict] = discussions();
    const udict = {};
    ddocs.forEach((ddoc) => { udict[ddoc.owner] = Udict[ddoc.owner] || user(ddoc.owner, `user${ddoc.owner}`); });
    return {
        ddocs, dpcount: 1, udict, page: 1, page_name: 'discussion_main',
        vndict, vnode: {}, vnodes: discussionNodes(),
    };
}

/** 排名 body（domain.ts:35-39）：udocs 已按 rp 降序，页面上没有任何写死的汇总数。 */
function rankingBody() {
    const udocs = Object.values(Udict).sort((a, b) => b.rp - a.rp);
    return { udocs, upcount: 1, ucount: udocs.length, page: 1 };
}

/** 登录 body（user.ts:57-63）。loginMethods 为空 = 站点没接第三方登录。 */
function loginBody() {
    return { redirect: '', builtInLogin: true, loginMethods: [] };
}

module.exports = {
    oid, user, homepageContents, BULLETIN, HERO_BULLETIN, Udict,
    STUDENT, TEACHER, recentProblems, contests, homeworks, trainings, discussions, ranking,
    PROBLEMS, RICH_RECORD, CONTEST_DOCS, HOMEWORK_DOCS,
    problemList, problemDetailBody, recordListBody, recordDetailBody,
    contestListBody, contestDetailBody, homeworkListBody, homeworkDetailBody, trainingListBody,
    discussionListBody, rankingBody, loginBody,
};

