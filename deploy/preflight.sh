#!/usr/bin/env bash
# SYLU OJ 部署前体检（对应实施计划 §5、§4）
#
# 目的：在动服务器之前，把所有"会把你坑掉"的条件先查清楚。
# 原则：任何关键项不通过就明确报错退出，绝不自动破坏已有服务。
#
# 用法：
#   bash deploy/preflight.sh --domain oj.example.edu.cn
#   bash deploy/preflight.sh --domain oj.example.edu.cn --expect-ip 1.2.3.4
#   bash deploy/preflight.sh                 # 只做本机检查，跳过 DNS
#
# 退出码：0 = 全部通过（可能含 WARN）；1 = 存在 FAIL

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
. "${SCRIPT_DIR}/lib/common.sh"

DOMAIN=""
EXPECT_IP=""
MIN_DISK_GB=20
MIN_MEM_MB=3800
MIN_CORES=2
IGNORE_FAILURES=0

usage() {
    sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'
}

while [ $# -gt 0 ]; do
    case "$1" in
        --domain) DOMAIN="${2:-}"; shift 2 ;;
        --expect-ip) EXPECT_IP="${2:-}"; shift 2 ;;
        --min-disk-gb) MIN_DISK_GB="${2:-}"; shift 2 ;;
        --min-mem-mb) MIN_MEM_MB="${2:-}"; shift 2 ;;
        --min-cores) MIN_CORES="${2:-}"; shift 2 ;;
        --ignore-failures) IGNORE_FAILURES=1; shift ;;
        -h | --help) usage; exit 0 ;;
        *) die "未知参数：$1（用 --help 查看用法）" ;;
    esac
done

banner "部署前体检 preflight" "只读检查，不会修改任何现有服务"

require_root

# ============================================================
log_step "1/15 操作系统"
# ============================================================
if [ -r /etc/os-release ]; then
    # shellcheck disable=SC1091
    . /etc/os-release
    OS_ID="${ID:-unknown}"
    OS_NAME="${PRETTY_NAME:-$OS_ID}"
    case "$OS_ID" in
        debian | ubuntu | alpine)
            case "$OS_ID" in
                debian)
                    case "${VERSION_ID:-}" in
                        11 | 12 | 13) pk_pass "$OS_NAME（官方推荐范围）" ;;
                        *) pk_warn "$OS_NAME — 官方推荐 Debian 12 / Debian 11 / Ubuntu 22.04" ;;
                    esac
                    ;;
                *) pk_warn "$OS_NAME — 可运行，但官方推荐 Debian 12 / Debian 11 / Ubuntu 22.04" ;;
            esac
            ;;
        centos | rhel | rocky | almalinux | alinux | tencentos | opencloudos | fedora | anolis)
            pk_fail "$OS_NAME — Hydro 官方明确不支持 RHEL 系及其变种（CentOS/Alibaba Cloud Linux/TencentOS/OpenCloudOS），请重装为 Debian 12"
            ;;
        *)
            pk_warn "$OS_NAME — 未在官方验证列表中，建议 Debian 12"
            ;;
    esac
else
    pk_fail "无法读取 /etc/os-release，无法确认发行版"
fi

if command -v systemctl >/dev/null 2>&1; then
    pk_pass "systemd 可用"
else
    pk_fail "未检测到 systemd；Hydro 安装脚本依赖 systemd 管理服务"
fi

# ============================================================
log_step "2/15 CPU 架构"
# ============================================================
ARCH="$(uname -m)"
case "$ARCH" in
    x86_64) pk_pass "x86_64" ;;
    aarch64 | arm64) pk_warn "$ARCH — 可运行但非主推架构，部分预编译组件可能缺包" ;;
    *) pk_fail "$ARCH — 计划要求 x86_64" ;;
esac

