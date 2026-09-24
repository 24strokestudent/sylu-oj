/**
 * SYLU Problem Importer — 预检 / 预览 / 校验 / 转换
 *
 * 对应实施计划 §22–§25、§18、§26：
 *   §22 独立工具，不修改 Hydro Core；源题库 ZIP → 解析 → 规范化 → 预览 → 校验 → 生成 Hydro 可导入格式
 *   §23 预检：路径穿越、绝对路径、重复路径、异常压缩率、单文件过大、总体积过大、
 *             非法编码、problem.json 格式、题号/标题为空、时限/内存、.in/.out 配对、
 *             重复测试点、空输出、测试点数量、文件名顺序
 *   §24 预览：题号、标题、难度、标签、时限、内存、测试点数、样例数、数据总大小、警告、错误
 *   §25 标准程序验证：编译 solution.cpp/.py → 跑全部测试点 → 与标准答案比较
 *
 * 输出的 Hydro 导入格式（依据 Hydro 源码 model/problem.ts 的 ProblemModel.import）：
 *   <pid>/problem.yaml          —— 必填；字段 pid / title / content / tag / difficulty
 *   <pid>/testdata/*.in|*.out   —— 测试数据
 *   <pid>/testdata/config.yaml  —— 可选；time: 1000ms / memory: 256m
 * 顶层目录不含 problem.yaml 的会被 Hydro 静默跳过，本工具保证一定生成。
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import child from 'node:child_process';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { readCentralDirectory, extractEntry, writeZip } from './zip.mjs';

// ---------------- 常量与限制 ----------------

export const LIMITS = {
    maxArchiveBytes: 512 * 1024 * 1024,       // 先限制压缩包本身，避免 CLI 全量读入造成峰值失控
    maxEntries: 20000,
    maxSingleFile: 256 * 1024 * 1024,      // 单文件 256 MB
    maxTotalUncompressed: 2 * 1024 * 1024 * 1024, // 解压后总量 2 GB
    maxRatioPerFile: 200,                  // 单文件压缩比上限
    maxRatioTotal: 100,                    // 总体压缩比上限
    maxTestsPerProblem: 200,               // 单题测试点上限
    maxTimeMs: 60000,
    minTimeMs: 100,
    maxMemoryMB: 4096,
    minMemoryMB: 16,
};

export const LEVEL = { ERROR: 'error', WARN: 'warn', INFO: 'info' };

class Diag {
    constructor() { this.items = []; }
    error(msg, ctx) { this.items.push({ level: LEVEL.ERROR, msg, ctx }); }
    warn(msg, ctx) { this.items.push({ level: LEVEL.WARN, msg, ctx }); }
    info(msg, ctx) { this.items.push({ level: LEVEL.INFO, msg, ctx }); }
    get errors() { return this.items.filter((i) => i.level === LEVEL.ERROR); }
    get warnings() { return this.items.filter((i) => i.level === LEVEL.WARN); }
    merge(other) { this.items.push(...other.items); }
    hasErrors() { return this.errors.length > 0; }
}

// ---------------- 工具函数 ----------------

const normName = (s) => s.normalize('NFC');
const sortKey = (s) => normName(s).toLowerCase();

const ALLOWED_PID = /^(?:[a-z0-9]{1,10}-)?[a-z][0-9a-z]*$/i;

/**
 * 把源目录名/文件名规范成 Hydro 合法题号。
 * Hydro 规则：可选命名空间前缀 `[a-z0-9]{1,10}-`，主体必须以字母开头、只含字母数字。
 * 所以 `A+B`、`1000-两数之和`、`1` 都不能直接用，必须规范化并提醒人工确认。
 */
export function derivePid(sourceKey, { prefix = '' } = {}) {
    let s = String(sourceKey || '').replace(/[^0-9A-Za-z-]/g, '');
    s = s.replace(/-+/g, '-').replace(/^-+|-+$/g, '');
    if (prefix) s = `${prefix.replace(/[^0-9A-Za-z]/g, '')}${s}`;
    if (!/^[A-Za-z]/.test(s)) s = `p${s}`;
    if (!s) s = 'problem';
    s = s.slice(0, 40).replace(/-+$/, '');
    return ALLOWED_PID.test(s) ? s : `p${crypto.createHash('sha256').update(String(sourceKey)).digest('hex').slice(0, 12)}`;
}

/** 保证题号唯一（Hydro 的 pid 不允许重复） */
function uniquePid(pid, used) {
    if (!used.has(pid)) return pid;
    for (let i = 0; i < 26; i++) {
        const cand = `${pid}${String.fromCharCode(98 + i)}`; // b, c, d ...
        if (!used.has(cand) && ALLOWED_PID.test(cand)) return cand;
    }
    let n = 2;
    while (used.has(`${pid}z${n}`) || !ALLOWED_PID.test(`${pid}z${n}`)) n++;
    return `${pid}z${n}`;
}

const HUMAN = (n) => {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
    return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
};

export function parseTimeToMs(v) {
    if (v === undefined || v === null || v === '') return null;
    // 数值和无单位字符串都按秒处理；单位必须由输入形式决定，不能按数值大小猜测。
    if (typeof v === 'number') {
        if (!Number.isFinite(v) || v <= 0) return null;
        return Math.round(v * 1000);
    }
    const s = String(v).trim().toLowerCase();
    const m = s.match(/^(\d+(?:\.\d+)?)\s*(ms|s|sec|second|秒)?$/);
    if (!m) return null;
    const n = Number.parseFloat(m[1]);
    if (!Number.isFinite(n) || n <= 0) return null;
    const unit = m[2] || 's';
    if (unit === 'ms') return Math.round(n);
    return Math.round(n * 1000);
}

