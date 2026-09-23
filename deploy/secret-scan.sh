#!/usr/bin/env bash
# SYLU OJ 密钥与危险实现扫描（对应实施计划 §44 §69）
#
# 目的：在 push / 上线之前，机器先替人看一遍 ——
#   1) 代码库里有没有硬编码的密钥、数据库口令、私钥、token；
#   2) 有没有「本该被 .gitignore 挡住、却已经被 git 跟踪」的敏感文件；
#   3) 有没有踩到 §69 明令禁止的写法（自己写评测机、child_process 跑用户代码、MongoDB 暴露公网）。
#
# 设计原则：**只报告 file:line 和整改建议**，绝不把命中行正文写入日志。
#
# 用法：
#   bash deploy/secret-scan.sh                 # 扫仓库
#   bash deploy/secret-scan.sh --root /path    # 扫指定目录
#   bash deploy/secret-scan.sh --all           # 连 node_modules/.ref 一起扫（慢）
#   bash deploy/secret-scan.sh --quiet         # 只输出问题
#
# 退出码：0 无高危项；1 存在高危项（应阻断 push / 上线）

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
. "${SCRIPT_DIR}/lib/common.sh"

SCAN_ROOT="${SYLU_OJ_ROOT}"
QUIET=0
SCAN_ALL=0

while [ $# -gt 0 ]; do
    case "$1" in
        --root) SCAN_ROOT="${2:?--root 需要目录}"; shift 2 ;;
        --root=*) SCAN_ROOT="${1#*=}"; shift ;;
        --all) SCAN_ALL=1; shift ;;
        --quiet) QUIET=1; shift ;;
        -h | --help) sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
        *) die "未知参数：$1" ;;
    esac
done

[ -d "$SCAN_ROOT" ] || die "扫描目录不存在：${SCAN_ROOT}"

banner "密钥与危险实现扫描（§44 §69）" "只报位置，不打印密钥原文"

PK_PASS=0
PK_WARN=0
PK_FAIL=0

# ------------------------------------------------------------
# 扫描范围
# ------------------------------------------------------------
EXCLUDES=(--exclude-dir=.git --exclude-dir=dist --exclude-dir=build)
# 本文件自身就是「密钥特征」的定义处，扫自己必然满屏误报，直接排除
EXCLUDES+=(--exclude=secret-scan.sh)
if [ "$SCAN_ALL" != 1 ]; then
    EXCLUDES+=(--exclude-dir=node_modules --exclude-dir=.ref --exclude-dir=.e2e --exclude-dir=vendor)
fi

# grep 基础参数：-r 递归 -I 跳过二进制 -n 行号 -E 扩展正则
GREP_OPTS=(-rInE --binary-files=without-match "${EXCLUDES[@]}")

PAT_NAME=(); PAT_SEV=(); PAT_RE=(); PAT_NOTE=(); PAT_EXCL=()

# --quiet 只保留问题项与结论，适合接 CI
qinfo() { [ "$QUIET" = 1 ] || log_info "$*"; }
qok() { [ "$QUIET" = 1 ] || log_ok "$*"; }
qcat() { [ "$QUIET" = 1 ] || cat; }

add_pattern() { # $1=名称 $2=级别 $3=正则 $4=说明 $5=额外排除的glob(可选)
    PAT_NAME+=("$1"); PAT_SEV+=("$2"); PAT_RE+=("$3"); PAT_NOTE+=("${4:-}")
    PAT_EXCL+=("${5:-__sylu_none__}")
}

# ---------- §44 密钥类 ----------
add_pattern "私钥内容" HIGH \
    '\-\-\-\-\-BEGIN [A-Z ]*PRIVATE KEY\-\-\-\-\-' \
    "任何私钥都不该出现在代码库里；HTTPS 证书私钥应放在服务器 /etc 下并限制权限"

add_pattern "带口令的 MongoDB 连接串" HIGH \
    'mongodb(\+srv)?://[^:/@[:space:]]+:[^@[:space:]]+@' \
    "Hydro 的数据库口令在 ~/.hydro/config.json 里；不要把带口令的 URI 写进仓库"

add_pattern "AWS Access Key" HIGH \
    '(AKIA|ASIA)[0-9A-Z]{16}' "云厂商长期密钥，一律走环境变量或实例角色"

add_pattern "GitHub Token" HIGH \
    'gh[pousr]_[A-Za-z0-9]{30,}' "GitHub token；一旦泄漏立即 revoke"

add_pattern "Slack / 通用 webhook Token" HIGH \
    'xox[baprs]-[A-Za-z0-9-]{10,}' "第三方平台 token"

add_pattern "JWT / 长 Base64 凭据" MEDIUM \
    'eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.' "疑似 JWT，确认是否属于敏感凭据"

add_pattern "Restic 备份口令" HIGH \
    'SYLU_RESTIC_PASS[[:space:]]*=[[:space:]]*["'"'"']?[A-Za-z0-9][A-Za-z0-9_./+-]{7,}' \
    "异地备份口令应通过环境变量注入，不要落盘"

