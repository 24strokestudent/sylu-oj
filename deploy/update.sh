#!/usr/bin/env bash
# SYLU OJ 升级（对应实施计划 §47 §48 §49）
#
# 为什么不能用「随便 npm update」：
#   官方 setup.sh 是用 **yarn global add** 装 Hydro 的，并且整组包必须一起升：
#       hydrooj @hydrooj/ui-default @hydrooj/hydrojudge @hydrooj/fps-importer @hydrooj/a11y
#   只升 hydrooj 会出现「后端 5.0.8 / 前端 5.0.5」这类版本错配，页面报错很难查。
#   另外 Hydro 的 **数据库迁移在启动时自动执行**（见 service/migration.ts），
#   迁移是单向的：一旦 db.ver 变大，旧代码就再也起不来了。
#   所以本脚本的顺序是：**先备份 → 再升级 → 后验收 → 失败就回滚**。
#
# 用法：
#   bash deploy/update.sh                      # 升到 latest
#   bash deploy/update.sh --to 5.0.7           # 升/降到指定版本
#   bash deploy/update.sh --dry-run            # 只看要做什么，不动系统
#   bash deploy/update.sh --with-judge         # 连评测机（hydrojudge）一起升
#   bash deploy/update.sh --no-backup          # 跳过备份（强烈不建议）
#
# 退出码：0 升级成功；1 升级失败（已给出回滚指引）

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
. "${SCRIPT_DIR}/lib/common.sh"

TARGET_VERSION="latest"
DRY_RUN=0
DO_BACKUP=1
WITH_JUDGE=0
CORE_ONLY=0
MIRROR="${SYLU_YARN_MIRROR:-https://registry.npmmirror.com}"
PATCH_DIR="${SYLU_PATCH_DIR:-${SYLU_OJ_ROOT}/deploy/patches}"
HTTP_TIMEOUT="${SYLU_UPGRADE_HTTP_TIMEOUT:-90}"

while [ $# -gt 0 ]; do
    case "$1" in
        --to) TARGET_VERSION="${2:?--to 需要版本号，如 --to 5.0.7}"; shift 2 ;;
        --to=*) TARGET_VERSION="${1#*=}"; shift ;;
        --dry-run) DRY_RUN=1; shift ;;
        --no-backup) DO_BACKUP=0; shift ;;
        --with-judge) WITH_JUDGE=1; shift ;;
        --core-only) CORE_ONLY=1; shift ;;
        --patches-dir) PATCH_DIR="${2:?}"; shift 2 ;;
        -h | --help) sed -n '2,25p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
        *) die "未知参数：$1" ;;
    esac
done

banner "升级（§47）" "先备份 → 再升级 → 后验收；数据库迁移不可逆，出问题就回滚"

require_root
require_hydro_cli
if [ "$DRY_RUN" != 1 ]; then ensure_state_dir; fi
require_cmd pm2 "Hydro 由 pm2 托管"
require_cmd yarn "Hydro 是用 yarn global 安装的"

# ------------------------------------------------------------
log_step "1. 升级前状态快照"
# ------------------------------------------------------------
VER_BEFORE="$(hydro_version || echo unknown)"
DBVER_BEFORE="$(hydro_db_ver || echo unknown)"
SNAP_BEFORE=""
if [ "$DRY_RUN" != 1 ]; then SNAP_BEFORE="$(snapshot_versions)"; fi
STAMP="$(date '+%Y%m%d-%H%M%S')"
STATE_FILE="${SYLU_STATE_DIR}/upgrade-${STAMP}.env"

log_info "当前 hydrooj 版本：${VER_BEFORE}"
log_info "当前数据库版本标记 db.ver：${DBVER_BEFORE}"
log_info "版本快照文件：${SNAP_BEFORE}"

if [ "$VER_BEFORE" = "unknown" ]; then
    log_warn "无法读取 hydrooj 版本号，回滚时将无法按版本回退（只能靠备份恢复）"
fi

PKGS="$SYLU_HYDRO_PKGS"
[ "$CORE_ONLY" = 1 ] && log_warn "--core-only：只升级 hydrooj 本体，前后端可能版本错配，仅用于排查问题"

