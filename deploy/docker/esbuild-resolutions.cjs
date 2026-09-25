'use strict';

// 复刻 Hydro 官方 setup.sh 的处理：把非本平台的 esbuild 可选二进制指向 /dev/null，
// 否则 yarn global add 会尝试拉取全部平台包，变慢甚至失败。
// 保留 esbuild-linux-64 / esbuild-linux-arm64。
//
// 用法：node esbuild-resolutions.cjs <yarn global dir>

const fs = require('fs');
const path = require('path');

const dir = process.argv[2] || process.env.YARN_GLOBAL_DIR;
if (!dir) {
    console.error('用法：node esbuild-resolutions.cjs <yarn global dir>');
    process.exit(1);
}

const file = path.join(dir, 'package.json');
let pkg = {};
try {
    pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
} catch (_) {
    pkg = {};
}
pkg.resolutions = pkg.resolutions || {};

const names = [
    '@esbuild/linux-loong64',
    'esbuild-windows-32',
    ...['android', 'darwin', 'freebsd', 'windows'].flatMap((o) => [`${o}-64`, `${o}-arm64`]).map((o) => `esbuild-${o}`),
    ...['32', 'arm', 'mips64', 'ppc64', 'riscv64', 's390x'].map((o) => `esbuild-linux-${o}`),
    ...['netbsd', 'openbsd', 'sunos'].map((o) => `esbuild-${o}-64`),
];
for (const name of names) pkg.resolutions[name] = 'link:/dev/null';

fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(file, JSON.stringify(pkg, null, 2));
console.log(`[sylu] 已写入 esbuild resolutions：${file}`);
