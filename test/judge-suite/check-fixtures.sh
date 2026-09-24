#!/usr/bin/env bash
# 本地校验验收集自身是否正确
#
# 目的：把"用例本身写错了"和"服务器的判题机坏了"区分开。
#   本地全绿、服务器异常 → 问题在 Judge / 沙箱
#   本地就异常           → 先修用例，别去动服务器
#
# 重要：本脚本**不是**判题机的替代品。
#   TLE / MLE / OLE 的最终判定必须在 Hydro 沙箱里做（§15 §16），
#   这里只做"编译能过、输出对得上、进程确实会被挂死"的粗略核对。
#
# 用法：
#   bash test/judge-suite/check-fixtures.sh
#   bash test/judge-suite/check-fixtures.sh --with-heavy   # 额外跑 TLE/MLE/OLE 用例

set -uo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROB="${DIR}/SYS001-AB"
SUB="${PROB}/submissions"

# 工作目录：Linux 用 mktemp 即可；Windows(Git Bash) 下原生编译器看不懂 /tmp，
# 需要用 cygpath 转成 Windows 可识别的路径，否则 g++ 会静默写不进去。
WORK_RAW="$(mktemp -d)"
if command -v cygpath >/dev/null 2>&1; then
    WORK="$(cygpath -m "$WORK_RAW")"
else
    WORK="$WORK_RAW"
fi
trap 'rm -rf "$WORK_RAW"' EXIT

# Windows 下 g++ 产出 .exe
EXE=""
case "$(uname -s)" in
    MINGW* | MSYS* | CYGWIN*) EXE=".exe" ;;
esac

# Windows 下原生编译器不认识 /e/AI/... 这种 POSIX 路径，统一转成 C:/... 形式
if command -v cygpath >/dev/null 2>&1; then
    DIR="$(cygpath -m "$DIR")"
    PROB="$(cygpath -m "$PROB")"
    SUB="$(cygpath -m "$SUB")"
fi

WITH_HEAVY=0
[ "${1:-}" = "--with-heavy" ] && WITH_HEAVY=1

if [ -t 1 ]; then
    G=$'\033[32m'; R=$'\033[31m'; Y=$'\033[33m'; B=$'\033[1m'; O=$'\033[0m'
else
    G=''; R=''; Y=''; B=''; O=''
fi

PASS=0
FAIL=0
ok()   { PASS=$((PASS + 1)); printf '  %s[PASS]%s %s\n' "$G" "$O" "$1"; }
bad()  { FAIL=$((FAIL + 1)); printf '  %s[FAIL]%s %s\n' "$R" "$O" "$1"; }
note() { printf '  %s%s%s\n' "$Y" "$1" "$O"; }

CXX="${CXX:-g++}"
if ! command -v "$CXX" >/dev/null 2>&1; then
    echo "${R}找不到 $CXX，无法本地校验。请先安装编译环境（apt-get install -y g++）。${O}"
    exit 2
fi

printf '%s本地校验判题验收集%s\n' "$B" "$O"
echo "  题目：SYS001 A+B   编译器：$($CXX --version | head -1)"
echo

# ---------------------------------------------------------------- 1. 编译期
echo "${B}1. 编译行为${O}"

compile() { # $1=src  $2=outname  → 0 成功
    "$CXX" -O2 -std=c++17 -o "${WORK}/$2${EXE}" "$1" >/dev/null 2>&1
}

for f in ac wa re tle mle ole; do
    if compile "${SUB}/${f}.cpp" "$f"; then
        ok "${f}.cpp 能编译（预期）"
    else
        bad "${f}.cpp 编译失败，但它应该能编译通过"
    fi
done

if compile "${SUB}/ce.cpp" ce 2>/dev/null; then
    bad "ce.cpp 竟然编译成功了 —— 它与预期（Compile Error）不符，请修正用例"
else
    ok "ce.cpp 编译失败（预期 Compile Error）"
fi

# ---------------------------------------------------------------- 2. 输出比对
echo
echo "${B}2. 输出比对（对全部测试点）${O}"

# 归一化：去 CR、去行尾空白、去首尾空行（纯 awk，不依赖 tac / sed 的 GNU 扩展）
norm() {
    awk '{ sub(/\r$/, ""); sub(/[ \t]+$/, ""); buf[NR] = $0 }
         END { last = NR; while (last > 0 && buf[last] == "") last--
               for (i = 1; i <= last; i++) print buf[i] }' "$1" 2>/dev/null
}