# ---------- 通用口令赋值 ----------
add_pattern "硬编码口令" HIGH \
    '(password|passwd|pwd|secret|token|apikey|api_key)[[:space:]]*[:=][[:space:]]*["'"'"'][^"'"'"']{4,}["'"'"']' \
    "疑似硬编码凭据"

# ---------- Hydro 已知默认口令 ----------
# 注意适用范围：`examplepassword` 是**独立/远端评测机**部署时 ~/.hydro/judge.yaml 的官方默认口令。
# 官方 setup.sh 默认装的「内嵌评测机」**不生成 judge.yaml**，配置取 JudgeSettings({}) 默认值，
# 因此这类机器上本项检查报"未命中"是正常的，不代表漏检（详见 docs/DEPLOY.md §6.7）。
# 这是**公开的默认值**，出现在文档里正是"要你去改它"的提醒，属于正常内容；
# 所以这个特征排除 *.md，只在配置/脚本里命中时才算问题。
add_pattern "Hydro 评测机默认口令" HIGH \
    'examplepassword' \
    "Hydro 独立评测机 judge.yaml 的官方默认密码，上线前必须修改（内嵌评测机无此文件，见 DEPLOY.md §6.7）" \
    '*.md'

# ---------- §69 明令禁止的实现 ----------
add_pattern "[§69] 自己写评测机（Express 判题路由）" HIGH \
    '(app|router)\.(post|put|get)\([[:space:]]*["'"'"'][^"'"'"']*(judge|submit|run)[^"'"'"']*["'"'"']' \
    "禁止自研评测：判题必须交给 Hydro 原生 + go-judge 沙箱（§1.1 §69）"

add_pattern "[§69] child_process 执行用户代码" HIGH \
    '(child_process|execSync|spawnSync|exec\()[^;]*(user|submit|code|source)' \
    "禁止用 child_process 直接跑用户提交的代码 —— 没有沙箱就是 RCE（§69）"

add_pattern "[§69] MongoDB 绑定 0.0.0.0" HIGH \
    'bind_ip[[:space:]]*[:=]?[[:space:]]*0\.0\.0\.0|0\.0\.0\.0:27017' \
    "MongoDB 绝不能监听公网（§42 §69）"

# ------------------------------------------------------------
log_step "1. 密钥 / 凭据扫描"
# ------------------------------------------------------------
TOTAL=0
i=0
while [ "$i" -lt "${#PAT_RE[@]}" ]; do
    NAME="${PAT_NAME[$i]}"; SEV="${PAT_SEV[$i]}"; RE="${PAT_RE[$i]}"; NOTE="${PAT_NOTE[$i]}"
    EXCL="${PAT_EXCL[$i]}"
    i=$((i + 1))

    MATCHES="$(grep "${GREP_OPTS[@]}" --exclude="$EXCL" -- "$RE" "$SCAN_ROOT" 2>/dev/null || true)"
    [ -n "$MATCHES" ] || continue

    printf '\n  %s[%s]%s %s\n' \
        "$([ "$SEV" = HIGH ] && echo "$C_RED" || echo "$C_YELLOW")" "$SEV" "$C_OFF" "$NAME"
    [ -n "$NOTE" ] && printf '        %s\n' "$NOTE"

    while IFS= read -r LINE; do
        [ -n "$LINE" ] || continue
        FILE="${LINE%%:*}"
        REST="${LINE#*:}"
        LN="${REST%%:*}"
        BODY="${REST#*:}"
        REL="${FILE#"$SCAN_ROOT"/}"

        # 是否已经被 git 跟踪？被跟踪 = 即将进入公开仓库，升级为 HIGH
        TRACKED="否"
        if git -C "$SCAN_ROOT" rev-parse --git-dir >/dev/null 2>&1; then
            if git -C "$SCAN_ROOT" ls-files --error-unmatch "$REL" >/dev/null 2>&1; then
                TRACKED="是"
            fi
        fi

        printf '        %s:%s  [已跟踪:%s]\n' "$REL" "$LN" "$TRACKED"
        # 命中行可能包含标点分隔的短口令，启发式打码无法保证不泄露。
        # 只输出位置和整改建议，避免扫描器把敏感值二次写入 CI/归档日志。
        printf '          命中内容已隐藏；请在受控环境检查该位置。\n'

        TOTAL=$((TOTAL + 1))
        if [ "$SEV" = HIGH ] && [ "$TRACKED" = "是" ]; then
            PK_FAIL=$((PK_FAIL + 1))
        elif [ "$SEV" = HIGH ]; then
            PK_WARN=$((PK_WARN + 1))
        fi
    done <<<"$MATCHES"
done

if [ "$TOTAL" = 0 ]; then
    pk_pass "未发现硬编码密钥 / 凭据"
else
    log_warn "共 ${TOTAL} 处命中，需要逐一确认"
fi

