#!/usr/bin/env bash
# SYLU OJ 健康检查（对应实施计划 §51 §52 §7 §48）
#
# 三种用法：
#   bash deploy/healthcheck.sh              日常巡检（Web / 服务 / 数据库 / 磁盘 / 备份）
#   bash deploy/healthcheck.sh --gate       §7 第一道 Gate：装完 Hydro 后的硬门槛
#   bash deploy/healthcheck.sh --upgrade    §48 升级后验收
#
# 退出码：0 全部通过；1 存在 FAIL（可接监控/CI）

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
. "${SCRIPT_DIR}/lib/common.sh"

MODE="daily"
case "${1:-}" in
    --gate) MODE="gate" ;;
    --upgrade) MODE="upgrade" ;;
    -h | --help) sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    "" ) ;;
    *) die "未知参数：$1" ;;
esac

case "$MODE" in
    gate) banner "第一道 Gate（§7）" "装完 Hydro 后的硬门槛：任何一项不过就不许改 UI" ;;
    upgrade) banner "升级后验收（§48）" "只看首页能不能打开是不够的" ;;
    *) banner "日常健康巡检" "Web / 服务 / 数据库 / 磁盘 / 备份" ;;
esac

BACKUP_DIR="${SYLU_BACKUP_DIR:-/var/backups/sylu-oj}"
DISK_WARN="${SYLU_DISK_WARN:-20}"
DISK_CRIT="${SYLU_DISK_CRIT:-10}"

PK_PASS=0; PK_WARN=0; PK_FAIL=0

# ============================================================
log_step "Web 服务"
# ============================================================
LOCAL_CODE="$(hydro_http_probe 'http://127.0.0.1:8888/')"
case "$LOCAL_CODE" in
    200 | 301 | 302 | 303) pk_pass "Hydro 内部端口 127.0.0.1:8888 -> HTTP ${LOCAL_CODE}" ;;
    000) pk_fail "127.0.0.1:8888 无响应（服务挂了或改了监听端口）" ;;
    *) pk_fail "127.0.0.1:8888 返回 HTTP ${LOCAL_CODE}" ;;
esac

if [ -n "${SYLU_SITE_URL:-}" ]; then
    # 注意别写成 `|| echo 000`：curl 失败时本身就会输出 000，会拼成 000000
    EXT_CODE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "${SYLU_SITE_URL%/}/" 2>/dev/null || true)"
    [ -n "$EXT_CODE" ] || EXT_CODE="000"
    case "$EXT_CODE" in
        200) pk_pass "公网入口 ${SYLU_SITE_URL} -> HTTP 200" ;;
        000) pk_fail "公网入口 ${SYLU_SITE_URL} 无法访问（DNS / 证书 / 反代 / 安全组）" ;;
        *) pk_fail "公网入口返回 HTTP ${EXT_CODE}" ;;
    esac
    # HTTPS 证书有效期（§41 生产必须 HTTPS）
    HOSTNAME_="$(printf '%s' "$SYLU_SITE_URL" | sed -E 's#^https?://([^/:]+).*#\1#')"
    if command -v openssl >/dev/null 2>&1; then
        EXP="$(echo | timeout 15 openssl s_client -servername "$HOSTNAME_" -connect "${HOSTNAME_}:443" 2>/dev/null \
            | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2 || true)"
        if [ -n "$EXP" ]; then
            SECONDS_LEFT=$(( $(date -d "$EXP" +%s) - $(date +%s) ))
            DAYS_LEFT=$(( SECONDS_LEFT / 86400 ))
            if [ "$DAYS_LEFT" -lt 0 ]; then pk_fail "TLS 证书已过期（$EXP）"
            elif [ "$DAYS_LEFT" -lt 14 ]; then pk_warn "TLS 证书将在 ${DAYS_LEFT} 天后过期（$EXP）"
            else pk_pass "TLS 证书有效，剩余 ${DAYS_LEFT} 天"; fi
        else
            pk_warn "无法读取 TLS 证书信息"
        fi
    fi
