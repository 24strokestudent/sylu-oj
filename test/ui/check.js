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
// 剩下的都挂在"自由 markdown 渲染出来的富文本"上：公告（home.css）和题面（oj.css）。
// 这两块内容的 class 会被 markdown 过滤器剥掉，上游只留下 .richmedia 和裸的 h2/h3/p，
// 所以排版只能按语义标签挂——这不是猜我们自己组件的 DOM 位置，而是没有别的位置可猜。
// 2026-09-21 C 级题目详情接入时，题面富文本又加了 2 条 richmedia 引用与 2 条块首标题规则。
const DEBT_BASELINE = {
    '本站 CSS 中的 richmedia 深层选择器': 10,
    '本站 CSS 中的 first-child 位置选择器': 3,
    // tokens.css 自称"颜色的唯一出处"，但首页的代码窗口和导航还留着 14 处字面色值
    // （深色代码窗口的 6 组配色 + 导航 2 处）。oj.css 是这一轮新写的，一处字面色值都没有，
    // 说明这个标准做得到；基线只许往下走，等首页配色收进令牌后升级为 HARD。
    '本站 CSS 中的字面色值（tokens.css 之外）': 14,
};

// HARD：清零一次就锁死，不许再长回来。
const DEBT_FORBIDDEN = {
    '本站 CSS 中的 :has() 选择器': /:has\(/g,
};

const COLOR_LITERAL = {
    hex: /#[0-9a-fA-F]{3,8}\b/g,
    func: /rgba?\(/g,
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
    const strip = (f) => fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const all = files.map(strip).join('\n');
    const count = (re) => (all.match(re) || []).length;
    // 令牌文件本身就是色值出处，统计字面色值时把它排除掉
    const palette = files.filter((f) => path.basename(f) !== 'tokens.css').map(strip).join('\n');
    const now = {
        '本站 CSS 中的 richmedia 深层选择器': count(/richmedia/g),
        '本站 CSS 中的 first-child 位置选择器': count(/first-child/g),
        '本站 CSS 中的字面色值（tokens.css 之外）':
            (palette.match(COLOR_LITERAL.hex) || []).length + (palette.match(COLOR_LITERAL.func) || []).length,
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

function checkAboutPage() {
    // 计划 §25：/sylu/about 的结构归模板，JS 只准备数据。
    // 这条查的是源码本身——只要 index.js 里再出现整段 HTML 字符串，就说明退回去了。
    const f = path.join(ADDON, 'index.js');
    const src = fs.readFileSync(f, 'utf8');
    let bad = 0;
    const tests = [
        [!/<\/?html|<!DOCTYPE/i.test(src), 'index.js 里又出现了 HTML 字符串，§25 要求结构放模板'],
        [/this\.response\.template = 'sylu\/about\.html'/.test(src), 'index.js 不再通过 response.template 渲染 sylu/about.html'],
        // 结构在模板里，样式就必须也在样式文件里：内联 <style> 拿不到设计令牌，
        // 换深色模式或改主题时会变成第二份配色来源。
        [!/<style/i.test(src), 'index.js 里又内联了 <style>，关于页的样式应放 public/sylu/css/about.css'],
    ];
    for (const [ok, msg] of tests) if (!ok) { fail(msg); bad++; }
    const out = path.join(OUT, 'about-student.html');
    if (!fs.existsSync(out)) { fail('缺少 about-student.html，先跑 render.js --all'); return; }
    const s = fs.readFileSync(out, 'utf8');
    const notices = (s.match(/class="section__title"/g) || []).length;
    if (notices < 4) { fail(`about-student.html 只有 ${notices} 条须知，§25 要求覆盖使用须知/判题环境/反馈方式/隐私说明`); bad++; }
    if (!/class="sylu-about"/.test(s)) { fail('about-student.html 没有 .sylu-about 容器，模板没渲染出来'); bad++; }
    if (!/关于本站<\/h1>/.test(s)) { fail('about-student.html 的标题不是模板产出的 h1'); bad++; }
    if (!/Powered by/.test(s)) { fail('about-student.html 丢了 Hydro 归属'); bad++; }
    if (!bad) pass(`关于页由模板渲染，须知 ${notices} 条`);
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

/** 拆出 @media 块。只处理一层嵌套（本站样式里没有嵌套 @media），够用就好。 */
function splitMedia(css) {
    const src = css.replace(/\/\*[\s\S]*?\*\//g, '');
    const blocks = [{ cond: '', body: '' }];
    let i = 0;
    while (i < src.length) {
        const at = src.indexOf('@media', i);
        if (at < 0) { blocks[0].body += src.slice(i); break; }
        blocks[0].body += src.slice(i, at);
        const open = src.indexOf('{', at);
        const cond = src.slice(at + 6, open).trim();
        let d = 1;
        let j = open + 1;
        while (j < src.length && d) {
            if (src[j] === '{') d++;
            else if (src[j] === '}') d--;
            j++;
        }
        blocks.push({ cond, body: src.slice(open + 1, j - 1) });
        i = j;
    }
    return blocks;
}

function checkNavClearance() {
    // Hydro 的顶栏是 position:fixed，并用 margin-bottom:-2.8125rem 抵消了自己的占位，
    // 也就是说它不占文档流：每个页面必须主动让出导航高度，否则首行被压在导航条下面。
    // 上游靠 `.main{padding:3.4375rem 0}` 表达这件事，本站一度写成死数 28px（< 45px），
    // 关于页/题库/记录页的首行就全被盖住了。这里把"让位"这件事钉在令牌上。
    const files = cssFiles();
    if (!files.length) { fail('没有本站 CSS'); return; }
    const read = (n) => {
        const p = path.join(ADDON, 'public', 'sylu', 'css', n);
        return fs.existsSync(p) ? fs.readFileSync(p, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '') : '';
    };
    let bad = 0;

    const tokens = read('tokens.css');
    const navH = (tokens.match(/--sylu-nav-h:\s*([\d.]+)(rem|px)/) || []).slice(1);
    if (navH.length !== 2) {
        fail('tokens.css 缺少 --sylu-nav-h，导航净空没有唯一出处');
        return;
    }
    const navPx = navH[1] === 'rem' ? Number(navH[0]) * 16 : Number(navH[0]);
    pass(`导航高度令牌 --sylu-nav-h = ${navH.join('')}（≈${Math.round(navPx)}px）`);

    const shell = read('shell.css');
    if (!/\.main\s*\{[^}]*padding-top:\s*calc\(var\(--sylu-nav-h\)\s*\+\s*\d+px\)/.test(shell)) {
        fail('shell.css 的 .main padding-top 没有引用 --sylu-nav-h，导航是 fixed 的，写死像素就会盖住首行');
        bad++;
    }

    // 上游把顶栏收进抽屉、改由处在文档流里的 .header--mobile 占位的开关就在 600px；
    // 净空释放只许发生在该宽度以下，写在 640 会留下 601–640px 谁都没管到的空档。
    for (const f of files) {
        const name = path.basename(f);
        for (const b of splitMedia(fs.readFileSync(f, 'utf8'))) {
            if (!b.cond) continue;
            const max = /max-width:\s*(\d+(?:\.\d+)?)px/.exec(b.cond);
            if (!max || Number(max[1]) <= 600) continue;
            if (/\.main\s*\{[^}]*padding-top/.test(b.body)) {
                fail(`${name} 在 @media ${b.cond} 里改了 .main 的 padding-top：这个宽度顶栏仍是 fixed，让位不能撤`);
                bad++;
            }
        }
    }

    // 品牌区是"logo + 两行文字"，实测会把链接盒子顶到 55px 并压住导航下边框，
    // 所以行高必须锁在令牌上，logo 也必须比导航矮。
    if (!/\.sylu-brand__link\s*\{[^}]*height:\s*var\(--sylu-nav-h\)/.test(shell)) {
        fail('shell.css 的 .sylu-brand__link 没有把高度锁到 --sylu-nav-h，品牌区会撑破导航条');
        bad++;
    }
    const logo = /\.nav__logo\s*\{[^}]*height:\s*([\d.]+)px/.exec(shell);
    if (!logo) fail('shell.css 找不到 .nav__logo 的高度，品牌图标尺寸失去约束');
    else if (Number(logo[1]) >= navPx) {
        fail(`.nav__logo 高 ${logo[1]}px ≥ 导航 ${Math.round(navPx)}px，副标题会被下边框切掉`);
        bad++;
    }
    if (!bad) pass('导航净空：.main 让位、品牌行高、图标尺寸都绑在 --sylu-nav-h 上');
}

/**
 * C 级页面（题库 / 题目详情 / 提交记录列表 / 提交详情）的闸门。
 * 这一组不覆盖上游模板，能改的只有 CSS，所以这里守的是 CSS 管不到的三件事：
 *   1) 场景还在渲染，而且渲染出的是有正文的上游模板——夹具和模板一旦脱节，
 *      Nunjucks 不会报错，只会静默交出空表格，据此出的截图全是假的；
 *   2) 隐藏题只对有 PERM_VIEW_PROBLEM_HIDDEN 的身份出现（§49 红线）；
 *   3) 判题状态用颜色区分时文字必须留着（计划 §13）。
 */
const TIER_C_MARKERS = {
    'problems-guest': ['class="data-table hide-problem-tag"'],
    'problems-student': ['class="data-table hide-problem-tag"'],
    'problems-teacher': ['class="data-table hide-problem-tag"'],
    'problems-admin': ['class="data-table hide-problem-tag"'],
    'problem-guest': ['class="problem-content"'],
    'problem-student': ['class="problem-content"'],
    'problem-admin': ['class="problem-content"'],
    'records-student': ['class="data-table record_main__table"'],
    'record-student': ['class="data-table record_detail__table"', 'class="subtask"'],
    // 这一组是本轮补上的：训练 / 比赛 / 作业 / 讨论 / 排名 / 登录。
    // 标记串一律取上游模板自己写出的 class，不是我们 CSS 里的选择器，
    // 这样"夹具脱节 → 空表格 → 照着空页面写 CSS"这条链会被断在这里。
    'contests-student': ['class="section__list contest__list"'],
    'contests-admin': ['class="section__list contest__list"'],
    'contest-live-student': ['class="problem__tag-item"'],
    'contest-upcoming-student': ['class="problem__tag-item"'],
    'contest-ended-hidden-student': ['class="problem__tag-item"'],
    'contest-ended-hidden-admin': ['class="problem__tag-item"'],
    'contest-ended-open-student': ['class="problem__tag-item"'],
    'homework-student': ['class="section__list homework__list"'],
    'training-student': ['class="section__list all primary training__list"'],
    'training-guest': ['class="section__list all primary training__list"'],
    'discuss-student': ['class="section__list discussion__list"'],
    'discuss-guest': ['class="section__list discussion__list"'],
    'ranking-student': ['class="data-table"', 'class="col--rp"'],
    'ranking-guest': ['class="data-table"', 'class="col--rp"'],
    'login-guest': ['class="immersive--content immersive--center"', 'name="password"'],
};

function checkTierC() {
    let bad = 0;
    const read = (name) => {
        const p = path.join(OUT, `${name}.html`);
        if (!fs.existsSync(p)) return null;
        return fs.readFileSync(p, 'utf8');
    };
    for (const [name, markers] of Object.entries(TIER_C_MARKERS)) {
        const s = read(name);
        if (s === null) { fail(`缺少 ${name}.html，先跑 node test/ui/render.js --all`); bad++; continue; }
        for (const m of markers) {
            if (!s.includes(m)) { fail(`${name}.html 里没有 ${m}：上游模板没渲染出正文，夹具与模板脱节了`); bad++; }
        }
        const rows = (s.match(/<tr data-pid="/g) || []).length;
        if (/^problems-/.test(name) && rows < 9) {
            fail(`${name}.html 的题目行只有 ${rows} 条，夹具的 PROBLEMS 至少该出 9 条`); bad++;
        }
    }
    // 隐藏题：可见性必须跟着权限分叉，而不是靠夹具一刀切过滤。
    // 只断言"学生看不到"是不够的——把夹具改成永远过滤掉隐藏题同样能过，
    // 所以正例（管理员能看到）必须一起断言。
    const HIDDEN_PID = 'data-pid="1009"';
    for (const role of ['guest', 'student', 'teacher']) {
        const s = read(`problems-${role}`) || '';
        if (s.includes(HIDDEN_PID)) { fail(`problems-${role}.html 出现了隐藏题 1009：越权泄露赛前/待发布题目`); bad++; }
    }
    const admin = read('problems-admin') || '';
    if (!admin.includes(HIDDEN_PID)) { fail('problems-admin.html 看不到隐藏题 1009：夹具的权限分支写反了，红线测不出回归'); bad++; }

    // 游客没有递交权限，页面上只该出现"登录后递交"；学生反之。
    const guest = read('problem-guest') || '';
    const student = read('problem-student') || '';
    if (!guest.includes('登录后递交')) { fail('problem-guest.html 没有"登录后递交"，游客分支变了'); bad++; }
    if (student.includes('登录后递交')) { fail('problem-student.html 出现"登录后递交"，学生被当成游客渲染了'); bad++; }

    // 状态列：颜色只是辅助，文字不许被 CSS 抹掉。
    const cssDir = path.join(ADDON, 'public', 'sylu', 'css');
    for (const f of fs.readdirSync(cssDir)) {
        if (!f.endsWith('.css')) continue;
        const css = fs.readFileSync(path.join(cssDir, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
        for (const m of css.matchAll(/([^{}]*record-status--text[^{}]*)\{([^}]*)\}/g)) {
            if (/display:\s*none/.test(m[2])) { fail(`${f} 用 display:none 隐藏了判题状态文字（计划 §13：颜色只是辅助）`); bad++; }
        }
    }
    // 窄屏把状态列压成"图标 + 分数"时靠的是 font-size:0 配 > span 还原，两条必须成对出现，
    // 只留前一条就会把分数一起压没，手机上只剩一个图标。
    for (const f of ['oj.css', 'responsive.css']) {
        const p = path.join(cssDir, f);
        if (!fs.existsSync(p)) continue;
        const css = fs.readFileSync(p, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
        const zeroed = (css.match(/record-status--text\s*\{[^}]*font-size:\s*0\b/g) || []).length;
        const restored = (css.match(/record-status--text\s*>\s*span\s*\{[^}]*font-size:\s*1[0-9]px/g) || []).length;
        if (zeroed > restored) { fail(`${f} 有 ${zeroed} 处 font-size:0 压缩状态文字，但只有 ${restored} 处 > span 还原，手机上分数会消失`); bad++; }
    }
    if (!bad) pass(`C 级 ${Object.keys(TIER_C_MARKERS).length} 页渲染正常，隐藏题按权限分叉，状态文字未被颜色化`);
}

/**
 * 比赛与作业的"数据不得提前出现"闸门（计划 §49 附加红线）。
 *
 * 上游把这三件事交给 model.contest 的可见性函数（model/contest.ts:1051-1073），
 * 侧栏据此决定输不输出链接（partials/contest_sidebar.html:130-149）。
 * C 级不覆盖模板，所以我们改不了这个判断——但"改坏了也没人知道"这件事可以消除：
 * 夹具里备好四种时间状态，逐条断言链接该有 / 不该有。
 * 断言一律按 URL 而不是文案：文案走 i18n，翻译一改假失败就来了。
 */
const CONTEST_GATE_EXPECT = [
    // [场景, 比赛链接片段, 期望出现?]
    ['contest-live-student', '/problems', true],
    ['contest-live-student', '/scoreboard', true],
    // 未开始：既没有题目列表，也没有榜单，只有一个参赛表单
    ['contest-upcoming-student', '/problems', false],
    ['contest-upcoming-student', '/scoreboard', false],
    // OI 结束但教师勾了隐藏榜单：普通学生仍然看不到
    ['contest-ended-hidden-student', '/scoreboard', false],
    // 同一份夹具换管理员：出现的是"榜单（隐藏）"入口，而不是提前公开榜单
    ['contest-ended-hidden-admin', '/scoreboard', true],
    ['contest-ended-open-student', '/scoreboard', true],
];

function checkContestGates() {
    let bad = 0;
    const read = (name) => {
        const p = path.join(OUT, `${name}.html`);
        return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
    };
    for (const [scene, frag, want] of CONTEST_GATE_EXPECT) {
        const s = read(scene);
        if (s === null) { fail(`缺少 ${scene}.html，先跑 node test/ui/render.js --all`); bad++; continue; }
        const re = new RegExp(`href="/contest/[a-z0-9]+${frag.replace('/', '\\/')}"`, 'i');
        const got = re.test(s);
        if (got !== want) {
            fail(`${scene}.html ${want ? '应当' : '不得'}出现 ${frag} 入口（got=${got}）：比赛可见性判断被改动`);
            bad++;
        }
    }
    // 未开始的那一页必须仍然给得出"参赛"这条路径，否则上面两条 false 是页面整个没渲染导致的假通过
    const upcoming = read('contest-upcoming-student') || '';
    if (!/data-contest-attend/.test(upcoming)) {
        fail('contest-upcoming-student.html 没有参赛表单：侧栏整块没渲染，前面几条 false 不可信');
        bad++;
    }
    // 指定分组的比赛（夹具 CONTEST_DOCS.grouped）只该出现在有 PERM_VIEW_HIDDEN_CONTEST 的页面
    const listStudent = read('contests-student') || '';
    const listAdmin = read('contests-admin') || '';
    if (listStudent.includes('图论专题训练赛')) {
        fail('contests-student.html 出现了指定分组的比赛：越权可见'); bad++;
    }
    if (!listAdmin.includes('图论专题训练赛')) {
        fail('contests-admin.html 看不到指定分组的比赛：夹具的权限分支写反了'); bad++;
    }
    if (!bad) pass(`比赛四态可见性闸门通过（未开始无题目列表/榜单，OI 隐藏榜单仅管理员可见入口）`);
}

/**
 * 路由完整性：沙箱的 url() 遇到没登记的 route 会回落到 '#'（lib/hydro.js 的 ROUTES），
 * 页面照样出图、链接却是死的。游客页有一处是上游自己的"忘记密码"触发器（由 JS 接管），
 * 所以只允许它一处，且只允许出现在游客页。
 */
function checkDeadLinks() {
    const files = htmlFiles();
    let bad = 0;
    for (const f of files) {
        const s = fs.readFileSync(path.join(OUT, f), 'utf8');
        const n = (s.match(/href="#"/g) || []).length;
        if (!n) continue;
        if (/-guest\.html$/.test(f) && n === 1 && /data-lostpass/.test(s)) continue;
        fail(`${f} 有 ${n} 处 href="#"：多半是 ROUTES 少登记了路由，线上会是死链接`);
        bad++;
    }
    if (!bad) pass(`${files.length} 个页面无未登记路由产生的死链接（游客页的"忘记密码"触发器除外）`);
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
    checkNavClearance();
    checkAboutPage();
    checkTierC();
    checkContestGates();
    checkDeadLinks();
    checkShotPath();
    console.log(failed ? `\n${failed} 项未通过` : '\n全部通过');
    process.exit(failed ? 1 : 0);
}

main();
