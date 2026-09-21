'use strict';

/**
 * 回归闸门：把"以后记得检查"变成断言，违反即 exit 1。
 * 用法： node test/ui/check.js        （先跑 render.js --all 生成 out/）
 *
 * 分两类：
 *   HARD   —— 一直必须成立的红线，任何改动都不许踩。
 *   RATCHET —— 已知历史债，只许变少不许变多；数值清零后应把该条升级为 HARD。
 *
 * 记录值是当前仓库的真实状态，不是"理想值"。
 */

const fs = require('fs');
const path = require('path');
const H = require('./lib/hydro');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(__dirname, 'out');
const ADDON = path.join(ROOT, 'addons', 'sylu-brand');

// 计划 §49：A 级（首页外壳与 homepage 分片）与 B 级（导航/登录/用户）允许覆盖上游模板。
// C 级（题库/记录/训练/比赛/作业/讨论/排名/后台）只能用 CSS，覆盖即视为越界。
const ALLOWED_OVERRIDES = [
    'main.html',
    'partials/nav.html',
    'login.html',
    'user/settings.html',
    'sylu/about.html',
];
const HOMEPAGE_PREFIX = 'partials/homepage/';

// RATCHET 基线：2026-09-21 首页模板化之后实测。改造前是 53 / 51 / 2，
// 首页模板化降到 8 / 4，导航品牌改成真实 DOM 后降到 8 / 1。
// 剩下的 8 条 richmedia 与这 1 条 first-child 都挂在公告富文本的语义标签上：
// 公告是自由 markdown，class 会被过滤器剥掉，只能按标签排版；那 1 条也只是
// "块首标题不留上边距"的排版规则，不是猜我们自己组件的 DOM 位置。
const DEBT_BASELINE = {
    '本站 CSS 中的 richmedia 深层选择器': 8,
    '本站 CSS 中的 first-child 位置选择器': 1,
};

// HARD：清零一次就锁死，不许再长回来。
const DEBT_FORBIDDEN = {
    '本站 CSS 中的 :has() 选择器': /:has\(/g,
};

const LEAKS = ['DATETIME_SPAN_ERROR', 'Template render error', 'Cannot get template', 'undefined undefined'];

let failed = 0;
function fail(msg) { failed++; console.log(`✗ ${msg}`); }
function pass(msg) { console.log(`✓ ${msg}`); }

function htmlFiles() {
    if (!fs.existsSync(OUT)) return [];
    // live-/legacy-/__ 前缀是对照用的临时产物，不算场景
    return fs.readdirSync(OUT)
        .filter((f) => f.endsWith('.html') && !/^(live-|legacy-|__)/.test(f));
}

function cssFiles() {
    const dir = path.join(ADDON, 'public', 'sylu', 'css');
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).filter((f) => f.endsWith('.css')).map((f) => path.join(dir, f));
}

function checkLeaks() {
    const files = htmlFiles();
    if (!files.length) { fail('out/ 下没有 HTML，先跑 node test/ui/render.js --all'); return; }
    let bad = 0;
    for (const f of files) {
        const s = fs.readFileSync(path.join(OUT, f), 'utf8');
        for (const l of LEAKS) if (s.includes(l)) { fail(`${f} 含泄漏串 "${l}"`); bad++; }
    }
    if (!bad) pass(`${files.length} 个渲染产物无错误串泄漏`);
}

function checkBrandLines() {
    // 上游页脚是 `Powered by <a href="https://hydro.js.org">Hydro v5.0.7</a> Community`，
    // 中间夹着标签，所以只能按要素断言，不能断言整串字面量。
    const files = htmlFiles();
    let bad = 0;
    for (const f of files) {
        const s = fs.readFileSync(path.join(OUT, f), 'utf8');
        if (!/Powered by\s*<a href="https:\/\/hydro\.js\.org">Hydro v/.test(s)) {
            fail(`${f} 缺少 "Powered by Hydro" 归属（计划 §60 明令不得删除）`);
            bad++;
        }
        if (!s.includes('非官方')) {
            fail(`${f} 缺少"学生维护的非官方平台"声明`);
            bad++;
        }
    }
    if (!bad) pass(`品牌红线：${files.length} 个页面的 Hydro 归属与非官方声明均在位`);
}

