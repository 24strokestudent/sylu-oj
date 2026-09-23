#!/usr/bin/env bash
# SYLU OJ 备份（对应实施计划 §45 §52）
#
# 核心原则：**调用 Hydro 官方备份能力，不自己 mongodump 一套**。
# Hydro 自带 `hydrooj backup`：
#     hydrooj backup [--dbOnly] [--withAddons] [--withLogs] [-r <restic仓库>] [-p <密码>]
# 它做的事：mongodump（排除 opcount/event/oplog）→ 打 zip（含 /data/file 文件存储）
#           加了 --withAddons 还会带上插件；给了 -r 就直接推到 restic 异地仓库。
#
# 保留策略（§45）：保留 7 份每日 + 4 份每周，且**至少一份异地副本**。
#
# 用法：
#   bash deploy/backup.sh                                  # 本地每日备份
#   SYLU_RESTIC_REPO=s3:xxx SYLU_RESTIC_PASS=... \
#       bash deploy/backup.sh --offsite                    # 额外推一份到异地
#
# 定时（建议 crontab -e，root）：
#   30 3 * * *  cd /root/sylu-oj && bash deploy/backup.sh >> /var/log/sylu-oj-backup.log 2>&1

set -euo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
. "${SCRIPT_DIR}/lib/common.sh"

BACKUP_DIR="${SYLU_BACKUP_DIR:-/var/backups/sylu-oj}"
KEEP_DAILY="${SYLU_KEEP_DAILY:-7}"
KEEP_WEEKLY="${SYLU_KEEP_WEEKLY:-4}"
OFFSITE=0
KEEP_LOCAL_TMP=0

RESTIC_REPO="${SYLU_RESTIC_REPO:-}"
RESTIC_PASS="${SYLU_RESTIC_PASS:-}"

while [ $# -gt 0 ]; do
    case "$1" in
        --offsite) OFFSITE=1; shift ;;
        --keep-tmp) KEEP_LOCAL_TMP=1; shift ;;
        -h | --help) sed -n '2,22p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
        *) die "未知参数：$1" ;;
    esac
done

banner "备份" "调用 Hydro 官方 backup，保留 7 日 + 4 周 + 异地副本"

require_root
require_hydro_cli
ensure_state_dir
ensure_cmd zip zip "hydrooj backup 打包时需要"
ensure_cmd unzip unzip "备份完整性校验时需要"
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
[[ "$KEEP_DAILY" =~ ^[1-9][0-9]*$ && "$KEEP_WEEKLY" =~ ^[1-9][0-9]*$ ]] || die "备份保留数必须为正整数"
require_cmd flock "防止并发备份共用 Hydro 临时目录"
if [ "${SYLU_BACKUP_LOCK_HELD:-0}" != 1 ]; then
    exec 9>"${SYLU_STATE_DIR}/backup.lock"
    flock -n 9 || die "已有备份任务运行"
fi

# ============================================================
log_step "0. 磁盘余量（§52 先看空间，别把盘写满）"
# ============================================================
for MNT in / "$BACKUP_DIR"; do
    USE="$(df -P "$MNT" 2>/dev/null | awk 'NR==2 {gsub(/%/,"",$5); print $5}')"
    [ -n "$USE" ] || continue
    FREE=$(( 100 - USE ))
    if [ "$FREE" -le 10 ]; then
        die "${MNT} 剩余 ${FREE}%，不足以安全完成备份。先清理磁盘。"
    elif [ "$FREE" -le 20 ]; then
        log_warn "${MNT} 剩余 ${FREE}%，备份后会更紧张（§52 高危线 10%）"
    else
        log_ok "${MNT} 剩余 ${FREE}%"
    fi
done

# ============================================================
log_step "1. 记录当前版本（§49 回滚要有据可查）"
# ============================================================
SNAP="$(snapshot_versions)"
log_info "版本快照：$SNAP"
log_info "备份文件会与这份快照放在一起，便于回滚时对照"

# ============================================================
log_step "2. 执行 Hydro 官方备份"
# ============================================================
WORK_DIR="$(mktemp -d "${SYLU_STATE_DIR}/backup-work.XXXXXX")"
trap 'if [ "$KEEP_LOCAL_TMP" != 1 ]; then rm -rf -- "$WORK_DIR"; fi' EXIT
cd_safe_workdir "$WORK_DIR"

