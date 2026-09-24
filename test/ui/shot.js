'use strict';

/**
 * 出图：把 out/*.html 截成 PNG，供目视验收。
 *
 * 为什么不用 MCP 浏览器：本机的内置浏览器视口是隐藏的，截图会被
 * NATIVE_BROWSER_VIEWPORT_UNAVAILABLE 挡掉；无头 Chrome 不依赖它。
 *
 * 两条出图路径：
 *   puppeteer-core（装了就用）—— 走 CDP 的 setViewport，视口宽度就是请求的宽度，
 *     fullPage 直接截整页。窄屏**必须**用它。
 *   Chrome 命令行（没装也能跑）—— --window-size 在 Windows 上有约 504px 的最小值，
 *     请求 390 实际得到 504，出图会按 390 裁掉右边一条；
 *     所以它会为窄屏打印警告，避免把 504 的排版当成 390 的结论。
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
/** Windows 上 Chrome 的 --window-size 最小值，实测 390/500 都会得到 innerWidth 504 */
const CLI_MIN_WIDTH = 504;

// --screenshot 只截视口，不截整页；先量出真实高度再出图。
const MEASURE = `<script>document.title='H'+document.documentElement.scrollHeight+'H';</script>`;

function findBrowser() {
    for (const p of CANDIDATES) if (fs.existsSync(p)) return p;
    return null;
}

function loadPuppeteer() {
    try {
        // eslint-disable-next-line global-require, import/no-extraneous-dependencies
        return require('puppeteer-core');
    } catch {
        return null;
    }
}

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

function shootCli(browser, file, bp, to) {
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'sylu-shot-'));
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
    } finally {
        try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* 交给系统回收 */ }
    }
    return h;
}

async function shootPuppeteer(puppeteer, executablePath, jobs) {
    const browser = await puppeteer.launch({
        executablePath,
        headless: 'new',
        args: ['--no-sandbox', '--disable-gpu', '--allow-file-access-from-files'],
    });
    const done = [];
    try {
        const page = await browser.newPage();
        for (const { file, bp, to } of jobs) {
            // deviceScaleFactor 固定 1：像素数等于 CSS px，diff.js 的比对基准才不会漂
            await page.setViewport({ width: bp.w, height: 900, deviceScaleFactor: 1 });
            // eslint-disable-next-line no-await-in-loop
            await page.goto(`file:///${file.replace(/\\/g, '/')}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
            // 不等 load：页面里有 //cn.gravatar.com 这类协议相对引用，在 file:// 下解析成
            // file://cn.gravatar.com/…，请求挂住就会把 load 事件拖到超时。
            // DOMContentLoaded 已经保证本站样式表就位，这里再补等字体与揭示动画。
            // eslint-disable-next-line no-await-in-loop
            await page.evaluateHandle(() => document.fonts.ready);
            // eslint-disable-next-line no-await-in-loop
            await new Promise((r) => { setTimeout(r, 500); });
            // eslint-disable-next-line no-await-in-loop
            await page.screenshot({ path: to, fullPage: true });
            // eslint-disable-next-line no-await-in-loop
            // 顺带量一次横向溢出：截图只看得到"被切掉的那部分长什么样"，看不出"有没有被切"，
            // 移动端表格溢出这种问题在图上往往表现为"右边内容突然没了"，很容易被当成排版风格。
            // 只比文档级 scrollWidth/clientWidth，不逐元素扫描——.slideout-menu 这类
            // 故意停在视口外的抽屉会被逐元素扫描误报。
            const m = await page.evaluate(() => {
                const de = document.documentElement;
                return { h: de.scrollHeight, over: de.scrollWidth - de.clientWidth };
            });
            done.push([to, m.h, m.over]);
        }
    } finally {
        await browser.close();
    }
    return done;
}

async function main() {
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

    // live-* 是抓线上现状的临时页，legacy-* 是 compare.js 造的"旧样式孪生页"，
    // 都不属于常规场景：混进来的话全量出图会多出一批没人看的图。
    const TEMP_PREFIX = /^(live|legacy)-/;
    const files = (pages.length ? pages : fs.readdirSync(OUT)
        .filter((f) => f.endsWith('.html') && !TEMP_PREFIX.test(f))
        .map((f) => f.replace(/\.html$/, '')))
        .map((p) => path.join(OUT, `${p}.html`))
        .filter((f) => fs.existsSync(f));
    if (!files.length) { console.error('没有可截图的 HTML，先跑 node test/ui/render.js --all'); process.exit(1); }

    const bps = widths ? BREAKPOINTS.filter((b) => widths.includes(b.w)) : BREAKPOINTS;
    const jobs = [];
    for (const file of files) {
        const base = path.basename(file, '.html');
        for (const bp of bps) jobs.push({ file, bp, to: path.join(SHOTS, `${base}@${bp.w}.png`) });
    }

    const puppeteer = loadPuppeteer();
    let ok = 0;
    let overflow = 0;
    let cliJobs = jobs;
    if (puppeteer) {
        try {
            const done = await shootPuppeteer(puppeteer, browser, jobs);
            for (const [to, h, over] of done) {
                ok++;
                const w = path.basename(to).match(/@(\d+)/)[1];
                if (over > 0) overflow++;
                console.log(`✓ ${path.basename(to)}  ${w}x${h}  ${Math.round(fs.statSync(to).size / 1024)} KB${over > 0 ? `  ✗ 横向溢出 ${over}px` : ''}`);
            }
            cliJobs = [];
        } catch (e) {
            console.error(`✗ puppeteer 出图失败：${String(e.message).split('\n')[0]}，改用命令行路径`);
        }
    }
    if (cliJobs.length) {
        const narrow = [...new Set(cliJobs.map((j) => j.bp.w).filter((w) => w < CLI_MIN_WIDTH))];
        if (narrow.length) {
            console.log(`! 未走 puppeteer：${narrow.join('/')}px 会被 Chrome 钳到 ${CLI_MIN_WIDTH}px，`
                + '窄屏图只反映裁切后的左半部分。要真实窄屏请 cd test/ui && npm install。');
        }
        for (const { file, bp, to } of cliJobs) {
            try {
                const h = shootCli(browser, file, bp, to);
                if (fs.existsSync(to)) { ok++; console.log(`✓ ${path.basename(to)}  ${bp.w}x${h}  ${Math.round(fs.statSync(to).size / 1024)} KB`); }
            } catch (e) {
                console.error(`✗ ${path.basename(file, '.html')}@${bp.w}：${String(e.stderr || e.message).split('\n')[0]}`);
            }
        }
    }
    console.log(`\n共 ${ok} 张，目录：${path.relative(path.resolve(__dirname, '..', '..'), SHOTS)}/`);
    // 溢出即失败：一张"看着还行"的窄屏截图可能整列都被切掉了，靠眼睛看不出来。
    if (overflow) console.error(`✗ ${overflow} 张图存在横向溢出，窄屏下会出现横向滚动条或内容被切`);
    if (!ok || overflow) process.exit(1);
}

main().catch((e) => { console.error(`出图失败：${e.message}`); process.exit(1); });
