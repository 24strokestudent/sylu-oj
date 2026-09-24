'use strict';

/**
 * Hydro 模板运行时（离线复刻）
 *
 * 唯一目的：在没有 Hydro 进程、没有 MongoDB 的情况下，用**上游真实模板**渲染页面，
 * 让 UI 改造可以目视验收。不改任何上游文件，只复刻 packages/ui-default/backendlib/template.ts
 * 注册的 globals / filters，以及 handler 交给模板的那几个变量。
 *
 * 复刻依据（上游只读副本，可用 SYLU_HYDRO_REF 覆盖路径）：
 *   - 模板运行时语义：backendlib/template.ts:47-59（自定义 memberLookup，见下方同名注释）
 *   - 模板发现与优先级：backendlib/template.ts:257-278（addon 的 templates/ 后者覆盖前者）
 *   - globals/filters：backendlib/template.ts:61-161
 *   - 渲染入参：backendlib/template.ts:224-245 + hydrooj/src/handler/home.ts:172-177
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const nunjucks = require('nunjucks');
const MarkdownIt = require('markdown-it');
const yaml = require('js-yaml');

/**
 * Hydro 在装载模板前替换了 nunjucks 的成员访问实现（backendlib/template.ts:47-59），
 * 把原函数挂在返回值的 `_original` 上。这一步是**运行时语义**，不是可选优化：
 * 模板里 `model.contest.canShowScoreboard.call(handler, tdoc)` 靠它才能把 this 绑到 handler——
 * memberLookup(obj,'call') 先按 `_original` 解包回原函数，返回的包装再执行
 * `Function.prototype.call.call(原函数, handler, tdoc)`，于是 thisArg 真的生效。
 * stock nunjucks 3.2.4 没有 `_original`，`obj[val].apply(obj, args)` 会把 this 定在宿主对象上，
 * 上一版沙箱因此给这四个可见性函数逐个手工重绑（modelFor），那是掩盖失真的局部补丁。
 * 这里按上游逐字复刻，check.js 的 checkRuntimeParity 盯住这段语义没被改回去。
 */
// eslint-disable-next-line no-import-assign
nunjucks.runtime.memberLookup = function memberLookup(obj, val) {
    if ((obj || {})._original) obj = obj._original;
    if (obj === undefined || obj === null) return undefined;
    if (typeof obj[val] === 'function') {
        const fn = function (...args) {
            return obj[val].call(obj, ...args);
        };
        fn._original = obj[val];
        return fn;
    }
    return obj[val];
};

/** 向上寻找 .ref/Hydro（该目录在 .gitignore 内，属本机的上游只读副本） */
function findRef() {
    let dir = __dirname;
    for (let i = 0; i < 8; i++) {
        const cand = path.join(dir, '.ref', 'Hydro');
        if (fs.existsSync(path.join(cand, 'packages', 'ui-default', 'templates'))) return cand;
        const parent = path.dirname(dir);
        if (parent === dir) break;
        dir = parent;
    }
    return null;
}

const REF = process.env.SYLU_HYDRO_REF || findRef();
const UI_DEFAULT = path.join(REF || '', 'packages', 'ui-default');
const TEMPLATES_UPSTREAM = path.join(UI_DEFAULT, 'templates');

if (!REF || !fs.existsSync(TEMPLATES_UPSTREAM)) {
    throw new Error(
        '找不到上游 Hydro 模板。这是只读参考副本（.ref/ 已在 .gitignore 内），\n'
        + '请放到仓库同级的 .ref/Hydro，或用环境变量指定：SYLU_HYDRO_REF=/path/to/Hydro',
    );
}

