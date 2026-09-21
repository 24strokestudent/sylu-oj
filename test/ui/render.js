'use strict';

/**
 * 渲染入口：node test/ui/render.js [page:scenario ...]
 *
 * 产出 test/ui/out/*.html —— 用上游 CSS 无法在此加载（那是构建产物），
 * 因此同时把 sylu-brand 的 css 以 <link> 注入到 out/ 页面的相对路径下，
 * 浏览器直接打开即可看到改造后的真实层叠效果。
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const H = require('./lib/hydro');
const D = require('./lib/data');

const ROOT = path.resolve(__dirname, '..', '..');
const ADDON = path.join(ROOT, 'addons', 'sylu-brand');
const OUT = path.join(ROOT, 'test', 'ui', 'out');

/** 设计系统分片顺序即层叠顺序，与 addon README 保持一致（计划 §6） */
const CSS_FILES = ['tokens.css', 'base.css', 'shell.css', 'home.css', 'about.css', 'oj.css', 'manage.css', 'responsive.css'];
/** out/*.html 相对 addon public/ 的路径 */
const PUB_REL = path.relative(OUT, path.join(ADDON, 'public')).replace(/\\/g, '/') || '.';

// 上游 hydrooj/setting.yaml 的 default（用于渲染"改造前"基线）
const CONFIG_DEFAULT = [
    { width: 9, bulletin: true, contest: 5, homework: 10, training: 10, ranking: 10, discussion: 20 },
    { width: 3, hitokoto: true, starred_problems: 50, recent_problems: 10, discussion_nodes: true, suggestion: true },
];
function loadSyluConfig() {
    const f = path.join(ADDON, 'homepage.yaml');
    if (!fs.existsSync(f)) return null;
    return yaml.load(fs.readFileSync(f, 'utf-8'));
}

const ROLES = {
    // 游客：有浏览类 PERM（公开题目/比赛/讨论可见），但没有 PRIV_USER_PROFILE，因此不能提交
    guest: () => D.user(0, 'Guest', {
        perm: H.PERM.PERM_VIEW_PROBLEM | H.PERM.PERM_VIEW_TRAINING | H.PERM.PERM_VIEW_CONTEST
            | H.PERM.PERM_VIEW_HOMEWORK | H.PERM.PERM_VIEW_DISCUSSION | H.PERM.PERM_VIEW_RANKING,
        priv: 0,
    }),
    student: () => D.user(1001, 'zhangsan', {
        perm: H.PERM.PERM_VIEW_PROBLEM | H.PERM.PERM_VIEW_TRAINING | H.PERM.PERM_VIEW_CONTEST
            | H.PERM.PERM_VIEW_HOMEWORK | H.PERM.PERM_VIEW_DISCUSSION | H.PERM.PERM_VIEW_RANKING,
        priv: H.PRIV.PRIV_USER_PROFILE | H.PRIV.PRIV_REGISTER_USER | H.PRIV.PRIV_CREATE_FILE,
    }),
    teacher: () => D.user(1002, 'li-laoshi', {
        perm: H.PERM.PERM_VIEW_PROBLEM | H.PERM.PERM_VIEW_TRAINING | H.PERM.PERM_VIEW_CONTEST
            | H.PERM.PERM_VIEW_HOMEWORK | H.PERM.PERM_VIEW_DISCUSSION | H.PERM.PERM_VIEW_RANKING
            | H.PERM.PERM_EDIT_DOMAIN,
        priv: H.PRIV.PRIV_USER_PROFILE | H.PRIV.PRIV_REGISTER_USER | H.PRIV.PRIV_CREATE_FILE,
    }),
    admin: () => D.user(1000, 'system-admin', {
        perm: -1n,
        priv: H.PRIV.PRIV_USER_PROFILE | H.PRIV.PRIV_REGISTER_USER | H.PRIV.PRIV_CREATE_FILE
            | H.PRIV.PRIV_EDIT_SYSTEM | H.PRIV.PRIV_MOD_BADGE | H.PRIV.PRIV_VIEW_SYSTEM_NOTIFICATION,
    }),
};