ARGS=(backup --withAddons)
if [ "$OFFSITE" = 1 ]; then
    if [ -z "$RESTIC_REPO" ] || [ -z "$RESTIC_PASS" ]; then
        die "--offsite 需要同时设置 SYLU_RESTIC_REPO 与 SYLU_RESTIC_PASS 环境变量"
    fi
    ensure_cmd restic restic "异地备份需要 restic"
    log_info "异地仓库：${RESTIC_REPO}"
    # 先校验本地备份，再通过 restic 环境变量传递凭据。
    record_note "backup: 使用 restic 异地仓库"
fi

log_info "执行：hydrooj ${ARGS[*]}"
record_note "backup.sh 开始"
if ! hydrooj "${ARGS[@]}" >"${SYLU_LOG_DIR}/backup-last.log" 2>&1; then
    die "hydrooj backup 失败，详情见受限日志 ${SYLU_LOG_DIR}/backup-last.log。"
fi

# ============================================================
log_step "3. 归集与完整性校验"
# ============================================================
shopt -s nullglob
ZIPS=("$WORK_DIR"/backup-*.zip)
[ "${#ZIPS[@]}" -eq 1 ] || die "本次备份没有生成唯一 ZIP，不能复用旧备份"
NEW_ZIP="${ZIPS[0]}"
unzip -tq "$NEW_ZIP" >/dev/null 2>&1 || die "备份 ZIP 完整性校验失败"
STAMP="$(date '+%Y%m%d-%H%M%S')"
TARGET="${BACKUP_DIR}/sylu-oj-${STAMP}.zip"
[ ! -e "$TARGET" ] || die "同名备份已存在：$TARGET"
mv "$NEW_ZIP" "$TARGET"
cp "$SNAP" "${BACKUP_DIR}/versions-${STAMP}.env"
# 版本快照与 ZIP 绑定保存，恢复时可在没有原工作目录的环境识别组件集合。
RECOVERY_DIR="${WORK_DIR}/sylu-recovery"
mkdir -p "$RECOVERY_DIR"
cp "$SNAP" "${RECOVERY_DIR}/versions.env"
CONFIG_DIR="${BACKUP_DIR}/config-${STAMP}"
mkdir -p "$CONFIG_DIR"
CONFIG_MAP="${CONFIG_DIR}/files.tsv"
: >"$CONFIG_MAP"
CONFIG_SAVED=()
for CONFIG_PATH in "$HYDRO_CONFIG" /etc/caddy/Caddyfile /etc/hydro/mount.yaml; do
    if [ -f "$CONFIG_PATH" ]; then
        if command -v sha256sum >/dev/null 2>&1; then
            CONFIG_KEY="$(printf '%s' "$CONFIG_PATH" | sha256sum | awk '{print substr($1,1,16)}')"
        else
            CONFIG_KEY="$(printf '%s' "$CONFIG_PATH" | cksum | awk '{print $1}')"
        fi
        CONFIG_NAME="${CONFIG_KEY}-$(basename "$CONFIG_PATH")"
        cp -- "$CONFIG_PATH" "$CONFIG_DIR/$CONFIG_NAME"
        chmod 600 "$CONFIG_DIR/$CONFIG_NAME"
        printf '%s\t%s\n' "$CONFIG_PATH" "$CONFIG_NAME" >>"$CONFIG_MAP"
        CONFIG_SAVED+=("$CONFIG_PATH")
    fi
done
if [ -n "${SYLU_BACKUP_CONFIG_PATHS:-}" ]; then
    for CONFIG_PATH in $SYLU_BACKUP_CONFIG_PATHS; do
        [ -f "$CONFIG_PATH" ] || continue
        if command -v sha256sum >/dev/null 2>&1; then
            CONFIG_KEY="$(printf '%s' "$CONFIG_PATH" | sha256sum | awk '{print substr($1,1,16)}')"
        else
            CONFIG_KEY="$(printf '%s' "$CONFIG_PATH" | cksum | awk '{print $1}')"
        fi
        CONFIG_NAME="${CONFIG_KEY}-$(basename "$CONFIG_PATH")"
        cp -- "$CONFIG_PATH" "$CONFIG_DIR/$CONFIG_NAME"
        chmod 600 "$CONFIG_DIR/$CONFIG_NAME"
        printf '%s\t%s\n' "$CONFIG_PATH" "$CONFIG_NAME" >>"$CONFIG_MAP"
        CONFIG_SAVED+=("$CONFIG_PATH")
    done