// ---------------------------------------------------------------- 权限常量
// packages/common/permission.ts 的逐字移植（位定义 + 组合值）。
// 为什么整表照抄而不是"用到哪条补哪条"：模板里每个 {% if hasPerm(...) %} 都在选分支，
// 少一条或位错一位不会报错，只会静默渲染成另一条分支——那等于给验收结论造假。
const PERM = {
    PERM_NONE: 0n,

    // Domain Settings
    PERM_VIEW: 1n << 0n,
    PERM_EDIT_DOMAIN: 1n << 1n,
    PERM_VIEW_DISPLAYNAME: 1n << 67n,
    PERM_VIEW_USER_PRIVATE_INFO: 1n << 67n,
    PERM_MOD_BADGE: 1n << 2n,

    // Problem
    PERM_CREATE_PROBLEM: 1n << 4n,
    PERM_EDIT_PROBLEM: 1n << 5n,
    PERM_EDIT_PROBLEM_SELF: 1n << 6n,
    PERM_VIEW_PROBLEM: 1n << 7n,
    PERM_VIEW_PROBLEM_HIDDEN: 1n << 8n,
    PERM_SUBMIT_PROBLEM: 1n << 9n,
    PERM_READ_PROBLEM_DATA: 1n << 10n,

    // Record
    PERM_VIEW_RECORD: 1n << 70n,
    PERM_READ_RECORD_CODE: 1n << 12n,
    PERM_READ_RECORD_CODE_ACCEPT: 1n << 66n,
    PERM_REJUDGE_PROBLEM: 1n << 13n,
    PERM_REJUDGE: 1n << 14n,

    // Problem Solution
    PERM_VIEW_PROBLEM_SOLUTION: 1n << 15n,
    PERM_VIEW_PROBLEM_SOLUTION_ACCEPT: 1n << 65n,
    PERM_CREATE_PROBLEM_SOLUTION: 1n << 16n,
    PERM_VOTE_PROBLEM_SOLUTION: 1n << 17n,
    PERM_EDIT_PROBLEM_SOLUTION: 1n << 18n,
    PERM_EDIT_PROBLEM_SOLUTION_SELF: 1n << 19n,
    PERM_DELETE_PROBLEM_SOLUTION: 1n << 20n,
    PERM_DELETE_PROBLEM_SOLUTION_SELF: 1n << 21n,
    PERM_REPLY_PROBLEM_SOLUTION: 1n << 22n,
    PERM_EDIT_PROBLEM_SOLUTION_REPLY_SELF: 1n << 24n,
    PERM_DELETE_PROBLEM_SOLUTION_REPLY: 1n << 25n,
    PERM_DELETE_PROBLEM_SOLUTION_REPLY_SELF: 1n << 26n,

    // Discussion
    PERM_VIEW_DISCUSSION: 1n << 27n,
    PERM_CREATE_DISCUSSION: 1n << 28n,
    PERM_HIGHLIGHT_DISCUSSION: 1n << 29n,
    PERM_PIN_DISCUSSION: 1n << 61n,
    PERM_EDIT_DISCUSSION: 1n << 30n,
    PERM_EDIT_DISCUSSION_SELF: 1n << 31n,
    PERM_DELETE_DISCUSSION: 1n << 32n,
    PERM_DELETE_DISCUSSION_SELF: 1n << 33n,
    PERM_REPLY_DISCUSSION: 1n << 34n,
    PERM_ADD_REACTION: 1n << 62n,
    PERM_EDIT_DISCUSSION_REPLY_SELF: 1n << 36n,
    PERM_DELETE_DISCUSSION_REPLY: 1n << 38n,
    PERM_DELETE_DISCUSSION_REPLY_SELF: 1n << 39n,
    PERM_DELETE_DISCUSSION_REPLY_SELF_DISCUSSION: 1n << 40n,
    PERM_LOCK_DISCUSSION: 1n << 64n,

    // Contest
    PERM_VIEW_CONTEST: 1n << 41n,
    PERM_VIEW_CONTEST_SCOREBOARD: 1n << 42n,
    PERM_VIEW_CONTEST_HIDDEN_SCOREBOARD: 1n << 43n,
    PERM_CREATE_CONTEST: 1n << 44n,
    PERM_ATTEND_CONTEST: 1n << 45n,
    PERM_EDIT_CONTEST: 1n << 50n,
    PERM_EDIT_CONTEST_SELF: 1n << 51n,
    PERM_VIEW_HIDDEN_CONTEST: 1n << 68n,

    // Homework
    PERM_VIEW_HOMEWORK: 1n << 52n,
    PERM_VIEW_HOMEWORK_SCOREBOARD: 1n << 53n,
    PERM_VIEW_HOMEWORK_HIDDEN_SCOREBOARD: 1n << 54n,
    PERM_CREATE_HOMEWORK: 1n << 55n,
    PERM_ATTEND_HOMEWORK: 1n << 56n,
    PERM_EDIT_HOMEWORK: 1n << 57n,
    PERM_EDIT_HOMEWORK_SELF: 1n << 58n,
    PERM_VIEW_HIDDEN_HOMEWORK: 1n << 69n,

    // Training
    PERM_VIEW_TRAINING: 1n << 46n,
    PERM_CREATE_TRAINING: 1n << 47n,
    PERM_EDIT_TRAINING: 1n << 48n,
    PERM_PIN_TRAINING: 1n << 63n,
    PERM_EDIT_TRAINING_SELF: 1n << 49n,

    // Ranking
    PERM_VIEW_RANKING: 1n << 59n,

    // Placeholder
    PERM_ALL: -1n,
    PERM_BASIC: 0n,
    PERM_DEFAULT: 0n,
    PERM_ADMIN: -1n,

    PERM_NEVER: 1n << 60n,
};
PERM.PERM_BASIC = PERM.PERM_VIEW | PERM.PERM_VIEW_PROBLEM | PERM.PERM_VIEW_PROBLEM_SOLUTION
    | PERM.PERM_VIEW_PROBLEM_SOLUTION_ACCEPT | PERM.PERM_VIEW_DISCUSSION | PERM.PERM_VIEW_CONTEST
    | PERM.PERM_VIEW_CONTEST_SCOREBOARD | PERM.PERM_VIEW_HOMEWORK | PERM.PERM_VIEW_HOMEWORK_SCOREBOARD
    | PERM.PERM_VIEW_TRAINING | PERM.PERM_VIEW_RANKING;
// 普通用户在新建域名时的默认权限集（上游逐条照搬，含上游本身重复的那几条）。
// harness 的 student 角色直接用它，而不是自己挑几条——这样"页面上出现哪些按钮"
// 与线上一台没动过权限配置的域是一致的。
PERM.PERM_DEFAULT = PERM.PERM_VIEW | PERM.PERM_VIEW_USER_PRIVATE_INFO | PERM.PERM_VIEW_PROBLEM
    | PERM.PERM_EDIT_PROBLEM_SELF | PERM.PERM_SUBMIT_PROBLEM | PERM.PERM_VIEW_PROBLEM_SOLUTION
    | PERM.PERM_VIEW_PROBLEM_SOLUTION_ACCEPT | PERM.PERM_CREATE_PROBLEM_SOLUTION | PERM.PERM_VOTE_PROBLEM_SOLUTION
    | PERM.PERM_EDIT_PROBLEM_SOLUTION_SELF | PERM.PERM_DELETE_PROBLEM_SOLUTION_SELF | PERM.PERM_REPLY_PROBLEM_SOLUTION
    | PERM.PERM_EDIT_PROBLEM_SOLUTION_REPLY_SELF | PERM.PERM_DELETE_PROBLEM_SOLUTION_REPLY_SELF | PERM.PERM_VIEW_DISCUSSION
    | PERM.PERM_CREATE_DISCUSSION | PERM.PERM_EDIT_DISCUSSION_SELF | PERM.PERM_REPLY_DISCUSSION | PERM.PERM_ADD_REACTION
    | PERM.PERM_EDIT_DISCUSSION_REPLY_SELF | PERM.PERM_DELETE_DISCUSSION_REPLY_SELF
    | PERM.PERM_DELETE_DISCUSSION_REPLY_SELF_DISCUSSION | PERM.PERM_VIEW_CONTEST | PERM.PERM_VIEW_CONTEST_SCOREBOARD
    | PERM.PERM_ATTEND_CONTEST | PERM.PERM_EDIT_CONTEST_SELF | PERM.PERM_VIEW_HOMEWORK
    | PERM.PERM_VIEW_HOMEWORK_SCOREBOARD | PERM.PERM_ATTEND_HOMEWORK | PERM.PERM_EDIT_HOMEWORK_SELF
    | PERM.PERM_VIEW_TRAINING | PERM.PERM_CREATE_TRAINING | PERM.PERM_EDIT_TRAINING_SELF
    | PERM.PERM_SUBMIT_PROBLEM | PERM.PERM_CREATE_PROBLEM_SOLUTION | PERM.PERM_VOTE_PROBLEM_SOLUTION
    | PERM.PERM_REPLY_PROBLEM_SOLUTION | PERM.PERM_CREATE_DISCUSSION | PERM.PERM_REPLY_DISCUSSION
    | PERM.PERM_ATTEND_CONTEST | PERM.PERM_CREATE_TRAINING | PERM.PERM_ATTEND_HOMEWORK
    | PERM.PERM_VIEW_RANKING | PERM.PERM_VIEW_RECORD;
