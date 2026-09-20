'use strict';

/**
 * sylu-brand — SYLU OJ 品牌插件（可选）
 *
 * 设计约束（实施计划 §1.2 §32 §34）：
 *   1. 不修改 Hydro Core，不 fork 上游，页面页脚保留 Powered by Hydro
 *   2. 只负责"品牌层"：导航扩展 + 平台须知页 + 非官方免责声明
 *   3. 绝不碰用户系统、题库、Judge
 *   4. 只使用 Hydro 官方 Addon API（ctx.Route / ctx.injectUI）
 *
 * 重要：站点名称、Logo、页脚附加内容、关于页正文，Hydro 原生系统设置就能改，
 * 不需要本插件。请先看同目录 README.md 的「原生设置清单」。
 * 本插件只补两件原生做不到的事：
 *   - 顶栏「关于本站」导航入口
 *   - 一页聚合的平台须知（实施计划 §40）
 *
 * 加载方式（在服务器上）：
 *   hydrooj addon add /root/sylu-oj/addons/sylu-brand
 *   pm2 restart hydrooj      # 或 systemctl restart hydro
 */

const path = require('path');

/**
 * 解析 hydrooj 本体。
 * Addon 不在 Hydro 的 node_modules 下，直接 require('hydrooj') 可能失败，
 * 因此依次尝试：常规解析 → global.Hydro 记录的 core 路径 → 环境变量兜底。
 */
function loadHydro() {
    const errors = [];
    const tryLoad = (spec, paths) => {
        try {
            const id = paths ? require.resolve(spec, { paths }) : spec;
            // eslint-disable-next-line global-require, import/no-dynamic-require
            return require(id);
        } catch (e) {
            errors.push(`${spec} -> ${e.code || e.message}`);
            return null;
        }
    };

    let mod = tryLoad('hydrooj');
    if (mod) return mod;

    const candidates = [];
    if (global.addons && global.addons.hydrooj) candidates.push(global.addons.hydrooj);
    if (process.env.SYLU_HYDRO_CORE) candidates.push(process.env.SYLU_HYDRO_CORE);
    for (const c of candidates) {
        mod = tryLoad(c);
        if (mod) return mod;
        mod = tryLoad('hydrooj', [c]);
        if (mod) return mod;
    }

    // 最后兜底：Hydro 常被全局安装，从常见全局目录尝试
    const globalDirs = [
        '/usr/local/lib/node_modules',
        '/usr/lib/node_modules',
        path.join(require('os').homedir(), '.npm-global/lib/node_modules'),
    ];
    mod = tryLoad('hydrooj', globalDirs);
    if (mod) return mod;

    return { __errors: errors };
}

const brand = require('./brand');

const htmlEscape = (s) => String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/** 站点配色（实施计划 §33：红=主要操作，棕=文本/导航，绿=状态/辅助） */
const BRAND_CSS = `
:root { --sylu-red:#b12d28; --sylu-ink:#231815; --sylu-green:#485742; }
.sylu-page { max-width:820px; margin:0 auto; padding:32px 20px 64px; color:var(--sylu-ink); line-height:1.75; }
.sylu-page h1 { font-size:26px; margin:0 0 6px; letter-spacing:.2px; }
.sylu-page .sylu-sub { color:#6b6462; margin:0 0 28px; font-size:14px; }
.sylu-page h2 { font-size:17px; margin:30px 0 8px; padding-left:10px; border-left:3px solid var(--sylu-red); }
.sylu-page p { margin:8px 0; }
.sylu-note { margin:26px 0; padding:14px 16px; border:1px solid rgba(35,24,21,.12); border-radius:14px; background:rgba(72,87,66,.06); }
.sylu-note strong { color:var(--sylu-green); }
.sylu-back { display:inline-block; margin-top:30px; padding:9px 18px; border-radius:10px; background:var(--sylu-red); color:#fff; text-decoration:none; font-size:14px; }
.sylu-back:hover { opacity:.9; }
`;

function renderAboutPage() {
    const notices = (brand.notices || []).map((n) => `
    <h2>${htmlEscape(n.title)}</h2>
    <p>${htmlEscape(n.body)}</p>`).join('');

    const contact = brand.contact
        ? `<p>反馈方式：${htmlEscape(brand.contact)}</p>` : '';
    const icp = brand.icp ? `<p>${htmlEscape(brand.icp)}</p>` : '';

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>关于本站 - ${htmlEscape(brand.siteName)}</title>
<style>${BRAND_CSS}</style>
</head>
<body>
<div class="sylu-page">
  <h1>关于本站</h1>
  <p class="sylu-sub">${htmlEscape(brand.siteName)} · ${htmlEscape(brand.siteSubtitle)}</p>

  <div class="sylu-note">
    <p><strong>非官方声明</strong>：${htmlEscape(brand.disclaimer)}</p>
  </div>

  ${notices}
  ${contact}
  ${icp}

  <p style="margin-top:26px;color:#6b6462;font-size:13px;">
    本站评测引擎基于开源项目
    <a href="https://github.com/hydro-dev/Hydro" target="_blank" rel="noopener">Hydro</a>（AGPL-3.0）。
  </p>

  <a class="sylu-back" href="/">返回首页</a>
</div>
</body>
</html>`;
}

async function apply(ctx) {
    const hydro = loadHydro();

    if (!hydro || !hydro.Handler) {
        // 不抛异常：Hydro 会捕获插件加载失败并弹出通知，站点本身不受影响。
        // 这里给出可操作的诊断信息，便于按 README 排查。
        ctx.logger.error('[sylu-brand] 无法解析 hydrooj 本体，插件未启用。');
        ctx.logger.error('[sylu-brand] 诊断：%o', (hydro && hydro.__errors) || 'unknown');
        ctx.logger.error('[sylu-brand] 处理：在 addon 目录执行 `yarn add hydrooj`（或用 SYLU_HYDRO_CORE 指向 Hydro 安装目录）后重启。');
        return;
    }

    const { Handler } = hydro;

    class SyluAboutHandler extends Handler {
        async get() {
            // 不设置 response.template：Hydro 会直接返回 body，避免依赖模板解析
            this.response.type = 'text/html; charset=utf-8';
            this.response.body = renderAboutPage();
        }
    }

    ctx.Route('sylu_about', '/sylu/about', SyluAboutHandler);

    if (brand.showNavEntry) {
        // args.displayName 会直接作为导航文字（见 ui-default templates/partials/nav.html）
        ctx.injectUI('Nav', 'sylu_about', {
            prefix: 'sylu',
            displayName: '关于本站',
            before: 'ranking',
        });
    }

    ctx.logger.info('[sylu-brand] 已启用：路由 /sylu/about，导航入口=%s', brand.showNavEntry ? '开' : '关');
}

exports.apply = apply;