export function parseMemoryToMB(v) {
    if (v === undefined || v === null || v === '') return null;
    // 数值和无单位字符串统一按 MB 处理；KB 必须显式写 k/kb，避免 1024 被猜成 1MB。
    if (typeof v === 'number') {
        if (!Number.isFinite(v) || v <= 0) return null;
        return Math.round(v);
    }
    const s = String(v).trim().toLowerCase();
    const m = s.match(/^(\d+(?:\.\d+)?)\s*(m|mb|mib|k|kb|g|gb)?$/);
    if (!m) return null;
    const n = Number.parseFloat(m[1]);
    if (!Number.isFinite(n) || n <= 0) return null;
    const unit = m[2] || 'm';
    if (unit.startsWith('g')) return Math.round(n * 1024);
    if (unit.startsWith('k')) return Math.round(n / 1024);
    return Math.round(n);
}

const isTextishBlank = (buf) => buf.length === 0 || buf.toString('utf8').trim() === '';

/** 使用完整 YAML 解析，保留多行题面与引号语义；题目元数据不需要别名。 */
export function parseSimpleYaml(text) {
    const value = parseYaml(text, { maxAliasCount: 0, uniqueKeys: true, stringKeys: true });
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('元数据必须是对象');
    }
    return value;
}

const decodeText = (buf) => new TextDecoder('utf-8', { fatal: true }).decode(buf);

// ---------------- 测试点配对（对齐 Hydro 的匹配规则） ----------------

/**
 * Hydro 的 readSubtasksFromFiles 会把 `X.in` 与 `X.out` / `X.ans` 配对
 * （输入扩展名还接受 `in` / `txt` / `in.txt`，输出接受 `out` / `ans` 及大小写变体）。
 * 本工具按同样语义配对，保证"我们校验过的，就是 Hydro 会用的"。
 */
const isInputFile = (name) => {
    const lower = path.posix.basename(name).toLowerCase();
    return lower.endsWith('.in') || lower.endsWith('.txt');
};
const isOutputFile = (name) => {
    const lower = path.posix.basename(name).toLowerCase();
    return lower.endsWith('.out') || lower.endsWith('.ans')
        || lower.endsWith('.out.txt') || lower.endsWith('.ans.txt');
};
const stemOf = (name) => {
    const base = path.posix.basename(name);
    const lower = base.toLowerCase();
    if (lower.endsWith('.in.txt')) return base.slice(0, -7);
    if (lower.endsWith('.out.txt')) return base.slice(0, -8);
    if (lower.endsWith('.ans.txt')) return base.slice(0, -8);
    return base.slice(0, base.lastIndexOf('.'));
};

/** 配对键必须包含题目内相对目录，避免 A/1.in 与 B/1.out 交叉配对。 */
const pairKeyOf = (name) => {
    const normalized = normName(name).replaceAll('\\', '/');
    return sortKey(path.posix.join(path.posix.dirname(normalized), stemOf(normalized)));
};

function pairTests(fileEntries) {
    const byStem = new Map();
    for (const e of fileEntries) {
        if (!isOutputFile(e.name)) continue;
        const key = pairKeyOf(e.name);
        if (!byStem.has(key)) byStem.set(key, []);
        byStem.get(key).push(e);
    }

    const pairs = [];
    const missingOut = [];
    const usedOutputs = new Set();

    for (const e of fileEntries) {
        if (!isInputFile(e.name) || isOutputFile(e.name)) continue;
        // 纯 .txt 只有数字化的主文件名才当作测试输入，避免把 readme.txt 这类误判
        const lower = path.posix.basename(e.name).toLowerCase();
        if (lower.endsWith('.txt') && !lower.endsWith('.in.txt') && !/\d/.test(stemOf(e.name))) continue;

        const key = pairKeyOf(e.name);
        const hit = (byStem.get(key) || []).find((o) => !usedOutputs.has(o.name));
        if (hit) {
            usedOutputs.add(hit.name);
            pairs.push({ input: e, output: hit });
        } else {
            missingOut.push(e.name);
        }
    }

    const orphanOut = fileEntries
        .filter((e) => isOutputFile(e.name) && !usedOutputs.has(e.name))
        .map((e) => e.name);

    return { pairs, missingOut, orphanOut };
}

const caseNumber = (name) => {
    const base = path.posix.basename(name);
    const m = base.match(/^(\D*?)(\d+)(?:[-_](\d+))?\./);
    if (!m) return Number.MAX_SAFE_INTEGER;
    return Number(m[3] || m[2]);
};

// ---------------- 源题库结构识别 ----------------

const META_FILES = ['problem.yaml', 'problem.yml', 'problem.json', 'config.yaml', 'config.yml'];

/**
 * 把一个 ZIP（或目录）解析成"待导入题目"列表。
 * 支持：单题平铺、每题一目录、testdata/ 子目录、CodeOJ 导出结构、Hydro 结构直通。
 */