RELEASE_TMP="$(mktemp)"
trap 'rm -f -- "$RELEASE_TMP"' EXIT
if ! hydro_release_specs "$TARGET_VERSION" "$WITH_JUDGE" "$CORE_ONLY" >"$RELEASE_TMP"; then
    die "无法解析发行清单：指定版本必须通过 SYLU_RELEASE_MANIFEST 提供逐包版本（每行 包名=版本），拒绝继续。"
fi
mapfile -t RELEASE_SPECS <"$RELEASE_TMP"
TARGET_PKGS="${RELEASE_SPECS[*]}"
PKGS="$TARGET_PKGS"

# ------------------------------------------------------------
log_step "2. 磁盘余量（§52 备份 + 解包都要空间）"
# ------------------------------------------------------------
for MNT in / "$(dirname "${SYLU_STATE_DIR}")"; do
    USE="$(df -P "$MNT" 2>/dev/null | awk 'NR==2 {gsub(/%/,"",$5); print $5}')"
    [ -n "$USE" ] || continue
    FREE=$(( 100 - USE ))
    if [ "$FREE" -le 10 ]; then
        die "${MNT} 剩余 ${FREE}%，不足以安全完成升级（备份都写不下）。先清理磁盘。"
    elif [ "$FREE" -le 20 ]; then
        log_warn "${MNT} 剩余 ${FREE}%，升级有风险（§52 高危线 10%）"
    else
        log_ok "${MNT} 剩余 ${FREE}%"
    fi
done

# ------------------------------------------------------------
log_step "3. 强制备份（§47 第 1 步）"
# ------------------------------------------------------------
if [ "$DO_BACKUP" = 1 ]; then
    if [ "$DRY_RUN" = 1 ]; then
        log_info "[dry-run] 会执行：bash deploy/backup.sh"
    else
        log_info "执行：bash deploy/backup.sh"
        if ! bash "${SCRIPT_DIR}/backup.sh"; then
            die "备份失败 —— 已中止升级。**不要**跳过备份，请先修好备份（§45）。"
        fi
        log_ok "升级前备份完成"
    fi
else
    log_warn "--no-backup：本次**没有**做升级前备份。"
    log_warn "数据库迁移不可逆，一旦升级失败将无法恢复到升级前状态。"
    if [ "$DRY_RUN" != 1 ] && ! confirm "确认在没有备份的情况下继续升级？"; then
        die "已取消。"
    fi
fi