function checkOverrideWhitelist() {
    const tplDir = path.join(ADDON, 'templates');
    if (!fs.existsSync(tplDir)) { pass('addon 尚未覆盖任何上游模板'); return; }
    const { overridden } = H.buildRegistry([tplDir]);
    const bad = overridden.filter((n) => !ALLOWED_OVERRIDES.includes(n) && !n.startsWith(HOMEPAGE_PREFIX));
    for (const n of bad) fail(`越界覆盖上游模板：${n}（§49 只允许 A/B 级，C 级请用 CSS）`);
    const stale = ALLOWED_OVERRIDES.filter((n) => !overridden.includes(n));
    if (!bad.length) pass(`模板覆盖 ${overridden.length} 项，全部在允许清单内${stale.length ? `（清单尚有 ${stale.length} 项未使用）` : ''}`);
}

function checkDebtRatchet() {
    const files = cssFiles();
    if (!files.length) { pass('尚未产生拆分后的 CSS 文件'); return; }
    // 注释里会出现 :has() 这类字样，先剥掉注释再统计，否则指标会被文字描述干扰
    const all = files.map((f) => fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')).join('\n');
    const count = (re) => (all.match(re) || []).length;
    const now = {
        '本站 CSS 中的 richmedia 深层选择器': count(/richmedia/g),
        '本站 CSS 中的 first-child 位置选择器': count(/first-child/g),
    };
    for (const k of Object.keys(DEBT_BASELINE)) {
        const cur = now[k] || 0;
        const base = DEBT_BASELINE[k];
        if (cur > base) fail(`${k}：${cur} > 基线 ${base}，深层结构选择器只许减少`);
        else if (cur === base) console.log(`… ${k}：${cur}（持平）`);
        else console.log(`↓ ${k}：${base} → ${cur}`);
    }
    for (const k of Object.keys(DEBT_FORBIDDEN)) {
        const cur = count(DEBT_FORBIDDEN[k]);
        if (cur) fail(`${k}：${cur} 处，已清零的能力不许退回去（改用模板或首页配置判断）`);
    }
    if (!Object.keys(DEBT_FORBIDDEN).some((k) => count(DEBT_FORBIDDEN[k]))) {
        pass(`${Object.keys(DEBT_FORBIDDEN).length} 条已清零的选择器手法保持为零`);
    }
}

function checkHomepageTemplate() {
    // 计划 §50：首屏归模板，公告归数据。两边都要断言，否则会悄悄退回去。
    const home = path.join(OUT, 'home-student.html');
    const base = path.join(OUT, 'baseline-guest.html');
    if (!fs.existsSync(home) || !fs.existsSync(base)) { fail('缺少 home-student/baseline-guest，先跑 render.js --all'); return; }
    const h = fs.readFileSync(home, 'utf8');
    const b = fs.readFileSync(base, 'utf8');
    const count = (s, re) => (s.match(re) || []).length;
    let bad = 0;
    const expect = (name, got, want, why) => {
        if (got === want) return;
        fail(`${name} 有 ${got} 处，预期 ${want} 处 —— ${why}`);
        bad++;
    };

    // 公告里的 class 会被 markdown-it-xss 剥掉（markdown-it-xss.ts:154），
    // 所以基线页有首屏内容却没有首屏类名。这条一旦反过来，
    // 说明上游过滤器放开了 class —— 那正是旧 hack 立不住的前提被推翻。
    expect('home-student.html 的 class="sylu-hero"', count(h, /class="sylu-hero"/g), 1, '首屏只应由模板出一份');
    expect('baseline-guest.html 的 class="sylu-hero"', count(b, /class="sylu-hero"/g), 0, '公告里的 class 应当被过滤器剥掉');
    const tests = [
        [/欢迎来到<em>沈阳理工/.test(b), 'baseline-guest.html 不含公告里的首屏文案，基线已不等同于改造前的线上页面'],
        [count(h, /class="sylu-code-window"/g) === 1, 'home-student.html 的代码窗口不是恰好一份'],
        [/fixtures\/legacy-home\.css/.test(b), 'baseline-guest.html 没挂冻结样式，基线外观会与线上不符'],
        [!/fixtures\/legacy/.test(h), 'home-student.html 挂了冻结样式，改造后页面不该依赖它'],
        [/class="sylu-band"/.test(h), 'home-student.html 缺少 §9.4 的绿色条'],
        [count(h, /class="sylu-entry"/g) === 4, 'home-student.html 的快捷入口不是 4 个（§9.2）'],
        [/WELCOME TO SYLU OJ/.test(h), 'home-student.html 首屏缺少 WELCOME TO SYLU OJ'],
    ];
    for (const [ok, msg] of tests) if (!ok) { fail(msg); bad++; }
    if (!bad) pass('首屏归属正确：模板出一份 Hero，公告只出纯文本');
}

function checkNavBrand() {
    // 计划 §8.2：品牌区要有真实 DOM。改造前站名是 CSS 伪元素 content 塞的，
    // 读屏读不到、也不响应式；现在它必须由 partials/nav.html 渲染出来。
    const home = path.join(OUT, 'home-student.html');
    const base = path.join(OUT, 'baseline-guest.html');
    if (!fs.existsSync(home) || !fs.existsSync(base)) { fail('缺少 home-student/baseline-guest，先跑 render.js --all'); return; }
    const h = fs.readFileSync(home, 'utf8');
    const b = fs.readFileSync(base, 'utf8');
    let bad = 0;
    const tests = [
        [/<li class="nav__list-item sylu-brand">/.test(h), 'home-student.html 没有品牌 <li>，nav.html 覆盖没生效'],
        [/class="sylu-brand__name">[^<{]+</.test(h), '品牌名没有渲染成真实文本节点'],
        [/class="sylu-brand__tagline">在线程序设计与评测平台</.test(h), '副标题没有出现在 DOM 里'],
        [!/class="[^"]*\bsylu-brand/.test(b), 'baseline-guest.html 用上了品牌类名，基线页被本站模板污染了'],
    ];
    for (const [ok, msg] of tests) if (!ok) { fail(msg); bad++; }
    // 伪元素塞正文这件事本身也要能门住：CSS 里再出现站名常量就是 hack 复活。
    const cssDir = path.join(ADDON, 'public', 'sylu', 'css');
    for (const f of fs.readdirSync(cssDir)) {
        const s = fs.readFileSync(path.join(cssDir, f), 'utf8');
        if (/content:\s*"[^"]*SYLU/.test(s)) { fail(`${f} 又用伪元素 content 写站名，§8.2 的 hack 复活了`); bad++; }
    }
    if (!bad) pass('导航品牌是真实 DOM，且未回退到伪元素文案');
}

