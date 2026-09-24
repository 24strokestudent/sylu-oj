#!/usr/bin/env node
/**
 * SYLU Problem Importer CLI
 *
 *   sylu-import preflight <源.zip>              预检，只报问题（§23）
 *   sylu-import preview   <源.zip>              预检 + 预览表（§24）
 *   sylu-import convert   <源.zip> -o <出.zip>  生成 Hydro 可导入包（§22）
 *   sylu-import verify    <源.zip>              用压缩包内 solution.* 验证标准程序（§25）
 *
 * 选项：
 *   -o, --out <file>      convert 的输出文件
 *   --only <pids>         只处理指定题号（逗号分隔）
 *   --prefix <str>        为自动推导的题号加前缀，避免与已有题号冲突
 *   --json                以 JSON 输出预检结果（便于接 CI）
 *   --no-color            关闭颜色
 *   --trusted             允许在本机执行可信来源的标准程序（没有沙箱隔离）
 *   -h, --help
 */

import fs from 'node:fs';
import path from 'node:path';
import {
    analyzeArchive, buildHydroPackage, renderPreview, renderVerify, LIMITS,
    verifySolutions, LEVEL,
} from '../src/importer.mjs';

const argv = process.argv.slice(2);
const options = { color: process.stdout.isTTY && !process.env.NO_COLOR, json: false, only: null, prefix: '', out: null };
const positional = [];

for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-o' || a === '--out') { options.out = argv[++i]; }
    else if (a === '--only') { options.only = String(argv[++i] || '').split(',').map((s) => s.trim()).filter(Boolean); }
    else if (a === '--prefix') { options.prefix = argv[++i] || ''; }
    else if (a === '--json') { options.json = true; options.color = false; }
    else if (a === '--no-color') { options.color = false; }
    else if (a === '--trusted') { options.trusted = true; }
    else if (a === '-h' || a === '--help') { printHelp(); process.exit(0); }
    else positional.push(a);
}

