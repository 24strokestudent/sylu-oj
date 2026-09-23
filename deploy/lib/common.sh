#!/usr/bin/env bash
# SYLU OJ 部署脚本公共库
# 用法： source "$(dirname "$0")/lib/common.sh"
# 仅适用于 Debian/Ubuntu 系（Hydro 官方不支持 CentOS/RHEL 及变种）

# ---------- 常量 ----------
SYLU_OJ_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SYLU_STATE_DIR="${SYLU_STATE_DIR:-/root/.sylu-oj}"
SYLU_LOG_DIR="${SYLU_STATE_DIR}/logs"
HYDRO_CONFIG="${HOME}/.hydro/config.json"

# 计划 §30 品牌规范
SYLU_SITE_NAME="SYLU OJ"
SYLU_SITE_URL_DEFAULT="https://oj.example.edu.cn/"

# Hydro 官方安装脚本（见 https://hydro.js.org/docs/Hydro/install）
HYDRO_SETUP_URL="https://hydro.ac/setup.sh"
# Hydro 需要占用的端口
HYDRO_PORTS=(80 443 2019 5050 8888 27017)

# ---------- 颜色 ----------
if [ -t 1 ] && [ "${NO_COLOR:-}" = "" ]; then
    C_RED=$'\033[31m'; C_GREEN=$'\033[32m'; C_YELLOW=$'\033[33m'
    C_BLUE=$'\033[34m'; C_BOLD=$'\033[1m'; C_OFF=$'\033[0m'
else
    C_RED=''; C_GREEN=''; C_YELLOW=''; C_BLUE=''; C_BOLD=''; C_OFF=''
fi

# ---------- 计数 ----------
PK_PASS=0
PK_WARN=0
PK_FAIL=0

# ---------- 输出 ----------
log_step() { printf '\n%s==> %s%s\n' "$C_BOLD$C_BLUE" "$*" "$C_OFF"; }
log_info() { printf '    %s\n' "$*"; }
log_ok()   { printf '    %s[ OK ]%s %s\n' "$C_GREEN" "$C_OFF" "$*"; }
log_warn() { printf '    %s[WARN]%s %s\n' "$C_YELLOW" "$C_OFF" "$*"; }
log_err()  { printf '    %s[FAIL]%s %s\n' "$C_RED" "$C_OFF" "$*" >&2; }
die()      { log_err "$*"; exit 1; }

# 体检项
pk_pass() { PK_PASS=$((PK_PASS + 1)); log_ok  "$1"; }
pk_warn() { PK_WARN=$((PK_WARN + 1)); log_warn "$1"; }
pk_fail() { PK_FAIL=$((PK_FAIL + 1)); log_err "$1"; }

pk_summary() {
    printf '\n%s—— 检查汇总 ——%s\n' "$C_BOLD" "$C_OFF"
    printf '    通过 %s%d%s    警告 %s%d%s    失败 %s%d%s\n' \
        "$C_GREEN" "$PK_PASS" "$C_OFF" "$C_YELLOW" "$PK_WARN" "$C_OFF" "$C_RED" "$PK_FAIL" "$C_OFF"
}

# ---------- 前置条件 ----------
require_root() {
    [ "$(id -u)" -eq 0 ] || die "必须使用 root 运行（先执行 sudo -i）。Hydro 的安装与全部后续操作都要求 root。"
}

require_cmd() {
    command -v "$1" >/dev/null 2>&1 || die "缺少命令：$1（$2）"
}

# 已装则用，未装则提示自动安装命令
ensure_cmd() {
    local cmd="$1" pkg="${2:-$1}" why="${3:-}"
    if command -v "$cmd" >/dev/null 2>&1; then return 0; fi
    log_warn "缺少 $cmd${why:+（$why）}，尝试安装 $pkg ..."
    if command -v apt-get >/dev/null 2>&1; then
        DEBIAN_FRONTEND=noninteractive apt-get install -y "$pkg" >/dev/null 2>&1 || true
    fi
    command -v "$cmd" >/dev/null 2>&1 || die "无法自动安装 $cmd，请手动：apt-get install -y $pkg"
}

ensure_state_dir() {
    mkdir -p "$SYLU_LOG_DIR"
    chmod 700 "$SYLU_STATE_DIR"
}

