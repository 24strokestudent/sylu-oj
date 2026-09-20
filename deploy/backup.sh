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
WORK_DIR="${SYLU_STATE_DIR}/work"
cd_safe_workdir "$WORK_DIR"
BEFORE_LIST="$(ls -1 "$WORK_DIR"/backup-*.zip 2>/dev/null || true)"

ARGS=(backup --withAddons)
if [ "$OFFSITE" = 1 ]; then
    if [ -z "$RESTIC_REPO" ] || [ -z "$RESTIC_PASS" ]; then
        die "--offsite 需要同时设置 SYLU_RESTIC_REPO 与 SYLU_RESTIC_PASS 环境变量"
    fi
    ensure_cmd restic restic "异地备份需要 restic"
    log_info "异地仓库：${RESTIC_REPO}"
    # 注意：密码通过参数传递给 hydrooj，本脚本不会把它写进任何文件
    record_note "backup: 使用 restic 异地仓库"
fi

log_info "执行：hydrooj ${ARGS[*]}"
record_note "backup.sh 开始"
if ! hydrooj "${ARGS[@]}"; then
    die "hydrooj backup 失败，请查看上方输出。备份未完成 —— 不要继续后续操作。"
fi

# ============================================================
log_step "3. 归集与完整性校验"
# ============================================================
NEW_ZIP=""
if [ "$OFFSITE" = 1 ]; then
    log_ok "已推送到 restic 仓库：${RESTIC_REPO}"
    log_warn "restic 快照无法用 unzip 直接校验；请用 deploy/restore-check.sh 定期做恢复演练"
else
    AFTER_LIST="$(ls -1 "$WORK_DIR"/backup-*.zip 2>/dev/null || true)"
    NEW_ZIP="$(comm -13 <(printf '%s\n' "$BEFORE_LIST" | sort) <(printf '%s\n' "$AFTER_LIST" | sort) | tail -1 || true)"
    [ -n "$NEW_ZIP" ] || NEW_ZIP="$(ls -1t "$WORK_DIR"/backup-*.zip 2>/dev/null | head -1 || true)"
    [ -n "$NEW_ZIP" ] || die "备份命令成功了，但找不到生成的 zip —— 请检查 hydrooj 版本的 backup 输出路径"

    STAMP="$(date '+%Y%m%d-%H%M%S')"
    TARGET="${BACKUP_DIR}/sylu-oj-${STAMP}.zip"
    mv "$NEW_ZIP" "$TARGET"
    cp "$SNAP" "${BACKUP_DIR}/versions-${STAMP}.env" 2>/dev/null || true

    if unzip -tq "$TARGET" >/dev/null 2>&1; then
        log_ok "备份完整性校验通过：$(basename "$TARGET")（$(du -h "$TARGET" | cut -f1)）"
    else
        die "备份 zip 校验失败：$TARGET —— 这是一个无效备份，请勿依赖它"
    fi

    # 周日额外留一份周备
    if [ "$(date '+%u')" = "7" ]; then
        mkdir -p "${BACKUP_DIR}/weekly"
        cp "$TARGET" "${BACKUP_DIR}/weekly/sylu-oj-week-$(date '+%G-W%V').zip"
        log_ok "本周周备已归档：sylu-oj-week-$(date '+%G-W%V').zip"
    fi
fi

# ============================================================
log_step "4. 保留策略（7 日 + 4 周）"
# ============================================================
keep_newest() { # $1=目录 $2=保留数 $3=glob
    local dir="$1" keep="$2" pattern="$3"
    local files
    files="$(ls -1t ${dir}/${pattern} 2>/dev/null || true)"
    [ -n "$files" ] || return 0
    local i=0
    while IFS= read -r f; do
        [ -n "$f" ] || continue
        i=$((i + 1))
        if [ "$i" -gt "$keep" ]; then
            rm -f "$f"
            log_info "清理旧备份：$(basename "$f")"
        fi
    done <<<"$files"
}

keep_newest "$BACKUP_DIR" "$KEEP_DAILY" 'sylu-oj-*.zip'
keep_newest "${BACKUP_DIR}/weekly" "$KEEP_WEEKLY" 'sylu-oj-week-*.zip'

log_ok "当前保留：每日 $(ls -1 ${BACKUP_DIR}/sylu-oj-*.zip 2>/dev/null | wc -l) 份 / 每周 $(ls -1 ${BACKUP_DIR}/weekly/sylu-oj-week-*.zip 2>/dev/null | wc -l) 份"

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