# Hydro 的 MongoDB 依赖 avx 指令集，虚拟机常默认关闭
if [ -r /proc/cpuinfo ]; then
    # 注意：不要写 `grep -mw1`，-m 的取值必须是纯数字，`-mw1` 会报
    # "grep: invalid max count" 并把检查误判为 FAIL。
    # 这里也不需要 -w：支持 avx2/avx512 的 CPU 一定支持 avx，
    # 而任何含 "avx" 子串的 flag 都说明有 avx 能力。
    if grep -q avx /proc/cpuinfo; then
        pk_pass "CPU 支持 avx 指令集"
    else
        pk_fail "CPU 未暴露 avx 指令集（虚拟机请开启 avx 透传），MongoDB 可能无法启动"
    fi
fi

# ============================================================
log_step "3/15 CPU 核数"
# ============================================================
CORES="$(nproc 2>/dev/null || echo 0)"
if [ "$CORES" -ge "$MIN_CORES" ]; then
    pk_pass "${CORES} 核（要求 ≥ ${MIN_CORES}）"
elif [ "$CORES" -ge 1 ]; then
    pk_warn "${CORES} 核 — 低于计划的 ${MIN_CORES} 核，多人同时提交时评测排队会明显"
else
    pk_fail "无法获取 CPU 核数"
fi

# ============================================================
log_step "4/15 内存"
# ============================================================
MEM_MB="$(awk '/^MemTotal:/ {printf "%d", $2/1024}' /proc/meminfo 2>/dev/null || echo 0)"
if [ "$MEM_MB" -ge "$MIN_MEM_MB" ]; then
    pk_pass "${MEM_MB} MB（计划建议 8 GB，最低试运行 4 GB）"
elif [ "$MEM_MB" -ge 1900 ]; then
    pk_warn "${MEM_MB} MB — 低于计划的 4 GB；可试运行但正式多人提交需要关注内存与 Judge 压力"
else
    pk_fail "${MEM_MB} MB — 低于 Hydro 官方最低要求 2 GB"
fi

# ============================================================
log_step "5/15 Swap"
# ============================================================
SWAP_MB="$(awk '/^SwapTotal:/ {printf "%d", $2/1024}' /proc/meminfo 2>/dev/null || echo 0)"
if [ "$SWAP_MB" -gt 0 ]; then
    pk_pass "Swap ${SWAP_MB} MB"
elif [ "$MEM_MB" -ge 3800 ]; then
    pk_warn "未启用 Swap — 内存虽够，但建议 2 GB Swap 兜底编译峰值"
else
    pk_fail "未启用 Swap 且内存 < 4 GB，编译大文件时容易被 OOM Killer 杀掉"
fi

# ============================================================
log_step "6/15 磁盘空间与挂载"
# ============================================================
DISK_OK=1
for MNT in / /data; do
    if [ -d "$MNT" ]; then
        AVAIL_GB="$(df -Pk "$MNT" 2>/dev/null | awk 'NR==2 {printf "%d", $4/1024/1024}')"
        AVAIL_GB="${AVAIL_GB:-0}"
        if [ "$MNT" = "/" ]; then
            if [ "$AVAIL_GB" -ge "$MIN_DISK_GB" ]; then
                pk_pass "/ 可用 ${AVAIL_GB} GB（要求 ≥ ${MIN_DISK_GB} GB）"
            else
                pk_fail "/ 可用仅 ${AVAIL_GB} GB — 判题数据与日志会持续增长，计划要求 ≥ 80 GB，最低 ${MIN_DISK_GB} GB"
                DISK_OK=0
            fi
        else
            pk_pass "/data 可用 ${AVAIL_GB} GB（Hydr 文件存储与备份中转目录）"
        fi
    elif [ "$MNT" = "/data" ]; then
        pk_warn "未发现 /data 目录 — Hydro 的文件存储默认落在 /data，建议单独挂载数据盘（计划 §45/§52）"
    fi
done
# inode 也要看，判题会产生大量小文件
INODE_USE="$(df -Pi / 2>/dev/null | awk 'NR==2 {gsub("%","",$5); print $5}')"
if [ "${INODE_USE:-0}" -ge 90 ]; then
    pk_fail "/ inode 已用 ${INODE_USE}%"