fi
{
    echo "created_at=$(date '+%Y-%m-%dT%H:%M:%S%z')"
    echo "repository=${SYLU_OJ_ROOT:-unknown}"
    echo "brand_addon=${SYLU_OJ_ROOT:+${SYLU_OJ_ROOT}/addons/sylu-brand}"
    printf 'config_paths='
    (IFS=,; printf '%s' "${CONFIG_SAVED[*]:-未找到}")
    echo
    echo "config_map=files.tsv"
} >"${RECOVERY_DIR}/manifest.txt"
if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$SNAP" >"${RECOVERY_DIR}/versions.sha256"
fi
cp "${RECOVERY_DIR}/manifest.txt" "${BACKUP_DIR}/manifest-${STAMP}.txt"
cp "${RECOVERY_DIR}/versions.sha256" "${BACKUP_DIR}/versions-${STAMP}.sha256" 2>/dev/null || true
if [ "${#CONFIG_SAVED[@]}" -gt 0 ]; then
    log_info "已保存受限配置：${CONFIG_SAVED[*]}"
fi
if [ -d "${SYLU_OJ_ROOT:-}/addons/sylu-brand" ] && command -v tar >/dev/null 2>&1; then
    tar -czf "${BACKUP_DIR}/sylu-brand-${STAMP}.tar.gz" -C "$SYLU_OJ_ROOT" addons/sylu-brand
else
    log_warn "未找到 sylu-brand 源码或 tar，恢复集合不含外部品牌插件归档"
fi
# 把 ZIP、版本、清单、配置和插件归档放进同名恢复集合。异地只上传这个
# 目录，避免恢复时 ZIP 已存在但配套材料仍留在另一处或命名不一致。
RECOVERY_SET_DIR="${BACKUP_DIR}/sylu-oj-${STAMP}"
mkdir -p "$RECOVERY_SET_DIR"
cp "$TARGET" "$RECOVERY_SET_DIR/data.zip"
cp "${BACKUP_DIR}/versions-${STAMP}.env" "$RECOVERY_SET_DIR/versions.env"
cp "${BACKUP_DIR}/manifest-${STAMP}.txt" "$RECOVERY_SET_DIR/manifest.txt"
[ -f "${BACKUP_DIR}/versions-${STAMP}.sha256" ] && cp "${BACKUP_DIR}/versions-${STAMP}.sha256" "$RECOVERY_SET_DIR/versions.sha256"
[ -f "${BACKUP_DIR}/sylu-brand-${STAMP}.tar.gz" ] && cp "${BACKUP_DIR}/sylu-brand-${STAMP}.tar.gz" "$RECOVERY_SET_DIR/sylu-brand.tar.gz"
[ -d "$CONFIG_DIR" ] && cp -a "$CONFIG_DIR" "$RECOVERY_SET_DIR/config"
chmod -R go-rwx "$RECOVERY_SET_DIR"
log_ok "本地备份校验通过：$(basename "$TARGET")"

if [ "$OFFSITE" = 1 ]; then
    RESTIC_REPOSITORY="$RESTIC_REPO" RESTIC_PASSWORD="$RESTIC_PASS" \
        restic backup "$RECOVERY_SET_DIR" --tag sylu-oj --tag "backup-id=${STAMP}" \
        || die "异地上传失败，本地备份已保留：$TARGET"
    RESTIC_REPOSITORY="$RESTIC_REPO" RESTIC_PASSWORD="$RESTIC_PASS" \
        restic forget --tag sylu-oj --group-by host --keep-daily "$KEEP_DAILY" --keep-weekly "$KEEP_WEEKLY" \
        || die "异地保留策略执行失败"
    log_ok "异地副本已上传"
fi

if [ "$(date '+%u')" = "7" ]; then
    WEEK_ID="$(date '+%G-W%V')"
    mkdir -p "${BACKUP_DIR}/weekly"
    cp "$TARGET" "${BACKUP_DIR}/weekly/sylu-oj-week-${WEEK_ID}.zip"
    cp "${BACKUP_DIR}/versions-${STAMP}.env" "${BACKUP_DIR}/weekly/versions-week-${WEEK_ID}.env"
    cp "${BACKUP_DIR}/manifest-${STAMP}.txt" "${BACKUP_DIR}/weekly/manifest-week-${WEEK_ID}.txt"
    [ -f "${BACKUP_DIR}/sylu-brand-${STAMP}.tar.gz" ] && cp "${BACKUP_DIR}/sylu-brand-${STAMP}.tar.gz" "${BACKUP_DIR}/weekly/sylu-brand-week-${WEEK_ID}.tar.gz"
    [ -d "${BACKUP_DIR}/config-${STAMP}" ] && cp -a "${BACKUP_DIR}/config-${STAMP}" "${BACKUP_DIR}/weekly/config-week-${WEEK_ID}"
    rm -rf "${BACKUP_DIR}/weekly/sylu-oj-week-${WEEK_ID}"
    cp -a "$RECOVERY_SET_DIR" "${BACKUP_DIR}/weekly/sylu-oj-week-${WEEK_ID}"