# ------------------------------------------------------------
log_step "4. 待升级内容确认"
# ------------------------------------------------------------
cat <<EOF
    目标版本    : ${TARGET_VERSION}
    升级包      : ${TARGET_PKGS}
    评测机      : $( [ "$WITH_JUDGE" = 1 ] && echo "一起升级（hydrojudge）" || echo "不升级" )
    核心补丁    : $( [ -d "$PATCH_DIR" ] && ls -1 "${PATCH_DIR}"/*.patch 2>/dev/null | wc -l || echo 0 ) 个（目录 ${PATCH_DIR}）
    工作目录    : $(yarn_global_dir 2>/dev/null || echo "未找到 yarn global dir")
EOF

if [ "$DRY_RUN" = 1 ]; then
    log_warn "[dry-run] 到此为止，未做任何修改。"
    exit 0
fi
confirm "开始升级？" || die "已取消。"

record_note "update.sh 开始 ${VER_BEFORE} -> ${TARGET_VERSION} (dbver=${DBVER_BEFORE})"

# ------------------------------------------------------------
log_step "5. 应用 esbuild resolutions 兼容处理"
# ------------------------------------------------------------
YGD="$(yarn_global_dir || true)"
if [ -z "$YGD" ]; then
    log_warn "取不到 yarn global dir，跳过 esbuild 兼容处理（若后续 add 失败多与此有关）"
else
    log_info "yarn global dir = ${YGD}"
    if esbuild_resolutions_on "$YGD"; then
        log_ok "已写入 resolutions（非本平台 esbuild 指向 /dev/null）"
    else
        log_warn "写入 resolutions 失败，继续尝试升级"
    fi
fi

# ------------------------------------------------------------
log_step "6. 执行 yarn global add"
# ------------------------------------------------------------
REG_SAVED="$(yarn config get registry 2>/dev/null | tr -d '\r' || echo https://registry.yarnpkg.com)"

yarn_try() { # $1 = registry
    local reg="$1"
    log_info "registry=${reg}"
    yarn config set registry "$reg" >/dev/null 2>&1 || true
    # shellcheck disable=SC2086
    yarn global add $TARGET_PKGS
}

UPGRADE_OK=0
if yarn_try "$MIRROR"; then
    UPGRADE_OK=1
else
    log_warn "使用镜像 ${MIRROR} 安装失败，回退到官方源重试 ..."
    if yarn_try "https://registry.yarnpkg.com"; then
        UPGRADE_OK=1
    fi
fi
yarn config set registry "${REG_SAVED:-https://registry.yarnpkg.com}" >/dev/null 2>&1 || true
esbuild_resolutions_off "$YGD" || true

if [ "$UPGRADE_OK" != 1 ]; then
    log_err "yarn global add 失败。"
    printf '\n%s回滚指引（§49）：%s\n' "$C_BOLD" "$C_OFF"
    printf '    bash deploy/rollback.sh --from-backup <deploy/backup.sh 生成的最新 zip>\n'
    exit 1
fi
VER_AFTER="$(hydro_version || echo unknown)"
log_ok "包已更新：${VER_BEFORE} -> ${VER_AFTER}"

# ------------------------------------------------------------
log_step "7. 重新应用核心补丁（§1.2 最小改动且留痕）"
# ------------------------------------------------------------
if [ -d "$PATCH_DIR" ] && ls -1 "${PATCH_DIR}"/*.patch >/dev/null 2>&1; then
    for PF in "${PATCH_DIR}"/*.patch; do
        log_info "应用补丁：$(basename "$PF")"
        if hydrooj patch "$PF"; then
            log_ok "已应用 $(basename "$PF")"
        else
            log_err "补丁 $(basename "$PF") 应用失败 —— 可能是上游代码已变化。"
            log_err "请人工核对后将补丁更新到新版本，再重试；否则先回滚（§49）。"
            exit 1
        fi
    done
    log_warn "提醒：核心补丁在每次升级后都会丢失，必须靠 deploy/patches/ 目录重新施加。"
else
    log_info "未发现核心补丁（deploy/patches/*.patch），跳过。"
    log_info "这正是我们想要的：优先用原生配置 / Addon，尽量不打核心补丁（§1.2）。"
fi

# ------------------------------------------------------------
log_step "8. 重启服务"
# ------------------------------------------------------------
if hydro_restart hydrooj; then
    log_ok "hydrooj 已重启"
else
    log_warn "未能通过 pm2 重启 hydrooj，请人工确认服务管理器（pm2 / systemd）"
fi
if [ "$WITH_JUDGE" = 1 ]; then
    if hydro_restart hydrojudge; then
        log_ok "hydrojudge 已重启"
    else
        log_warn "未能重启 hydrojudge（若评测机独立部署，请在评测机上重启）"
    fi
fi

# ------------------------------------------------------------
log_step "9. 等待服务就绪"
# ------------------------------------------------------------
CODE="000"
for _ in $(seq 1 "$HTTP_TIMEOUT"); do
    CODE="$(hydro_http_probe 'http://127.0.0.1:8888/')"
    case "$CODE" in 200 | 301 | 302 | 303) break ;; esac
    sleep 1
done
case "$CODE" in
    200 | 301 | 302 | 303) log_ok "Hydro 已就绪（HTTP ${CODE}）" ;;
    *) log_err "等待 ${HTTP_TIMEOUT}s 后仍无法访问 127.0.0.1:8888（最后状态 ${CODE}）" ;;
esac

# ------------------------------------------------------------
log_step "10. 数据库迁移判定（最关键的一步）"
# ------------------------------------------------------------
DBVER_AFTER="$(hydro_db_ver || echo unknown)"
log_info "db.ver：${DBVER_BEFORE} -> ${DBVER_AFTER}"

{
    echo "RECORDED_AT=$(date '+%Y-%m-%dT%H:%M:%S%z')"
    echo "HYDRO_VERSION_BEFORE=${VER_BEFORE}"
    echo "HYDRO_VERSION_AFTER=${VER_AFTER}"
    echo "DB_VER_BEFORE=${DBVER_BEFORE}"
    echo "DB_VER_AFTER=${DBVER_AFTER}"
    echo "TARGET_VERSION=${TARGET_VERSION}"
    printf 'PKGS='
    printf '%s ' "${RELEASE_SPECS[@]}"
    echo
    echo "WITH_JUDGE=${WITH_JUDGE}"
    echo "CORE_ONLY=${CORE_ONLY}"
    echo "SNAPSHOT=${SNAP_BEFORE}"
} >"$STATE_FILE"
ln -sfn "$STATE_FILE" "${SYLU_STATE_DIR}/upgrade-latest.env"

MIGRATED=0
if [ "$DBVER_BEFORE" != "unknown" ] && [ "$DBVER_AFTER" != "unknown" ] && [ "$DBVER_BEFORE" != "$DBVER_AFTER" ]; then
    MIGRATED=1
fi

if [ "$MIGRATED" = 1 ]; then
    cat <<EOF

  ${C_YELLOW}${C_BOLD}注意：本次升级触发了数据库迁移（db.ver ${DBVER_BEFORE} -> ${DBVER_AFTER}）${C_OFF}
  这意味着 Hydro 已经按新版本改写了数据库结构，**迁移是单向的**。
  旧版本代码再次启动时，会检测到 db.ver 比它认识的更大，从而：
      "You are likely trying to apply a downgrade. ... startup has been aborted."
  并拒绝启动。

  ${C_BOLD}结论：本次升级后只能「向前修」，不能简单把代码退回去。${C_OFF}
  如果本次验收不通过，唯一安全的回退方式是**用升级前的备份整体恢复**：
      bash deploy/rollback.sh --from-backup <升级前的那份 zip>
  备份文件位置：$( [ -n "${SYLU_BACKUP_DIR:-}" ] && echo "$SYLU_BACKUP_DIR" || echo "/var/backups/sylu-oj" )
  版本快照：$STATE_FILE
EOF
elif [ "$DBVER_BEFORE" = "unknown" ] || [ "$DBVER_AFTER" = "unknown" ]; then
    log_err "无法确认数据库迁移状态，禁止据此判定代码回滚安全"
    MIGRATED=unknown
else
    log_ok "db.ver 未变化 —— 没有发生数据库迁移，必要时可以安全地只回滚代码（§49）"
fi

# ------------------------------------------------------------
log_step "11. 升级后验收（§48）"
# ------------------------------------------------------------
HC_RC=0
bash "${SCRIPT_DIR}/healthcheck.sh" --upgrade || HC_RC=$?

record_note "update.sh 完成 ${VER_BEFORE} -> ${VER_AFTER} dbver=${DBVER_BEFORE}->${DBVER_AFTER} migrated=${MIGRATED} healthcheck_rc=${HC_RC}"

cat <<'EOF'

  下一步（脚本不能代替人工，§48）：
      请在浏览器里逐条走一遍：
        登录 → 题库列表 → 题目详情 → 提交 C++ → 提交 Python
        → 作业 → 管理员后台 →（若启用）SYLU addon 页面
      任何一条失败 → 不要继续改别的东西，立即回滚：
        bash deploy/rollback.sh --list
        bash deploy/rollback.sh --from-backup <备份 zip>
EOF

if [ "$HC_RC" != 0 ] || [[ ! "$CODE" =~ ^(200|301|302|303)$ ]] || [ "$MIGRATED" = unknown ]; then
    printf '\n%s升级后体检存在失败项，请按上面的回滚指引处理（§49）。%s\n' "$C_RED$C_BOLD" "$C_OFF"
    exit 1
fi
printf '\n%s升级完成。%s\n' "$C_GREEN$C_BOLD" "$C_OFF"