else
    pk_pass "/ inode 已用 ${INODE_USE:-?}%"
fi
[ "$DISK_OK" = 1 ] || true

# ============================================================
log_step "7/15 端口占用（Hydro 需要 80 443 2019 5050 8888 27017）"
# ============================================================
if command -v ss >/dev/null 2>&1; then
    LISTEN="$(ss -H -ltn 2>/dev/null | awk '{print $4}' || true)"
    for P in "${HYDRO_PORTS[@]}"; do
        if printf '%s\n' "$LISTEN" | grep -qE "[:.]${P}$"; then
            if [ "$P" = "8888" ] || [ "$P" = "27017" ]; then
                pk_fail "端口 ${P} 已被占用 — 这是 Hydro/${P/27017/MongoDB} 的必需端口，请先停止冲突服务"
            else
                pk_fail "端口 ${P} 已被占用 — Hydro 安装脚本需要该端口空闲"
            fi
        else
            pk_pass "端口 ${P} 空闲"
        fi
    done
else
    pk_warn "未找到 ss 命令（net-tools/iproute2），跳过端口检查：apt-get install -y iproute2"
fi

# 公网端口 80/443 说明
log_info "提示：云服务商安全组/防火墙还需单独放行 80、443（阿里云/腾讯云搜「放行80端口」）"
if [ -n "${GATEWAY_EXT_IF:-}" ]; then :; fi
if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q "Status: active"; then
    log_info "检测到 ufw 已启用，当前规则："
    ufw status 2>/dev/null | sed 's/^/        /' || true
fi

# ============================================================
log_step "8/15 已有服务冲突"
# ============================================================
if command -v systemctl >/dev/null 2>&1; then
    for SVC in mongod nginx apache2 httpd mysql; do
        if systemctl is-active --quiet "$SVC" 2>/dev/null; then
            case "$SVC" in
                mongod)
                    pk_fail "已运行 mongod 服务 — Hydro 安装脚本会安装并配置自己的 MongoDB，请先停用：systemctl disable --now mongod" ;;
                nginx | apache2 | httpd)
                    pk_warn "已运行 $SVC — Hydro 安装脚本默认用 Caddy 接管 80/443；如需保留请在安装时选择不配置反向代理（--no-caddy）后自行配置" ;;
                mysql)
                    pk_warn "已运行 mysql — 与 Hydro 无冲突，但注意内存占用" ;;
            esac
        fi
    done
    pk_pass "已扫描 mongod/nginx/apache2/httpd/mysql 服务状态"
fi

if [ -d "$HOME/.hydro" ]; then
    pk_warn "已存在 $HOME/.hydro — 疑似装过 Hydro。若确认要重装，请先备份（见 deploy/backup.sh）"
else
    pk_pass "未发现既有 Hydro 数据目录 $HOME/.hydro"
fi

if has_hydro_cli; then
    pk_warn "已存在 hydrooj 命令：$(hydro_version 2>/dev/null || echo '版本未知')"
else
    pk_pass "未发现既有 hydrooj 命令"
fi

if command -v pm2 >/dev/null 2>&1; then
    if pm2 list 2>/dev/null | grep -q hydrooj; then
        pk_fail "pm2 中已有 hydrooj 进程在运行 — 再次安装会造成端口/数据冲突，请先 pm2 stop hydrooj"
    else
        pk_pass "pm2 已安装且无 hydrooj 进程"
    fi
else
    pk_pass "未安装 pm2（Hydro 安装脚本会自行处理）"
fi

# ============================================================
log_step "9/15 已有 Node 运行环境"
# ============================================================
if command -v node >/dev/null 2>&1; then
    NODE_V="$(node -v)"
    NODE_MAJOR="$(printf '%s' "$NODE_V" | sed 's/^v//' | cut -d. -f1)"
    if [ "${NODE_MAJOR:-0}" -ge 22 ]; then
        pk_pass "Node ${NODE_V}"
    elif [ "${NODE_MAJOR:-0}" -ge 18 ]; then
        pk_warn "Node ${NODE_V} — 运行 Hydro 可用；但插件开发（addons/）要求 Node ≥ 22"
    else
        pk_warn "Node ${NODE_V} 过旧 — 建议升级到 ≥ 22（插件开发要求）"
    fi