# 官方 setup.sh 用 Nix 提供 node/yarn/pm2/hydrooj 等命令（装在 $HOME/.nix-profile）。
# 非交互式 shell 常常没有 source /etc/profile，这里主动把 nix profile 补进 PATH。
ensure_nix_path() {
    local p="${HOME}/.nix-profile/bin"
    case ":${PATH}:" in
        *":${p}:"*) ;;
        *) [ -d "$p" ] && export PATH="${p}:${PATH}" ;;
    esac
    if ! command -v hydrooj >/dev/null 2>&1; then
        local ygd
        ygd="$(yarn_global_dir 2>/dev/null || true)"
        if [ -n "$ygd" ] && [ -d "${ygd}/node_modules/.bin" ]; then
            export PATH="${ygd}/node_modules/.bin:${PATH}"
            # 官方以 yarn global add 安装，bin 软链在 yarn global 的 .bin 下
            [ -d "${ygd}/node_modules/hydrooj/bin" ] && export HYDROJS_BIN="${ygd}/node_modules/hydrooj/bin"
        fi
    fi
    return 0
}

# hydrooj CLI 是否存在（Hydro 安装后可用）
has_hydro_cli() {
    ensure_nix_path
    command -v hydrooj >/dev/null 2>&1
}

require_hydro_cli() {
    has_hydro_cli || die "未找到 hydrooj 命令。Hydro 尚未安装，请先执行 deploy/install-hydro.sh。"
}

# 在 Hydro 服务器上执行 CWD 必须是可写目录（hydrooj backup 会把 zip 落在当前目录）
cd_safe_workdir() {
    local d="${1:-$SYLU_STATE_DIR/work}"
    mkdir -p "$d"
    cd "$d" || die "无法进入工作目录 $d"
}

# ---------- 交互 ----------
confirm() {
    local prompt="$1" answer
    if [ "${SYLU_ASSUME_YES:-0}" = "1" ]; then
        log_info "（--yes）自动确认：$prompt"
        return 0
    fi
    printf '%s%s%s [y/N] ' "$C_YELLOW" "$prompt" "$C_OFF"
    read -r answer </dev/tty || answer=""
    case "$answer" in
        y | Y | yes | YES) return 0 ;;
        *) return 1 ;;
    esac
}

# ---------- 记录 ----------
# 追加一条运行记录，便于 §47 升级/回滚时追溯
record_note() {
    ensure_state_dir
    printf '%s\t%s\n' "$(date '+%Y-%m-%dT%H:%M:%S%z')" "$*" >>"${SYLU_STATE_DIR}/history.log"
}