fi

# ============================================================
log_step "Hydro 服务与 Judge"
# ============================================================
SVC="$(hydro_service_active || true)"
case "$SVC" in
    systemd:*:active | pm2:*:online) pk_pass "Hydro 服务运行中（${SVC}）" ;;
    none:*) pk_fail "未检测到 Hydro 服务" ;;
    *) pk_fail "Hydro 服务异常（${SVC}）" ;;
esac

if has_hydro_cli; then
    pk_pass "hydrooj CLI 可用"
else
    pk_fail "hydrooj CLI 不可用"
fi

# Hydro 需要的端口是否都在监听（80/443 由反代负责）
for P in 2019 5050 8888; do
    if command -v ss >/dev/null 2>&1 && ss -H -ltn 2>/dev/null | awk '{print $4}' | grep -qE "[:.]${P}$"; then
        ADDRS="$(ss -H -ltn | awk -v port="$P" '$4 ~ ":"port"$" {print $4}')"
        if printf '%s\n' "$ADDRS" | grep -vE "^(127\.0\.0\.1|\[::1\]|::1):${P}$" >/dev/null; then
            pk_fail "内部端口 ${P} 监听非本机地址"
        else
            pk_pass "内部端口 ${P} 仅本机监听"
        fi
    else
        pk_warn "端口 ${P} 未监听（若使用独立评测机或未启用该组件可忽略）"
    fi
done

cat <<'EOF'
    说明：Judge 是否真的能判题，机器无法代替人工确认。
          请在题库里对 SYS001 提交 test/judge-suite/SYS001-AB/submissions/ 下的
          ac / wa / ce / re / tle / mle / ole 七个程序，逐一核对结果。
EOF

# ============================================================
log_step "MongoDB"
# ============================================================
MONGO_BIND_RC=0
mongo_bind_ok || MONGO_BIND_RC=$?
case "$MONGO_BIND_RC" in
    0) pk_pass "MongoDB 仅监听 127.0.0.1（§42 硬性要求）" ;;
    1) pk_fail "MongoDB 监听了非本机地址 —— 数据库暴露风险，立即修正" ;;
    2) pk_warn "无 ss 命令，无法确认 MongoDB 监听地址" ;;
esac

if command -v mongosh >/dev/null 2>&1 || command -v mongo >/dev/null 2>&1; then
    MONGO_URI="$(hydro_mongo_uri || true)"
    MONGO_CLI="$(command -v mongosh || command -v mongo)"
    if [ -n "$MONGO_URI" ] && "$MONGO_CLI" "$MONGO_URI" --quiet --eval 'db.runCommand({ping:1}).ok' >/dev/null 2>&1; then
        pk_pass "MongoDB ping 正常"
    else
        pk_fail "MongoDB ping 失败"
    fi
fi

# ============================================================
log_step "磁盘与内存（§52）"
# ============================================================
for MNT in / /data; do
    [ -d "$MNT" ] || continue
    USE="$(df -P "$MNT" 2>/dev/null | awk 'NR==2 {gsub(/%/,"",$5); print $5}')"
    [ -n "$USE" ] || continue
    FREE=$(( 100 - USE ))
    if [ "$FREE" -le "$DISK_CRIT" ]; then
        pk_fail "${MNT} 剩余 ${FREE}% —— 高危（阈值 ${DISK_CRIT}%），立即清理或扩容"
    elif [ "$FREE" -le "$DISK_WARN" ]; then
        pk_warn "${MNT} 剩余 ${FREE}% —— 需要关注（阈值 ${DISK_WARN}%）"
    else
        pk_pass "${MNT} 剩余 ${FREE}%"
    fi
done