export function analyzeArchive(buf, { archiveName = 'archive.zip', pidPrefix = '' } = {}) {
    const diag = new Diag();
    if (!Buffer.isBuffer(buf)) throw new TypeError('输入必须是 Buffer');
    if (buf.length > LIMITS.maxArchiveBytes) {
        diag.error(`压缩包大小 ${HUMAN(buf.length)} 超过上限 ${HUMAN(LIMITS.maxArchiveBytes)}`);
        return { problems: [], diag, stats: { entries: 0, totalComp: buf.length, totalUncomp: 0 } };
    }
    const { entries, comment } = readCentralDirectory(buf);
    if (comment) diag.info(`ZIP 注释：${comment.slice(0, 80)}`);

    // ---- §23 安全预检（解压之前，基于中央目录元数据）----
    if (entries.length === 0) diag.error('ZIP 内没有任何条目');
    if (entries.length > LIMITS.maxEntries) {
        diag.error(`条目数 ${entries.length} 超过上限 ${LIMITS.maxEntries}`);
    }

    let totalComp = 0;
    let totalUncomp = 0;
    const seenNames = new Map();

    for (const e of entries) {
        const raw = e.name;

        if (raw.includes('\\')) {
            diag.error('存在反斜杠路径分隔符（Windows 打包），Hydro 无法识别', raw);
        }
        if (raw.startsWith('/') || /^[a-zA-Z]:/.test(raw)) {
            diag.error('绝对路径条目（路径穿越风险）', raw);
        }
        const segments = raw.split('/');
        if (segments.includes('..')) diag.error('包含 `..` 的路径穿越条目', raw);
        if (raw.includes('\0') || /[\x00-\x1f]/.test(raw)) diag.error('文件名含控制字符或 NUL', JSON.stringify(raw));
        if (e.isSymlink) diag.error('符号链接条目（不得解压）', raw);
        if (e.encrypted) diag.error('条目已加密，无法处理', raw);
        if (!e.isDirectory && ![0, 8].includes(e.method)) {
            diag.error(`不支持的压缩算法 ${e.method}`, raw);
        }

        const key = sortKey(raw);
        if (seenNames.has(key)) {
            const prev = seenNames.get(key);
            if (prev === raw) diag.error('完全重复的路径条目', raw);
            else diag.error('大小写/归一化后重复的路径条目', `${prev} 与 ${raw}`);
        } else {
            seenNames.set(key, raw);
        }

        if (e.uncompSize > LIMITS.maxSingleFile) {
            diag.error(`单文件过大：${HUMAN(e.uncompSize)}（上限 ${HUMAN(LIMITS.maxSingleFile)}）`, raw);
        }
        if (e.compSize > 0) {
            const ratio = e.uncompSize / e.compSize;
            if (ratio > LIMITS.maxRatioPerFile && e.uncompSize > 1024 * 1024) {
                diag.error(`单文件压缩比异常 ${ratio.toFixed(0)}:1（疑似压缩炸弹）`, raw);
            }
        }
        totalComp += e.compSize;
        totalUncomp += e.uncompSize;
    }

    if (totalComp > 0 && totalUncomp / totalComp > LIMITS.maxRatioTotal && totalUncomp > 10 * 1024 * 1024) {
        diag.error(`总体压缩比异常 ${(totalUncomp / totalComp).toFixed(0)}:1（疑似压缩炸弹）`);
    }
    if (totalUncomp > LIMITS.maxTotalUncompressed) {
        diag.error(`解压后总体积 ${HUMAN(totalUncomp)} 超过上限 ${HUMAN(LIMITS.maxTotalUncompressed)}`);
    }
    diag.info(`条带统计：${entries.length} 个条目，压缩后 ${HUMAN(totalComp)}，解压后 ${HUMAN(totalUncomp)}`);

    // 元数据预检不通过时不能继续分配解压内存。
    if (diag.hasErrors()) return { problems: [], diag, stats: { entries: entries.length, totalComp, totalUncomp } };

    // ---- 读出内容，识别结构 ----
    const files = [];
    for (const e of entries) {
        if (e.isDirectory) continue;
        let content = null;
        try {
            content = extractEntry(buf, e, { maxBytes: LIMITS.maxSingleFile });
        } catch (err) {
            diag.error(`解压失败：${err.message}`, e.name);
            continue;
        }
        files.push({ name: normName(e.name), buf: content });
    }

    const problems = groupIntoProblems(files, archiveName, diag, { pidPrefix });
    return { problems, diag, stats: { entries: entries.length, totalComp, totalUncomp } };
}