function printHelp() {
    const text = fs.readFileSync(new URL(import.meta.url), 'utf8');
    const head = text.split('*/')[0].replace(/^#!.*\n/, '').replace(/^\/\*\*\n/, '');
    process.stdout.write(head.split('\n').map((l) => l.replace(/^\s?\* ?/, '')).join('\n'));
}

const [command, input] = positional;

if (!command || !input) {
    printHelp();
    process.exit(2);
}
if (!fs.existsSync(input)) {
    console.error(`找不到文件：${input}`);
    process.exit(2);
}
const inputStat = fs.statSync(input);
if (inputStat.size > LIMITS.maxArchiveBytes) {
    console.error(`压缩包过大：${inputStat.size} 字节，超过 ${LIMITS.maxArchiveBytes} 字节上限`);
    process.exit(1);
}

const c = options.color
    ? { red: (s) => `\x1b[31m${s}\x1b[0m`, green: (s) => `\x1b[32m${s}\x1b[0m`, yellow: (s) => `\x1b[33m${s}\x1b[0m`, bold: (s) => `\x1b[1m${s}\x1b[0m`, dim: (s) => `\x1b[2m${s}\x1b[0m` }
    : { red: (s) => s, green: (s) => s, yellow: (s) => s, bold: (s) => s, dim: (s) => s };

const buf = fs.readFileSync(input);
let analysis;
try {
    analysis = analyzeArchive(buf, { archiveName: path.basename(input), pidPrefix: options.prefix });
} catch (err) {
    console.error(c.red(`[致命] 无法解析压缩包：${err.message}`));
    process.exit(1);
}

const { problems, diag, stats } = analysis;

function pickProblems() {
    if (!options.only) return problems;
    const wanted = new Set(options.only.map((s) => s.toLowerCase()));
    const hit = problems.filter((p) => wanted.has(String(p.pid).toLowerCase()) || wanted.has(String(p.sourceKey).toLowerCase()));
    const missing = [...wanted].filter((w) => !hit.some((p) => String(p.pid).toLowerCase() === w || String(p.sourceKey).toLowerCase() === w));
    if (missing.length) console.error(c.yellow(`[警告] --only 指定的这些题号没有匹配到题目：${missing.join(', ')}`));
    return hit;
}

function globalErrors() {
    return diag.errors;
}

function problemErrors() {
    return problems.reduce((a, p) => a + p.problems.errors.length, 0);
}

function problemWarnings() {
    return problems.reduce((a, p) => a + p.warnings.warnings.length, 0);
}

// ---------------------------------------------------------------- preflight
function runPreflight() {
    const errs = globalErrors();
    const w = problemWarnings();
    const e = problemErrors();

    if (options.json) {
        console.log(JSON.stringify({
            file: input,
            stats,
            problems: problems.map((p) => ({
                pid: p.pid,
                title: p.title,
                timeMs: p.timeMs,
                memoryMB: p.memoryMB,
                difficulty: p.difficulty,
                tags: p.tags,
                tests: p.pairs.length,
                bytes: p.totalBytes,
                errors: p.problems.items,
                warnings: p.warnings.items,
            })),
            errors: errs,
        }, null, 2));
        return e + errs.length > 0 ? 1 : 0;
    }

    console.log(c.bold(`预检：${input}`));
    console.log(`  ${stats.entries} 个条目，压缩后/解压后体积见下`);
    if (errs.length) {
        console.log(c.red(`\n全局错误 ${errs.length} 项：`));
        for (const it of errs) console.log(`  ${c.red('[错误]')} ${it.msg}${it.ctx ? c.dim(`  ← ${it.ctx}`) : ''}`);
    }
    console.log('');
    console.log(renderPreview(problems, { color: options.color }));

    console.log('');
    const totalErr = e + errs.length;
    if (totalErr > 0) {
        console.log(c.red(`${c.bold(`结论：${totalErr} 项错误，${w} 项警告 —— 不可直接导入，请先修复错误项`)}`));
        return 1;
    }
    if (w > 0) {
        console.log(c.yellow(`${c.bold(`结论：0 项错误，${w} 项警告 —— 可以导入，但请先逐条确认警告`)}`));
        return 0;
    }
    console.log(c.green(c.bold('结论：全部检查通过，可以导入')));
    return 0;
}

// ---------------------------------------------------------------- verify
function runVerify() {
    if (globalErrors().length || problemErrors()) {
        console.error('预检存在错误，已中止标准程序验证');
        return 1;
    }
    if (!options.trusted) {
        console.error('verify 会在本机执行压缩包中的代码，没有沙箱隔离；可信来源请显式加 --trusted，否则请在 Hydro 沙箱中验证。');
        return 2;
    }
    const targets = pickProblems();
    if (!targets.length) {
        console.log(c.red('没有通过预检的题目，无法验证标准程序'));
        return 1;
    }
    let failed = 0;
    let skipped = 0;
    const reports = [];
    for (const p of targets) {
        const r = verifySolutions(p, { trusted: true });
        reports.push(r);
        if (r.skipped) skipped++;
        else if (r.passed !== r.total) failed++;
        if (!options.json) {
            console.log(renderVerify(r, { color: options.color }));
            console.log('');
        }
    }
    if (options.json) console.log(JSON.stringify(reports, null, 2));
    if (options.json) return failed || skipped ? 1 : 0;
    if (failed) {
        console.log(c.red(c.bold(`结论：${failed} 道题的标准程序未通过全部测试点 —— 按 §20 禁止发布`)));
        return 1;
    }
    if (skipped) {
        console.log(c.yellow(`结论：${skipped} 道题未完成标准程序验证`));
        return 1;
    }
    console.log(c.green(c.bold('结论：所有有标准程序的题目均 100% 通过全部测试点')));
    return 0;
}

// ---------------------------------------------------------------- convert
function runConvert() {
    if (!options.out) {
        console.error(c.red('convert 需要 -o <输出.zip>'));
        return 2;
    }
    const errs = globalErrors().length + problemErrors();
    if (errs > 0) {
        console.error(c.red(`存在 ${errs} 项错误，已中止转换。请先执行 preflight 逐条修复。`));
        return 1;
    }
    const targets = pickProblems();
    if (!targets.length) {
        console.error(c.red('没有可转换的题目'));
        return 1;
    }
    const outBuf = buildHydroPackage(targets);
    fs.writeFileSync(options.out, outBuf);

    console.log(c.bold('转换完成'));
    console.log(`  输出：${options.out}`);
    console.log(`  大小：${(outBuf.length / 1024 / 1024).toFixed(2)} MB`);
    const mapping = outBuf.pidPlan || [];
    console.log(`  题目：${targets.map((p, i) => {
        const finalPid = mapping[i]?.pid || p.pid;
        return `${p.pid} -> ${finalPid}(${p.pairs.length} 点)`;
    }).join('、')}`);
    console.log('');
    console.log(c.bold('下一步（按 §19 题目发布流程，不要跳过）：'));
    console.log('  1. 浏览器进入题库页，点「Import From Hydro」，上传上面这个 zip');
    console.log(c.yellow('  2. 导入时勾选 hidden / 保持私有 —— 禁止创建完立即公开'));
    console.log('  3. 逐题运行标准程序确认 100% AC，人工检查题面');
    console.log('  4. 用错误程序测试（WA/CE/RE/TLE 各一）');
    console.log('  5. 确认无误后再取消隐藏、加入作业或训练');
    console.log('');
    console.log(c.dim('  导入入口：/problem/import/hydro （需要建题权限）'));
    console.log(c.dim('  校验包结构：unzip -l ' + path.basename(options.out)));
    return 0;
}

let code = 0;
switch (command) {
    case 'preflight': code = runPreflight(); break;
    case 'preview': code = runPreflight(); break;
    case 'convert': code = runConvert(); break;
    case 'verify': code = runVerify(); break;
    default:
        console.error(`未知命令：${command}`);
        printHelp();
        code = 2;
}
process.exit(code);