else
    pk_pass "未安装 Node（Hydro 安装脚本会安装）"
fi
if command -v node >/dev/null 2>&1 && command -v nodejs >/dev/null 2>&1; then
    if [ "$(readlink -f "$(command -v node)")" != "$(readlink -f "$(command -v nodejs)")" ]; then
        pk_warn "同时存在 node 与 nodejs 且指向不同二进制，可能引发版本错乱，建议只保留一个"
    fi
fi

# ============================================================
log_step "10/15 系统时间与 NTP"
# ============================================================
if command -v timedatectl >/dev/null 2>&1; then
    TZ_NAME="$(timedatectl show -p Timezone --value 2>/dev/null || echo '')"
    NTP_SYNC="$(timedatectl show -p NTPSynchronized --value 2>/dev/null || echo '')"
    if [ "$NTP_SYNC" = "yes" ]; then
        pk_pass "时间已同步（时区 ${TZ_NAME:-未知}）"
    else
        pk_fail "系统时间未同步（NTP 未同步）— 评测时间与比赛计时不可靠，请启用 systemd-timesyncd/chrony"
    fi
    if [ "$TZ_NAME" = "Asia/Shanghai" ]; then
        pk_pass "时区 Asia/Shanghai（比赛与作业时间显示符合国内习惯）"
    else
        pk_warn "时区为 ${TZ_NAME:-未知}，建议 timedatectl set-timezone Asia/Shanghai"
    fi
else
    pk_warn "未找到 timedatectl，无法确认时间同步状态"
fi

# ============================================================
log_step "11/15 DNS 解析"
# ============================================================
if [ -n "$DOMAIN" ]; then
    RESOLVED=""
    if command -v dig >/dev/null 2>&1; then
        RESOLVED="$(dig +short A "$DOMAIN" 2>/dev/null | grep -E '^[0-9.]+$' | head -1 || true)"
    elif command -v getent >/dev/null 2>&1; then
        RESOLVED="$(getent hosts "$DOMAIN" 2>/dev/null | awk '{print $1}' | head -1 || true)"
    fi
    if [ -z "$RESOLVED" ]; then
        pk_fail "$DOMAIN 无法解析到 A 记录 — HTTPS 证书签发会失败，请先配置 DNS"
    else
        pk_pass "$DOMAIN -> $RESOLVED"
        if [ -n "$EXPECT_IP" ] && [ "$RESOLVED" != "$EXPECT_IP" ]; then
            pk_fail "$DOMAIN 解析为 $RESOLVED，但期望 $EXPECT_IP — 确认是否指向本机"
        fi
    fi
    if command -v dig >/dev/null 2>&1; then
        if dig +short AAAA "$DOMAIN" 2>/dev/null | grep -q .; then
            pk_warn "$DOMAIN 存在 AAAA 记录，若本机无 IPv6 会导致部分用户访问失败"
        fi
    fi
else
    pk_warn "未指定 --domain，跳过 DNS 检查（生产 HTTPS 必须有可解析域名）"
fi

# ============================================================
log_step "12/15 外网连通与软件源"
# ============================================================
if curl -fsS --max-time 8 -o /dev/null "https://hydro.ac/setup.sh" 2>/dev/null; then
    pk_pass "可访问 Hydro 官方安装脚本（https://hydro.ac/setup.sh）"
else
    pk_fail "无法访问 https://hydro.ac/setup.sh — 安装将失败，请检查出网策略/代理"
fi
if curl -fsS --max-time 8 -o /dev/null "https://registry.npmmirror.com" 2>/dev/null; then
    pk_pass "可访问 npmmirror（国内 npm 加速源）"