PERM.PERM_ADMIN = PERM.PERM_ALL;
const PRIV = {
    PRIV_NONE: 0,
    PRIV_EDIT_SYSTEM: 1 << 0,
    PRIV_SET_PRIV: 1 << 1,
    PRIV_USER_PROFILE: 1 << 2,
    PRIV_REGISTER_USER: 1 << 3,
    PRIV_READ_PROBLEM_DATA: 1 << 4,
    PRIV_READ_RECORD_CODE: 1 << 7,
    PRIV_VIEW_HIDDEN_RECORD: 1 << 8,
    PRIV_JUDGE: 1 << 9,
    PRIV_CREATE_DOMAIN: 1 << 10,
    PRIV_VIEW_ALL_DOMAIN: 1 << 11,
    PRIV_MANAGE_ALL_DOMAIN: 1 << 12,
    PRIV_REJUDGE: 1 << 13,
    PRIV_VIEW_USER_SECRET: 1 << 14,
    PRIV_VIEW_JUDGE_STATISTICS: 1 << 15,
    PRIV_CREATE_FILE: 1 << 16,
    PRIV_UNLIMITED_QUOTA: 1 << 17,
    PRIV_DELETE_FILE: 1 << 18,
    PRIV_UNLIMITED_ACCESS: 1 << 22,
    PRIV_VIEW_SYSTEM_NOTIFICATION: 1 << 23,
    PRIV_SEND_MESSAGE: 1 << 24,
    PRIV_MOD_BADGE: 1 << 25,
    PRIV_ALL: -1,
    PRIV_DEFAULT: 0,
    PRIV_NEVER: 1 << 20,
};
PRIV.PRIV_DEFAULT = PRIV.PRIV_USER_PROFILE | PRIV.PRIV_CREATE_FILE | PRIV.PRIV_SEND_MESSAGE;
// packages/common/status.ts —— 键名与上游逐字一致。
// 模板里到处是 STATUS.STATUS_TIME_LIMIT_EXCEEDED 这种长名（record_main / record_detail），
// 只定义 TLE/MLE 这些短名的话比较结果恒为 false，页面会静默走错分支。
const STATUS = {
    STATUS_WAITING: 0,
    STATUS_ACCEPTED: 1,
    STATUS_WRONG_ANSWER: 2,
    STATUS_TIME_LIMIT_EXCEEDED: 3,
    STATUS_MEMORY_LIMIT_EXCEEDED: 4,
    STATUS_OUTPUT_LIMIT_EXCEEDED: 5,
    STATUS_RUNTIME_ERROR: 6,
    STATUS_COMPILE_ERROR: 7,
    STATUS_SYSTEM_ERROR: 8,
    STATUS_CANCELED: 9,
    STATUS_ETC: 10,
    STATUS_HACKED: 11,
    STATUS_JUDGING: 20,
    STATUS_COMPILING: 21,
    STATUS_FETCHED: 22,
    STATUS_IGNORED: 30,
    STATUS_FORMAT_ERROR: 31,
    STATUS_HACK_SUCCESSFUL: 32,
    STATUS_HACK_UNSUCCESSFUL: 33,
};
// 短名只是本仓库 fixtures 的书写便利，值必须与长名相同
Object.assign(STATUS, {
    STATUS_TLE: 3, STATUS_MLE: 4, STATUS_OLE: 5, STATUS_RE: 6, STATUS_CE: 7, STATUS_SE: 8,
});
// 上游是 Record<STATUS, string>，所以这里也用对象：
// record_main.html:58 的 `{% for k, v in utils.status.STATUS_TEXTS %}` 要靠键值对遍历，
// 换成数组会得到 0,1,2… 这种没有意义的 option。
const STATUS_TEXTS = {
    0: 'Waiting', 1: 'Accepted', 2: 'Wrong Answer', 3: 'Time Exceeded', 4: 'Memory Exceeded',
    5: 'Output Exceeded', 6: 'Runtime Error', 7: 'Compile Error', 8: 'System Error',
    9: 'Cancelled', 10: 'Unknown Error', 11: 'Hacked', 20: 'Running', 21: 'Compiling',
    22: 'Fetched', 30: 'Ignored', 31: 'Format Error', 32: 'Hack Successful', 33: 'Hack Unsuccessful',
};
const STATUS_SHORT_TEXTS = {
    1: 'AC', 2: 'WA', 3: 'TLE', 4: 'MLE', 5: 'OLE', 6: 'RE', 7: 'CE', 8: 'SE',
    9: 'IGN', 11: 'HK', 30: 'IGN', 31: 'FE',
};
// STATUS_CODES[STATUS_ETC] 是 fail（不是 ignored），32/33 分别 pass/fail：
// 这两个决定状态格子的底色，抄错就等于给自己造了一个"看起来正常"的假结论。
const STATUS_CODES = {
    0: 'pending', 1: 'pass', 2: 'fail', 3: 'fail', 4: 'fail', 5: 'fail', 6: 'fail', 7: 'fail',
    8: 'fail', 9: 'ignored', 10: 'fail', 11: 'fail', 20: 'progress', 21: 'progress',
    22: 'progress', 30: 'ignored', 31: 'ignored', 32: 'pass', 33: 'fail',
};