# 记录当前版本快照（供 rollback 使用）
# 注意：所有探测都加 timeout，避免某个命令卡住把整个部署流程挂死。
snapshot_versions() {
    ensure_state_dir
    ensure_nix_path
    local f="${SYLU_STATE_DIR}/versions-$(date '+%Y%m%d-%H%M%S').env"
    local v_hydro v_ui v_judge v_fps v_a11y
    v_hydro="$(hydro_version 2>/dev/null || echo none)"
    v_ui="$(hydro_pkg_version @hydrooj/ui-default 2>/dev/null || echo none)"
    v_judge="$(hydro_pkg_version @hydrooj/hydrojudge 2>/dev/null || echo none)"
    v_fps="$(hydro_pkg_version @hydrooj/fps-importer 2>/dev/null || echo none)"
    v_a11y="$(hydro_pkg_version @hydrooj/a11y 2>/dev/null || echo none)"
    {
        echo "HYDRO_SNAPSHOT_FORMAT=1"
        echo "RECORDED_AT=$(date '+%Y-%m-%dT%H:%M:%S%z')"
        echo "OS=$(. /etc/os-release 2>/dev/null && echo "${PRETTY_NAME:-unknown}")"
        echo "KERNEL=$(uname -r)"
        echo "ARCH=$(uname -m)"
        echo "NODE=$(timeout 10 node -v 2>/dev/null || echo none)"
        echo "NPM=$(timeout 10 npm -v 2>/dev/null || echo none)"
        echo "YARN=$(timeout 10 yarn --version 2>/dev/null || echo none)"
        echo "HYDROOJ=$v_hydro"
        echo "HYDRO_UI=$v_ui"
        echo "HYDRO_JUDGE=$v_judge"
        echo "HYDRO_FPS_IMPORTER=$v_fps"
        echo "HYDRO_A11Y=$v_a11y"
        echo "HYDRO_UI_ENABLED=$([ "$v_ui" != none ] && echo 1 || echo 0)"
        echo "HYDRO_JUDGE_ENABLED=$([ "$v_judge" != none ] && echo 1 || echo 0)"
        echo "HYDRO_FPS_IMPORTER_ENABLED=$([ "$v_fps" != none ] && echo 1 || echo 0)"
        echo "HYDRO_A11Y_ENABLED=$([ "$v_a11y" != none ] && echo 1 || echo 0)"
        echo "MONGOD=$(timeout 20 mongod --version 2>/dev/null | head -1 || echo none)"
        echo "MONGOSH=$(timeout 20 mongosh --version 2>/dev/null | head -1 || echo none)"
        echo "HYDRO_SANDBOX=$(timeout 10 go-judge --version 2>/dev/null | head -1 || echo none)"
        echo "PM2=$(timeout 20 pm2 --version 2>/dev/null || echo none)"
        echo "CADDY=$(timeout 10 caddy version 2>/dev/null | head -1 || echo none)"
        echo "DB_VER=$(hydro_db_ver 2>/dev/null || echo none)"
    } >"$f"
    ln -sfn "$f" "${SYLU_STATE_DIR}/versions-latest.env"
    printf '%s\n' "$f"
}

latest_snapshot() {
    [ -f "${SYLU_STATE_DIR}/versions-latest.env" ] || return 1
    readlink -f "${SYLU_STATE_DIR}/versions-latest.env"
}

# 读取 Hydro 数据库连接串（用于只读诊断，脚本不直接写库；见计划 §56）
hydro_mongo_uri() {
    [ -f "$HYDRO_CONFIG" ] || return 1
    node -e '
        const fs = require("fs");
        const o = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
        if (o.url || o.uri) { console.log(o.url || o.uri); process.exit(0); }
        let u = (o.protocol || "mongodb") + "://";
        if (o.username) u += o.username + ":" + o.password + "@";
        u += o.host + ":" + o.port + "/" + o.name;
        console.log(u);
    ' "$HYDRO_CONFIG" 2>/dev/null
}

# ---------- Hydro 运行时探测 ----------

# Hydro 服务名（安装脚本可能用 systemd unit 或 pm2，两者都探测）
hydro_service_active() {
    if command -v systemctl >/dev/null 2>&1; then
        for U in hydro hydrooj; do
            if systemctl list-unit-files 2>/dev/null | grep -q "^${U}\.service"; then
                if systemctl is-active --quiet "$U"; then
                    echo "systemd:${U}:active"
                else
                    echo "systemd:${U}:inactive"
                fi
                return 0
            fi
        done
    fi
    if command -v pm2 >/dev/null 2>&1; then
        if pm2 jlist 2>/dev/null | grep -q '"name":"hydrooj"'; then
            local st
            st="$(pm2 jlist 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const a=JSON.parse(s);const p=a.find(x=>x.name==="hydrooj");console.log(p&&p.pm2_env?p.pm2_env.status:"unknown")}catch(e){console.log("unknown")}})')"
            echo "pm2:hydrooj:${st}"
            return 0
        fi
    fi
    echo "none:-:unknown"
    return 1
}

# 输出 Hydro 各组件版本（JSON），失败返回非 0
# 注意：`hydrooj cli <...>` 是**非交互**子命令，不会挂；但仍加 timeout 兜底，
# 避免 CLI 内部等锁/连不上库时把调用方一起拖住。
hydro_versions_json() {
    has_hydro_cli || return 1
    timeout 60 hydrooj cli execute "return global.Hydro.version" 2>/dev/null || return 1
}

# HTTP 探活：返回状态码
# 注意：curl 连接失败时会把 "000" 写进 -w 的输出，如果这里再 `|| echo 000`，
# 就会拼成 "000000"，看起来像个诡异的错误码。所以只兜底"完全没输出"的情况。
hydro_http_probe() {
    local url="${1:-http://127.0.0.1:8888/}" code
    code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$url" 2>/dev/null || true)"
    [ -n "$code" ] || code="000"
    printf '%s\n' "$code"
}

