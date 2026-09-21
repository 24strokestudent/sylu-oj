'use strict';

/**
 * 出图：把 out/*.html 用无头 Chrome/Edge 截成 PNG，供目视验收。
 *
 * 为什么不用 MCP 浏览器：本机的内置浏览器视口是隐藏的，截图会被
 * NATIVE_BROWSER_VIEWPORT_UNAVAILABLE 挡掉；无头 Chrome 不依赖它。
 *
 * 用法：
 *   node test/ui/shot.js                     # 全部页面 × 全部断点
 *   node test/ui/shot.js home-student        # 指定页面
 *   node test/ui/shot.js --widths 1440,390
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const OUT = path.join(__dirname, 'out');
const SHOTS = path.join(OUT, 'shots');

const CANDIDATES = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].filter(Boolean);

// 断点宽度取自计划 §29；高度由实测页面高度决定，避免截断长页
const BREAKPOINTS = [
    { w: 1440, name: 'desktop' },
    { w: 1024, name: 'laptop' },
    { w: 768, name: 'tablet' },
    { w: 390, name: 'mobile' },
];
const MIN_H = 900;
const MAX_H = 12000;

// --screenshot 只截视口，不截整页；先量出真实高度再出图。
const MEASURE = `<script>document.title='H'+document.documentElement.scrollHeight+'H';</script>`;

function measureHeight(browser, profile, file, width) {
    const tmp = `${file}.measure.html`;
    fs.writeFileSync(tmp, fs.readFileSync(file, 'utf8').replace(/<\/body>/i, `${MEASURE}</body>`), 'utf8');
    try {
        const dom = execFileSync(browser, [
            '--headless=new', '--disable-gpu', '--no-sandbox', `--user-data-dir=${profile}`,
            `--window-size=${width},1200`, '--virtual-time-budget=6000', '--dump-dom',
            `file://${tmp.replace(/\\/g, '/')}`,
        ], { maxBuffer: 1024 * 1024 * 64, timeout: 90000, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
        const m = dom.match(/<title>H(\d+)H</);
        const h = m ? +m[1] : 0;
        return Math.max(MIN_H, Math.min(MAX_H, h || MIN_H));
    } catch {
        return 2600;
    } finally {
        fs.rmSync(tmp, { force: true });
    }
}

function findBrowser() {
    for (const p of CANDIDATES) if (fs.existsSync(p)) return p;
    return null;
}

function main() {
    const argv = process.argv.slice(2);
    const wi = argv.indexOf('--widths');
    const widths = wi >= 0 ? argv[wi + 1].split(',').map(Number) : null;
    // 排除 --widths 本身，以及它的取值（下标 wi+1，不以 -- 开头）
    const pages = argv.filter((a, i) => !a.startsWith('--') && !(wi >= 0 && i === wi + 1));

    const browser = findBrowser();
    if (!browser) {
        console.error('找不到 Chrome/Edge。可用 CHROME_PATH 指定可执行文件。');
        process.exit(1);
    }
    fs.mkdirSync(SHOTS, { recursive: true });

    const files = (pages.length ? pages : fs.readdirSync(OUT)
        .filter((f) => f.endsWith('.html') && !f.startsWith('live-'))
        .map((f) => f.replace(/\.html$/, '')))
        .map((p) => path.join(OUT, `${p}.html`))
        .filter((f) => fs.existsSync(f));
    if (!files.length) { console.error('没有可截图的 HTML，先跑 node test/ui/render.js --all'); process.exit(1); }

    const bps = widths ? BREAKPOINTS.filter((b) => widths.includes(b.w)) : BREAKPOINTS;
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'sylu-shot-'));
    let ok = 0;
    for (const file of files) {
        const base = path.basename(file, '.html');
        for (const bp of bps) {
            if (widths && !widths.includes(bp.w)) continue;
            const to = path.join(SHOTS, `${base}@${bp.w}.png`);
            const h = measureHeight(browser, profile, file, bp.w);
            try {
                execFileSync(browser, [
                    '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
                    `--user-data-dir=${profile}`,
                    `--window-size=${bp.w},${h}`,
                    '--virtual-time-budget=6000',
                    `--screenshot=${to}`,
                    `file://${file.replace(/\\/g, '/')}`,
                ], { stdio: ['ignore', 'ignore', 'pipe'], timeout: 90000 });
                if (fs.existsSync(to)) { ok++; console.log(`✓ ${path.basename(to)}  ${bp.w}x${h}  ${Math.round(fs.statSync(to).size / 1024)} KB`); }
            } catch (e) {
                console.error(`✗ ${base}@${bp.w}：${String(e.stderr || e.message).split('\n')[0]}`);
            }
        }
    }
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* 交给系统回收 */ }
    console.log(`\n共 ${ok} 张，目录：${path.relative(path.resolve(__dirname, '..', '..'), SHOTS)}/`);
    if (!ok) process.exit(1);
}

main();