function groupIntoProblems(files, archiveName, diag, opts = {}) {
    // 先判断是否需要剥掉一层公共外壳目录（有些打包工具会多套一层）。
    // 关键：如果这个顶层目录"自己就是一道题"（直接含 testdata/ 或 problem.yaml/1.in 等），
    // 就绝不能剥，否则会把题号剥成压缩包名。
    const topLevels = new Set(files.map((f) => f.name.split('/')[0]));
    const looksLikeProblemDir = files
        .filter((f) => f.name.split('/').length === 2)
        .map((f) => f.name.split('/')[1])
        .some((c) => ['testdata', 'additional_file', 'data'].includes(c)
            || /\.(ya?ml|json|in|out|ans)$/i.test(c));
    const stripCommon = files.every((f) => f.name.includes('/'))
        && topLevels.size === 1
        && !looksLikeProblemDir;

    const normalized = files.map((f) => {
        const rel = stripCommon ? f.name.split('/').slice(1).join('/') : f.name;
        return { ...f, rel };
    });

    // 判断结构：每题一目录（含 problem.yaml 之类的元数据文件在顶层） vs 扁平单题
    const hasMetaAtRoot = normalized.some((f) => META_FILES.includes(path.posix.basename(f.rel)) && !f.rel.includes('/'));
    const dirGroups = new Map();
    for (const f of normalized) {
        const dir = f.rel.includes('/') ? f.rel.split('/')[0] : '';
        if (!dirGroups.has(dir)) dirGroups.set(dir, []);
        dirGroups.get(dir).push(f);
    }

    const groups = [];
    if (hasMetaAtRoot) {
        // 单题：全部文件属于一道题；测试数据可能在 testdata/ 下
        groups.push({ key: baseName(archiveName), files: normalized });
    } else if (dirGroups.size === 1 && dirGroups.has('')) {
        groups.push({ key: baseName(archiveName), files: normalized });
    } else {
        for (const [dir, list] of dirGroups) {
            if (dir === '') {
                // 根目录散落文件，若都是测试数据则归入单题
                const onlyTests = list.every((f) => /\.(in|out|ans|txt)$/i.test(f.rel));
                if (onlyTests) groups.push({ key: baseName(archiveName), files: list });
                else if (list.some((f) => META_FILES.includes(path.posix.basename(f.rel)))) {
                    groups.push({ key: baseName(archiveName), files: list });
                }
                continue;
            }
            groups.push({ key: dir, files: list });
        }
    }

    if (groups.length === 0) diag.error('未能从压缩包中识别出任何题目');

    return groups.map((g) => buildProblem(g.key, g.files, diag, opts));
}

const baseName = (p) => path.posix.basename(p).replace(/\.zip$/i, '');

// 当前转换器只保证普通标准输入输出题的语义。发现高级判题字段时必须拒绝，
// 不能把 SPJ、交互、子任务或附件静默降级成普通题。
const UNSUPPORTED_FIELDS = new Set([
    'checker', 'checker_type', 'judge', 'judge_type', 'interactor', 'interactor_type',
    'subtasks', 'subtask', 'score', 'scoring', 'depends', 'dependencies',
    'additional_file', 'additional_files', 'attachments', 'attachment', 'files',
    'type', 'filename', 'cases', 'user_extra_files', 'judge_extra_files',
    'manager', 'validator', 'time_limit_rate', 'memory_limit_rate',
    'data', 'testdata', 'test_data', 'special_judge', 'spj', 'interactive',
    'interaction', 'output_only', 'input_file', 'output_file', 'extra_files',
    'detail', 'langs', 'redirect',
]);

function rejectUnsupportedFields(problem, source) {
    if (!source || typeof source !== 'object') return;
    for (const key of Object.keys(source)) {
        if (UNSUPPORTED_FIELDS.has(key.toLowerCase())) {
            problem.problems.error(`暂不支持字段 ${key}，为避免改变题目语义已拒绝转换`);
        }
    }
}

