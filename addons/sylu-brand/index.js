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
        // 与上游 WikiAboutHandler 同样处理（ui-default/index.ts:21）：
        // 这是张对外的说明页，不该要求域内 VIEW 权限。
        noCheckPermView = true;

        async get() {
            // 计划 §25：JS 只准备数据并指定模板，页面结构在 templates/sylu/about.html，
            // 样式在 public/sylu/css/about.css。这里不再拼 HTML 字符串。
            this.response.template = 'sylu/about.html';
            this.response.body = {
                siteName: brand.siteName,
                siteSubtitle: brand.siteSubtitle,
                disclaimer: brand.disclaimer,
                notices: brand.notices || [],
                contact: brand.contact || '',
                icp: brand.icp || '',
            };
        }
    }

    ctx.Route('sylu_about', '/sylu/about', SyluAboutHandler);

    if (brand.showNavEntry) {
        // args.displayName 会直接作为导航文字（见 ui-default templates/partials/nav.html）
        ctx.injectUI('Nav', 'sylu_about', {
            prefix: 'sylu',
            before: 'ranking',
        });
        // injectUI 的节点名称用于路由，显示文案需写到节点本身，避免导航直接显示内部 route 名。
        const navNode = global.Hydro.ui?.nodes?.Nav?.find((item) => item.name === 'sylu_about');
        if (navNode) navNode.displayName = '关于本站';
    }

    ctx.logger.info('[sylu-brand] 已启用：路由 /sylu/about，导航入口=%s', brand.showNavEntry ? '开' : '关');
}

exports.apply = apply;