# ---------- 版本与升级所需信息 ----------

# 官方 setup.sh 安装的包全集（见 https://hydro.ac/setup.sh 内嵌载荷）
# 升级必须整组一起动，只升 hydrooj 会出现 ui/judge 版本错配。
SYLU_HYDRO_PKGS="hydrooj @hydrooj/ui-default @hydrooj/hydrojudge @hydrooj/fps-importer @hydrooj/a11y"

# 发行版本按包管理。latest 使用包管理器解析一组最新版本；指定版本必须提供
# `SYLU_RELEASE_MANIFEST`，每行形如 `包名=版本`，禁止把核心版本广播给所有组件。
hydro_release_specs() {
    local target="$1" with_judge="${2:-0}" core_only="${3:-0}" manifest="${SYLU_RELEASE_MANIFEST:-}"
    local packages="hydrooj @hydrooj/ui-default @hydrooj/fps-importer @hydrooj/a11y"
    [ "$core_only" = 1 ] && packages="hydrooj"
    [ "$with_judge" = 1 ] && packages="$packages @hydrooj/hydrojudge"
    if [ "$target" = latest ]; then
        printf '%s\n' $packages
        return 0
    fi
    [[ "$target" =~ ^[0-9]+\.[0-9]+\.[0-9]+([-.+][0-9A-Za-z.-]+)?$ ]] || return 4
    [ -n "$manifest" ] && [ -f "$manifest" ] || return 2
    local package version
    for package in $packages; do
        version="$(awk -F= -v p="$package" '$1 == p {print $2; exit}' "$manifest" | tr -d '\r[:space:]')"
        [ -n "$version" ] || return 3
        [[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+([-.+][0-9A-Za-z.-]+)?$ ]] || return 5
        # --to 表示 Hydro 核心目标版本；清单若核心版本不同，整组安装会
        # 形成“参数与实际发行集合不一致”的假回滚，必须在下载前拒绝。
        if [ "$package" = hydrooj ] && [ "$version" != "$target" ]; then
            return 6
        fi
        printf '%s@%s\n' "$package" "$version"
    done
}

hydro_release_specs_from_snapshot() {
    local snapshot="$1" with_judge="${2:-0}" core_only="${3:-0}" package key version
    local packages="hydrooj @hydrooj/ui-default @hydrooj/fps-importer @hydrooj/a11y"
    [ "$core_only" = 1 ] && packages="hydrooj"
    [ "$with_judge" = 1 ] && packages="$packages @hydrooj/hydrojudge"
    [ -f "$snapshot" ] || return 1
    for package in $packages; do
        case "$package" in
            hydrooj) key=HYDROOJ ;;
            @hydrooj/ui-default) key=HYDRO_UI ;;
            @hydrooj/hydrojudge) key=HYDRO_JUDGE ;;
            @hydrooj/fps-importer) key=HYDRO_FPS_IMPORTER ;;
            @hydrooj/a11y) key=HYDRO_A11Y ;;
        esac
        version="$(awk -F= -v k="$key" '$1 == k {print $2; exit}' "$snapshot" | tr -d '\r[:space:]')"
        [ -n "$version" ] && [ "$version" != none ] || return 2
        printf '%s@%s\n' "$package" "$version"
    done
}