// ---------------------------------------------------------------- 路由表
// 每条都是上游 ctx.Route(name, path) 的登记结果（题库/记录两组取自
// hydrooj/src/handler/problem.ts:1070-1084 与 record.ts:492-493，其余见 test/ui/README.md 的引用）
const ROUTES = {
    homepage: '/',
    problem_main: '/p',
    problem_random: '/problem/random',
    problem_detail: '/p/:pid',
    problem_submit: '/p/:pid/submit',
    problem_hack: '/p/:pid/hack/:rid',
    problem_edit: '/p/:pid/edit',
    problem_config: '/p/:pid/config',
    problem_files: '/p/:pid/files',
    problem_solution: '/p/:pid/solution',
    problem_statistics: '/p/:pid/stat',
    record_main: '/record',
    record_detail: '/record/:rid',
    contest_main: '/contest',
    contest_detail: '/contest/:tid',
    contest_problemlist: '/contest/:tid/problems',
    contest_scoreboard: '/contest/:tid/scoreboard',
    contest_print: '/contest/:tid/print',
    contest_team: '/contest/team',
    contest_edit: '/contest/:tid/edit',
    contest_manage: '/contest/:tid/management',
    contest_code: '/contest/:tid/code',
    contest_create: '/contest/create',
    homework_main: '/homework',
    homework_detail: '/homework/:tid',
    homework_scoreboard: '/homework/:tid/scoreboard',
    homework_create: '/homework/create',
    training_main: '/training',
    training_detail: '/training/:tid',
    training_create: '/training/create',
    discussion_main: '/discuss',
    discussion_detail: '/discuss/:did',
    discussion_node: '/discuss/:type/:name',
    discussion_create: '/discuss/:type/:name/create',
    discussion_edit: '/discuss/:did/edit',
    ranking: '/ranking',
    user_login: '/login',
    user_register: '/register',
    user_logout: '/logout',
    user_lostpass: '/lostpass',
    user_oauth: '/oauth/:type/login',
    user_detail: '/user/:uid',
    home_settings: '/home/settings/:category',
    home_security: '/home/security',
    home_messages: '/home/messages',
    home_domain: '/home/domain',
    home_files: '/file',
    domain_dashboard: '/domain/dashboard',
    manage_dashboard: '/manage/dashboard',
    status: '/status',
    switch_language: '/language/:lang',
    set_theme: '/set_theme/:theme',
    wiki_help: '/wiki/help',
    wiki_about: '/wiki/about',
    sylu_about: '/sylu/about',
};

// hydrooj/src/service/server.ts:130-161 的等价实现
function makeUrl(handler) {
    return function url(name, ...kwargsList) {
        if (name === '#') return '#';
        const pattern = ROUTES[name];
        if (!pattern) return '#';
        const args = {};
        const query = {};
        for (const kwargs of kwargsList) {
            if (!kwargs) continue;
            for (const key of Object.keys(kwargs)) {
                if (key === 'query') continue;
                args[key] = String(kwargs[key]).replace(/\//g, '%2F');
            }
            for (const key of Object.keys(kwargs.query || {})) {
                query[key] = String(kwargs.query[key]);
            }
        }
        const { anchor } = args;
        let res = pattern;
        let bad = false;
        res = res.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, (_, key) => {
            if (args[key] === undefined) { bad = true; return ''; }
            return args[key];
        });
        if (bad) return '#';
        const qs = Object.keys(query).map((k) => `${k}=${encodeURIComponent(query[k])}`).join('&');
        if (qs) res += `?${qs}`;
        if (anchor) res += `#${anchor}`;
        const target = args.domainId || (handler && handler.args && handler.args.domainId) || 'system';
        if (target !== 'system') res = `/d/${target}${res}`;
        return res;
    };
}

// ---------------------------------------------------------------- i18n
// 直接读上游 zh.yaml，避免自己维护对照表导致文案漂移
function loadLocale() {
    const dict = {};
    const f = path.join(UI_DEFAULT, 'locales', 'zh.yaml');
    if (!fs.existsSync(f)) return dict;
    const raw = yaml.load(fs.readFileSync(f, 'utf-8')) || {};
    for (const [k, v] of Object.entries(raw)) {
        if (k.startsWith('__')) continue;
        if (typeof v === 'string') dict[k] = v;
    }
    return dict;
}

function formatString(str, ...args) {
    // @hydrooj/utils 的 String.prototype.format：单对象参数按 {key}，否则按 {0} {1}
    if (args.length === 1 && args[0] && typeof args[0] === 'object' && !Array.isArray(args[0])) {
        return Object.keys(args[0]).reduce((s, k) => s.split(`{${k}}`).join(args[0][k]), str);
    }
    const list = Array.isArray(args[0]) ? args[0] : args;
    return list.reduce((s, v, i) => s.split(`{${i}}`).join(String(v)), str);
}

// ---------------------------------------------------------------- markdown / XSS
// backendlib/markdown-it-xss.ts:118-157：class 走白名单，非白名单类名被清空。
// 这条正是旧版首页不得不靠 DOM 结构写 CSS 的根因，harness 必须保留该行为。
const CLASS_WHITELIST = new Set([
    'typo', 'center', 'text-center', 'right', 'float-left', 'float-right', 'clearfix',
    'medium', 'large', 'small', 'no-media', 'v-center', 'expandable',
]);
const md = new MarkdownIt({ html: true, linkify: true });

function sanitizeClasses(html) {
    return html.replace(/class="([^"]*)"/g, (all, val) => {
        const kept = val.split(' ')
            .filter((c) => CLASS_WHITELIST.has(c) || c.startsWith('language-'))
            .join(' ');
        return `class="${kept}"`;
    });
}
// packages/hydrooj/src/lib/ensureTag 的近似：补全未闭合标签
function ensureTag(html) {
    const stack = [];
    const out = html.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)[^>]*?(\/?)>/g, (m, tag, slash) => {
        const t = tag.toLowerCase();
        if (['br', 'hr', 'img', 'input', 'meta', 'link'].includes(t)) return m;
        if (slash) return m;
        if (m.startsWith('</')) stack.pop();
        else stack.push(t);
        return m;
    });
    return out + stack.map((t) => `</${t}>`).join('');
}