else
    pk_warn "无法访问 registry.npmmirror.com（不影响安装，但 npm 安装可能很慢）"
fi
if grep -qE '^deb .*(mirrors\.(tuna|aliyun|cloud\.aliyun|ustc)|mirror)' /etc/apt/sources.list /etc/apt/sources.list.d/* 2>/dev/null; then
    pk_pass "apt 已使用国内镜像源（清华/阿里/中科大）"
else
    pk_warn "apt 未见国内镜像源，国内下载可能很慢；结论：可临时切换镜像，但不要因此更换技术方案（§75）"
fi

# ============================================================
log_step "13/15 备份与运维依赖"
# ============================================================
for CMD_INFO in "curl:curl" "unzip:unzip" "zip:zip" "tar:tar" "mongodump:mongodb-database-tools"; do
    CMD="${CMD_INFO%%:*}"
    PKG="${CMD_INFO##*:}"
    if command -v "$CMD" >/dev/null 2>&1; then
        pk_pass "已安装 $CMD"
    else
        pk_warn "缺少 $CMD（deploy/backup.sh 需要，可用 apt-get install -y $PKG 安装）"
    fi
done
if command -v restic >/dev/null 2>&1; then
    pk_pass "已安装 restic（可做异地备份副本，计划 §45 要求至少一份异地）"
else
    pk_warn "未安装 restic — 建议安装以支持异地备份：apt-get install -y restic"
fi

# ============================================================
log_step "14/15 评测环境前置（编译器）"
# ============================================================
for CXX_INFO in "gcc:gcc" "g++:g++" "python3:python3" "javac:default-jdk"; do
    CMD="${CXX_INFO%%:*}"
    PKG="${CXX_INFO##*:}"
    if command -v "$CMD" >/dev/null 2>&1; then
        pk_pass "已安装 $CMD"
    else
        pk_warn "缺少 $CMD — Hydro 安装脚本会安装编译环境；若缺失需手动 apt-get install -y $PKG（计划 §14）"
    fi
done

# ============================================================
log_step "15/15 权限与目录"
# ============================================================
if [ "$(id -u)" -eq 0 ]; then
    pk_pass "以 root 运行（Hydro 安装与后续操作均要求 root）"
fi
if [ -w "$HOME" ]; then
    pk_pass "$HOME 可写（Hydro 配置与数据目录基准）"
else
    pk_fail "$HOME 不可写"
fi

# ============================================================
pk_summary

if [ "$PK_FAIL" -gt 0 ]; then
    printf '\n%s结论：不满足部署前置条件，已按计划 §5 明确报错退出。%s\n' "$C_RED$C_BOLD" "$C_OFF"
    printf '请逐条修复上述 [FAIL] 项后重新执行 preflight。\n'
    if [ "$IGNORE_FAILURES" = "1" ]; then
        printf '%s（--ignore-failures 已指定，仍继续；生产环境不建议这样做）%s\n' "$C_YELLOW" "$C_OFF"
        record_note "preflight 带 --ignore-failures 通过，FAIL=${PK_FAIL}"
        exit 0
    fi
    exit 1
fi

printf '\n%s结论：前置条件满足，可以进入 deploy/install-hydro.sh。%s\n' "$C_GREEN$C_BOLD" "$C_OFF"
record_note "preflight 通过 PASS=${PK_PASS} WARN=${PK_WARN} DOMAIN=${DOMAIN:-none}"
# 写入标记，供 install-hydro.sh 判断体检是否已通过（不通过则拒绝安装）
ensure_state_dir
{
    printf 'PREFLIGHT_PASS_AT=%s\n' "$(date '+%Y-%m-%dT%H:%M:%S%z')"
    printf 'DOMAIN=%s\n' "${DOMAIN:-}"
    printf 'PASS=%s\nWARN=%s\n' "$PK_PASS" "$PK_WARN"
} >"${SYLU_STATE_DIR}/preflight.ok"
chmod 600 "${SYLU_STATE_DIR}/preflight.ok"
exit 0