function checkCssWiring() {
    const dir = path.join(ADDON, 'public', 'sylu', 'css');
    const real = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.css')).map((f) => f.slice(0, -4)) : [];
    const sh = fs.readFileSync(path.join(ROOT, 'deploy', 'configure.sh'), 'utf8');
    const orderLine = (sh.match(/^\s*CSS_ORDER="([^"]*)"/m) || [, ''])[1].split(/\s+/).filter(Boolean);
    // eslint-disable-next-line global-require
    const harness = require('./render.js').CSS_FILES.map((f) => f.replace(/\.css$/, ''));
    let bad = 0;
    if (!orderLine.length) { fail('configure.sh 里找不到 CSS_ORDER 名单，样式不会被挂载'); bad++; }
    for (const f of real) {
        if (!orderLine.includes(f)) { fail(`${f}.css 存在于目录，但不在 configure.sh 的 CSS_ORDER 里，线上不会加载`); bad++; }
        if (!harness.includes(f)) { fail(`${f}.css 不在 render.js 的 CSS_FILES 里，沙箱不会加载它`); bad++; }
    }
    // 线上按 CSS_ORDER 层叠，沙箱按 CSS_FILES 层叠；两边顺序不一致会让沙箱失真
    const sameOrder = orderLine.length === harness.length && orderLine.every((v, i) => v === harness[i]);
    if (!sameOrder) { fail(`configure.sh 的 CSS_ORDER 与 render.js 的 CSS_FILES 不一致：[${orderLine}] vs [${harness}]`); bad++; }
    const pending = harness.filter((f) => !real.includes(f));
    if (!bad) pass(`样式装配一致：${real.length} 个文件已就位，名单两边同步${pending.length ? `，${pending.length} 个待建（${pending.join('/')}）` : ''}`);
}