fi

# ============================================================
log_step "4. 保留策略（7 日 + 4 周）"
# ============================================================
keep_newest() { # $1=目录 $2=保留数 $3=glob
    local dir="$1" keep="$2" pattern="$3"
    local files
    local matches=("$dir"/$pattern)
    [ "${#matches[@]}" -gt 0 ] || return 0
    files="$(ls -1t -- "${matches[@]}")"
    [ -n "$files" ] || return 0
    local i=0
    while IFS= read -r f; do
        [ -n "$f" ] || continue
        i=$((i + 1))
        if [ "$i" -gt "$keep" ]; then
            rm -f -- "$f"
            if [[ "$(basename "$f")" == sylu-oj-[0-9]*.zip ]]; then
                local stamp="${f##*/sylu-oj-}"
                rm -f -- "${dir}/versions-${stamp%.zip}.env"
                rm -f -- "${dir}/manifest-${stamp%.zip}.txt" "${dir}/versions-${stamp%.zip}.sha256"
                rm -f -- "${dir}/sylu-brand-${stamp%.zip}.tar.gz"
                rm -rf -- "${dir}/config-${stamp%.zip}"
                rm -rf -- "${dir}/sylu-oj-${stamp%.zip}"
            fi
            if [[ "$(basename "$f")" == sylu-oj-week-*.zip ]]; then
                local week_id="${f##*/sylu-oj-week-}"
                rm -f -- "${dir}/versions-week-${week_id%.zip}.env" "${dir}/manifest-week-${week_id%.zip}.txt"
                rm -f -- "${dir}/sylu-brand-week-${week_id%.zip}.tar.gz"
                rm -rf -- "${dir}/config-week-${week_id%.zip}" "${dir}/sylu-oj-week-${week_id%.zip}"
            fi
            log_info "清理旧备份：$(basename "$f")"
        fi
    done <<<"$files"
}

keep_newest "$BACKUP_DIR" "$KEEP_DAILY" 'sylu-oj-*.zip'
keep_newest "${BACKUP_DIR}/weekly" "$KEEP_WEEKLY" 'sylu-oj-week-*.zip'

DAILY_FILES=("${BACKUP_DIR}"/sylu-oj-*.zip)
WEEKLY_FILES=("${BACKUP_DIR}"/weekly/sylu-oj-week-*.zip)
log_ok "当前保留：每日 ${#DAILY_FILES[@]} 份 / 每周 ${#WEEKLY_FILES[@]} 份"

# ============================================================
log_step "5. 异地副本检查（§45 必做项）"
# ============================================================
if [ "$OFFSITE" = 1 ]; then
    log_ok "本次已生成异地副本"
else
    log_warn "本次**没有**生成异地副本。备份只存在这一块硬盘上，"
    log_warn "硬盘故障 / 误删 / 勒索加密都会一起丢。请尽快配置 restic 异地仓库："
    log_warn '  export SYLU_RESTIC_REPO=s3:https://s3.example.com/sylu-oj'
    log_warn '  export SYLU_RESTIC_PASS="$(cat /root/.restic-pass)"   # 口令放文件里，别写进命令行历史'
    log_warn '  bash deploy/backup.sh --offsite'
fi

cat <<'EOF'

  提醒（§46）：备份"命令退出 0"不等于备份有效。
        必须定期执行 deploy/restore-check.sh 做恢复演练，
        只有 restore → 启动 → 登录 → 打开题目 → 查看提交记录 全部成功，
        才能认定这份备份可用。
EOF

record_note "backup.sh 完成 offsite=${OFFSITE} dir=${BACKUP_DIR}"
printf '\n%s下一步：bash deploy/restore-check.sh%s\n' "$C_BOLD" "$C_OFF"