# ------------------------------------------------------------
log_step "2. 敏感文件是否会被提交（.gitignore 有效性）"
# ------------------------------------------------------------
MUST_IGNORE=(
    ".env"
    "*.key"
    "*.pem"
    "secrets/"
    "backup/"
    "deploy/local.env"
    "*credentials*"
)
GI="${SCAN_ROOT}/.gitignore"
if [ -f "$GI" ]; then
    MISSING=0
    for P in "${MUST_IGNORE[@]}"; do
        if grep -qF -- "$P" "$GI" 2>/dev/null; then
            qok ".gitignore 覆盖 ${P}"
        else
            log_warn ".gitignore 未覆盖 ${P}"
            MISSING=$((MISSING + 1))
        fi
    done
    [ "$MISSING" = 0 ] && PK_PASS=$((PK_PASS + 1)) || PK_WARN=$((PK_WARN + 1))
else
    pk_fail "仓库根目录没有 .gitignore —— 任何敏感文件都可能被误提交"
fi

# 已经被 git 跟踪、但看起来是敏感文件的，直接报高危
if git -C "$SCAN_ROOT" rev-parse --git-dir >/dev/null 2>&1; then
    TRACKED_SENSITIVE="$(git -C "$SCAN_ROOT" ls-files 2>/dev/null \
        | grep -E '(^|/)(\.env|.*\.key|.*\.pem|id_rsa|id_ed25519|.*credentials.*|secrets?/.*)$' || true)"
    if [ -n "$TRACKED_SENSITIVE" ]; then
        pk_fail "以下敏感文件已被 git 跟踪，必须从版本库中移除："
        printf '%s\n' "$TRACKED_SENSITIVE" | sed 's/^/          /'
        printf '        %s处理：git rm --cached <文件> 并加入 .gitignore，然后轮换该凭据%s\n' "$C_BOLD" "$C_OFF"
    else
        pk_pass "没有敏感文件被 git 跟踪"
    fi
fi

# ------------------------------------------------------------
log_step "3. §69 禁止实现复核（人工确认清单）"
# ------------------------------------------------------------
if grep "${GREP_OPTS[@]}" -- 'require\(["'"'"']express["'"'"']\)' "$SCAN_ROOT" >/dev/null 2>&1; then
    # 仓库里保留了 legacy-server，属于历史遗留，只要不被部署即可
    if [ -d "${SCAN_ROOT}/legacy-server" ]; then
        log_warn "仓库内存在 legacy-server/（旧 Express 后端）。按 §1.1 §69 它已停用，"
        log_warn "仅作历史归档保留；**上线机器上不得运行它**（见 deploy/preflight.sh 端口冲突检查）。"
    else
        pk_fail "检测到 Express 服务代码，但不在 legacy-server/ 下 —— 请确认它不是评测后端"
    fi
fi

qcat <<'EOF'
    人工确认（脚本无法判断意图）：
      [ ] 没有自研判题逻辑（提交一律进 Hydro 原生评测队列）
      [ ] 没有用 child_process / eval 执行用户提交的代码
      [ ] Judge 与 Web 之间的连接使用独立账号 + 强口令
      [ ] MongoDB 只监听 127.0.0.1（deploy/healthcheck.sh 会机器判定）
EOF

# ------------------------------------------------------------
log_step "4. 运行时敏感文件权限（在 Hydro 服务器上才有意义）"
# ------------------------------------------------------------
HYDRO_HOME="${HOME}/.hydro"
RUNTIME_FILES=("${HYDRO_HOME}/config.json" "${HYDRO_HOME}/judge.yaml" "${HYDRO_HOME}/addon.json")
FOUND=0
for F in "${RUNTIME_FILES[@]}"; do
    [ -f "$F" ] || continue
    FOUND=1
    PERM="$(stat -c '%a' "$F" 2>/dev/null || echo '?')"
    if [ "$PERM" = "600" ] || [ "$PERM" = "400" ]; then
        qok "$(basename "$F") 权限 ${PERM}"
    else
        log_warn "$(basename "$F") 权限 ${PERM} —— 建议 chmod 600（含数据库口令 / 评测机口令）"
    fi
    # 万一被误拷进仓库目录
    if [ "$SCAN_ROOT" != "/" ] && case "$F" in "$SCAN_ROOT"/*) true ;; *) false ;; esac; then
        pk_fail "$F 位于仓库目录内！必须移出并加入 .gitignore"
    fi
done
[ "$FOUND" = 0 ] && qinfo "本机没有 ~/.hydro 配置文件（说明这里不是 Hydro 服务器，或尚未安装）"

# ------------------------------------------------------------
pk_summary
# 仓库扫描可由普通开发用户执行，不写服务器状态目录。

if [ "$PK_FAIL" -gt 0 ]; then
    printf '\n%s结论：存在 %d 项高危，禁止 push / 上线。修正后重跑。%s\n' \
        "$C_RED$C_BOLD" "$PK_FAIL" "$C_OFF"
    exit 1
fi
printf '\n%s结论：无高危项。%s（警告项请人工确认后再继续）\n' "$C_GREEN$C_BOLD" "$C_OFF"
exit 0
