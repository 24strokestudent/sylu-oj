'use strict';

/**
 * Hydro 模板运行时（离线复刻）
 *
 * 唯一目的：在没有 Hydro 进程、没有 MongoDB 的情况下，用**上游真实模板**渲染页面，
 * 让 UI 改造可以目视验收。不改任何上游文件，只复刻 packages/ui-default/backendlib/template.ts
 * 注册的 globals / filters，以及 handler 交给模板的那几个变量。
 *
 * 复刻依据（上游只读副本，可用 SYLU_HYDRO_REF 覆盖路径）：
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
// packages/common/permission.ts
const PRIV = {
    PRIV_EDIT_SYSTEM: 1 << 0,
    PRIV_MOD_BADGE: 1 << 25,
    PRIV_USER_PROFILE: 1 << 2,
    PRIV_REGISTER_USER: 1 << 3,
    PRIV_CREATE_FILE: 1 << 16,
    PRIV_VIEW_SYSTEM_NOTIFICATION: 1 << 23,
};
const PERM = {
    PERM_EDIT_DOMAIN: 1n << 1n,
    PERM_VIEW_PROBLEM: 1n << 7n,
    PERM_VIEW_USER_PRIVATE_INFO: 1n << 67n,
    PERM_MOD_BADGE: 1n << 2n,
    PERM_VIEW_DISCUSSION: 1n << 27n,
    PERM_VIEW_CONTEST: 1n << 41n,
    PERM_VIEW_TRAINING: 1n << 46n,
    PERM_VIEW_HOMEWORK: 1n << 52n,
    PERM_VIEW_RANKING: 1n << 59n,
};
// packages/common/status.ts
const STATUS = {
    STATUS_WAITING: 0, STATUS_ACCEPTED: 1, STATUS_WRONG_ANSWER: 2, STATUS_TLE: 3,
    STATUS_MLE: 4, STATUS_OLE: 5, STATUS_RE: 6, STATUS_CE: 7, STATUS_SE: 8,
    STATUS_CANCELED: 9, STATUS_ETC: 10, STATUS_HACKED: 11, STATUS_JUDGING: 20,
    STATUS_COMPILING: 21, STATUS_FETCHED: 22, STATUS_IGNORED: 30,
};
const STATUS_TEXTS = ['', 'Accepted', 'Wrong Answer', 'Time Exceeded', 'Memory Exceeded', 'Output Exceeded',
    'Runtime Error', 'Compile Error', 'System Error', 'Cancelled', 'Unknown Error', 'Hacked', 'Running',
    'Compiling', 'Fetched', 'Ignored', 'Format Error'];
const STATUS_SHORT_TEXTS = ['', 'AC', 'WA', 'TLE', 'MLE', 'OLE', 'RE', 'CE', 'SE', 'CANCELED', 'ETC', 'Hacked',
    'RUN', 'Compile', 'Ignored', 'Ignored', 'FE'];
const STATUS_CODES = [];
STATUS_CODES[0] = 'pending';
STATUS_CODES[1] = 'pass';
for (let i = 2; i <= 8; i++) STATUS_CODES[i] = 'fail';
STATUS_CODES[9] = 'ignored';
STATUS_CODES[10] = 'ignored';
STATUS_CODES[11] = 'fail';
for (let i = 20; i <= 22; i++) STATUS_CODES[i] = 'progress';
STATUS_CODES[30] = 'ignored';
STATUS_CODES[31] = 'ignored';

// ---------------------------------------------------------------- 路由表
// 每条都是上游 ctx.Route(name, path) 的登记结果（见 test/ui/README.md 的引用）
const ROUTES = {
    homepage: '/',
    problem_main: '/p',
    problem_detail: '/p/:pid',
    problem_submit: '/p/:pid/submit',
    record_main: '/record',
    record_detail: '/record/:rid',
    contest_main: '/contest',
    contest_detail: '/contest/:tid',
    homework_main: '/homework',
    homework_detail: '/homework/:tid',
    training_main: '/training',
    training_detail: '/training/:tid',
    discussion_main: '/discuss',
    discussion_detail: '/discuss/:did',
    discussion_node: '/discuss/:type/:name',
    discussion_create: '/discuss/:type/:name/create',
    ranking: '/ranking',
    user_login: '/login',
    user_register: '/register',
    user_logout: '/logout',
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

// ---------------------------------------------------------------- model stubs
const DAY = 86400 * 1000;
const model = {
    system: { get: (k) => SYSTEM_DEFAULTS[k] },
    setting: {
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
    contest: {
        RULES: {
            acm: { TEXT: 'XCPC' }, oi: { TEXT: 'OI' }, ioi: { TEXT: 'IOI' },
            strictioi: { TEXT: 'IOI(Strict)' }, ledo: { TEXT: 'Ledo' },
            homework: { TEXT: 'Assignment', hidden: true },
        },
        isUpcoming: (tdoc, days = 7) => Date.now() > tdoc.beginAt - days * DAY && Date.now() < tdoc.beginAt,
        isOngoing: (tdoc, tsdoc) => {
            const now = Date.now();
            if (tsdoc && tsdoc.endAt && tsdoc.endAt <= new Date(now)) return false;
            return tdoc.beginAt <= new Date(now) && new Date(now) < tdoc.endAt;
        },
        isExtended: (tdoc) => tdoc.penaltySince && tdoc.penaltySince <= new Date() && new Date() < tdoc.endAt,
        isDone: (tdoc) => tdoc.endAt <= new Date(),
        statusText: (tdoc) => {
            if (model.contest.isUpcoming(tdoc, 99999) && Date.now() < tdoc.beginAt - DAY) return 'New';
            if (Date.now() < tdoc.beginAt) return 'Ready (☆▽☆)';
            if (model.contest.isOngoing(tdoc)) return 'Live...';
            return 'Done';
        },
    },
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
    'avatar.gravatar_url': '//cn.gravatar.com/avatar/',
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
        status: { getScoreColor: (s) => Math.min(10, Math.floor((s || 0) / 10)) },
        getAlphabeticId: (i) => String.fromCharCode(65 + (i < 0 ? 0 : i)),
        buildQueryString,
    });
    env.addGlobal('avatarUrl', avatarUrl);
    env.addGlobal('formatSeconds', formatSeconds);
    env.addGlobal('model', model);
    env.addGlobal('lib', { difficulty: { display: (d) => (d <= 3 ? '入门' : d <= 6 ? '基础' : d <= 8 ? '进阶' : '困难') } });
    env.addGlobal('isIE', isIE);
    env.addGlobal('platformIcon', platformIcon);
    env.addGlobal('set', (obj, key, val) => {
        if (val !== undefined) obj[key] = val; else Object.assign(obj, key);
        return '';
    });
    env.addGlobal('templateExists', (name) => !!registry[name]);
    env.addGlobal('findSubModule', (prefix) => Object.keys(registry).filter((n) => n.startsWith(prefix)));
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