function buildProblem(key, files, diag, opts = {}) {
    const problem = {
        sourceKey: key,
        pid: null,
        title: null,
        difficulty: null,
        tags: [],
        timeMs: null,
        memoryMB: null,
        samples: [],
        content: null,
        tests: [],
        solutions: [],
        sourceFiles: files.map((f) => f.rel),
        problems: new Diag(),
        warnings: new Diag(),
    };

    const meta = {};          // 从 problem.* 读到的元数据
    let metaDoc = null;
    const recognizedFiles = new Set();

    for (const f of files) {
        const base = path.posix.basename(f.rel).toLowerCase();
        const isTestDir = /(^|\/)testdata\//.test(f.rel);
        const lowerRel = f.rel.toLowerCase();

        // 这些目录中的文件不能降级成普通测试数据；即使没有元数据字段，
        // 也必须明确拒绝，避免把用户/判题机附件静默丢掉。
        if (/(^|\/)(additional_files?|user_extra_files|judge_extra_files|attachments?)(\/|$)/i.test(f.rel)) {
            problem.problems.error(`暂不支持附加文件：${f.rel}`);
            recognizedFiles.add(f);
            continue;
        }

        if (['problem.json', 'problem.yaml', 'problem.yml', 'config.yaml', 'config.yml'].includes(base)) {
            recognizedFiles.add(f);
            try {
                const text = decodeText(f.buf);
                const value = base.endsWith('.json') ? JSON.parse(text) : parseSimpleYaml(text);
                if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('元数据必须是对象');
                if (base.startsWith('problem.')) metaDoc = { ...(metaDoc || {}), ...value };
                else Object.assign(meta, value);
            } catch (e) {
                problem.problems.error(`${base} 不是合法 JSON/YAML 或 UTF-8 元数据：${e.message}`, f.rel);
            }
        } else if ((isOutputFile(base) || (isInputFile(base)
            && (!base.endsWith('.txt') || base.endsWith('.in.txt') || /\d/.test(stemOf(base)))))
            && !lowerRel.includes('/source') && !lowerRel.includes('/solution')) {
            recognizedFiles.add(f);
            problem.tests.push(f);
        } else if (/^solution\.(cpp|cc|cxx|c|py|java|pas)$/i.test(base)) {
            recognizedFiles.add(f);
            problem.solutions.push(f);
        } else if (lowerRel.includes('/source/') || lowerRel.includes('/solution/')) {
            // 源程序目录不是本转换器的输出内容，但不能被误报成附件。
            recognizedFiles.add(f);
        }
    }

    for (const f of files) {
        if (!recognizedFiles.has(f)) {
            problem.problems.error(`暂不支持的附加文件：${f.rel}`);
        }
    }

    // 目录形态：<pid>/testdata/1.in
    const nestedTestdata = files.filter((f) => /\/testdata\//i.test(f.rel));
    if (nestedTestdata.length) {
        problem.tests = files.filter((f) => {
            const lower = f.rel.toLowerCase();
            if (!/\.(in|out|ans|txt)$/i.test(lower)) return false;
            return /\/testdata\//.test(lower) || /\/data\//.test(lower) || /\/data$/.test(path.posix.dirname(lower));
        });
        // 目录形态下问题标识取目录名
        const first = nestedTestdata[0].rel;
        const segs = first.split('/');
        if (segs.length >= 2) problem.pid = segs[0];
    }

    if (metaDoc) {
        rejectUnsupportedFields(problem, metaDoc);
        problem.pid = metaDoc.pid || metaDoc.problem_id || metaDoc.id || problem.pid || null;
        problem.title = metaDoc.title || metaDoc.name || null;
        problem.content = metaDoc.content || null;
        problem.difficulty = normalizeDifficulty(metaDoc.difficulty);
        problem.tags = normalizeTags(metaDoc.tag || metaDoc.tags);
        problem.samples = normalizeSamples(metaDoc.samples || metaDoc.sample || metaDoc.examples);
        if (!problem.content) problem.content = composeContent(metaDoc);
        if (!problem.timeMs) problem.timeMs = parseTimeToMs(metaDoc.time ?? metaDoc.time_limit ?? metaDoc.timeLimit);
        if (!problem.memoryMB) problem.memoryMB = parseMemoryToMB(metaDoc.memory ?? metaDoc.memory_limit ?? metaDoc.memoryLimit);
        if (metaDoc.limits) {
            problem.timeMs = problem.timeMs || parseTimeToMs(metaDoc.limits.time_limit);
            problem.memoryMB = problem.memoryMB || parseMemoryToMB(metaDoc.limits.memory_limit);
        }
    }

    rejectUnsupportedFields(problem, meta);

    if (!problem.timeMs) problem.timeMs = parseTimeToMs(meta.time ?? meta.time_limit);
    if (!problem.memoryMB) problem.memoryMB = parseMemoryToMB(meta.memory ?? meta.memory_limit);
    if (metaDoc && !problem.title) {
        problem.warnings.warn('源数据未提供标题（title/name），已用题号兜底，请人工确认');
    }
    if (!problem.title) problem.title = problem.pid || problem.sourceKey;
    if (!problem.content) problem.content = `# ${problem.title}\n\n（源文件未提供题面，请在 Hydro 中补充完整题面后再发布）`;

    // 题面中的本地文件引用不能指向转换器会丢弃的附件；至少先对明确的
    // file:// 引用做存在性和可消费性检查，避免发布后出现失效题面链接。
    for (const match of String(problem.content).matchAll(/file:\/\/([^\s)\]}>"']+)/gi)) {
        let ref;
        try { ref = decodeURIComponent(match[1]).replace(/^\/+/, ''); } catch (_) { ref = match[1]; }
        const target = files.find((f) => f.rel === ref || path.posix.basename(f.rel) === path.posix.basename(ref));
        if (!target || !recognizedFiles.has(target)) {
            problem.problems.error(`题面引用了未被转换的本地文件：${match[1]}`);
        }
    }

    // 显式填写的非法限制不能悄悄退回默认值。
    for (const source of [metaDoc, metaDoc?.limits, meta]) {
        if (!source) continue;
        for (const [keys, parse, label] of [
            [['time', 'time_limit', 'timeLimit'], parseTimeToMs, '时间限制'],
            [['memory', 'memory_limit', 'memoryLimit'], parseMemoryToMB, '内存限制'],
        ]) {
            for (const key of keys) {
                if (source[key] !== undefined && parse(source[key]) === null) problem.problems.error(`${label}无效：${source[key]}`);
            }
        }
    }

    // ---- 校验 ----
    if (!problem.pid) {
        problem.pid = problem.sourceKey;
        problem.warnings.warn('源数据未提供题号，已使用目录名/压缩包名推导，请人工确认');
    }
    const normalizedPid = derivePid(problem.pid, { prefix: opts.pidPrefix });
    if (normalizedPid !== problem.pid) {
        problem.warnings.warn(`题号 "${problem.pid}" 不符合 Hydro 规则（需字母开头、仅字母数字），已规范化为 "${normalizedPid}"，请人工确认`);
    }
    problem.pid = normalizedPid;
    if (!problem.title || !String(problem.title).trim()) {
        problem.problems.error('标题为空');
    }
    if (!problem.timeMs) problem.timeMs = 1000;
    else if (problem.timeMs < LIMITS.minTimeMs || problem.timeMs > LIMITS.maxTimeMs) {
        problem.problems.error(`时间限制 ${problem.timeMs}ms 超出合理区间 ${LIMITS.minTimeMs}–${LIMITS.maxTimeMs}ms`);
    }
    if (!problem.memoryMB) problem.memoryMB = 256;
    else if (problem.memoryMB < LIMITS.minMemoryMB || problem.memoryMB > LIMITS.maxMemoryMB) {
        problem.problems.error(`内存限制 ${problem.memoryMB}MB 超出合理区间 ${LIMITS.minMemoryMB}–${LIMITS.maxMemoryMB}MB`);
    }

    // ---- 测试点配对 ----
    const { pairs, missingOut, orphanOut } = pairTests(problem.tests);
    pairs.sort((a, b) => caseNumber(a.input.name) - caseNumber(b.input.name) || a.input.name.localeCompare(b.input.name));
    problem.pairs = pairs;
    problem.missingOut = missingOut;
    problem.orphanOut = orphanOut;

    for (const name of missingOut) problem.problems.error('输入文件缺少配对的 .out/.ans', name);
    for (const name of orphanOut) problem.warnings.warn('输出文件没有对应输入（将被忽略）', name);

    // 扫描阶段识别为测试文件不等于最终会写入输出；题面引用孤立的
    // .out/.txt 等文件时必须报错，避免配对阶段静默丢失附件。
    const consumedFiles = new Set([
        ...pairs.flatMap((pair) => [pair.input, pair.output]),
        ...problem.solutions,
        ...files.filter((f) => META_FILES.includes(path.posix.basename(f.rel).toLowerCase())),
    ]);
    for (const match of String(problem.content).matchAll(/file:\/\/([^\s)\]}>"']+)/gi)) {
        let ref;
        try { ref = decodeURIComponent(match[1]).replace(/^\/+/, ''); } catch (_) { ref = match[1]; }
        const target = files.find((f) => f.rel === ref || path.posix.basename(f.rel) === path.posix.basename(ref));
        if (target && recognizedFiles.has(target) && !consumedFiles.has(target)) {
            problem.problems.error(`题面引用了未被转换的本地文件：${match[1]}`);
        }
    }

    if (pairs.length === 0) problem.problems.error('没有任何可用的输入/输出测试点对');
    if (pairs.length > LIMITS.maxTestsPerProblem) {
        problem.problems.error(`测试点数量 ${pairs.length} 超过上限 ${LIMITS.maxTestsPerProblem}`);
    }

    // 重复测试点（内容哈希）
    const seenHash = new Map();
    for (const p of pairs) {
        const h = crypto.createHash('sha1').update(p.input.buf).digest('hex');
        if (seenHash.has(h)) {
            problem.warnings.warn('重复测试点（输入内容与前面的完全相同）', `${p.input.name} 与 ${seenHash.get(h)}`);
        } else seenHash.set(h, p.input.name);
    }
    // 空输出
    for (const p of pairs) {
        if (isTextishBlank(p.output.buf)) {
            problem.warnings.warn('标准答案为空或全空白', p.output.name);
        }
    }
    // 空输入
    for (const p of pairs) {
        if (p.input.buf.length === 0) problem.warnings.warn('输入文件为 0 字节', p.input.name);
    }
    // 编号顺序与连续性
    const nums = pairs.map((p) => caseNumber(p.input.name)).filter((n) => n !== Number.MAX_SAFE_INTEGER);
    if (nums.length) {
        const sorted = [...nums].sort((a, b) => a - b);
        const expected = Array.from({ length: sorted.length }, (_, i) => i + 1);
        if (JSON.stringify(sorted) !== JSON.stringify(expected)) {
            problem.warnings.warn(`测试点编号不连续（实际 ${sorted.join(',')}），不影响判题但建议规范为 1..N（§18）`);
        }
    }
    // 编码检查
    for (const p of pairs) {
        for (const f of [p.input, p.output]) {
            if (f.buf.includes(0) && !/\.(out|ans)$/i.test(f.name)) {
                problem.warnings.warn('文件疑似二进制内容', f.name);
            }
        }
    }

    problem.totalBytes = pairs.reduce((a, p) => a + p.input.buf.length + p.output.buf.length, 0);
    problem.tagList = problem.tags;
    return problem;
}

function normalizeDifficulty(d) {
    if (d === undefined || d === null || d === '') return null;
    const n = Number(d);
    if (!Number.isFinite(n)) {
        const map = { 入门: 1, 简单: 2, 普及: 3, 中等: 4, 提高: 5, 困难: 7, 挑战: 9 };
        const hit = Object.keys(map).find((k) => String(d).includes(k));
        return hit ? map[hit] : null;
    }
    if (n < 1 || n > 10) return null;
    return Math.round(n);
}

function normalizeTags(t) {
    if (!t) return [];
    if (Array.isArray(t)) return t.map((s) => String(s).trim()).filter(Boolean);
    return String(t).split(/[,，;；\s]+/).map((s) => s.trim()).filter(Boolean);
}

function normalizeSamples(s) {
    if (!s) return [];
    const arr = Array.isArray(s) ? s : [s];
    return arr.filter((x) => x !== null && x !== undefined).map((x) => {
        if (typeof x === 'string') return { input: x, output: '' };
        return {
            input: x.input ?? x.in ?? '',
            output: x.output ?? x.out ?? '',
            note: x.note ?? '',
        };
    }).filter((x) => x.input || x.output);
}

/** 把 CodeOJ 风格的分散字段（§26）拼成一份 Markdown 题面 */
function composeContent(m) {
    const parts = [];
    const desc = m.description ?? m.content ?? m.statement ?? '';
    if (desc) parts.push(String(desc).trim());
    if (m.input_format) parts.push(`## 输入格式\n\n${String(m.input_format).trim()}`);
    if (m.output_format) parts.push(`## 输出格式\n\n${String(m.output_format).trim()}`);
    if (m.hint) parts.push(`## 提示\n\n${String(m.hint).trim()}`);
    const samples = normalizeSamples(m.samples || m.sample || m.examples);
    if (samples.length) {
        const body = samples.map((s, i) => [
            `### 样例 ${i + 1}`,
            '',
            '输入：',
            '',
            '```text',
            String(s.input).trim(),
            '```',
            '',
            '输出：',
            '',
            '```text',
            String(s.output).trim(),
            '```',
        ].join('\n')).join('\n\n');
        parts.push(`## 样例\n\n${body}`);
    }
    return parts.length ? parts.join('\n\n') : null;
}

// ---------------- 生成 Hydro 可导入 ZIP ----------------

export function resolveOutputPids(problems) {
    const usedPids = new Set();
    return problems.map((p) => {
        const pid = uniquePid(p.pid, usedPids);
        usedPids.add(pid);
        return { sourceKey: p.sourceKey, inputPid: p.pid, pid };
    });
}

export function buildHydroPackage(problems, { includeSolutions = false } = {}) {
    const files = [];
    const pidPlan = resolveOutputPids(problems);

    for (const [problemIndex, p] of problems.entries()) {
        const pid = pidPlan[problemIndex].pid;
        const metadata = { pid, title: String(p.title), content: String(p.content || ''), tag: p.tags };
        if (p.difficulty) metadata.difficulty = p.difficulty;
        files.push([`${pid}/problem.yaml`, stringifyYaml(metadata)]);
        files.push([`${pid}/testdata/config.yaml`, stringifyYaml({ time: `${p.timeMs}ms`, memory: `${p.memoryMB}m` })]);

        p.pairs.forEach((pair, i) => {
            const idx = i + 1;
            files.push([`${pid}/testdata/${idx}.in`, pair.input.buf]);
            files.push([`${pid}/testdata/${idx}.out`, pair.output.buf]);
        });

        if (includeSolutions && p.solutions.length) {
            for (const s of p.solutions) {
                const ext = path.posix.extname(s.name);
                files.push([`${pid}/testdata/additional/solution${ext}`, s.buf]);
            }
        }
    }
    const archive = writeZip(files);
    // Buffer 允许附加非枚举属性，保持既有调用方的 Buffer API，同时给 CLI 暴露最终映射。
    archive.pidPlan = pidPlan;
    return archive;
}

// ---------------- 预览（§24） ----------------

export function renderPreview(problems, { color = false } = {}) {
    const c = color
        ? { red: (s) => `\x1b[31m${s}\x1b[0m`, green: (s) => `\x1b[32m${s}\x1b[0m`, yellow: (s) => `\x1b[33m${s}\x1b[0m`, dim: (s) => `\x1b[2m${s}\x1b[0m`, bold: (s) => `\x1b[1m${s}\x1b[0m` }
        : { red: (s) => s, green: (s) => s, yellow: (s) => s, dim: (s) => s, bold: (s) => s };

    const lines = [];
    lines.push(c.bold(`共识别出 ${problems.length} 道题目`));
    lines.push('');

    const header = ['题号', '标题', '难度', '时限', '内存', '测试点', '大小', '状态'];
    const rows = problems.map((p) => {
        const errs = p.problems.errors.length;
        const warns = p.warnings.warnings.length;
        const status = errs > 0 ? c.red(`错误 ${errs}`) : (warns > 0 ? c.yellow(`警告 ${warns}`) : c.green('OK'));
        return [
            p.pid || '-',
            truncate(p.title || '-', 28),
            p.difficulty ? String(p.difficulty) : '-',
            `${p.timeMs}ms`,
            `${p.memoryMB}MB`,
            String(p.pairs ? p.pairs.length : 0),
            HUMAN(p.totalBytes || 0),
            status,
        ];
    });

    const widths = header.map((h, i) => Math.max(strWidth(h), ...rows.map((r) => strWidth(r[i]))));

    const pad = (s, w) => s + ' '.repeat(Math.max(0, w - strWidth(s)));
    lines.push(header.map((h, i) => pad(h, widths[i])).join('  '));
    lines.push(widths.map((w) => '-'.repeat(w)).join('  '));
    for (const r of rows) lines.push(r.map((v, i) => pad(v, widths[i])).join('  '));

    for (const p of problems) {
        if (!p.problems.errors.length && !p.warnings.warnings.length) continue;
        lines.push('');
        lines.push(c.bold(`【${p.pid}】${p.title}`));
        for (const it of [...p.problems.items, ...p.warnings.items]) {
            const tag = it.level === LEVEL.ERROR ? c.red('[错误]') : c.yellow('[警告]');
            lines.push(`  ${tag} ${it.msg}${it.ctx ? c.dim(`  ← ${it.ctx}`) : ''}`);
        }
        if (p.samples && p.samples.length) lines.push(`  ${c.dim(`样例 ${p.samples.length} 组`)}`);
    }
    return lines.join('\n');
}

function strWidth(s) {
    let w = 0;
    for (const ch of String(s)) w += /[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/.test(ch) ? 2 : 1;
    return w;
}

const truncate = (s, n) => (strWidth(s) <= n ? s : `${Array.from(s).slice(0, n - 1).join('')}…`);

// ---------------- 标准程序验证（§25） ----------------

export function detectToolchain() {
    // 不用 `command -v`（Windows 下 shell 语义不一致），直接试着跑一次版本命令
    const probe = (cmd, arg = '--version') => {
        try {
            child.execSync(`"${cmd}" ${arg}`, { stdio: ['ignore', 'ignore', 'ignore'], timeout: 15000 });
            return cmd;
        } catch {
            return null;
        }
    };
    return {
        gpp: probe('g++'),
        gcc: probe('gcc'),
        python: probe('python3') || probe('python'),
        javac: probe('javac', '-version'),
    };
}

/**
 * 编译并运行题目的标准程序，逐测试点比对。
 * §20/§25：标准程序必须 100% AC，否则禁止发布。
 */
export function verifySolutions(problem, { timeoutMs = 10000, trusted = false } = {}) {
    if (!trusted) throw new Error('标准程序会在本机执行；仅对可信来源传入 trusted: true');
    const tools = detectToolchain();
    const result = { pid: problem.pid, compile: null, cases: [], skipped: null, total: problem.pairs.length, passed: 0 };

    if (!problem.solutions.length) {
        result.skipped = '压缩包内没有 solution.cpp / solution.py，无法验证标准程序';
        return result;
    }
    const sol = problem.solutions.find((s) => /\.(cpp|cc|cxx|c)$/i.test(s.name)) || problem.solutions[0];
    const ext = path.posix.extname(sol.name).toLowerCase();
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sylu-verify-'));

    try {
        const srcPath = path.join(tmp, `solution${ext}`);
        fs.writeFileSync(srcPath, sol.buf);
        let runCmd;
        let runArgs;

        if (['.cpp', '.cc', '.cxx', '.c'].includes(ext)) {
            const compiler = ext === '.c' ? (tools.gcc || tools.gpp) : (tools.gpp || tools.gcc);
            if (!compiler) { result.skipped = '本机没有 g++/gcc，跳过标准程序验证'; return result; }
            const exe = path.join(tmp, process.platform === 'win32' ? 'sol.exe' : 'sol');
            try {
                child.execFileSync(compiler, ['-O2', ext === '.c' ? '-std=c17' : '-std=c++17', '-o', exe, srcPath], { stdio: 'pipe', timeout: 120000 });
                result.compile = 'PASS';
            } catch (e) {
                result.compile = 'FAIL';
                result.cases.push({ status: 'CE', detail: String(e.stderr || e.message).slice(0, 500) });
                return result;
            }
            runCmd = exe;
            runArgs = [];
        } else if (ext === '.py') {
            if (!tools.python) { result.skipped = '本机没有 python3，跳过标准程序验证'; return result; }
            result.compile = 'PASS(解释型)';
            runCmd = tools.python;
            runArgs = [srcPath];
        } else {
            result.skipped = `暂不支持验证 ${ext} 标准程序`;
            return result;
        }

        for (const pair of problem.pairs) {
            let expected = pair.output.buf.toString('utf8');
            let actual = '';
            let status = 'PASS';
            try {
                const out = child.execFileSync(runCmd, runArgs, {
                    input: pair.input.buf, cwd: tmp, timeout: timeoutMs,
                    maxBuffer: 64 * 1024 * 1024, encoding: 'buffer',
                });
                actual = out.toString('utf8');
            } catch (e) {
                status = e.killed || e.signal ? 'TLE/RE' : 'RE';
                actual = String(e.stdout || '');
                expected = null;
            }
            if (expected !== null) {
                const norm = (s) => s.replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '').replace(/\n+$/, '');
                status = norm(actual) === norm(expected) ? 'PASS' : 'WA';
            }
            if (status === 'PASS') result.passed++;
            result.cases.push({
                name: pair.input.name,
                status,
                ...(status === 'PASS' ? {} : {
                    expected: expected === null ? '(程序异常退出)' : expected.slice(0, 200),
                    actual: actual.slice(0, 200),
                }),
            });
        }
    } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
    }
    return result;
}