/** nunjucks 的 _prettifyError 已把嵌套位置写进 message，逐行输出即可 */
function describeError(e) {
    return String((e && e.message) || e).split('\n').slice(0, 8).join('\n  ');
}

function translateFn(zh) {
    return (key) => {
        const s = new String(key === undefined || key === null ? '' : (zh[key] || key));
        s.format = (...args) => H.formatString(String(s), ...args);
        return s;
    };
}

function makeHandler(user, opts) {
    const handler = {
        user,
        domain: {
            _id: 'system', name: 'SYLU OJ', avatar: '',
            bulletin: (opts && opts.bulletin) || D.BULLETIN,
            ui: {
                name: 'SYLU OJ',
                footer_extra_html: '<span>非学校官方信息系统 · 请勿上传隐私数据</span>',
            },
        },
        session: {},
        request: { path: '/', headers: { 'user-agent': 'SyluUiHarness/1.0' } },
        context: { request: { url: 'http://127.0.0.1:8888/' } },
        args: { __start: Date.now() - 137, __prepareDone: Date.now(), __prepare: Date.now(), domainId: 'system' },
        UiContext: { cdn_prefix: '/', cdn_dynamic: false, url_prefix: '/', ws_prefix: '/', constantVersion: 'a1b2c3d4' },
    };
    handler.url = H.makeUrl(handler);
    handler.renderTitle = (p) => `${p} - SYLU OJ`;
    return handler;
}

function buildEnv(opts) {
    const { registry, env, overridden, settingGet, uiNodes } = H.createEnv({
        addonTemplateDirs: opts.addon === false ? [] : [path.join(ADDON, 'templates')],
        settings: { 'ui-default.nav_logo_dark': '/sylu-logo.svg' },
    });
    env.addGlobal('ui', {
        getNodes: (n) => uiNodes[n] || [],
        nodes: uiNodes,
    });
    // sylu-brand 注入的「关于本站」导航项，等价于 index.js 的 ctx.injectUI('Nav', ...)
    if (opts.addon !== false) {
        const idx = uiNodes.Nav.findIndex((n) => n.name === 'ranking');
        uiNodes.Nav.splice(idx < 0 ? uiNodes.Nav.length : idx, 0, {
            name: 'sylu_about',
            displayName: '关于本站',
            args: { prefix: 'sylu' },
            checker: () => true,
        });
    }
    return { env, registry, overridden, settingGet, uiNodes };
}

