#!/usr/bin/env bash
# SYLU OJ 回滚（对应实施计划 §49）
#
# 回滚有两条路，**选错会丢数据**：
#
#   1) 只回滚代码（快、不丢数据）
#        yarn global add hydrooj@<旧版本> ...
#      仅当升级**没有触发数据库迁移**时才安全。
#
#   2) 用备份整体恢复（慢、会覆盖当前数据）
#        hydrooj restore <zip> -y --withAddons
#      升级已经跑过数据库迁移时，这是唯一安全的路。
#
# 为什么这么苛刻：Hydro 在启动时自动跑数据库迁移（service/migration.ts），
# 迁移是单向的。旧代码启动时若发现 db.ver 比它认识的更大，会直接：
#     "You are likely trying to apply a downgrade ... startup has been aborted."
# 拒绝启动。此时把代码退回去，只会得到一个起不来的站点。
#
# 用法：
#   bash deploy/rollback.sh --list                     # 看有哪些回滚点
#   bash deploy/rollback.sh --to-previous              # 回到上一次升级前的代码版本
#   bash deploy/rollback.sh --code 5.0.6               # 回到指定代码版本
#   bash deploy/rollback.sh --from-backup /var/backups/sylu-oj/sylu-oj-20260920-033000.zip
#
# 通用选项：--dry-run  --yes  --force

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
. "${SCRIPT_DIR}/lib/common.sh"

MODE=""
TARGET_VER=""
BACKUP_FILE=""
DRY_RUN=0
FORCE=0
HTTP_TIMEOUT="${SYLU_UPGRADE_HTTP_TIMEOUT:-90}"

while [ $# -gt 0 ]; do
    case "$1" in
        --list) MODE="list"; shift ;;
        --to-previous) MODE="prev"; shift ;;
        --code) MODE="code"; TARGET_VER="${2:?--code 需要版本号}"; shift 2 ;;
        --code=*) MODE="code"; TARGET_VER="${1#*=}"; shift ;;
        --from-backup) MODE="backup"; BACKUP_FILE="${2:?--from-backup 需要 zip 路径}"; shift 2 ;;
        --from-backup=*) MODE="backup"; BACKUP_FILE="${1#*=}"; shift ;;
        --dry-run) DRY_RUN=1; shift ;;
        --force) FORCE=1; shift ;;
        --yes) export SYLU_ASSUME_YES=1; shift ;;
        -h | --help) sed -n '2,30p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
        *) die "未知参数：$1（见 --help）" ;;
    esac
done

[ -n "$MODE" ] || { sed -n '2,30p' "$0" | sed 's/^# \{0,1\}//'; exit 1; }

BACKUP_DIR="${SYLU_BACKUP_DIR:-/var/backups/sylu-oj}"
require_root
if [ "$DRY_RUN" != 1 ] && [ "$MODE" != list ]; then ensure_state_dir; fi
if [ "$MODE" = backup ] && [ "$DRY_RUN" != 1 ]; then
    require_cmd flock "恢复与备份轮转必须共用互斥锁"
    exec 8>"${SYLU_STATE_DIR}/backup.lock"
    flock -n 8 || die "已有备份或恢复任务运行，拒绝并发操作"
fi