// ---------------------------------------------------------------- misc helpers
// backendlib/misc.ts:11-21
function datetimeSpan(dt, relative = true, fmt = 'YYYY-M-D H:mm:ss', tz) {
    if (!dt) return 'DATETIME_SPAN_ERROR';
    // 24 位十六进制按 MongoDB ObjectId 处理：前 8 位是创建时间的秒级时间戳。
    // 模板里大量出现 datetimeSpan(pdoc._id)，不认 ObjectId 就会整片渲染成错误串。
    const hex = typeof dt === 'string' && /^[0-9a-f]{24}$/i.test(dt) ? dt : null;
    const d = hex ? new Date(Number.parseInt(hex.slice(0, 8), 16) * 1000)
        : (dt instanceof Date ? dt : new Date(dt));
    if (Number.isNaN(d.getTime())) return 'DATETIME_SPAN_ERROR';
    // 上游按 tz 渲染；harness 固定 +08:00 偏移即可保证页面数字稳定
    const local = new Date(d.getTime() + 8 * 3600 * 1000);
    const p = (n) => String(n).padStart(2, '0');
    const map = {
        YYYY: local.getUTCFullYear(),
        M: local.getUTCMonth() + 1,
        MM: p(local.getUTCMonth() + 1),
        D: local.getUTCDate(),
        'DD': p(local.getUTCDate()),
        H: local.getUTCHours(),
        HH: p(local.getUTCHours()),
        m: local.getUTCMinutes(),
        mm: p(local.getUTCMinutes()),
        s: local.getUTCSeconds(),
        ss: p(local.getUTCSeconds()),
    };
    const text = fmt.replace(/YYYY|MM|DD|M|D|HH|H|mm|m|ss|s/g, (k) => (map[k] === undefined ? k : map[k]));
    return `<span class="time${relative ? ' relative' : ''}" data-timestamp="${(d.getTime() / 1000).toFixed(3)}">${text}</span>`;
}