function renderPage({
    template, state, env, settingGet, out, opts = {},
}) {
    const zh = (function loadZh() {
        const f = path.join(H.REF, 'packages', 'ui-default', 'locales', 'zh.yaml');
        if (!fs.existsSync(f)) return {};
        const raw = yaml.load(fs.readFileSync(f, 'utf-8')) || {};
        return Object.fromEntries(Object.entries(raw).filter(([k, v]) => !k.startsWith('__') && typeof v === 'string'));
    }());
    const _ = translateFn(zh);
    const handler = state.handler;
    const ctx = {
        _,
        url: handler.url,
        handler,
        ctx: { setting: { get: settingGet }, request: handler.context.request },
        ...state,
    };
    ctx.UserContext = state.UserContext || {
        viewLang: 'zh', fontFamily: 'system-ui', codeFontFamily: 'monospace', codeFontLigatures: false,
    };
    // template.ts:238 —— UiContext 由渲染管线注入，html5.html 会对它做 Object.create，缺失即报错
    ctx.UiContext = state.UiContext || handler.UiContext || {};
    let html = env.render(template, ctx);
    // 样式层叠顺序 = 线上层叠顺序：上游 theme.css 在前，本站样式在后
    const vendor = path.join(OUT, 'vendor', 'theme.css');
    const links = [];
    if (fs.existsSync(vendor)) links.push('<link rel="stylesheet" href="vendor/theme.css">');
    else links.push('<link rel="stylesheet" href="http://101.42.27.44/theme-4.58.5.css">');
    const rel = `${PUB_REL}/`;
    const cssDir = path.join(ADDON, 'public', 'sylu', 'css');
    // skipCss：整份被冻结进 fixtures 的文件不能再挂当前版。两者同名规则会互相覆盖，
    // 结果是基线页得到一个"改造前和改造后各一部分"的混合外观，基线就不可信了。
    const skip = opts.skipCss || [];
    for (const f of CSS_FILES) {
        if (skip.includes(f)) continue;
        if (fs.existsSync(path.join(cssDir, f))) links.push(`<link rel="stylesheet" href="${rel}sylu/css/${f}">`);
    }
    // baseline-* 复刻的是"改造前"首页：那套按 DOM 位置写的样式已经从 addon 里删掉了，
    // 只有 test/ui/fixtures 的冻结快照还留着它，否则基线页会得到一个线上从未存在过的外观。
    for (const f of (opts.legacyCss || [])) {
        const abs = path.join(__dirname, f);
        if (!fs.existsSync(abs)) { throw new Error(`冻结样式缺失：${f}，baseline-* 无法复刻改造前外观`); }
        links.push(`<link rel="stylesheet" href="${path.relative(OUT, abs).replace(/\\/g, '/')}">`);
    }
    html = html.replace('</head>', `  ${links.join('\n  ')}\n</head>`);
    // 绝对路径的静态资源（/sylu-logo.svg 等）由 server.ts:114-120 从各 addon 的
    // public/ 挂到 web 根；file:// 下解析不到。仅当文件确实存在时改写为相对路径，
    // 因此 /p、/record 这类路由不会被误伤。
    html = html.replace(/(src|href)="(\/[^"?#]+)"/g, (all, attr, p) => {
        const f = path.join(ADDON, 'public', p.slice(1));
        if (!fs.existsSync(f) || !fs.statSync(f).isFile()) return all;
        return `${attr}="${path.relative(OUT, f).replace(/\\/g, '/')}"`;
    });
    // 沙箱里没有 entry.js：上游 hydro.ts:108 在页面初始化后执行
    // $('.section').addClass('visible')，而 theme.css 的
    // `.hasjs .section{opacity:0}` / `.hasjs .section.visible{opacity:1}`
    // 依赖它。html5.html:51 的内联脚本已把 nojs 换成 hasjs，
    // 所以不补这一步会得到"导航正常、正文全透明"的假象。
    html = html.replace('</body>', [
        '  <script>',
        '  /* sandbox-only reveal shim，等价于 hydro.ts:108 */',
        "  document.querySelectorAll('.section').forEach(function (el) { el.classList.add('visible'); });",
        '  </script>',
        '</body>',
    ].join('\n'));
    fs.writeFileSync(path.join(OUT, out), html);
    return html.length;
}

function homepageState(role, config, bulletin) {
    const user = ROLES[role]();
    const handler = makeHandler(user, bulletin);
    return {
        handler,
        contents: D.homepageContents({ role, config }),
        udict: D.Udict,
        domain: handler.domain,
    };
}

/** 关于页的数据源就是插件自己 require 的 brand.js，沙箱读同一份文件，不另抄一遍。
 *  等价于 index.js 的 SyluAboutHandler：response.body 会被并进模板上下文。 */
function aboutState(role) {
    const b = require(path.join(ADDON, 'brand.js'));
    const handler = makeHandler(ROLES[role](), { bulletin: D.BULLETIN });
    return {
        handler,
        siteName: b.siteName,
        siteSubtitle: b.siteSubtitle,
        disclaimer: b.disclaimer,
        notices: b.notices || [],
        contact: b.contact || '',
        icp: b.icp || '',
    };
}