# 读取备份恢复集合中的严格版本快照。新格式必须声明所有组件及启用状态，
# 禁止把缺失字段或 latest 当成“可用的完整发行集合”。
hydro_release_specs_from_backup_snapshot() {
    local snapshot="$1" key enabled version package SPEC SPEC_REST
    [ -f "$snapshot" ] || return 1
    [ "$(awk -F= '$1 == "HYDRO_SNAPSHOT_FORMAT" {print $2; exit}' "$snapshot" | tr -d '\r[:space:]')" = 1 ] || return 2
    version="$(awk -F= '$1 == "HYDROOJ" {print $2; exit}' "$snapshot" | tr -d '\r[:space:]')"
    [[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+([-.+][0-9A-Za-z.-]+)?$ ]] || return 3
    printf 'hydrooj@%s\n' "$version"
    for SPEC in \
        '@hydrooj/ui-default HYDRO_UI HYDRO_UI_ENABLED' \
        '@hydrooj/fps-importer HYDRO_FPS_IMPORTER HYDRO_FPS_IMPORTER_ENABLED' \
        '@hydrooj/a11y HYDRO_A11Y HYDRO_A11Y_ENABLED' \
        '@hydrooj/hydrojudge HYDRO_JUDGE HYDRO_JUDGE_ENABLED'; do
        package="${SPEC%% *}"; SPEC_REST="${SPEC#* }"; key="${SPEC_REST%% *}"; enabled="${SPEC_REST##* }"
        version="$(awk -F= -v k="$key" '$1 == k {print $2; exit}' "$snapshot" | tr -d '\r[:space:]')"
        case "$(awk -F= -v k="$enabled" '$1 == k {print $2; exit}' "$snapshot" | tr -d '\r[:space:]')" in
            0) [ "$version" = none ] || return 4 ;;
            1)
                [[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+([-.+][0-9A-Za-z.-]+)?$ ]] || return 5
                printf '%s@%s\n' "$package" "$version"
                ;;
            *) return 6 ;;
        esac
    done
}

# 读取某个 yarn global 包的版本号。
# 为什么不用 `hydrooj --version`：hydrooj CLI **没有** --version 这个选项，
# 传进去会被当成子命令解析失败，随后掉进交互式 REPL 等 stdin；
# 在非交互脚本里表现为**永久挂起**（被 timeout 杀掉，退出码 124），
# 会把整个部署流程卡死。唯一可靠的取法：直接读该包的 package.json。
hydro_pkg_version() {
    has_hydro_cli || return 1
    local ygd
    ygd="$(yarn_global_dir 2>/dev/null || true)"
    [ -n "$ygd" ] || return 1
    local v=""
    v="$(timeout 20 node -p "require('${ygd}/node_modules/${1}/package.json').version" 2>/dev/null | tr -d '\r' | head -1)" || true
    [ -n "$v" ] || return 1
    printf '%s\n' "$v"
}

hydro_version() {
    hydro_pkg_version hydrooj
}

# 数据库版本标记 db.ver（见 packages/hydrooj/src/service/migration.ts）
# 升级时 Hydro 会把可用的迁移脚本数量写进 db.ver。
# 关键结论：**db.ver 一旦变大，就说明数据库已经迁移过了。**
# 此时只回滚代码是危险的 —— 旧版本启动时看到 db.ver > expected 会直接
# 以 "You are likely trying to apply a downgrade" 阻断启动（除非 --ignore-version）。
#
# 【踩坑记录】hydrooj CLI 的输出去噪非常麻烦，实测格式：
#     Process 45781 running as master          <-- 行首数字是 PID
#     Using mongodb external event bus
#     20 19:51:02   common [I] Locale init: …
#     20 19:51:02 settings [I] Successfully loaded config
#     …
#     97                                        <-- 这才是 system get db.ver 的真正结果
# 每行日志的"行首 20"非常容易被误当成 db.ver（实际它只是个日志前缀，与 db.ver 无关）；
# 而 head -1 抠数字会抓到 PID。真正的返回值是**唯一一行纯数字行**。
# 所以这里首选直连 MongoDB 只读查询（结果权威、无噪声），CLI 仅作兜底。
# 注：URI 会以参数形式出现在 mongosh 的进程命令行里 —— 该机仅 root 可登录，可接受。
hydro_db_ver() {
    local uri v
    uri="$(hydro_mongo_uri 2>/dev/null || true)"
    if [ -n "$uri" ] && command -v mongosh >/dev/null 2>&1; then
        v="$(timeout 40 mongosh "$uri" --quiet \
            --eval 'JSON.stringify((db.system.findOne({_id:"db.ver"})||{}).value)' 2>/dev/null \
            | tr -d '\r" ' | tail -1 || true)"
        case "$v" in '' | *undefined* | *null*) v="" ;; esac
        if [ -n "$v" ]; then printf '%s\n' "$v"; return 0; fi
    fi
    has_hydro_cli || return 1
    v="$(timeout 40 hydrooj cli system get db.ver 2>/dev/null | tr -d '\r' | grep -xE '[0-9]+' | tail -1 || true)"
    [ -n "$v" ] || return 1
    printf '%s\n' "$v"
}

