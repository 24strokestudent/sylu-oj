'use strict';

/**
 * 诊断：把量测脚本注入页面，用 headless Chrome --dump-dom 取回真实布局数据。
 * 用法： node test/ui/diag.js baseline-guest
 *        node test/ui/diag.js home-student --width 390    # 查横向溢出
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const OUT = path.join(__dirname, 'out');
const CANDIDATES = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].filter(Boolean);

const PROBE = `
<script>
(function () {
  var out = [];
  function px(v) { return Math.round(parseFloat(v) || 0); }
  var m = document.querySelector('.main');
  if (!m) { out.push('NO .main'); }
  else {
    var chain = [];
    for (var e = m; e && e !== document.documentElement; e = e.parentElement) chain.push(e);
    chain.reverse();
    out.push('HTMLCLASS=' + document.documentElement.className);
    chain.forEach(function (e, i) {
      var cs = getComputedStyle(e);
      var r = e.getBoundingClientRect();
      var idc = e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') +
        (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\\s+/).slice(0, 3).join('.') : '');
      out.push(i + ' ' + idc +
        ' rect=' + Math.round(r.top) + ',' + Math.round(r.height) +
        ' disp=' + cs.display + ' vis=' + cs.visibility + ' op=' + cs.opacity +
        ' ovf=' + cs.overflow + ' pos=' + cs.position +
        ' pad=' + cs.paddingTop + '/' + cs.paddingBottom + ' mt=' + cs.marginTop +
        ' z=' + cs.zIndex + ' bg=' + cs.backgroundColor);
    });
    out.push('MAIN_INNER_TEXT_LEN=' + (m.innerText || '').length);
    var s = m.querySelector('.section');
    if (s) {
      var sc = getComputedStyle(s);
      out.push('FIRST_SECTION rect=' + Math.round(s.getBoundingClientRect().top) + ',' +
        Math.round(s.getBoundingClientRect().height) + ' op=' + sc.opacity +
        ' transform=' + sc.transform + ' vis=' + sc.visibility + ' disp=' + sc.display);
    }
    out.push('BODY_SCROLLH=' + document.body.scrollHeight + ' DOC_SCROLLH=' + document.documentElement.scrollHeight);
    out.push('INNER_H=' + window.innerHeight);
    // 横向溢出：整页被撑宽时截图只会右边缘消失，看不出是谁撑的，所以按"自己越界、父级不越界"找元凶。
    var vw = window.innerWidth;
    out.push('INNER_W=' + vw + ' DOC_SCROLLW=' + document.documentElement.scrollWidth);
    if (document.documentElement.scrollWidth > vw + 1) {
      var bad = [];
      var all = document.querySelectorAll('body *');
      for (var k = 0; k < all.length; k++) {
        var el = all[k];
        var r = el.getBoundingClientRect();
        if (r.width === 0 || r.right <= vw + 1) continue;
        var pr = el.parentElement ? el.parentElement.getBoundingClientRect() : null;
        if (pr && pr.right > vw + 1) continue;
        var cls = (typeof el.className === 'string' && el.className.trim())
          ? '.' + el.className.trim().split(/\\s+/).slice(0, 3).join('.') : '';
        bad.push(el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + cls
          + ' right=' + Math.round(r.right) + ' w=' + Math.round(r.width));
        if (bad.length >= 8) break;
      }
      out.push('OVERFLOW_X=' + (bad.length ? '\\n  ' + bad.join('\\n  ') : '（找不到越界元素，可能是 body/html 自身）'));
    }
  }
  document.title = 'DIAGBEGIN' + out.join('\\n') + 'DIAGEND';
}());
</script>
`;

function main() {
    const argv = process.argv.slice(2);
    const wi = argv.indexOf('--width');
    const width = wi >= 0 ? Number(argv[wi + 1]) : 1440;
    const page = argv.filter((a, i) => !a.startsWith('--') && !(wi >= 0 && i === wi + 1))[0] || 'baseline-guest';
    const src = path.join(OUT, `${page}.html`);
    const html = fs.readFileSync(src, 'utf8');
    const browser = CANDIDATES.find((p) => fs.existsSync(p));
    if (!browser) { console.error('no browser'); process.exit(1); }
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'sylu-diag-'));
    const tmp = path.join(OUT, `__diag-${page}.html`);
    fs.writeFileSync(tmp, html.replace(/<\/body>/i, `${PROBE}</body>`), 'utf8');
    const dom = execFileSync(browser, [
        '--headless=new', '--disable-gpu', '--no-sandbox', `--user-data-dir=${profile}`,
        `--window-size=${width},2600`, '--virtual-time-budget=6000',
        `--dump-dom`, `file://${tmp.replace(/\\/g, '/')}`,
    ], { maxBuffer: 1024 * 1024 * 64, timeout: 90000 }).toString();
    fs.rmSync(tmp, { force: true });
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* ignore */ }
    const t = dom.match(/<title>([\s\S]*?)<\/title>/);
    const raw = t ? t[1] : '';
    const m = raw.match(/DIAGBEGIN([\s\S]*?)DIAGEND/);
    console.log(m ? m[1] : 'DIAG NOT FOUND. title was: ' + JSON.stringify(raw).slice(0, 300));
}

main();