# ============================================================
# --list：把所有可用的回滚点列出来
# ============================================================
if [ "$MODE" = "list" ]; then
    banner "回滚点清单（§49）" "先看清楚有什么，再决定怎么回"

    log_step "A. 升级记录（来自每次 deploy/update.sh）"
    if ls -1 "${SYLU_STATE_DIR}"/upgrade-*.env >/dev/null 2>&1; then
        for F in $(ls -1t "${SYLU_STATE_DIR}"/upgrade-*.env); do
            # shellcheck disable=SC1090
            VB="$(awk -F= '/^HYDRO_VERSION_BEFORE=/{print $2}' "$F")"
            VA="$(awk -F= '/^HYDRO_VERSION_AFTER=/{print $2}' "$F")"
            DB="$(awk -F= '/^DB_VER_BEFORE=/{print $2}' "$F")"
            DA="$(awk -F= '/^DB_VER_AFTER=/{print $2}' "$F")"
            TS="$(basename "$F" .env | sed 's/^upgrade-//')"
            MIG="无迁移"
            [ -n "$DB" ] && [ -n "$DA" ] && [ "$DB" != "$DA" ] && MIG="${C_YELLOW}已迁移${C_OFF}"
            printf '    %s  %s -> %s   db.ver %s->%s   [%s]\n' \
                "$TS" "${VB:-?}" "${VA:-?}" "${DB:-?}" "${DA:-?}" "$MIG"
            printf '        回滚命令：bash deploy/rollback.sh --to-previous   # 或 --code %s\n' "${VB:-<版本>}"
        done
    else
        log_warn "没有任何升级记录（还没跑过 deploy/update.sh？）"
    fi

    log_step "B. 备份文件（来自 deploy/backup.sh）"
    if ls -1 "${BACKUP_DIR}"/*.zip >/dev/null 2>&1; then
        for Z in $(ls -1t "${BACKUP_DIR}"/*.zip | head -10); do
            printf '    %s  %s\n' "$(basename "$Z")" "$(du -h "$Z" | cut -f1)"
        done
        printf '    整体恢复：bash deploy/rollback.sh --from-backup %s\n' "$(ls -1t "${BACKUP_DIR}"/*.zip | head -1)"
    else
        log_warn "${BACKUP_DIR} 下没有备份文件 —— 一旦需要整体恢复将无路可走（§45）"
    fi

    log_step "C. 当前状态"
    log_info "hydrooj 版本：$(hydro_version 2>/dev/null || echo unknown)"
    log_info "数据库版本标记 db.ver：$(hydro_db_ver 2>/dev/null || echo unknown)"
    exit 0
fi

require_hydro_cli
ensure_cmd yarn yarn "回滚代码需要 yarn"

CUR_VER="$(hydro_version || echo unknown)"
CUR_DBVER="$(hydro_db_ver || echo unknown)"
log_info "当前版本：${CUR_VER}    当前 db.ver：${CUR_DBVER}"

# ============================================================
# 解析「上一次升级前」的版本
# ============================================================
if [ "$MODE" = "prev" ]; then
    LATEST_STATE="${SYLU_STATE_DIR}/upgrade-latest.env"
    [ -f "$LATEST_STATE" ] || die "找不到升级记录 ${LATEST_STATE}，请改用 --code <版本>"
    TARGET_VER="$(awk -F= '/^HYDRO_VERSION_BEFORE=/{print $2}' "$LATEST_STATE")"
    [ -n "$TARGET_VER" ] && [ "$TARGET_VER" != "unknown" ] ||
        die "升级记录里没有可用的旧版本号，请改用 --code <版本>"
    MODE="code"
    log_info "上一次升级前的版本：${TARGET_VER}"
fi

# ============================================================
# --code：只回滚代码
# ============================================================
if [ "$MODE" = "code" ]; then
    banner "回滚代码（§49）" "${CUR_VER} -> ${TARGET_VER}"

    # ---- 关键安全闸：判断是否发生过数据库迁移 ----
    SAFE_DBVER=""
    for F in $(ls -1t "${SYLU_STATE_DIR}"/upgrade-*.env 2>/dev/null || true); do
        VA="$(awk -F= '/^HYDRO_VERSION_AFTER=/{print $2}' "$F")"
        VB="$(awk -F= '/^HYDRO_VERSION_BEFORE=/{print $2}' "$F")"
        DB="$(awk -F= '/^DB_VER_BEFORE=/{print $2}' "$F")"
        if [ "$VB" = "$TARGET_VER" ]; then
            SAFE_DBVER="$DB"
            break
        fi
        [ -z "$VA" ] || true
    done

    log_step "数据库迁移安全检查"
    if [ -z "$SAFE_DBVER" ] || [ "$SAFE_DBVER" = "unknown" ] || [ "$CUR_DBVER" = "unknown" ]; then
        log_warn "找不到 ${TARGET_VER} 对应的升级前记录，无法自动判断是否安全。"
        if [ "$FORCE" != 1 ]; then
            cat <<EOF

  ${C_RED}${C_BOLD}拒绝在无法判断的情况下回滚代码。${C_OFF}
  如果升级时确实发生过数据库迁移，退回旧代码会让 Hydro 启动失败：
      "You are likely trying to apply a downgrade ... startup has been aborted."

  可选做法：
    * 确认没有迁移过 → 加 --force 强制执行
    * 更稳的做法     → 用备份整体恢复：
        bash deploy/rollback.sh --from-backup <升级前的 zip>
EOF
            exit 1
        fi
        log_warn "--force：跳过安全检查，风险自负。"
    elif [ "$CUR_DBVER" != "unknown" ] && [ "$CUR_DBVER" != "$SAFE_DBVER" ]; then
        cat <<EOF

  ${C_RED}${C_BOLD}检测到数据库已经迁移过，不能只回滚代码。${C_OFF}
    当前 db.ver                 : ${CUR_DBVER}
    ${TARGET_VER} 时代的 db.ver : ${SAFE_DBVER}

  退回 ${TARGET_VER} 的代码后，Hydro 会认为你在做降级并**拒绝启动**。
  唯一安全的回退方式是整体恢复备份：
      bash deploy/rollback.sh --from-backup <升级前的 zip>
  （备份文件见 bash deploy/rollback.sh --list）
EOF
        if [ "$FORCE" != 1 ]; then
            exit 1
        fi
        log_warn "--force：已知会触发降级保护，仍继续（启动时可能还需要 --ignore-version）。"
    else
        log_ok "db.ver 未变（${CUR_DBVER}）—— 没有迁移过，回滚代码是安全的。"
    fi

    TARGET_SNAPSHOT=""
    TARGET_WITH_JUDGE=0
    TARGET_CORE_ONLY=0
    for F in $(ls -1t "${SYLU_STATE_DIR}"/upgrade-*.env 2>/dev/null || true); do
        VB="$(awk -F= '/^HYDRO_VERSION_BEFORE=/{print $2}' "$F")"
        if [ "$VB" = "$TARGET_VER" ]; then
            TARGET_SNAPSHOT="$(awk -F= '/^SNAPSHOT=/{sub(/^SNAPSHOT=/, ""); print}' "$F")"
            TARGET_WITH_JUDGE="$(awk -F= '/^WITH_JUDGE=/{print $2}' "$F")"
            TARGET_CORE_ONLY="$(awk -F= '/^CORE_ONLY=/{print $2}' "$F")"
            break
        fi
    done
    RELEASE_SPECS_TMP="$(mktemp)"
    if ! hydro_release_specs_from_snapshot "$TARGET_SNAPSHOT" "${TARGET_WITH_JUDGE:-0}" "${TARGET_CORE_ONLY:-0}" >"$RELEASE_SPECS_TMP"; then
        rm -f -- "$RELEASE_SPECS_TMP"
        die "找不到目标发行的逐包版本清单，拒绝只回滚代码。请使用 --from-backup。"
    fi
    mapfile -t RELEASE_SPECS <"$RELEASE_SPECS_TMP"
    rm -f -- "$RELEASE_SPECS_TMP"

    log_step "待回滚内容"
    cat <<EOF
    版本      : ${CUR_VER} -> ${TARGET_VER}
    包        : ${RELEASE_SPECS[*]}
    yarn 目录 : $(yarn_global_dir 2>/dev/null || echo 未找到)
EOF

    if [ "$DRY_RUN" = 1 ]; then
        log_warn "[dry-run] 到此为止，未做任何修改。"
        exit 0
    fi
    confirm "开始回滚代码到 ${TARGET_VER}？" || die "已取消。"

    SNAP="$(snapshot_versions)"
    log_info "回滚前版本快照：${SNAP}"

    YGD="$(yarn_global_dir || true)"
    esbuild_resolutions_on "$YGD" || true

    REG_SAVED="$(yarn config get registry 2>/dev/null | tr -d '\r' || echo https://registry.yarnpkg.com)"
    PINS="${RELEASE_SPECS[*]}"

    OK=0
    yarn config set registry "${SYLU_YARN_MIRROR:-https://registry.npmmirror.com}" >/dev/null 2>&1 || true
    # shellcheck disable=SC2086
    if yarn global add $PINS; then
        OK=1
    else
        log_warn "镜像安装失败，回退官方源重试 ..."
        yarn config set registry https://registry.yarnpkg.com >/dev/null 2>&1 || true
        # shellcheck disable=SC2086
        yarn global add $PINS && OK=1 || OK=0
    fi
    yarn config set registry "${REG_SAVED:-https://registry.yarnpkg.com}" >/dev/null 2>&1 || true
    esbuild_resolutions_off "$YGD" || true

    [ "$OK" = 1 ] || die "yarn global add 失败，代码回滚未完成。系统当前仍可能是新版本。"

    hydro_restart hydrooj || log_warn "未能自动重启 hydrooj，请检查 pm2"
    if [ "${TARGET_WITH_JUDGE:-0}" = 1 ]; then
        hydro_restart hydrojudge || true
    fi

    log_step "等待服务就绪"
    CODE="000"
    for _ in $(seq 1 "$HTTP_TIMEOUT"); do
        CODE="$(hydro_http_probe 'http://127.0.0.1:8888/')"
        case "$CODE" in 200 | 301 | 302 | 303) break ;; esac
        sleep 1
    done
    case "$CODE" in
        200 | 301 | 302 | 303) log_ok "服务已恢复（HTTP ${CODE}）" ;;
        *)
            log_err "服务在 ${HTTP_TIMEOUT}s 内没有起来（最后状态 ${CODE}）"
            log_err "常见原因：数据库已迁移，旧代码触发了降级保护。"
            log_err "处理方式：用备份整体恢复 → bash deploy/rollback.sh --from-backup <zip>"
            record_note "rollback(code) 失败 ${CUR_VER}->${TARGET_VER} code=${CODE}"
            exit 1
            ;;
    esac

    record_note "rollback.sh(code) 完成 ${CUR_VER} -> ${TARGET_VER} dbver=${CUR_DBVER}"
    bash "${SCRIPT_DIR}/healthcheck.sh" || die "恢复后健康检查失败"
    printf '\n%s代码回滚完成：%s -> %s%s\n' "$C_GREEN$C_BOLD" "$CUR_VER" "$TARGET_VER" "$C_OFF"
    exit 0
fi

# ============================================================
# --from-backup：整体恢复
# ============================================================
if [ "$MODE" = "backup" ]; then
    banner "从备份恢复（§46 §49）" "会用备份**覆盖**当前数据库"

    # 新备份以同名目录保存完整恢复集合；仍兼容旧的单独 ZIP。
    ORIGINAL_BACKUP_SOURCE="$BACKUP_FILE"
    BACKUP_SET_DIR=""
    if [ -d "$BACKUP_FILE" ]; then
        BACKUP_SET_DIR="$(cd "$BACKUP_FILE" && pwd)"
        BACKUP_FILE="${BACKUP_SET_DIR}/data.zip"
    fi
    [ -f "$BACKUP_FILE" ] || die "找不到备份文件或恢复集合：${BACKUP_FILE}"
    ensure_cmd unzip unzip "恢复前要校验备份完整性"

    log_step "1. 校验备份文件"
    if unzip -tq "$BACKUP_FILE" >/dev/null 2>&1; then
        log_ok "zip 完整性校验通过（$(du -h "$BACKUP_FILE" | cut -f1)）"
    else
        die "备份 zip 已损坏，无法恢复：$BACKUP_FILE"
    fi
    if ! unzip -l "$BACKUP_FILE" 2>/dev/null | grep -q 'dump/hydro'; then
        log_warn "备份里没有找到 dump/hydro —— 这可能不是 hydrooj backup 生成的包，恢复会失败。"
    fi
    BACKUP_STEM="$(basename "$BACKUP_FILE" .zip)"
    BACKUP_FILE_DIR="${BACKUP_SET_DIR:-$(cd "$(dirname "$BACKUP_FILE")" && pwd)}"
    BACKUP_ID="${BACKUP_STEM#sylu-oj-}"
    [ -n "$BACKUP_SET_DIR" ] && BACKUP_ID="$(basename "$BACKUP_SET_DIR" | sed 's/^sylu-oj-//')"
    if [ ! -f "${BACKUP_FILE_DIR}/manifest-${BACKUP_STEM#sylu-oj-}.txt" ] \
        && [ ! -f "${BACKUP_FILE_DIR}/manifest.txt" ] \
        && ! unzip -l "$BACKUP_FILE" 2>/dev/null | grep -q 'sylu-recovery/versions.env'; then
        log_warn "备份缺少恢复清单，只能按数据恢复，不能确认对应代码发行集合。"
    fi

    # 新恢复集合的版本清单在停服前严格校验；旧 ZIP 继续支持数据恢复，
    # 但不把缺失组件或 latest 误称为完整代码回滚。
    RECOVERY_COMPLETE=0
    RECOVERY_SNAPSHOT=""
    if [ -n "$BACKUP_SET_DIR" ]; then
        [ -f "${BACKUP_SET_DIR}/versions.env" ] || die "恢复集合缺少 versions.env，拒绝进入停服阶段"
        [ -f "${BACKUP_SET_DIR}/manifest.txt" ] || die "恢复集合缺少 manifest.txt，拒绝进入停服阶段"
        [ -d "${BACKUP_SET_DIR}/config" ] || die "恢复集合缺少 config 目录，拒绝进入停服阶段"
        if grep -q '^HYDRO_SNAPSHOT_FORMAT=1$' "${BACKUP_SET_DIR}/versions.env"; then
            RECOVERY_SNAPSHOT="${BACKUP_SET_DIR}/versions.env"
        else
            log_warn "恢复集合是旧格式，只执行数据恢复，不宣称完整代码回滚。"
        fi
    elif [ -f "${BACKUP_FILE_DIR}/versions-${BACKUP_ID}.env" ] \
        && grep -q '^HYDRO_SNAPSHOT_FORMAT=1$' "${BACKUP_FILE_DIR}/versions-${BACKUP_ID}.env"; then
        [ -f "${BACKUP_FILE_DIR}/manifest-${BACKUP_ID}.txt" ] ||
            die "新格式备份缺少 manifest 清单，拒绝进入停服阶段"
        [ -d "${BACKUP_FILE_DIR}/config-${BACKUP_ID}" ] ||
            die "新格式备份缺少 config 目录，拒绝进入停服阶段"
        RECOVERY_SNAPSHOT="${BACKUP_FILE_DIR}/versions-${BACKUP_ID}.env"
    fi
    RECOVERY_SPECS_TMP=""
    if [ -n "$RECOVERY_SNAPSHOT" ]; then
        RECOVERY_SPECS_TMP="$(mktemp "${SYLU_STATE_DIR}/restore-specs.XXXXXX")"
        if ! hydro_release_specs_from_backup_snapshot "$RECOVERY_SNAPSHOT" >"$RECOVERY_SPECS_TMP"; then
            rm -f -- "$RECOVERY_SPECS_TMP"
            die "恢复集合的逐包版本快照不完整或不是固定版本，拒绝进入停服阶段"
        fi
        RECOVERY_COMPLETE=1
    elif [ -n "$BACKUP_SET_DIR" ]; then
        die "恢复集合缺少可验证的逐包版本快照，拒绝进入停服阶段"
    else
        log_warn "旧格式 ZIP 没有严格恢复集合，只执行数据恢复，不宣称完整代码回滚。"
    fi

    # 将选中的恢复源复制到状态目录之外的轮转目录，随后整个恢复期间持有
    # backup.lock。即使安全备份触发轮转，也不会删除本次明确选择的源。
    if [ "$DRY_RUN" != 1 ]; then
        RESTORE_SOURCE_STAGE="$(mktemp -d "${SYLU_STATE_DIR}/restore-source.XXXXXX")"
        trap 'rm -rf -- "${RESTORE_SOURCE_STAGE:-}"' EXIT
        if [ -n "$BACKUP_SET_DIR" ]; then
            cp -a "${BACKUP_SET_DIR}/." "$RESTORE_SOURCE_STAGE/"
        else
            cp -- "$BACKUP_FILE" "$RESTORE_SOURCE_STAGE/data.zip"
            for SIDE_FILE in \
                "manifest-${BACKUP_ID}.txt" "versions-${BACKUP_ID}.env" \
                "versions-${BACKUP_ID}.sha256" "sylu-brand-${BACKUP_ID}.tar.gz"; do
                [ -f "${BACKUP_FILE_DIR}/${SIDE_FILE}" ] && cp -- "${BACKUP_FILE_DIR}/${SIDE_FILE}" "$RESTORE_SOURCE_STAGE/"
            done
            [ -d "${BACKUP_FILE_DIR}/config-${BACKUP_ID}" ] && cp -a "${BACKUP_FILE_DIR}/config-${BACKUP_ID}" "$RESTORE_SOURCE_STAGE/config"
        fi
        BACKUP_FILE="${RESTORE_SOURCE_STAGE}/data.zip"
        BACKUP_FILE_DIR="$RESTORE_SOURCE_STAGE"
    fi

    log_step "2. 当前数据先留一份退路"
    log_warn "恢复会 --drop 现有集合。为了避免「恢复失败又回不来」，"
    log_warn "建议先跑一次 deploy/backup.sh 把当前状态存下来。"
    if [ "$DRY_RUN" != 1 ]; then
        if confirm "先给当前状态做一次备份？"; then
            SYLU_BACKUP_LOCK_HELD=1 bash "${SCRIPT_DIR}/backup.sh" || die "当前状态备份失败，已中止恢复。"
        fi
    fi

    cat <<EOF

  ${C_RED}${C_BOLD}接下来会用 ${BACKUP_FILE}
  覆盖当前数据库${C_OFF}（hydrooj restore ... --drop）。
  当前数据将不可恢复（除非上一步刚做了备份）。

  版本提示：新恢复集合会先按逐包快照安装对应代码；旧 ZIP 若没有快照，
    只能恢复数据，不能宣称代码与数据库属于同一发行集合。
    当前代码版本 : ${CUR_VER}
EOF

    if [ "$DRY_RUN" = 1 ]; then
        log_warn "[dry-run] 到此结束，未做任何修改。"
        exit 0
    fi
    confirm "确认用这份备份覆盖当前数据库？" || die "已取消。"

    SNAP="$(snapshot_versions)"
    log_info "恢复前版本快照：${SNAP}"
    record_note "rollback.sh(backup) 开始 file=${BACKUP_FILE}"

    # 恢复必须先阻断 Web、判题消费者和后台写入。失败时保留维护标记，
    # 不自动重新开放一个可能只恢复了一半的数据集。
    MAINTENANCE_MARKER="${SYLU_STATE_DIR}/maintenance"
    if [ -f "$MAINTENANCE_MARKER" ]; then
        SAVED_SOURCE="$(awk -F= '$1 == "source" {print substr($0, index($0, "=")+1); exit}' "$MAINTENANCE_MARKER")"
        [ "$SAVED_SOURCE" = "$ORIGINAL_BACKUP_SOURCE" ] ||
            die "已有另一份恢复任务的维护标记：${MAINTENANCE_MARKER}"
        INITIAL_JUDGE_STATE="$(awk -F= '$1 == "judge_initial_state" {print $2; exit}' "$MAINTENANCE_MARKER")"
        [ -n "$INITIAL_JUDGE_STATE" ] || die "维护标记缺少 Judge 原始状态，拒绝覆盖并重试"
        printf 'phase=retry\n' >>"$MAINTENANCE_MARKER"
    else
        INITIAL_JUDGE_STATE="$(hydro_service_state hydrojudge)"
        printf 'started_at=%s\nsource=%s\nbackup=%s\njudge_initial_state=%s\nphase=entered\n' \
            "$(date '+%Y-%m-%dT%H:%M:%S%z')" "$ORIGINAL_BACKUP_SOURCE" "$BACKUP_FILE" "$INITIAL_JUDGE_STATE" >"$MAINTENANCE_MARKER"
    fi
    if ! hydro_stop hydrooj; then
        die "无法停止 hydrooj，已拒绝在仍可写入时执行恢复。维护标记：${MAINTENANCE_MARKER}"
    fi
    JUDGE_WAS_RUNNING=0
    case "$INITIAL_JUDGE_STATE" in
        pm2:running|pm2:online|systemd:running) JUDGE_WAS_RUNNING=1 ;;
        pm2:stopped|systemd:stopped|absent) ;;
        pm2:stopping|systemd:stopping) ;;
        *) die "无法判定维护前 hydrojudge 状态（${INITIAL_JUDGE_STATE}），已拒绝执行恢复。维护标记：${MAINTENANCE_MARKER}" ;;
    esac
    wait_judge_stopped() {
        local state
        for _ in $(seq 1 "${SYLU_SERVICE_STOP_TIMEOUT:-30}"); do
            state="$(hydro_service_state hydrojudge)"
            case "$state" in
                pm2:stopped|systemd:stopped|absent) return 0 ;;
                pm2:stopping|systemd:stopping) sleep 1 ;;
                pm2:running|pm2:online|systemd:running)
                    hydro_stop hydrojudge || return 1
                    sleep 1
                    ;;
                *) return 1 ;;
            esac
        done
        return 1
    }
    if ! wait_judge_stopped; then
        die "hydrojudge 未在超时时间内进入明确停止状态，已拒绝执行恢复。维护标记：${MAINTENANCE_MARKER}"
    fi

    restore_abort() {
        local message="$1"
        if [ "${RESTORE_WEB_STARTED:-0}" = 1 ]; then
            hydro_stop hydrooj || log_warn "失败收敛时无法停止 hydrooj，请保持维护标记并人工确认"
        fi
        if [ "${JUDGE_WAS_RUNNING:-0}" = 1 ]; then
            hydro_stop hydrojudge || log_warn "失败收敛时无法停止 hydrojudge，请保持维护标记并人工确认"
        fi
        die "$message；维护标记仍保留：${MAINTENANCE_MARKER}"
    }

    # 新备份带有逐包版本快照。存在完整快照时先恢复同一组全局包，
    # 这样数据库与代码来自同一恢复集合；旧备份没有快照时明确降级为数据恢复。
    TARGET_JUDGE_ENABLED=1
    if [ "$RECOVERY_COMPLETE" = 1 ]; then
        TARGET_JUDGE_ENABLED=0
        grep -q '^@hydrooj/hydrojudge@' "$RECOVERY_SPECS_TMP" && TARGET_JUDGE_ENABLED=1
    fi

    if [ -n "$RECOVERY_SPECS_TMP" ]; then
        mapfile -t RECOVERY_SPECS <"$RECOVERY_SPECS_TMP"
        rm -f -- "$RECOVERY_SPECS_TMP"
        REG_SAVED="$(yarn config get registry 2>/dev/null | tr -d '\r' || echo https://registry.yarnpkg.com)"
        yarn config set registry "${SYLU_YARN_MIRROR:-https://registry.npmmirror.com}" >/dev/null 2>&1 || true
        if ! yarn global add "${RECOVERY_SPECS[@]}"; then
            yarn config set registry https://registry.yarnpkg.com >/dev/null 2>&1 || true
            yarn global add "${RECOVERY_SPECS[@]}" || {
                yarn config set registry "${REG_SAVED:-https://registry.yarnpkg.com}" >/dev/null 2>&1 || true
                restore_abort "无法安装备份对应的逐包版本集合"
            }
        fi
        yarn config set registry "${REG_SAVED:-https://registry.yarnpkg.com}" >/dev/null 2>&1 || true
        log_ok "已安装备份记录的逐包版本集合：${RECOVERY_SPECS[*]}"
    fi

    # hydrooj restore 会把 zip 解包后 mongorestore --drop
    # 注意：-y 用于跳过它自己的交互确认（我们已经确认过了）
    if ! hydrooj restore "$BACKUP_FILE" -y --withAddons; then
        die "hydrooj restore 失败。数据库可能处于不完整状态，请用刚做的当前状态备份再恢复一次。"
    fi
    log_ok "数据库已恢复"

    # 配置默认只做完整性核对，不自动覆盖目标机配置；需要迁移到同构机器时
    # 可显式设置 SYLU_RESTORE_CONFIG=1，按备份中的原始绝对路径逐项恢复。
    RECOVERY_CONFIG_DIR="${BACKUP_FILE_DIR}/config"
    if [ ! -d "$RECOVERY_CONFIG_DIR" ] && [ -d "${BACKUP_FILE_DIR}/config-${BACKUP_ID}" ]; then
        RECOVERY_CONFIG_DIR="${BACKUP_FILE_DIR}/config-${BACKUP_ID}"
    fi
    if [ -d "$RECOVERY_CONFIG_DIR" ]; then
        CONFIG_MAP="${RECOVERY_CONFIG_DIR}/files.tsv"
        if [ ! -f "$CONFIG_MAP" ]; then
            if [ "$RECOVERY_COMPLETE" = 1 ]; then
                restore_abort "恢复集合配置目录缺少 files.tsv"
            fi
            log_warn "旧格式配置目录缺少 files.tsv，只保留现有目标机配置"
        else
            while IFS=$'\t' read -r ORIGINAL_CONFIG STORED_CONFIG; do
                [ -n "${ORIGINAL_CONFIG:-}" ] || continue
                case "$STORED_CONFIG" in
                    ''|/*|*'..'*|*'/'*) restore_abort "恢复集合配置映射含非法文件名" ;;
                esac
                [ -f "${RECOVERY_CONFIG_DIR}/${STORED_CONFIG}" ] ||
                    restore_abort "恢复集合缺少配置文件：${STORED_CONFIG}"
                log_info "已核对备份配置：${ORIGINAL_CONFIG} <- ${STORED_CONFIG}"
                if [ "${SYLU_RESTORE_CONFIG:-0}" = 1 ]; then
                    mkdir -p "$(dirname "$ORIGINAL_CONFIG")"
                    cp -- "${RECOVERY_CONFIG_DIR}/${STORED_CONFIG}" "$ORIGINAL_CONFIG" ||
                        restore_abort "恢复配置失败：${ORIGINAL_CONFIG}"
                fi
            done <"$CONFIG_MAP"
        fi
    elif [ "$RECOVERY_COMPLETE" = 1 ]; then
        restore_abort "恢复集合缺少配置目录"
    fi

    # 外部品牌插件不在 Hydro 官方 backup 的 addons 目录中，按同一时间戳的
    # 配套归档恢复到代码目录；没有归档时明确告警，不伪装成完整版本回滚。
    PLUGIN_ARCHIVE="${BACKUP_FILE_DIR}/sylu-brand-${BACKUP_ID}.tar.gz"
    if [ ! -f "$PLUGIN_ARCHIVE" ] && [ -f "${BACKUP_FILE_DIR}/sylu-brand.tar.gz" ]; then
        PLUGIN_ARCHIVE="${BACKUP_FILE_DIR}/sylu-brand.tar.gz"
    fi
    if [ -f "$PLUGIN_ARCHIVE" ]; then
        tar -tzf "$PLUGIN_ARCHIVE" >/dev/null 2>&1 || die "品牌插件归档损坏：${PLUGIN_ARCHIVE}"
        if tar -tzf "$PLUGIN_ARCHIVE" | grep -Eq '(^/|(^|/)\.\.?(/|$))'; then
            die "品牌插件归档含非法路径：${PLUGIN_ARCHIVE}"
        fi
        if tar -tvzf "$PLUGIN_ARCHIVE" | awk 'substr($0,1,1) != "-" && substr($0,1,1) != "d" {bad=1} END {exit bad}'; then :; else
            die "品牌插件归档含符号链接或特殊文件：${PLUGIN_ARCHIVE}"
        fi
        PLUGIN_TMP="$(mktemp -d "${SYLU_STATE_DIR}/restore-plugin.XXXXXX")"
        if ! tar -xzf "$PLUGIN_ARCHIVE" -C "$PLUGIN_TMP"; then
            rm -rf -- "$PLUGIN_TMP"
            die "品牌插件归档恢复失败：${PLUGIN_ARCHIVE}"
        fi
        [ -d "${PLUGIN_TMP}/addons" ] && [ ! -L "${PLUGIN_TMP}/addons" ] \
            && [ -d "${PLUGIN_TMP}/addons/sylu-brand" ] && [ ! -L "${PLUGIN_TMP}/addons/sylu-brand" ] || {
            rm -rf -- "$PLUGIN_TMP"
            die "品牌插件归档缺少 addons/sylu-brand：${PLUGIN_ARCHIVE}"
        }
        rm -rf -- "${SYLU_OJ_ROOT}/addons/sylu-brand"
        mkdir -p "${SYLU_OJ_ROOT}/addons"
        mv "${PLUGIN_TMP}/addons/sylu-brand" "${SYLU_OJ_ROOT}/addons/sylu-brand" \
            || { rm -rf -- "$PLUGIN_TMP"; die "品牌插件归档恢复失败：${PLUGIN_ARCHIVE}"; }
        rm -rf -- "$PLUGIN_TMP"
        log_ok "已恢复 sylu-brand 外部插件源码"
    else
        log_warn "找不到配套品牌插件归档：${PLUGIN_ARCHIVE}；当前恢复不包含外部插件源码"
    fi

    log_step "3. 恢复后核对（有已知坑，务必人工确认）"
    cat <<'EOF'
    Hydro 的 backup/restore 在插件清单上存在命名不一致：
      backup  --withAddons 打包的是  ~/.hydro/addon.json
      restore --withAddons 读取的是  <解包目录>/addons.json
    两者名字不同，因此**插件配置可能没有被恢复**。请手动核对：
      cat ~/.hydro/addon.json
      # 若为空或缺少 sylu-brand / @hydrooj/ui-default，按 deploy/configure.sh 重新添加
EOF
    log_info "当前 addon.json 内容："
    hydrooj addon list 2>/dev/null || log_warn "hydrooj addon list 执行失败，请手动查看 ~/.hydro/addon.json"

    RESTORE_WEB_STARTED=1
    hydro_restart hydrooj || restore_abort "恢复完成但 hydrooj 无法启动"

    log_step "4. 等待服务就绪"
    CODE="000"
    for _ in $(seq 1 "$HTTP_TIMEOUT"); do
        CODE="$(hydro_http_probe 'http://127.0.0.1:8888/')"
        case "$CODE" in 200 | 301 | 302 | 303) break ;; esac
        sleep 1
    done
    case "$CODE" in
        200 | 301 | 302 | 303) log_ok "服务已恢复（HTTP ${CODE}）" ;;
        *) restore_abort "服务未就绪（最后状态 ${CODE}）—— 检查 pm2 logs hydrooj" ;;
    esac

    if [ "$JUDGE_WAS_RUNNING" = 1 ] && [ "$TARGET_JUDGE_ENABLED" = 1 ]; then
        hydro_restart hydrojudge || restore_abort "恢复后无法恢复原先运行的 hydrojudge"
    fi
    if ! bash "${SCRIPT_DIR}/healthcheck.sh"; then
        restore_abort "恢复后健康检查失败"
    fi
    record_note "rollback.sh(backup) 完成 file=${BACKUP_FILE} code=${CODE} judge_was_running=${JUDGE_WAS_RUNNING}"
    rm -f -- "$MAINTENANCE_MARKER"

    cat <<'EOF'

  恢复演练后必须人工确认（§46）：
      [ ] 能登录
      [ ] 题库列表有题目
      [ ] 打开题目能看到题面与测试点
      [ ] 提交记录还在
      [ ] 能正常判题
  全部通过，才算这份备份真的可用。
EOF
    exit 0
fi

die "未识别的模式（见 --help）"
