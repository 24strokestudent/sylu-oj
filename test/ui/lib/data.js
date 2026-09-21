'use strict';

/**
 * 页面数据夹具
 *
 * 形状严格对齐上游 handler 交给模板的变量，而不是我凭空设计的 mock：
 *   - 首页：hydrooj/src/handler/home.ts:147-177（contents[i].sections[j] = [name, payload]）
 *   - 各 payload 形状由各 homepage partial 的取值方式反推（partials/homepage/*.html）
 * 数据内容用"看起来像校内 OJ"的真实语义填充，但不含任何写死的统计数字（ACCEPTANCE §29 §65）。
 */

const { PERM, PRIV } = require('./hydro');

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
        _perm: extra.perm === undefined ? PERM.PERM_VIEW_PROBLEM : extra.perm,
        _priv: extra.priv === undefined ? PRIV.PRIV_USER_PROFILE : extra.priv,
        hasPerm(...perms) { return perms.some((p) => (this._perm & p) === p); },
        hasPriv(...privs) { return privs.some((p) => (this._priv & p) === p); },
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

module.exports = {
    oid, user, homepageContents, BULLETIN, HERO_BULLETIN, Udict,
    STUDENT, TEACHER, recentProblems, contests, homeworks, trainings, discussions, ranking,
};