check_output() { # $1=程序名 $2=期望(AC|WA)
    local name="$1" expect="$2"
    local allmatch=1 anyrun=0
    for in_file in "${PROB}"/*.in; do
        local base exp
        base="$(basename "$in_file" .in)"
        exp="${PROB}/${base}.out"
        [ -f "$exp" ] || continue
        anyrun=1
        timeout 10 "${WORK}/${name}${EXE}" <"$in_file" >"${WORK}/actual.txt" 2>/dev/null
        if diff -q <(norm "$exp") <(norm "${WORK}/actual.txt") >/dev/null 2>&1; then
            :
        else
            allmatch=0
        fi
    done
    if [ "$anyrun" = 0 ]; then
        bad "${name} 没有找到任何测试点"
        return
    fi
    local actual="WA"
    [ "$allmatch" = 1 ] && actual="AC"
    if [ "$actual" = "$expect" ]; then
        ok "${name}.cpp 本地判定 = ${actual}（预期 ${expect}）"
    else
        bad "${name}.cpp 本地判定 = ${actual}，预期 ${expect}"
    fi
}

check_output ac AC
check_output wa WA

if command -v python3 >/dev/null 2>&1 || command -v python >/dev/null 2>&1; then
    PY="$(command -v python3 || command -v python)"
    acond=1
    for in_file in "${PROB}"/*.in; do
        base="$(basename "$in_file" .in)"
        exp="${PROB}/${base}.out"
        [ -f "$exp" ] || continue
        timeout 10 "$PY" "${SUB}/ac.py" <"$in_file" >"${WORK}/actual.txt" 2>/dev/null
        diff -q <(norm "$exp") <(norm "${WORK}/actual.txt") >/dev/null 2>&1 || acond=0
    done
    [ "$acond" = 1 ] && ok "ac.py 输出与标准答案一致" || bad "ac.py 输出与标准答案不一致"
else
    note "未找到 python3，跳过 ac.py 校验"
fi

# ---------------------------------------------------------------- 3. 异常行为
echo
echo "${B}3. 异常行为（粗筛，最终以沙箱判定为准）${O}"

if [ "$WITH_HEAVY" = 1 ]; then
    timeout 2 "${WORK}/tle${EXE}" >/dev/null 2>&1
    rc=$?
    if [ "$rc" = 124 ]; then ok "tle.cpp 被 timeout 强杀（说明确实是死循环）"
    else note "tle.cpp 退出码 $rc（预期 124）；在沙箱里应以 TLE 判定"; fi

    timeout 2 "${WORK}/ole${EXE}" >/dev/null 2>&1
    rc=$?
    if [ "$rc" = 124 ]; then ok "ole.cpp 被 timeout 强杀（说明是无界输出）"
    else note "ole.cpp 退出码 $rc（预期 124）；在沙箱里应以 OLE 判定"; fi

    # 用地址空间上限模拟内存限制
    ( ulimit -v $((256 * 1024)) 2>/dev/null; timeout 10 "${WORK}/mle${EXE}" ) >/dev/null 2>&1
    rc=$?
    if [ "$rc" != 0 ]; then ok "mle.cpp 在 256MB 地址空间限制下异常退出（rc=$rc）"
    else note "mle.cpp 在限制下正常退出；本机 ulimit -v 可能不生效，以沙箱 MLE 判定为准"; fi

    echo '0' | timeout 5 "${WORK}/re${EXE}" >/dev/null 2>&1
    rc=$?
    if [ "$rc" != 0 ]; then ok "re.cpp 异常退出（rc=$rc），预期 Runtime Error"
    else note "re.cpp 正常退出，可能被编译器优化掉了除零；以沙箱判定为准"; fi
else
    note "已跳过 TLE / MLE / OLE / RE 的实际运行（加 --with-heavy 开启）"
    note "它们必须在部署后的 Hydro 沙箱里验证（§15 §16），本机跑没有意义"
fi

# ---------------------------------------------------------------- 汇总
echo
printf '%s========================================%s\n' "$B" "$O"
printf '本地校验：%s%d 通过%s / %s%d 失败%s\n' "$G" "$PASS" "$O" "$R" "$FAIL" "$O"
printf '%s========================================%s\n' "$B" "$O"
[ "$FAIL" -eq 0 ] || exit 1
echo
echo "下一步：把本目录打成可导入包，上传到 /problem/import/hydro"
echo "  bash test/judge-suite/build.sh"