/**
 * 场景表。baseline-* 必须复刻线上现状：公告里塞着整块 Hero HTML、只加载上游模板
 * （不启用 addon）、并挂上 fixtures 里的冻结样式；home-* 是改造后形态，
 * 公告只留纯文本，首屏改由 addon 的 main.html 承载。
 */
const LEGACY_CSS = ['fixtures/legacy-shell-nav.css', 'fixtures/legacy-home.css', 'fixtures/legacy-responsive.css'];
// 冻结快照本身就是 home.css / responsive.css 在改造前的全文，所以这两个文件在
// 基线场景里换成快照、不再挂当前版；legacy-shell-nav.css 只是 shell.css 的导航段
// （品牌伪元素 + 28px 净空 + 42px logo），所以 shell.css 照常加载，由它在后面覆盖回旧值。
// 顺序保持"tokens→base→shell→home→responsive"。
const LEGACY_SKIP = ['home.css', 'responsive.css'];
const SCENARIOS = {
    'baseline-guest': { role: 'guest', addon: false, bulletin: 'hero', legacyCss: LEGACY_CSS, skipCss: LEGACY_SKIP },
    'baseline-student': { role: 'student', addon: false, bulletin: 'hero', legacyCss: LEGACY_CSS, skipCss: LEGACY_SKIP },
    'home-guest': { role: 'guest', addon: true, bulletin: 'plain' },
    'home-student': { role: 'student', addon: true, bulletin: 'plain' },
    'home-teacher': { role: 'teacher', addon: true, bulletin: 'plain' },
    'home-admin': { role: 'admin', addon: true, bulletin: 'plain' },
    // 关于页不是首页：它走自己的模板与数据，用来验证 §25 的"JS 只给数据不拼 HTML"。
    'about-student': { role: 'student', addon: true, page: 'sylu/about.html' },
};
const HERO = { bulletin: D.HERO_BULLETIN };
const PLAIN = { bulletin: D.BULLETIN };

function main() {
    const argv = process.argv.slice(2);
    const all = argv.includes('--all');
    fs.mkdirSync(OUT, { recursive: true });

    const targets = all ? Object.keys(SCENARIOS) : argv.filter((a) => !a.startsWith('--'));
    if (!targets.length) {
        console.log(`用法：node test/ui/render.js --all  或  node test/ui/render.js ${Object.keys(SCENARIOS)[0]} ...`);
        return;
    }
    const sylu = loadSyluConfig();
    if (!sylu) console.warn('! addons/sylu-brand/homepage.yaml 缺失，home-* 场景将退回上游默认配置');

    for (const t of targets) {
        const sc = SCENARIOS[t];
        if (!sc) { console.error(`未知场景 ${t}；可用：${Object.keys(SCENARIOS).join(', ')}`); process.exit(1); }
        const config = sc.addon ? (sylu || CONFIG_DEFAULT) : CONFIG_DEFAULT;
        const { env, overridden, settingGet } = buildEnv({ addon: sc.addon });
        try {
            const n = renderPage({
                template: sc.page || 'main.html',
                state: sc.page ? aboutState(sc.role) : homepageState(sc.role, config, sc.bulletin === 'hero' ? HERO : PLAIN),
                env,
                settingGet,
                out: `${t}.html`,
                opts: sc,
            });
            console.log(`✓ ${t}.html  ${n} 字节${sc.addon ? '' : '（改造前基线）'}`);
        } catch (e) {
            console.error(`✗ ${t} 渲染失败：\n  ${describeError(e)}`);
            process.exitCode = 1;
        }
        if (sc.addon && overridden.length) {
            console.log(`  覆盖上游模板：${overridden.join(', ')}`);
        }
    }
    console.log(`\n输出目录：${path.relative(ROOT, OUT)}/`);
}

if (require.main === module) main();
module.exports = { main, buildEnv, renderPage, homepageState, makeHandler, ROLES, SCENARIOS, CONFIG_DEFAULT, loadSyluConfig, CSS_FILES };
