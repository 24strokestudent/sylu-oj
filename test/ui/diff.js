'use strict';

/**
 * 视觉回归比对：两张 PNG 的逐像素差异率。
 * 用法： node test/ui/diff.js a.png b.png [--fail-over 0.5]
 *
 * 本机没有图像库依赖，所以把两张图交给 headless Chrome 的 canvas 去解码，
 * 结果写进 document.title，再用 --dump-dom 取回。
 * 拆分 CSS、替换模板这类"声称不改外观"的改动，靠它来证明而不是靠目视。
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

function runner(a, b) {
    return `<!doctype html><body><script>
var A=${JSON.stringify(a)}, B=${JSON.stringify(b)}, imgs=[], n=0;
function load(src, i){
  var im=new Image();
  im.onload=function(){ imgs[i]=im; n++; if(n===2) go(); };
  im.onerror=function(){ document.title='LOADFAIL '+src; };
  im.src=src;
}
function go(){
  var w=Math.min(imgs[0].width,imgs[1].width), h=Math.min(imgs[0].height,imgs[1].height);
  var res=(imgs[0].width!==imgs[1].width||imgs[0].height!==imgs[1].height)
    ? 'SIZE '+imgs[0].width+'x'+imgs[0].height+' vs '+imgs[1].width+'x'+imgs[1].height+' | ' : '';
  var c=document.createElement('canvas'); c.width=w; c.height=h;
  var x=c.getContext('2d'); x.drawImage(imgs[0],0,0); var da=x.getImageData(0,0,w,h).data;
  x.clearRect(0,0,w,h); x.drawImage(imgs[1],0,0); var db=x.getImageData(0,0,w,h).data;
  var diff=0, tot=w*h, box=null;
  for(var p=0;p<da.length;p+=4){
    if(Math.abs(da[p]-db[p])>6||Math.abs(da[p+1]-db[p+1])>6||Math.abs(da[p+2]-db[p+2])>6){
      diff++;
      var i=p/4, x=i%w, y=(i/w)|0;
      // 只报百分比的话，"差在哪一行"还得靠肉眼翻两张长图，所以顺手记差异包围盒
      box = box ? [Math.min(box[0],x), Math.min(box[1],y), Math.max(box[2],x), Math.max(box[3],y)] : [x,y,x,y];
    }
  }
  var bbox = box ? ' BBOX '+box[0]+','+box[1]+' '+(box[2]-box[0]+1)+'x'+(box[3]-box[1]+1) : '';
  document.title=(res||'')+'DIFF '+(diff/tot*100).toFixed(3)+'% ('+diff+'/'+tot+')'+bbox;
}
load(A,0); load(B,1);
<\/script></body>`;
}

function main() {
    const argv = process.argv.slice(2);
    const fi = argv.indexOf('--fail-over');
    const maxOver = fi >= 0 ? Number(argv[fi + 1]) : 0.5;
    const positional = argv.filter((x, i) => !(x.startsWith('--') || (fi >= 0 && i === fi + 1)));
    const [a, b] = positional;
    if (!a || !b) { console.log('用法：node test/ui/diff.js <a.png> <b.png> [--fail-over 0.5]'); process.exit(2); }
    for (const f of [a, b]) if (!fs.existsSync(f)) { console.error(`找不到 ${f}`); process.exit(2); }

    const browser = CANDIDATES.find((p) => fs.existsSync(p));
    if (!browser) { console.error('找不到 Chrome/Edge'); process.exit(2); }
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'sylu-diff-'));
    const tmp = path.join(OUT, '__diff.html');
    fs.writeFileSync(tmp, runner(`file:///${path.resolve(a).replace(/\\/g, '/')}`, `file:///${path.resolve(b).replace(/\\/g, '/')}`), 'utf8');
    let title = '';
    try {
        const dom = execFileSync(browser, [
            '--headless=new', '--disable-gpu', '--no-sandbox', '--allow-file-access-from-files',
            `--user-data-dir=${profile}`, '--window-size=400,200', '--virtual-time-budget=15000', '--dump-dom',
            `file://${tmp.replace(/\\/g, '/')}`,
        ], { maxBuffer: 1024 * 1024 * 32, timeout: 90000, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
        title = (dom.match(/<title>([\s\S]*?)<\/title>/) || [, ''])[1];
    } finally {
        fs.rmSync(tmp, { force: true });
        try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* 交给系统回收 */ }
    }
    if (!title || title === 'undefined') { console.error('比对失败：未取得结果'); process.exit(1); }
    console.log(`${path.basename(a)} vs ${path.basename(b)} → ${title}`);
    const m = title.match(/DIFF ([\d.]+)%/);
    if (!m) { console.error('比对未完成'); process.exit(1); }
    const pct = Number(m[1]);
    if (pct > maxOver) { console.error(`✗ 差异 ${pct}% 超过阈值 ${maxOver}%`); process.exit(1); }
    console.log(`✓ 差异 ${pct}% ≤ ${maxOver}%`);
}

main();
