/**
 * 自测：用真实构造的 ZIP 验证预检规则与转换结果。
 * 运行： node test/selftest.mjs
 *
 * 覆盖实施计划 §23 的每条预检规则，以及 §22 生成的 Hydro 包结构能否被自己再解析回来。
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { writeZip, readCentralDirectory, extractEntry } from '../src/zip.mjs';
import {
    analyzeArchive, buildHydroPackage, derivePid, parseTimeToMs, parseMemoryToMB,
} from '../src/importer.mjs';

let pass = 0;
let fail = 0;
const failures = [];

function test(name, fn) {
    try {
        fn();
        pass++;
        console.log(`  \x1b[32mPASS\x1b[0m ${name}`);
    } catch (e) {
        fail++;
        failures.push({ name, error: e });
        console.log(`  \x1b[31mFAIL\x1b[0m ${name}`);
        console.log(`       ${e.message.split('\n')[0]}`);
    }
}

const analyze = (files, opts) => analyzeArchive(writeZip(files), { archiveName: 'test.zip', ...opts });
const allMsgs = (r) => [
    ...r.diag.items.map((i) => i.msg),
    ...r.problems.flatMap((p) => [...p.problems.items, ...p.warnings.items].map((i) => i.msg)),
];
const allCtx = (r) => [
    ...r.diag.items.map((i) => String(i.ctx || '')),
    ...r.problems.flatMap((p) => [...p.problems.items, ...p.warnings.items].map((i) => String(i.ctx || ''))),
];
const hasError = (r, re) => r.problems.some((p) => p.problems.items.some((i) => re.test(i.msg)))
    || r.diag.errors.some((i) => re.test(i.msg));
const hasWarn = (r, re) => r.problems.some((p) => p.warnings.items.some((i) => re.test(i.msg)));

const OK_PROBLEM = [
    ['aplusb/problem.json', JSON.stringify({
        pid: 'p1000',
        title: 'A+B Problem',
        description: '读入两个整数，输出它们的和。',
        input_format: '一行两个整数 a, b',
        output_format: '一个整数，表示 a+b',
        time_limit: 1,
        memory_limit: 256,
        tags: ['输入输出', '入门'],
        difficulty: 1,
        samples: [{ input: '1 2\n', output: '3\n' }],
    })],
    ['aplusb/1.in', '1 2\n'],
    ['aplusb/1.out', '3\n'],
    ['aplusb/2.in', '100 200\n'],
    ['aplusb/2.out', '300\n'],
];

console.log('\n=== 1. 正常包 ===');

test('合法题库包：0 错误', () => {
    const r = analyze(OK_PROBLEM);
    const errs = allMsgs(r).length ? r.problems.flatMap((p) => p.problems.items) : [];
    assert.equal(errs.length, 0, `不应有错误，实际：${JSON.stringify(errs)}`);
    assert.equal(r.problems.length, 1);
});

test('题号/标题/时限/内存/标签/难度解析正确', () => {
    const p = analyze(OK_PROBLEM).problems[0];
    assert.equal(p.pid, 'p1000');
    assert.equal(p.title, 'A+B Problem');
    assert.equal(p.timeMs, 1000);
    assert.equal(p.memoryMB, 256);
    assert.equal(p.difficulty, 1);
    assert.deepEqual(p.tags, ['输入输出', '入门']);
});

test('测试点配对正确且按编号排序', () => {
    const p = analyze(OK_PROBLEM).problems[0];
    assert.equal(p.pairs.length, 2);
    assert.deepEqual(p.pairs.map((x) => x.input.name), ['aplusb/1.in', 'aplusb/2.in']);
});

test('题面自动拼装出输入/输出格式与样例', () => {
    const p = analyze(OK_PROBLEM).problems[0];
    assert.match(p.content, /## 输入格式/);
    assert.match(p.content, /## 输出格式/);
    assert.match(p.content, /### 样例 1/);
});

test('testdata/ 子目录形态也能识别', () => {
    const r = analyze([
        ['p1001/problem.yaml', '---\ntitle: 求和\ntime: 500ms\nmemory: 128m\ncontent: |\n  求两个数之和\n'],
        ['p1001/testdata/1.in', '2 3\n'],
        ['p1001/testdata/1.out', '5\n'],
    ]);
    assert.equal(r.problems.length, 1);
    assert.equal(r.problems[0].pid, 'p1001');
    assert.equal(r.problems[0].pairs.length, 1);
    assert.equal(r.problems[0].timeMs, 500);
});

test('.ans 结尾的标准答案同样被接受（§18）', () => {
    const r = analyze([
        ['ab/problem.json', JSON.stringify({ pid: 'pab', title: 'AB' })],
        ['ab/1.in', '1 1\n'],
        ['ab/1.ans', '2\n'],
    ]);
    assert.equal(r.problems[0].pairs.length, 1);
});

console.log('\n=== 2. 安全预检（§23）===');

test('路径穿越 `..` 被拒', () => {
    const r = analyze([['../evil.txt', 'x'], ...OK_PROBLEM]);
    assert.ok(hasError(r, /路径穿越/), `未报错：${allMsgs(r).join(' | ')}`);
});

test('绝对路径条目被拒', () => {
    const r = analyze([['/etc/passwd', 'x'], ...OK_PROBLEM]);
    assert.ok(hasError(r, /绝对路径/));
});

test('反斜杠路径被拒', () => {
    const r = analyze([['dir\\1.in', 'x'], ...OK_PROBLEM]);
    assert.ok(hasError(r, /反斜杠/));
});

test('重复路径条目被拒', () => {
    const r = analyze([['a/1.in', '1\n'], ['a/1.in', '2\n'], ['a/problem.json', JSON.stringify({ pid: 'pa', title: 'A' })]]);
    assert.ok(hasError(r, /重复的路径/));
});

test('仅大小写不同的重复路径被拒', () => {
    const r = analyze([['a/1.IN', '1\n'], ['a/1.in', '1\n'], ['a/problem.json', JSON.stringify({ pid: 'pa', title: 'A' })]]);
    assert.ok(hasError(r, /重复的路径/));
});

test('文件名含 NUL 被拒', () => {
    const r = analyze([['a/1\u0000.in', '1\n'], ...OK_PROBLEM]);
    assert.ok(hasError(r, /控制字符|NUL/));
});

test('压缩炸弹（单文件压缩比过高）被拒', () => {
    const big = Buffer.alloc(8 * 1024 * 1024, 0x41); // 8MB 全 A，deflate 后约几 KB
    const r = analyzeArchive(writeZip([['a/bomb.txt', big], ...OK_PROBLEM], { deflate: true }), { archiveName: 't.zip' });
    assert.ok(hasError(r, /压缩比异常/), `未报错：${allMsgs(r).join(' | ')}`);
});

test('正常包不触发「单文件过大」', () => {
    const r = analyze([...OK_PROBLEM]);
    assert.ok(!hasError(r, /单文件过大/));
});

console.log('\n=== 3. 数据完整性（§18 §23）===');

test('输入缺少配对输出 → 错误', () => {
    const r = analyze([
        ['x/problem.json', JSON.stringify({ pid: 'px', title: 'X' })],
        ['x/1.in', '1\n'],
        ['x/1.out', '1\n'],
        ['x/2.in', '2\n'],
    ]);
    assert.ok(hasError(r, /缺少配对的/));
});

test('输出没有对应输入 → 警告（忽略而非报错）', () => {
    const r = analyze([
        ['x/problem.json', JSON.stringify({ pid: 'px', title: 'X' })],
        ['x/1.in', '1\n'],
        ['x/1.out', '1\n'],
        ['x/9.out', 'garbage\n'],
    ]);
    assert.ok(hasWarn(r, /没有对应输入/));
    assert.ok(!hasError(r, /缺少配对的/));
});

test('标准答案为空 → 警告', () => {
    const r = analyze([
        ['x/problem.json', JSON.stringify({ pid: 'px', title: 'X' })],
        ['x/1.in', '1\n'],
        ['x/1.out', '   \n'],
    ]);
    assert.ok(hasWarn(r, /空白/));
});

test('输入为 0 字节 → 警告', () => {
    const r = analyze([
        ['x/problem.json', JSON.stringify({ pid: 'px', title: 'X' })],
        ['x/1.in', ''],
        ['x/1.out', '1\n'],
    ]);
    assert.ok(hasWarn(r, /0 字节/));
});

test('重复测试点（内容相同）→ 警告', () => {
    const r = analyze([
        ['x/problem.json', JSON.stringify({ pid: 'px', title: 'X' })],
        ['x/1.in', 'same\n'], ['x/1.out', '1\n'],
        ['x/2.in', 'same\n'], ['x/2.out', '2\n'],
    ]);
    assert.ok(hasWarn(r, /重复测试点/));
});

test('测试点编号不连续 → 警告（§18）', () => {
    const r = analyze([
        ['x/problem.json', JSON.stringify({ pid: 'px', title: 'X' })],
        ['x/1.in', 'a\n'], ['x/1.out', '1\n'],
        ['x/3.in', 'b\n'], ['x/3.out', '2\n'],
    ]);
    assert.ok(hasWarn(r, /编号不连续/));
});

test('没有任何可用测试点 → 错误', () => {
    const r = analyze([['x/problem.json', JSON.stringify({ pid: 'px', title: 'X' })], ['x/readme.md', '# hi']]);
    assert.ok(hasError(r, /没有任何可用/));
});

console.log('\n=== 4. 元数据校验 ===');

test('源数据没有标题 → 告警并提示人工确认', () => {
    const r = analyze([
        ['x/problem.json', JSON.stringify({ pid: 'px' })],
        ['x/1.in', '1\n'], ['x/1.out', '1\n'],
    ]);
    assert.ok(hasWarn(r, /未提供标题/), `未告警：${allMsgs(r).join(' | ')}`);
});

test('标题为纯空白 → 错误', () => {
    const r = analyze([
        ['x/problem.json', JSON.stringify({ pid: 'px', title: '   ' })],
        ['x/1.in', '1\n'], ['x/1.out', '1\n'],
    ]);
    assert.ok(hasError(r, /标题为空/), `未报错：${allMsgs(r).join(' | ')}`);
});

test('problem.json 非法 JSON → 错误', () => {
    const r = analyze([
        ['x/problem.json', '{ not json'],
        ['x/1.in', '1\n'], ['x/1.out', '1\n'],
    ]);
    assert.ok(hasError(r, /不是合法 JSON/));
});

test('时限超出合理区间 → 错误', () => {
    const r = analyze([
        ['x/problem.json', JSON.stringify({ pid: 'px', title: 'X', time_limit: 999 })],
        ['x/1.in', '1\n'], ['x/1.out', '1\n'],
    ]);
    assert.ok(hasError(r, /时间限制/));
});

test('内存超出合理区间 → 错误', () => {
    const r = analyze([
        ['x/problem.json', JSON.stringify({ pid: 'px', title: 'X', memory_limit: 99999 })],
        ['x/1.in', '1\n'], ['x/1.out', '1\n'],
    ]);
    assert.ok(hasError(r, /内存限制/));
});

test('非法题号被规范化并告警', () => {
    const r = analyze([
        ['1000-两数之和/problem.json', JSON.stringify({ title: '两数之和' })],
        ['1000-两数之和/1.in', '1 2\n'], ['1000-两数之和/1.out', '3\n'],
    ]);
    const p = r.problems[0];
    assert.equal(p.pid, 'p1000');
    assert.ok(hasWarn(r, /规范化/));
});

test('高级判题与附加字段必须拒绝', () => {
    for (const key of ['type', 'filename', 'cases', 'user_extra_files', 'judge_extra_files',
        'manager', 'validator', 'time_limit_rate', 'memory_limit_rate']) {
        const r = analyze([
            ['x/problem.json', JSON.stringify({ pid: 'px', title: 'X', [key]: true })],
            ['x/1.in', '1\n'], ['x/1.out', '1\n'],
        ]);
        assert.ok(hasError(r, new RegExp(`暂不支持字段 ${key}`)), `${key} 未被拒绝`);
    }
});

test('实际附加文件必须拒绝而不能静默丢弃', () => {
    const r = analyze([
        ['x/problem.json', JSON.stringify({ pid: 'px', title: 'X' })],
        ['x/1.in', '1\n'], ['x/1.out', '1\n'],
        ['x/additional_file/diagram.png', Buffer.from([0x89, 0x50, 0x4e, 0x47])],
    ]);
    assert.ok(hasError(r, /暂不支持附加文件/), `未拒绝附件：${allMsgs(r).join(' | ')}`);
});

test('判题反馈与重定向配置必须拒绝', () => {
    for (const key of ['detail', 'langs', 'redirect']) {
        const r = analyze([
            ['x/problem.json', JSON.stringify({ pid: 'px', title: 'X', [key]: 'none' })],
            ['x/1.in', '1\n'], ['x/1.out', '1\n'],
        ]);
        assert.ok(hasError(r, new RegExp(`暂不支持字段 ${key}`)), `${key} 未被拒绝`);
    }
});

test('题面引用的普通文本附件不能静默丢失', () => {
    const r = analyze([
        ['x/problem.json', JSON.stringify({ pid: 'px', title: 'X', content: '[说明](file://manual.txt)' })],
        ['x/1.in', '1\n'], ['x/1.out', '1\n'], ['x/manual.txt', '说明'],
    ]);
    assert.ok(hasError(r, /附加文件|未被转换的本地文件/), `未拒绝题面附件：${allMsgs(r).join(' | ')}`);
});

test('题面引用孤立测试扩展名也必须拒绝', () => {
    const r = analyze([
        ['x/problem.json', JSON.stringify({ pid: 'px', title: 'X', content: '[说明](file://manual.out)' })],
        ['x/1.in', '1\n'], ['x/1.out', '1\n'], ['x/manual.out', '说明'],
    ]);
    assert.ok(hasError(r, /未被转换的本地文件/), `未拒绝孤立输出：${allMsgs(r).join(' | ')}`);
});

console.log('\n=== 5. 单位解析 ===');

test('parseTimeToMs', () => {
    assert.equal(parseTimeToMs(1), 1000);
    assert.equal(parseTimeToMs('1s'), 1000);
    assert.equal(parseTimeToMs('1500ms'), 1500);
    assert.equal(parseTimeToMs('2 秒'), 2000);
    assert.equal(parseTimeToMs(''), null);
});

test('parseMemoryToMB', () => {
    assert.equal(parseMemoryToMB(256), 256);
    assert.equal(parseMemoryToMB('256m'), 256);
    assert.equal(parseMemoryToMB('1g'), 1024);
    assert.equal(parseMemoryToMB('524288k'), 512);
    assert.equal(parseMemoryToMB(null), null);
});

test('derivePid 生成 Hydro 合法题号', () => {
    const re = /^(?:[a-z0-9]{1,10}-)?[a-z][0-9a-z]*$/i;
    for (const s of ['A+B', '1000', 'A+B Problem', '两数之和', 'p1000', 'abc-1', '', '123-456']) {
        assert.ok(re.test(derivePid(s)), `${s} -> ${derivePid(s)} 不合法`);
    }
});

console.log('\n=== 6. 转换结果可被自己再解析（往返一致性）===');

test('生成 Hydro 包并能重新解析通过', () => {
    const r = analyze(OK_PROBLEM);
    const out = buildHydroPackage(r.problems);
    const tmp = path.join(os.tmpdir(), `sylu-selftest-${Date.now()}.zip`);
    fs.writeFileSync(tmp, out);
    const r2 = analyzeArchive(fs.readFileSync(tmp), { archiveName: 'out.zip' });
    fs.rmSync(tmp, { force: true });
    const errs = [...r2.diag.errors, ...r2.problems.flatMap((p) => p.problems.items)];
    assert.equal(errs.length, 0, `往返后出现错误：${JSON.stringify(errs)}`);
    assert.equal(r2.problems[0].pairs.length, 2);
});

test('生成的包结构符合 Hydro 导入约定', () => {
    const r = analyze(OK_PROBLEM);
    const out = buildHydroPackage(r.problems);
    const back = analyzeArchive(out, { archiveName: 'out.zip' });
    assert.equal(back.problems[0].pid, 'p1000');
    assert.equal(back.problems[0].timeMs, 1000);
    assert.equal(back.problems[0].memoryMB, 256);
    // Hydro 要求 testdata 子目录 + problem.yaml
    const names = back.problems[0].sourceFiles;
    assert.ok(names.some((n) => n.endsWith('p1000/problem.yaml')), names.join(','));
    assert.ok(names.some((n) => n.includes('p1000/testdata/1.in')), names.join(','));
    assert.ok(names.some((n) => n.includes('p1000/testdata/config.yaml')), names.join(','));
});

test('--only 选择题目不影响包内其它题', () => {
    const two = [
        ...OK_PROBLEM,
        ['bsum/problem.json', JSON.stringify({ pid: 'p1001', title: 'B' })],
        ['bsum/1.in', '2 2\n'], ['bsum/1.out', '4\n'],
    ];
    const r = analyze(two);
    assert.equal(r.problems.length, 2);
    const out = buildHydroPackage([r.problems[1]]);
    const back = analyzeArchive(out, { archiveName: 'out.zip' });
    assert.equal(back.problems.length, 1);
    assert.equal(back.problems[0].pid, 'p1001');
});

test('重名题号自动去重且仍合法', () => {
    const dup = [
        ['a/problem.json', JSON.stringify({ pid: 'pdup', title: 'A' })],
        ['a/1.in', '1\n'], ['a/1.out', '1\n'],
        ['b/problem.json', JSON.stringify({ pid: 'pdup', title: 'B' })],
        ['b/1.in', '2\n'], ['b/1.out', '2\n'],
    ];
    const r = analyze(dup);
    const out = buildHydroPackage(r.problems);
    const back = analyzeArchive(out, { archiveName: 'out.zip' });
    const pids = back.problems.map((p) => p.pid);
    assert.equal(new Set(pids).size, 2, `题号重复：${pids.join(',')}`);
});


console.log('\n=== 7. 审查回归：安全边界与无损转换 ===');

test('安全预检失败后不提取任何题目', () => {
    const r = analyze([['../evil.txt', 'x'], ...OK_PROBLEM]);
    assert.equal(r.problems.length, 0);
});

test('YAML 题面、引号、标签与样例完整往返', () => {
    const original = analyze(OK_PROBLEM).problems[0];
    original.title = 'true';
    original.tags = ['null', '123', 'a # b', 'a,b'];
    original.content = '# 标题\n\n输入: "a"\n  缩进\n\n末尾';
    const archive = buildHydroPackage([original]);
    const entry = readCentralDirectory(archive).entries.find((e) => e.name.endsWith('problem.yaml'));
    const metadata = parse(extractEntry(archive, entry).toString());
    assert.equal(metadata.title, 'true');
    assert.deepEqual(metadata.tag, original.tags);
    const back = analyzeArchive(archive).problems[0];
    assert.equal(back.content, original.content);
    assert.deepEqual(back.tags, original.tags);
});

test('实际输出题号唯一且符合 Hydro 规则', () => {
    const p = analyze(OK_PROBLEM).problems[0];
    const archive = buildHydroPackage([p, p, p]);
    const pids = readCentralDirectory(archive).entries.filter((e) => e.name.endsWith('problem.yaml'))
        .map((e) => parse(extractEntry(archive, e).toString()).pid);
    assert.equal(new Set(pids).size, 3);
    assert.ok(pids.every((pid) => /^(?:[a-z0-9]{1,10}-)?[a-z][0-9a-z]*$/i.test(pid)));
});

test('题号规范化结果可重现', () => {
    assert.equal(derivePid('123-456'), derivePid('123-456'));
});

test('.out.txt 不会被误识别为输入，字母 .in.txt 可配对', () => {
    const r = analyze([['x/problem.json', '{"pid":"px","title":"X"}'],
        ['x/alpha.in.txt', '1'], ['x/alpha.out.txt', '2'],
        ['x/2.in.txt', '3'], ['x/2.ans.txt', '4']]);
    assert.equal(r.problems[0].pairs.length, 2);
    assert.equal(r.problems[0].problems.errors.length, 0);
});

test('显式元数据题号优先于目录名', () => {
    const r = analyze([['directory/problem.json', '{"pid":"p42","title":"X"}'],
        ['directory/testdata/1.in', '1'], ['directory/testdata/1.out', '2']]);
    assert.equal(r.problems[0].pid, 'p42');
});

test('非对象元数据、非法编码、重复 YAML 键均拒绝', () => {
    for (const [name, content] of [['problem.json', '[]'], ['problem.json', 'null'],
        ['problem.json', Buffer.from([0xff])], ['problem.yaml', 'title: A\ntitle: B\n']]) {
        const r = analyze([[`x/${name}`, content], ['x/1.in', '1'], ['x/1.out', '2']]);
        assert.ok(hasError(r, /元数据/));
    }
});

test('显式非法限制不会静默使用默认值', () => {
    for (const val of [0, -1, 'bad', '1.2.3s']) {
        const r = analyze([['x/problem.json', JSON.stringify({title:'X', time_limit:val})],
            ['x/1.in', '1'], ['x/1.out', '2']]);
        assert.ok(hasError(r, /时间限制/));
    }
    assert.equal(parseTimeToMs(Infinity), null);
    assert.equal(parseMemoryToMB('1.2.3m'), null);
});

test('篡改解压大小与 CRC=0 都必须拒绝', () => {
    for (const [offset, value] of [[24, 1], [16, 0]]) {
        const archive = writeZip([['x.txt', 'hello']]);
        const cd = archive.readUInt32LE(archive.length - 6);
        archive.writeUInt32LE(value, cd + offset);
        const entry = readCentralDirectory(archive).entries[0];
        assert.throws(() => extractEntry(archive, entry), /大小|CRC/);
    }
});

test('非法 UTF-8 文件名与中央目录长度越界被拒绝', () => {
    const archive = writeZip([['x.txt', 'hello']]);
    const cd = archive.readUInt32LE(archive.length - 6);
    const badName = Buffer.from(archive);
    badName[cd + 46] = 0xff;
    assert.throws(() => readCentralDirectory(badName));
    archive.writeUInt16LE(65535, cd + 28);
    assert.throws(() => readCentralDirectory(archive), /越界/);
});

test('本地头文件名不一致被拒绝', () => {
    const archive = writeZip([['x.txt', 'hello']]);
    archive[30] = 0x79;
    assert.throws(() => extractEntry(archive, readCentralDirectory(archive).entries[0]), /不一致/);
});

test('50 题转换后题面与所有测试数据无损', () => {
    const source = Array.from({length: 50}, (_, i) => [
        [`p${i}/problem.json`, JSON.stringify({pid:`p${i}`, title:`题目 ${i}`, content:`内容\n${i}`})],
        [`p${i}/1.in`, `${i}\n`], [`p${i}/1.out`, `${i * 2}\n`],
    ]).flat();
    const first = analyze(source);
    const back = analyzeArchive(buildHydroPackage(first.problems));
    assert.equal(back.problems.length, 50);
    for (let i=0; i<50; i++) {
        assert.equal(back.problems[i].content, first.problems[i].content);
        assert.deepEqual(back.problems[i].pairs[0].input.buf, first.problems[i].pairs[0].input.buf);
        assert.deepEqual(back.problems[i].pairs[0].output.buf, first.problems[i].pairs[0].output.buf);
    }
});

test('verify 未授权不执行；缺失程序返回失败且 JSON 可解析', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sylu-cli-'));
    try {
        const input = path.join(dir, 'input.zip');
        fs.writeFileSync(input, writeZip(OK_PROBLEM));
        const cli = fileURLToPath(new URL('../bin/sylu-import.mjs', import.meta.url));
        const blocked = spawnSync(process.execPath, [cli, 'verify', input], {encoding:'utf8'});
        assert.equal(blocked.status, 2);
        const skipped = spawnSync(process.execPath, [cli, 'verify', input, '--trusted', '--json'], {encoding:'utf8'});
        assert.equal(skipped.status, 1);
        assert.ok(JSON.parse(skipped.stdout)[0].skipped);
    } finally { fs.rmSync(dir, {recursive:true, force:true}); }
});

// ---------------------------------------------------------------- 汇总
console.log(`\n${'='.repeat(56)}`);
console.log(`自测结果：${pass} 通过 / ${fail} 失败`);
console.log('='.repeat(56));
if (fail) {
    console.log('\n失败详情：');
    for (const f of failures) console.log(`\n[${f.name}]\n${f.error.message}\n${f.error.stack?.split('\n').slice(1, 4).join('\n')}`);
    process.exit(1);
}
process.exit(0);