function checkHomepageSections() {
    const files = htmlFiles().filter((f) => /^(home|baseline)-/.test(f));
    let bad = 0;
    for (const f of files) {
        const s = fs.readFileSync(path.join(OUT, f), 'utf8');
        const n = (s.match(/class="section/g) || []).length;
        if (n < 5) { fail(`${f} 只有 ${n} 个 section，首页数据或模板异常`); bad++; }
    }
    if (!bad) pass(`${files.length} 个首页场景 section 数量正常`);
}

function checkAssetLinks() {
    // 相对路径的 <link> 写错时页面照样渲染，只是样式静默丢失 —— 基线页尤其吃这一口。
    const files = htmlFiles();
    let bad = 0;
    for (const f of files) {
        const s = fs.readFileSync(path.join(OUT, f), 'utf8');
        for (const m of s.matchAll(/<(?:link|script)[^>]*?(?:href|src)="([^"]+)"|<img[^>]*src="([^"]+)"/g)) {
            const ref = m[1] || m[2];
            // 根绝对路径是留给线上用的（/js/entry.js、/p、/record 等），沙箱里本来就不解析
            if (!ref || /^(\/|[a-z]+:|\/\/|#)/i.test(ref)) continue;
            const rel = ref.split('?')[0].split('#')[0];
            if (!fs.existsSync(path.resolve(OUT, rel))) { fail(`${f} 引用了不存在的本地资源：${ref}`); bad++; }
        }
    }
    if (!bad) pass(`${files.length} 个页面的本地资源引用全部可解析`);
}

function checkShotPath() {
    // Windows 上 Chrome 的 --window-size 宽度最小约 504px（实测 320/390/500 都得 504）。
    // 真窄屏只能靠 puppeteer-core 的 CDP setViewport；它一旦从依赖里掉出去，
    // 390px 的图会静默变成 504px 排版的裁切图，据此得出的移动端结论是假的。
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    if (!deps['puppeteer-core']) {
        fail('package.json 缺少 puppeteer-core：窄屏出图会退化成 504px 裁切，不能用来验收移动端');
        return;
    }
    pass(`出图依赖就位：puppeteer-core ${deps['puppeteer-core']}（窄屏走 CDP 视口）`);
}

function main() {
    console.log('== UI 回归闸门 ==');
    checkLeaks();
    checkBrandLines();
    checkOverrideWhitelist();
    checkDebtRatchet();
    checkCssWiring();
    checkAssetLinks();
    checkHomepageSections();
    checkHomepageTemplate();
    checkNavBrand();
    checkShotPath();
    console.log(failed ? `\n${failed} 项未通过` : '\n全部通过');
    process.exit(failed ? 1 : 0);
}

main();
