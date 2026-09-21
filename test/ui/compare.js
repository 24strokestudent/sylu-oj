'use strict';

/**
 * 视觉回归：拿当前工作区的效果和某个 git 版本比，逐像素出差异率。
 * 用法：
 *   node test/ui/compare.js                 # 与 HEAD 比，全部场景 × 1440
 *   node test/ui/compare.js 1794a1a --widths 1440,390
 *   node test/ui/compare.js --only baseline-guest   # 只比一个场景（出图很慢时很有用）
 *   node test/ui/compare.js --fail-over 0.1
 *
 * 为什么需要它：拆分 CSS、把首页换成模板这类改动，声称"外观没变"是不够的，
 * 必须有个能重复跑的判据。做法是从目标 ref 还原当时的样式，
 * 给每个场景造一份"旧样式孪生页"，两边都出图再比像素。
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(__dirname, 'out');
const SHOTS = path.join(OUT, 'shots');
const LEGACY = path.join(OUT, 'vendor', 'legacy');
const ADDON_REL = 'addons/sylu-brand/public';
const SCENARIOS = Object.keys(require('./render.js').SCENARIOS);
const { CSS_FILES } = require('./render.js');

function git(args) {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1024 * 1024 * 32 });
}

/** 列出某 ref 下本站的全部 CSS（含拆分前的单文件形态） */
function legacyStylesheets(ref) {
    const listing = git(['ls-tree', '-r', '--name-only', ref, '--', ADDON_REL])
        .split('\n').filter((f) => f.endsWith('.css'));
    // 层叠顺序必须照搬真实装配顺序：git 给的是字典序，base/home/responsive/shell/tokens
    // 一旦交错，同优先级的规则就会换赢家，比对结果里就会混进"孪生页自己的假差异"。
    listing.sort((a, b) => orderOf(a) - orderOf(b));
    fs.rmSync(LEGACY, { recursive: true, force: true });
    fs.mkdirSync(LEGACY, { recursive: true });
    return listing.map((f, i) => {
        const body = git(['show', `${ref}:${f}`]);
        const to = path.join(LEGACY, `${i}-${path.basename(f)}`);
        fs.writeFileSync(to, body, 'utf8');
        return `vendor/legacy/${path.basename(to)}`;
    });
}

/** 拆分前的单文件 sylu-brand.css 排在最前，它没有同辈；拆分后的按 CSS_FILES 排 */
function orderOf(file) {
    const i = CSS_FILES.indexOf(path.basename(file));
    return i < 0 ? -1 : i;
}

/**
 * 用当前渲染结果换掉本站样式，得到"旧样式孪生页"。
 * fixtures/ 下的冻结快照也要一并换掉：孪生页的旧样式来自 ref，两边都留会互相干扰。
 */
function buildTwin(page, links) {
    const src = path.join(OUT, `${page}.html`);
    if (!fs.existsSync(src)) return null;
    let html = fs.readFileSync(src, 'utf8');
    html = html.replace(/[ \t]*<link rel="stylesheet" href="[^"]*\/sylu\/css\/[^"]*">\n?/g, '');
    html = html.replace(/[ \t]*<link rel="stylesheet" href="[^"]*sylu-brand\.css">\n?/g, '');
    html = html.replace(/[ \t]*<link rel="stylesheet" href="[^"]*fixtures\/legacy-[^"]*">\n?/g, '');
    const inject = links.map((l) => `  <link rel="stylesheet" href="${l}">`).join('\n');
    html = html.replace('</head>', `${inject}\n</head>`);
    const to = path.join(OUT, `legacy-${page}.html`);
    fs.writeFileSync(to, html, 'utf8');
    return `legacy-${page}`;
}

function main() {
    const argv = process.argv.slice(2);
    const wi = argv.indexOf('--widths');
    const fi = argv.indexOf('--fail-over');
    const oi = argv.indexOf('--only');
    const valueIdx = new Set([wi, fi, oi].filter((i) => i >= 0).map((i) => i + 1));
    const positional = argv.filter((a, i) => !a.startsWith('--') && !valueIdx.has(i));
    const widths = wi >= 0 ? argv[wi + 1].split(',').map(Number) : [1440];
    const maxOver = fi >= 0 ? Number(argv[fi + 1]) : 0.1;
    const ref = positional[0] || 'HEAD';
    const only = oi >= 0 ? argv[oi + 1] : null;
    let scenarios = only ? SCENARIOS.filter((s) => s.includes(only)) : SCENARIOS.slice();
    // baseline-* 默认不比：这些页面靠 fixtures/ 里的冻结样式复刻"改造前"，
    // 而孪生页会按定义把冻结样式换成 ref 的当前样式，比出来的是"快照 vs 现版 skin"，
    // 实测稳定在 25% 上下，跟本轮改动量无关（去掉整个 oj.css 只挪动 0.01%）。
    // 要看它们用 --only baseline 显式指定。
    if (!only && scenarios.some((s) => s.startsWith('baseline-'))) {
        scenarios = scenarios.filter((s) => !s.startsWith('baseline-'));
        console.log('跳过 baseline-*：孪生页会用 ref 样式覆盖 fixtures 冻结快照，比出的不是本轮改动量（--only baseline 可强跑）');
    }
    if (!scenarios.length) { console.error(`没有匹配的场景，可用：${SCENARIOS.join(', ')}`); process.exit(2); }

    console.log(`比对基准：${ref}`);
    const links = legacyStylesheets(ref);
    if (!links.length) { console.error(`!! ${ref} 下没有任何本站样式，无法比对`); process.exit(1); }
    console.log(`还原旧样式 ${links.length} 份：${links.map((l) => path.basename(l)).join(', ')}`);

    execFileSync(process.execPath, [path.join(__dirname, 'render.js'), ...scenarios], { cwd: ROOT, stdio: 'inherit' });
    const twins = scenarios.map((p) => buildTwin(p, links)).filter(Boolean);

    const shoot = (names) => execFileSync(process.execPath,
        [path.join(__dirname, 'shot.js'), ...names, '--widths', widths.join(',')],
        { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1024 * 1024 * 16 });
    shoot(twins);
    shoot(scenarios);

    let worst = 0;
    for (const p of scenarios) {
        for (const w of widths) {
            const a = path.join(SHOTS, `legacy-${p}@${w}.png`);
            const b = path.join(SHOTS, `${p}@${w}.png`);
            if (!fs.existsSync(a) || !fs.existsSync(b)) { console.log(`- ${p}@${w}：缺图，跳过`); continue; }
            const out = execFileSync(process.execPath, [path.join(__dirname, 'diff.js'), a, b, '--fail-over', '101'],
                { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).toString();
            const m = out.match(/DIFF ([\d.]+)%/);
            const pct = m ? Number(m[1]) : 100;
            worst = Math.max(worst, pct);
            console.log(`${pct > maxOver ? '✗' : '✓'} ${p}@${w}  ${pct}%`);
        }
    }
    console.log(`\n最大差异 ${worst}%（阈值 ${maxOver}%）`);
    process.exit(worst > maxOver ? 1 : 0);
}

main();