// @hydrooj/utils size / formatSeconds
function size(bytes) {
    const units = ['Bytes', 'KiB', 'MiB', 'GiB', 'TiB'];
    let s = Number(bytes) || 0;
    let i = 0;
    while (s >= 1024 && i < units.length - 1) { s /= 1024; i++; }
    return `${Math.round(s * 10) / 10} ${units[i]}`;
}
function formatSeconds(sec, showSeconds = true) {
    const n = Math.floor(Number(sec) || 0);
    const h = Math.floor(n / 3600);
    const m = Math.floor((n % 3600) / 60);
    const s = n % 60;
    if (!showSeconds) return `${h}:${String(m).padStart(2, '0')}`;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
function* paginate(page, numPages) {
    const p = Number(page) || 1;
    yield ['first', 1];
    if (p > 1) yield ['previous', p - 1];
    if (p > 6) yield ['ellipsis', 0];
    for (let i = Math.max(1, p - 5); i <= Math.min(numPages, p + 5); i++) {
        yield [i === p ? 'current' : 'page', i];
    }
    if (p < numPages - 5) yield ['ellipsis', 0];
    if (p < numPages) yield ['next', p + 1];
    yield ['last', numPages];
}
function buildQueryString(obj) {
    return Object.keys(obj)
        .filter((k) => obj[k] && !k.startsWith('__'))
        .map((k) => `${k}=${encodeURIComponent(obj[k])}`)
        .join('&');
}
function ansiToHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function avatarUrl(src, size_ = 64) {
    if (!src) return `//cn.gravatar.com/avatar/${crypto.createHash('md5').update('').digest('hex')}?d=mm&s=${size_}`;
    if (src.startsWith('url:')) return src.slice(4);
    if (src.startsWith('gravatar:')) {
        return `//cn.gravatar.com/avatar/${crypto.createHash('md5').update(src.slice(9).trim().toLowerCase()).digest('hex')}?d=mm&s=${size_}`;
    }
    return src;
}
function platformIcon(p) { return (p || 'unknown').toLowerCase() === 'mac os' ? 'mac' : (p || 'unknown').toLowerCase(); }
function isIE(ua) { return false; } // eslint-disable-line no-unused-vars

// ---------------------------------------------------------------- 难度算法
// hydrooj/src/lib/difficulty.ts 逐字移植。题库列表与题详的"难度"格都由它算，
// 用近似值会让难度分布失真，而这套 CSS 的 §10 目标之一就是让难度可辨识。
const DIFF_CACHE = { s: 0.0, y: 0, values: [0.0] };

function _LOGP(x) {
    const sqrtPi = 2.506628274631; // Sqrt[Pi]
    return (2 * Math.exp(-2.0 * (Math.log(x) ** 2))) / x / sqrtPi;
}

function _intergrateEnsureCache(y) {
    let lastY = DIFF_CACHE.y;
    if (y <= lastY) return DIFF_CACHE;
    let { s } = DIFF_CACHE;
    const dx = 0.1;
    const dT = 2;
    let x0 = (lastY / dT) * dx;
    while (y > lastY) {
        x0 += dx;
        s += _LOGP(x0) * dx;
        for (let i = 1; i <= dT; i++) DIFF_CACHE.values.push(s);
        lastY += dT;
    }
    DIFF_CACHE.y = lastY;
    DIFF_CACHE.s = s;
    return DIFF_CACHE;
}

_intergrateEnsureCache(10000);

function difficulty(nSubmit, nAccept) {
    if (!nSubmit) return null;
    const s = DIFF_CACHE.values[nSubmit];
    const acRate = nAccept / nSubmit;
    const ans = Math.round(10 - 13 * s * acRate);
    return Math.max(ans, 1);
}

// ---------------------------------------------------------------- model stubs
const DAY = 86400 * 1000;

// hydrooj/setting.yaml 的 langs 默认表，按 parseLang 的合并规则展开后的结果：
// `[foo].[bar]` 继承 `[foo]` 的 highlight/monaco，display 各自覆盖。
// 记录列表与提交详情都要读 model.setting.langs[lang].display / .highlight。
const LANGS = {
    cc: { display: 'C++', highlight: 'cpp', monaco: 'cpp' },
    'cc.cc11': { display: 'C++11', highlight: 'cpp', monaco: 'cpp' },
    'cc.cc14': { display: 'C++14', highlight: 'cpp', monaco: 'cpp' },
    'cc.cc17': { display: 'C++17', highlight: 'cpp', monaco: 'cpp' },
    'cc.cc17o2': { display: 'C++17(O2)', highlight: 'cpp', monaco: 'cpp' },
    'cc.cc20': { display: 'C++20', highlight: 'cpp', monaco: 'cpp' },
    java: { display: 'Java', highlight: 'java astyle-java', monaco: 'java' },
    kt: { display: 'Kotlin', highlight: 'kotlin', monaco: 'kotlin' },
    py: { display: 'Python', highlight: 'python', monaco: 'python' },
    'py.py3': { display: 'Python 3', highlight: 'python', monaco: 'python' },
    pas: { display: 'Pascal', highlight: 'pascal', monaco: 'pascal' },
};
const model = {
    system: { get: (k) => SYSTEM_DEFAULTS[k] },
    setting: {
        langs: LANGS,
        SETTINGS_BY_KEY: {
            viewLang: { type: 'select', range: { zh: '简体中文', en: 'English' } },
        },
    },
    builtin: {
        LEVELS: [100, 90, 70, 55, 40, 30, 20, 10, 5, 2, 1],
        STATUS, STATUS_TEXTS, STATUS_SHORT_TEXTS, STATUS_CODES,
    },
    document: {
        TYPE_PROBLEM: 10, TYPE_PROBLEM_SOLUTION: 11, TYPE_DISCUSSION_NODE: 20,
        TYPE_DISCUSSION: 21, TYPE_CONTEST: 30, TYPE_TRAINING: 40,
    },
    discussion: { typeDisplay: { 10: 'problem', 20: 'node', 30: 'contest', 40: 'training' } },
    contest: (() => {
        /**
         * 时间判定与可见性回调逐字移植自 model/contest.ts（行号见各处注释）。
         * 沙箱为什么要复刻这一层：侧栏的「题目列表 / 榜单 / 我的提交」三个入口全部由
         * canShow* 决定输不输出（partials/contest_sidebar.html），而"比赛数据不提前泄露"
         * 是计划里的硬约束。只测 CSS 的话，将来模板换版或夹具改错时间字段导致榜单链接
         * 提前出现，没有任何闸门会响。
         */
        const HOUR = 3600 * 1000;
        // model/contest.ts:49-52
        const isNew = (tdoc, days = 1) => Date.now() < tdoc.beginAt.getTime() - days * DAY;
        // model/contest.ts:54-58
        const isUpcoming = (tdoc, days = 7) => {
            const now = Date.now();
            const readyAt = tdoc.beginAt.getTime();
            return now > readyAt - days * DAY && now < readyAt;
        };
        // model/contest.ts:60-62
        const isNotStarted = (tdoc) => new Date() < tdoc.beginAt;
        // model/contest.ts:64-69（duration 型比赛的 tsdoc 截止）
        const isOngoing = (tdoc, tsdoc) => {
            const now = new Date();
            if (tsdoc && tsdoc.endAt && tsdoc.endAt <= now) return false;
            if (tsdoc && tdoc.duration && tsdoc.startAt <= new Date(Date.now() - Math.floor(tdoc.duration * HOUR))) return false;
            return tdoc.beginAt <= now && now < tdoc.endAt;
        };
        // model/contest.ts:71-76
        const isDone = (tdoc, tsdoc) => {
            if (tdoc.endAt <= new Date()) return true;
            if (tsdoc && tsdoc.endAt && tsdoc.endAt <= new Date()) return true;
            if (tsdoc && tdoc.duration && tsdoc.startAt <= new Date(Date.now() - Math.floor(tdoc.duration * HOUR))) return true;
            return false;
        };
        // model/contest.ts:78-81
        const isLocked = (tdoc, time = new Date()) => (!!tdoc.lockAt && tdoc.lockAt < time && !tdoc.unlocked);
        // model/contest.ts:83-86
        const isExtended = (tdoc) => !!tdoc.penaltySince && tdoc.penaltySince <= new Date() && new Date() < tdoc.endAt;
        // 六条规则的 showScoreboard / showSelfRecord / showRecord：
        // acm 125-127、oi 335-337、ioi 489-491、strictioi 500-502、ledo 580-582、homework 700-702
        const RULES = {
            acm: {
                TEXT: 'XCPC',
                showScoreboard: (tdoc, now) => now > tdoc.beginAt,
                showSelfRecord: () => true,
                showRecord: (tdoc, now) => now > tdoc.endAt && !isLocked(tdoc),
            },
            oi: {
                TEXT: 'OI',
                showScoreboard: (tdoc, now) => now > tdoc.endAt && !tdoc.keepScoreboardHidden,
                showSelfRecord: (tdoc, now) => now > tdoc.endAt && !tdoc.keepScoreboardHidden,
                showRecord: (tdoc, now) => now > tdoc.endAt && !tdoc.keepScoreboardHidden,
            },
            ioi: {
                TEXT: 'IOI',
                showRecord: (tdoc, now) => now > tdoc.endAt && !isLocked(tdoc),
                showSelfRecord: () => true,
                showScoreboard: (tdoc, now) => now > tdoc.beginAt,
            },
            strictioi: {
                TEXT: 'IOI(Strict)',
                showRecord: (tdoc, now) => now > tdoc.endAt && !tdoc.keepScoreboardHidden,
                showSelfRecord: (tdoc) => !tdoc.keepScoreboardHidden || !isDone(tdoc),
                showScoreboard: (tdoc, now) => now > tdoc.endAt && !tdoc.keepScoreboardHidden,
            },
            ledo: {
                TEXT: 'Ledo',
                showScoreboard: (tdoc, now) => now > tdoc.beginAt,
                showSelfRecord: () => true,
                showRecord: (tdoc, now) => now > tdoc.endAt,
            },
            homework: {
                TEXT: 'Assignment', hidden: true, features: ['scoreboard', 'download'],
                showScoreboard: () => true,
                showSelfRecord: () => true,
                showRecord: (tdoc, now) => now > tdoc.endAt,
            },
        };
        // model/contest.ts:1051-1056
        function canViewHiddenScoreboard(tdoc) {
            if (this.user.own(tdoc)) return true;
            if (tdoc.rule === 'homework') return this.user.hasPerm(PERM.PERM_VIEW_HOMEWORK_HIDDEN_SCOREBOARD);
            return this.user.hasPerm(PERM.PERM_VIEW_CONTEST_HIDDEN_SCOREBOARD);
        }
        // model/contest.ts:1057-1073。模板用 `.call(handler, tdoc, ...)` 调用，
        // 这几个必须是普通 function（从 this.user 取身份），不能写成箭头函数；
        // this 能真的落到 handler 上，靠的是文件顶部复刻的 memberLookup。
        function canShowRecord(tdoc, allowPermOverride = true) {
            if (RULES[tdoc.rule].showRecord(tdoc, new Date())) return true;
            if (allowPermOverride && canViewHiddenScoreboard.call(this, tdoc)) return true;
            return false;
        }
        function canShowSelfRecord(tdoc, allowPermOverride = true) {
            if (RULES[tdoc.rule].showSelfRecord(tdoc, new Date())) return true;
            if (allowPermOverride && canViewHiddenScoreboard.call(this, tdoc)) return true;
            return false;
        }
        function canShowScoreboard(tdoc, allowPermOverride = true) {
            if (RULES[tdoc.rule].showScoreboard(tdoc, new Date())) return true;
            if (allowPermOverride && canViewHiddenScoreboard.call(this, tdoc)) return true;
            return false;
        }
        // model/contest.ts:1129-1136。返回的是英文 key，翻译由模板里的 _() 完成，
        // 与上游一致（上游在 model 里就 _() 了，但那要求全局 i18n，沙箱没有；
        // 两边最终都查 zh.yaml 的同一批 key，渲染结果相同）。
        const statusText = (tdoc, tsdoc) => (
            isNew(tdoc) ? 'New'
                : isUpcoming(tdoc) ? 'Ready (☆▽☆)'
                    : isOngoing(tdoc, tsdoc) ? 'Live...' : 'Done');
        return {
            RULES, isNew, isUpcoming, isNotStarted, isOngoing, isDone, isLocked, isExtended,
            statusText, canViewHiddenScoreboard, canShowRecord, canShowSelfRecord, canShowScoreboard,
        };
    })(),
    training: {
        getPids: (dag) => Array.from(new Set((dag || []).reduce((a, n) => a.concat(n.pids || []), []))),
    },
};

const SYSTEM_DEFAULTS = {
    'server.name': 'SYLU OJ',
    'server.url': 'http://127.0.0.1:8888/',
    'server.language': 'zh_CN',
    'server.login': true,
    'server.pro': false,
    'ui-default.footer_extra_html': '<span>SYLU OJ · 学生维护的非官方编程学习与在线评测平台</span>',
    'ui-default.domainNavigation': true,
    'ui-default.enableScratchpad': true,
    'avatar.gravatar_url': '//cn.gravatar.com/avatar/',
    // model/setting.ts:359-363 的默认值。ranking.html:60 用它算名次，
    // 少了这一条首列会渲染成 NaN。
    'pagination.problem': 100,
    'pagination.contest': 20,
    'pagination.discussion': 50,
    'pagination.record': 100,
    'pagination.ranking': 100,
    // partials/category.html 读的是域设置 problem.categories（YAML 文本，
    // 结构见 model/builtin.ts:120 的 CATEGORIES：{ 大类: [子类…] }）。
    // 这里是仿真数据，只保证形状对，不代表线上实际配了哪些分类。
    'problem.categories': yaml.dump({
        动态规划: ['LCS', 'LIS', '背包', '单调性DP'],
        搜索: ['枚举', '搜索与剪枝', '记忆化搜索'],
        图论: ['最短路', '生成树', '网络流'],
        数据结构: ['并查集', '树状数组', '线段树'],
    }),
};

// ---------------------------------------------------------------- UI 节点
// hydrooj/src/lib/ui.ts:46-61 的默认 Nav 节点
function defaultNavNodes() {
    const perm = (p) => (h) => !!h.user.hasPerm(p);
    return [
        { name: 'homepage', args: { prefix: 'homepage' }, checker: () => true },
        { name: 'problem_main', args: { prefix: 'problem' }, checker: perm(PERM.PERM_VIEW_PROBLEM) },
        { name: 'training_main', args: { prefix: 'training' }, checker: perm(PERM.PERM_VIEW_TRAINING) },
        { name: 'contest_main', args: { prefix: 'contest' }, checker: perm(PERM.PERM_VIEW_CONTEST) },
        { name: 'homework_main', args: { prefix: 'homework' }, checker: perm(PERM.PERM_VIEW_HOMEWORK) },
        { name: 'discussion_main', args: { prefix: 'discussion' }, checker: perm(PERM.PERM_VIEW_DISCUSSION) },
        { name: 'record_main', args: { prefix: 'record' }, checker: perm(PERM.PERM_VIEW_PROBLEM) },
        { name: 'ranking', args: { prefix: 'ranking' }, checker: perm(PERM.PERM_VIEW_RANKING) },
        { name: 'domain_dashboard', args: { prefix: 'domain' }, checker: perm(PERM.PERM_EDIT_DOMAIN) },
        { name: 'manage_dashboard', args: { prefix: 'manage' }, checker: (h) => h.user.hasPriv(PRIV.PRIV_EDIT_SYSTEM) },
    ];
}

// ---------------------------------------------------------------- 模板注册表
function walk(dir, base = '') {
    const out = [];
    for (const name of fs.readdirSync(dir)) {
        const full = path.join(dir, name);
        if (fs.statSync(full).isDirectory()) out.push(...walk(full, path.join(base, name)));
        else out.push(path.join(base, name).replace(/\\/g, '/'));
    }
    return out;
}

/**
 * 与 template.ts:257-278 同构：按 addon 顺序逐个登记，后登记者覆盖同名相对路径。
 * 生产上 sylu-brand 在 ~/.hydro/addon.json 中位于 ui-default 之后，这里保持同一顺序。
 */
function buildRegistry(addonTemplateDirs) {
    const registry = {};
    const load = (root) => {
        for (const rel of walk(root)) {
            if (!/\.(html|md|txt)$/.test(rel)) continue;
            registry[rel] = fs.readFileSync(path.join(root, rel), 'utf-8');
        }
    };
    load(TEMPLATES_UPSTREAM);
    const overridden = new Set();
    for (const dir of addonTemplateDirs) {
        if (!fs.existsSync(dir)) continue;
        const before = Object.keys(registry);
        load(dir);
        for (const rel of walk(dir)) if (/\.(html|md|txt)$/.test(rel) && before.includes(rel)) overridden.add(rel);
    }
    return { registry, overridden: [...overridden] };
}

function createEnv({ addonTemplateDirs = [], settings = {} } = {}) {
    const { registry, overridden } = buildRegistry(addonTemplateDirs);
    const zh = loadLocale();

    class RegistryLoader extends nunjucks.Loader {
        getSource(name) {
            const src = registry[name];
            if (!src) throw new Error(`Cannot get template ${name}`);
            return { src, path: name, noCache: true };
        }
    }

    const env = new nunjucks.Environment(new RegistryLoader(), { autoescape: true, trimBlocks: true });

    // ---- filters：与 template.ts 的注册项一一对应
    env.addFilter('json', (self) => (self ? JSON.stringify(self, (k, v) => ((k.startsWith('_') && k !== '_id') ? undefined : v)) : ''));
    env.addFilter('parseYaml', (self) => yaml.load(self));
    env.addFilter('dumpYaml', (self) => yaml.dump(self));
    env.addFilter('assign', (self, data) => Object.assign(self, data));
    env.addFilter('markdown', (self) => ensureTag(sanitizeClasses(md.render(String(self || '')))));
    env.addFilter('markdownInline', (self) => ensureTag(sanitizeClasses(md.renderInline(String(self || '')))));
    env.addFilter('ansi', (self) => ansiToHtml(self));
    env.addFilter('base64_encode', (s) => Buffer.from(s).toString('base64'));
    env.addFilter('base64_decode', (s) => Buffer.from(s, 'base64').toString());
    env.addFilter('jsesc', (self) => JSON.stringify(self));
    env.addFilter('bitand', (self, val) => self & val); // eslint-disable-line no-bitwise
    env.addFilter('toString', (self) => (typeof self === 'string' ? self : JSON.stringify(self)));
    env.addFilter('content', (content, language, html) => {
        let s = content;
        try { s = JSON.parse(content); } catch { /* 原样 */ }
        if (s && typeof s === 'object') {
            const langs = Object.keys(s);
            s = s[language] || s[langs.find((i) => i.startsWith(language))] || s[langs[0]];
        }
        return ensureTag(html ? String(s) : sanitizeClasses(md.render(String(s))));
    });
    env.addFilter('problemPreview', (html) => String(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
    env.addFilter('contentLang', (content) => {
        try { const s = JSON.parse(content); return typeof s === 'object' ? Object.keys(s) : []; } catch { return []; }
    });
    env.addFilter('log', (self) => { console.log(self); return self; }); // eslint-disable-line no-console

    // ---- globals
    const settingGet = (k) => (settings[k] !== undefined ? settings[k] : SYSTEM_DEFAULTS[k]);
    Object.assign(SYSTEM_DEFAULTS, settings);

    env.addGlobal('Date', Date);
    env.addGlobal('Object', Object);
    env.addGlobal('String', String);
    env.addGlobal('Array', Array);
    env.addGlobal('Math', Math);
    env.addGlobal('process', process);
    env.addGlobal('global', global);
    env.addGlobal('typeof', (o) => typeof o);
    env.addGlobal('instanceof', (a, b) => a instanceof b);
    env.addGlobal('paginate', paginate);
    env.addGlobal('size', size);
    env.addGlobal('utils', {
        status: {
            getScoreColor: (s) => Math.min(10, Math.floor((s || 0) / 10)),
            STATUS_TEXTS,
        },
        getAlphabeticId: (i) => String.fromCharCode(65 + (i < 0 ? 0 : i)),
        buildQueryString,
    });
    env.addGlobal('avatarUrl', avatarUrl);
    env.addGlobal('formatSeconds', formatSeconds);
    env.addGlobal('model', model);
    env.addGlobal('lib', { difficulty });
    env.addGlobal('isIE', isIE);
    env.addGlobal('platformIcon', platformIcon);
    env.addGlobal('set', (obj, key, val) => {
        if (val !== undefined) obj[key] = val; else Object.assign(obj, key);
        return '';
    });
    env.addGlobal('templateExists', (name) => !!registry[name]);
    env.addGlobal('findSubModule', (prefix) => Object.keys(registry).filter((n) => n.startsWith(prefix)));
    // backendlib/template.ts:124 确实把 eval 注册成了模板全局，
    // record_main.html:12 的 `rdocs.map(eval("rdoc=>rdoc._id.toString()"))` 就靠它。
    // 不照做的话记录列表页整页渲染失败，而失败原因看起来像"我们的沙箱不行"。
    env.addGlobal('eval', (expr) => eval(expr)); // eslint-disable-line no-eval
    env.addGlobal('perm', PERM);
    env.addGlobal('PRIV', PRIV);
    env.addGlobal('STATUS', STATUS);
    env.addGlobal('datetimeSpan', datetimeSpan);
    // 上游模板通过 addGlobal('global', global) 读取 global.Hydro.*，这里如实挂到真实 global 上
    global.Hydro = { version: { hydrooj: '5.0.7', 'ui-default': '4.58.5' }, model };

    return {
        env,
        registry,
        overridden,
        settingGet,
        uiNodes: { Nav: defaultNavNodes(), Notification: [], UserDropdown: [], ControlPanel: [], DomainManage: [], ProblemAdd: [] },
    };
}

module.exports = {
    createEnv, model, PERM, PRIV, STATUS, ROUTES, makeUrl, formatString,
    datetimeSpan, size, formatSeconds, avatarUrl, loadLocale,
    TEMPLATES_UPSTREAM, REF, buildRegistry,
};