# ---------- 系统设置读写（走官方 CLI，不直接写库） ----------
# Hydro 的 CLI 分发规则（见 packages/hydrooj/src/entry/cli.ts）：
#     hydrooj cli <modelName> <func> [args...]   ->   global.Hydro.model[modelName][func](...args)
# 所以：
#     hydrooj cli system get <key>          ->  model.system.get(key)
#     hydrooj cli system set <key> <value>  ->  model.system.set(key, value, broadcast=true)
# 这条路与控制面板「系统设置」是同一条代码路径 —— 属于官方接口（§56），
# 比直接改 MongoDB 的 system 文档安全，也不会被后续迁移覆盖。
#
# 输出解析的坑：CLI 会把日志混在 stdout 里，且每行日志带 "<序号> <时间>" 前缀。
# 系统设置允许多行 Markdown/YAML，不能只取最后一行，否则中间行变化会被静默跳过。
HYDRO_LOG_NOISE='^([0-9]+ [0-9]{2}:[0-9]{2}:[0-9]{2}|Process [0-9]+ running as master|Using mongodb external event bus|Module require)'

hydro_sys_get() {
    has_hydro_cli || return 1
    local key="$1" out
    out="$(timeout 60 hydrooj cli system get "$key" 2>/dev/null | tr -d '\r' \
        | grep -vE "$HYDRO_LOG_NOISE" || true)"
    # 命令替换会去掉末尾换行，但保留设置正文的全部行。
    [ -n "$out" ] || return 1
    printf '%s' "$out"
}

hydro_sys_set() {
    has_hydro_cli || return 1
    local key="$1" value="$2"
    # broadcast 默认 true，会把变更广播给已启动的 worker
    timeout 90 hydrooj cli system set "$key" "$value" >/dev/null 2>&1
}

# ---------- pm2（官方安装用 pm2 托管 hydrooj / hydrojudge / mongodb / caddy） ----------
pm2_has() {
    command -v pm2 >/dev/null 2>&1 || return 1
    pm2 jlist 2>/dev/null | grep -q "\"name\":\"$1\"" || return 1
}

# 重启 Hydro 进程（优先 pm2，兼容 systemd）
hydro_restart() {
    local name="${1:-hydrooj}"
    ensure_nix_path
    if pm2_has "$name"; then
        pm2 restart "$name" >/dev/null 2>&1 && return 0
    fi
    if command -v systemctl >/dev/null 2>&1 \
        && systemctl list-unit-files 2>/dev/null | grep -q "^${name}\.service"; then
        systemctl restart "$name" && return 0
    fi
    return 1
}

# 进入恢复/升级维护态时停止服务，防止恢复数据库期间继续写入。
hydro_stop() {
    local name="${1:-hydrooj}"
    ensure_nix_path
    if pm2_has "$name"; then
        pm2 stop "$name" >/dev/null 2>&1
        return $?
    fi
    if command -v systemctl >/dev/null 2>&1 \
        && systemctl list-unit-files 2>/dev/null | grep -q "^${name}\.service"; then
        systemctl stop "$name"
        return $?
    fi
    return 1
}

# 返回服务的托管与运行状态：pm2:running、systemd:stopped、absent 等。
# 恢复流程需要区分“本机没有独立 Judge 服务”和“Judge 原本在运行但没停下来”。
hydro_service_state() {
    local name="${1:-hydrooj}" status
    ensure_nix_path
    if pm2_has "$name"; then
        status="$(pm2 jlist 2>/dev/null | node -e '
            let s = "";
            process.stdin.on("data", d => { s += d; }).on("end", () => {
                try {
                    const a = JSON.parse(s);
                    const p = a.find(x => x.name === process.argv[1]);
                    process.stdout.write(p && p.pm2_env ? String(p.pm2_env.status || "unknown") : "unknown");
                } catch (_) { process.stdout.write("unknown"); }
            });
        ' "$name" 2>/dev/null || true)"
        printf 'pm2:%s\n' "${status:-unknown}"
        return 0
    fi
    if command -v systemctl >/dev/null 2>&1 \
        && systemctl list-unit-files 2>/dev/null | grep -q "^${name}\.service"; then
        status="$(systemctl show -p ActiveState --value "$name" 2>/dev/null || true)"
        case "$status" in
            active|activating) printf 'systemd:running\n' ;;
            deactivating) printf 'systemd:stopping\n' ;;
            inactive|failed|degraded|'') printf 'systemd:stopped\n' ;;
            *) printf 'systemd:unknown\n' ;;
        esac
        return 0
    fi
    printf 'absent\n'
}