export function renderVerify(report, { color = false } = {}) {
    const c = color
        ? { red: (s) => `\x1b[31m${s}\x1b[0m`, green: (s) => `\x1b[32m${s}\x1b[0m`, dim: (s) => `\x1b[2m${s}\x1b[0m` }
        : { red: (s) => s, green: (s) => s, dim: (s) => s };
    const lines = [];
    lines.push(`【${report.pid}】标准程序验证`);
    if (report.skipped) { lines.push(`  ${c.dim(report.skipped)}`); return lines.join('\n'); }
    lines.push(`  标准程序编译        ${report.compile === 'PASS' ? c.green('PASS') : c.red(report.compile)}`);
    for (const cs of report.cases) {
        const mark = cs.status === 'PASS' ? c.green('PASS') : c.red(cs.status);
        lines.push(`  ${cs.name.padEnd(20)} ${mark}`);
        if (cs.status !== 'PASS' && cs.expected !== undefined) {
            lines.push(`      期望：${JSON.stringify(cs.expected)}`);
            lines.push(`      实际：${JSON.stringify(cs.actual)}`);
        }
    }
    lines.push(`  合计 ${report.passed}/${report.total} PASS`);
    if (report.passed !== report.total) {
        lines.push(`  ${c.red('标准程序未全部通过 —— 按 §20 禁止发布该题')}`);
    }
    return lines.join('\n');
}
