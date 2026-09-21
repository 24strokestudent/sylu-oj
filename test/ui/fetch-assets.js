'use strict';

/**
 * 拉取上游编译产物，让离线渲染的页面带上真实 Hydro 样式。
 *
 * 为什么需要：theme-*.css 是 ui-default 的构建产物，仓库里没有，
 * 没有它则 out/*.html 只是无样式 HTML，目视验收等于自欺欺人。
 * 产物落到 out/vendor/（out/ 已 gitignore，不入库，因为它是上游构建结果）。
 *
 * 用法：node test/ui/fetch-assets.js [--base http://101.42.27.44]
 * 幂等：已存在且非空则跳过，--force 覆盖。
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(__dirname, 'out', 'vendor');
const argv = process.argv.slice(2);
const FORCE = argv.includes('--force');
const bi = argv.indexOf('--base');
const BASE = bi >= 0 ? argv[bi + 1] : (process.env.SYLU_UI_BASE || 'http://101.42.27.44');

function get(url) {
    return new Promise((resolve, reject) => {
        const lib = url.startsWith('https:') ? https : http;
        const req = lib.get(url, { timeout: 30000 }, (res) => {
            if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
                res.resume();
                return resolve(get(new URL(res.headers.location, url).toString()));
            }
            if (res.statusCode !== 200) { res.resume(); return reject(new Error(`HTTP ${res.statusCode} ${url}`)); }
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => resolve(Buffer.concat(chunks)));
            res.on('error', reject);
        });
        req.on('error', reject);
        req.on('timeout', () => req.destroy(new Error(`超时 ${url}`)));
    });
}

async function main() {
    fs.mkdirSync(OUT, { recursive: true });
    // 先取首页，从真实 HTML 里解析出带版本号的资源名，避免把版本号写死在这里
    const home = await get(BASE.replace(/\/$/, '') + '/');
    const found = {};
    for (const m of home.toString('utf-8').matchAll(/(?:href|src)="(\/[^"]*\.css)(?:\?[^"]*)?"/g)) {
        if (/theme-.*\.css$/.test(m[1])) found.theme = m[1];
        if (/sylu-brand\.css$/.test(m[1])) found.brand = m[1];
    }
    if (!found.theme) throw new Error(`${BASE} 首页里找不到 theme-*.css，无法取得上游样式`);

    const targets = [
        ['theme.css', found.theme, '上游 ui-default 编译样式'],
        ['hydro-brand-live.css', found.brand, '线上正在使用的 sylu-brand.css（对照改造前后差异）'],
    ];
    let changed = 0;
    for (const [name, urlPath, why] of targets) {
        if (!urlPath) { console.log(`- 跳过 ${name}（首页未引用）`); continue; }
        const to = path.join(OUT, name);
        if (!FORCE && fs.existsSync(to) && fs.statSync(to).size > 1024) {
            console.log(`= ${name} 已存在（${Math.round(fs.statSync(to).size / 1024)} KB），跳过`);
            continue;
        }
        const buf = await get(new URL(urlPath, BASE).toString());
        fs.writeFileSync(to, buf);
        changed++;
        console.log(`+ ${name}  ${Math.round(buf.length / 1024)} KB  <- ${urlPath}  [${why}]`);
    }
    // 图标字体：theme.css 里 .icon-* 的 content 是私用区码点，没有 hydro-icons 字体
    // 就只会渲染成豆腐块，"用 Hydro 已有 iconfont" 这个决定在沙箱里就无法目视验收。
    const css = fs.readFileSync(path.join(OUT, 'theme.css'), 'utf8');
    const face = (css.match(/@font-face\{font-family:hydro-icons;[^}]*\}/) || [''])[0];
    const fonts = [...face.matchAll(/url\(([^)?]+)\?[^)]*\)/g)].map((m) => m[1]);
    for (const f of fonts) {
        const name = path.basename(f);
        const to = path.join(OUT, name);
        if (!FORCE && fs.existsSync(to) && fs.statSync(to).size > 1024) {
            console.log(`= ${name} 已存在（${Math.round(fs.statSync(to).size / 1024)} KB），跳过`);
            continue;
        }
        try {
            const buf = await get(new URL(f, new URL(found.theme, BASE)).toString());
            fs.writeFileSync(to, buf);
            changed++;
            console.log(`+ ${name}  ${Math.round(buf.length / 1024)} KB  <- ${f}  [iconfont]`);
        } catch (e) {
            console.log(`! ${name} 拉取失败：${e.message}（图标会以豆腐块渲染，不影响其余验收）`);
        }
    }
    console.log(changed ? `\n已更新 ${changed} 个文件。` : '\n全部命中缓存，无需更新（--force 可强制刷新）。');
}

main().catch((e) => { console.error(`拉取失败：${e.message}\n（离线可用 --base 指向任意能访问的实例，或自行放置 test/ui/out/vendor/theme.css）`); process.exit(1); });
