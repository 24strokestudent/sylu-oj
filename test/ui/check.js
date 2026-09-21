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

// RATCHET 基线：2026-09-21 实测（改造前）
const DEBT_BASELINE = {
    '本站 CSS 中的 richmedia 深层选择器': 53,
    '本站 CSS 中的 first-child 位置选择器': 51,
    '本站 CSS 中的 :has() 隐藏业务模块': 2,
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
        '本站 CSS 中的 :has() 隐藏业务模块': count(/:has\(/g),
    };
    for (const k of Object.keys(DEBT_BASELINE)) {
        const cur = now[k] || 0;
        const base = DEBT_BASELINE[k];
        if (cur > base) fail(`${k}：${cur} > 基线 ${base}，深层结构选择器只许减少`);
        else if (cur === base) console.log(`… ${k}：${cur}（仍为改造前水平）`);
        else console.log(`↓ ${k}：${base} → ${cur}`);
    }
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

function main() {
    console.log('== UI 回归闸门 ==');
    checkLeaks();
    checkBrandLines();
    checkOverrideWhitelist();
    checkDebtRatchet();
    checkCssWiring();
    checkHomepageSections();
    console.log(failed ? `\n${failed} 项未通过` : '\n全部通过');
    process.exit(failed ? 1 : 0);
}

main();