# ---------- yarn global（官方用 yarn global add 安装 Hydro） ----------
yarn_global_dir() {
    command -v yarn >/dev/null 2>&1 || return 1
    local d
    d="$(yarn global dir 2>/dev/null | tr -d '\r' | tail -1)"
    [ -n "$d" ] || return 1
    printf '%s\n' "$d"
}

# 官方安装脚本为绕过 esbuild 的跨平台二进制依赖，会在 yarn global 的 package.json
# 里写入 resolutions（把非本平台的 esbuild 包指向 /dev/null）。
# 重新 yarn global add 时必须同样处理，否则安装会变慢甚至失败。
esbuild_resolutions_on() {
    local dir="${1:-$(yarn_global_dir || true)}"
    [ -n "$dir" ] || return 1
    ensure_nix_path
    command -v node >/dev/null 2>&1 || return 1
    mkdir -p "$dir"
    SYLU_YGD="$dir" node -e '
const fs = require("fs");
const path = require("path");
const dir = process.env.SYLU_YGD;
const f = path.join(dir, "package.json");
let pkg = {};
if (fs.existsSync(f)) { try { pkg = JSON.parse(fs.readFileSync(f, "utf8")); } catch (e) { pkg = {}; } }
pkg.resolutions = pkg.resolutions || {};
const names = [
  "@esbuild/linux-loong64", "esbuild-windows-32",
  ...["android", "darwin", "freebsd", "windows"].flatMap((o) => [`${o}-64`, `${o}-arm64`]).map((o) => `esbuild-${o}`),
  ...["32", "arm", "mips64", "ppc64", "riscv64", "s390x"].map((o) => `esbuild-linux-${o}`),
  ...["netbsd", "openbsd", "sunos"].map((o) => `esbuild-${o}-64`),
];
for (const n of names) pkg.resolutions[n] = "link:/dev/null";
fs.writeFileSync(f, JSON.stringify(pkg, null, 2));
'
}

esbuild_resolutions_off() {
    local dir="${1:-$(yarn_global_dir || true)}"
    [ -n "$dir" ] || return 0
    [ -f "${dir}/package.json" ] || return 0
    ensure_nix_path
    command -v node >/dev/null 2>&1 || return 0
    SYLU_YGD="$dir" node -e '
const fs = require("fs");
const path = require("path");
const f = path.join(process.env.SYLU_YGD, "package.json");
try {
  const pkg = JSON.parse(fs.readFileSync(f, "utf8"));
  delete pkg.resolutions;
  fs.writeFileSync(f, JSON.stringify(pkg, null, 2));
} catch (e) { /* 非致命 */ }
' || true
    return 0
}

# 检查 MongoDB 是否只监听本机（计划 §42 硬性要求）
mongo_bind_ok() {
    command -v ss >/dev/null 2>&1 || return 2
    local addrs
    addrs="$(ss -H -ltn 2>/dev/null | awk '$4 ~ /:27017$/ {print $4}')"
    [ -n "$addrs" ] || return 1
    local bad
    bad="$(printf '%s\n' "$addrs" | grep -vE '^(127\.0\.0\.1|\[::1\]|::1):27017$' || true)"
    [ -z "$bad" ] && return 0 || return 1
}

banner() {
    printf '%s' "$C_BOLD"
    cat <<EOF
 __  _  _ _   _   _    ___   _
/ _)(_)(_| | | | | |  / _ \ | |
\__) _) | |_| | |_| | | (_) ||_|
   |_|   SYLU OJ · 在线程序设计与评测平台
  $1
  $2
EOF
    printf '%s' "$C_OFF"
    echo
}