MEM_TOTAL="$(awk '/^MemTotal:/ {printf "%d", $2/1024}' /proc/meminfo)"
MEM_AVAIL="$(awk '/^MemAvailable:/ {printf "%d", $2/1024}' /proc/meminfo)"
if [ "${MEM_AVAIL:-0}" -lt 256 ]; then
    pk_fail "可用内存仅 ${MEM_AVAIL} MB，随时可能 OOM"
else
    pk_pass "内存可用 ${MEM_AVAIL} MB / 共 ${MEM_TOTAL} MB"
fi
SWAP="$(awk '/^SwapTotal:/ {printf "%d", $2/1024}' /proc/meminfo)"
[ "${SWAP:-0}" -gt 0 ] && pk_pass "Swap ${SWAP} MB" || pk_warn "未启用 Swap"

# ============================================================
log_step "备份新鲜度（§45 §46）"
# ============================================================
if [ -d "$BACKUP_DIR" ]; then
    LATEST="$(ls -1t "${BACKUP_DIR}"/*.zip 2>/dev/null | head -1 || true)"
    if [ -z "$LATEST" ]; then
        pk_fail "备份目录 ${BACKUP_DIR} 里没有任何备份文件"
    else
        AGE_H=$(( ( $(date +%s) - $(stat -c %Y "$LATEST") ) / 3600 ))
        if [ "$AGE_H" -le 26 ]; then
            pk_pass "最近备份 $(basename "$LATEST")，${AGE_H} 小时前"
        elif [ "$AGE_H" -le 192 ]; then
            pk_warn "最近备份 ${AGE_H} 小时前，超过了每日备份窗口"
        else
            pk_fail "最近备份 ${AGE_H} 小时前 —— 备份任务可能已失效"
        fi
    fi
    if command -v restic >/dev/null 2>&1; then
        pk_pass "已安装 restic，可做异地副本（§45 要求至少一份异地）"
    else
        pk_warn "未安装 restic —— 备份目前只有一份，存储故障会一起丢"
    fi
else
    pk_warn "备份目录 ${BACKUP_DIR} 不存在（还没跑过 deploy/backup.sh？）"
fi

# ============================================================
if [ "$MODE" = "gate" ]; then
    log_step "Gate 逐项对照（§7）"
    cat <<'EOF'
    机器可判定项（见上面结果）：
      [ ] Hydro Web 页面打开（以上方检查结果为准）
      [ ] MongoDB 正常（以上方检查结果为准）
      [ ] Hydro 服务正常（以上方检查结果为准）
      [~] Judge 服务正常        ← 需要人工提交 SYS001 验收集确认
      [~] Sandbox 正常          ← 需要人工跑 test/sandbox-suite 确认

    必须人工完成（脚本不能代替）：
      [ ] 管理员登录
      [ ] 普通用户注册
      [ ] 普通用户登录

    未完成上述人工项之前，**禁止开始 UI 改造**（§7）。
EOF
fi

if [ "$MODE" = "upgrade" ]; then
    log_step "升级后必须复验的链路（§48）"
    cat <<'EOF'
    只看首页能否打开是不够的，至少逐条走一遍：
      [ ] 登录
      [ ] 题库列表
      [ ] 题目详情
      [ ] 提交代码
      [ ] C++ 判题
      [ ] Python 判题
      [ ] 作业功能
      [ ] 管理员后台
      [ ] SYLU addon（若已启用）
    任何一条失败 → 停止继续修改，执行 deploy/rollback.sh（§49）
EOF
fi

pk_summary
record_note "healthcheck mode=${MODE} PASS=${PK_PASS} WARN=${PK_WARN} FAIL=${PK_FAIL}"

if [ "$PK_FAIL" -gt 0 ]; then
    printf '\n%s结论：存在 %d 项失败%s\n' "$C_RED$C_BOLD" "$PK_FAIL" "$C_OFF"
    exit 1
fi
printf '\n%s结论：无失败项%s\n' "$C_GREEN$C_BOLD" "$C_OFF"
exit 0
