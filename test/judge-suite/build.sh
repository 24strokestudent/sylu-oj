#!/usr/bin/env bash
# 把 judge-suite 的 SYS001 打成 Hydro 可导入包
#
# 用自研的 tools/problem-importer 完成（顺便验证导入工具本身）：
#   预检 → 生成 zip
# 生成物默认放在 /tmp，不写进仓库。
#
# 用法：
#   bash test/judge-suite/build.sh [输出路径]

set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "${DIR}/../.." && pwd)"
IMPORTER="${REPO}/tools/problem-importer/bin/sylu-import.mjs"
OUT="${1:-/tmp/sys001-hydro-import.zip}"

# Windows(Git Bash) 下 node/g++ 等原生程序看不懂 /e/... 形式的 POSIX 路径
if command -v cygpath >/dev/null 2>&1; then
    DIR="$(cygpath -m "$DIR")"
    REPO="$(cygpath -m "$REPO")"
    IMPORTER="$(cygpath -m "$IMPORTER")"
    OUT="$(cygpath -m "$OUT")"
fi

command -v node >/dev/null 2>&1 || { echo "需要 Node.js（>=18）"; exit 1; }
[ -f "$IMPORTER" ] || { echo "找不到导入工具：$IMPORTER"; exit 1; }

echo "== 打包源目录 =="
# 用临时目录而不是临时文件：部分平台的 zip 拒绝写入已存在的空文件
TMPDIR_BUILD="$(mktemp -d)"
TMPZIP="${TMPDIR_BUILD}/sys001-src.zip"
if command -v cygpath >/dev/null 2>&1; then
    TMPDIR_BUILD="$(cygpath -m "$TMPDIR_BUILD")"
    TMPZIP="${TMPDIR_BUILD}/sys001-src.zip"
fi
trap 'rm -rf "$TMPDIR_BUILD"' EXIT

pack_with_node() {
    node --input-type=module -e '
        import { writeZip } from "file://'"${REPO}"'/tools/problem-importer/src/zip.mjs";
        import fs from "node:fs";
        import path from "node:path";
        const root = process.argv[1], out = process.argv[2], files = [];
        (function walk(d, rel) {
            for (const e of fs.readdirSync(d, { withFileTypes: true })) {
                const p = path.join(d, e.name);
                const r = rel ? rel + "/" + e.name : e.name;
                if (e.isDirectory()) walk(p, r); else files.push([r, fs.readFileSync(p)]);
            }
        })(path.join(root, "SYS001-AB"), "SYS001-AB");
        fs.writeFileSync(out, writeZip(files));
    ' "${DIR}" "$TMPZIP"
}

if command -v zip >/dev/null 2>&1; then
    (cd "${DIR}" && zip -qr "$TMPZIP" SYS001-AB)
else
    pack_with_node
fi

echo
echo "== 预检 =="
node "$IMPORTER" preflight "$TMPZIP"

echo
echo "== 生成 Hydro 导入包 =="
node "$IMPORTER" convert "$TMPZIP" -o "$OUT"

echo
echo "输出：$OUT"
echo "上传位置：题库 → Import From Hydro（/problem/import/hydro），导入时保持隐藏"
