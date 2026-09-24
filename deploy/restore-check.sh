#!/usr/bin/env bash
# SYLU OJ 恢复演练（对应实施计划 §46）
#
# 核心立场：
#   "备份命令退出 0" 不等于备份有效。
#   只有真的恢复出来、真的能启动、真的能登录、真的能看到题目和提交记录，才算数。
#
# 本脚本做**机械可验证的那一半**，而且绝不碰生产库：
#     备份 zip → 完整性校验 → 解出 dump → mongorestore 到**临时库**（改名隔离）
#              → 统计各集合文档数 → 删除临时库
#   剩下的一半（启动 → 登录 → 打开题目 → 查看 Submission）在文档末尾以清单形式给出，
#   必须在测试环境上由人完成并留记录。
#
# 用法：
#   bash deploy/restore-check.sh                    # 用最近一次本地备份
#   bash deploy/restore-check.sh --file /var/backups/sylu-oj/sylu-oj-20260920-033000.zip
#   bash deploy/restore-check.sh --drill-only       # 只打印人工演练清单
#
# 退出码：0 演练通过；1 备份不可恢复

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
. "${SCRIPT_DIR}/lib/common.sh"

BACKUP_DIR="${SYLU_BACKUP_DIR:-/var/backups/sylu-oj}"
BACKUP_FILE=""
DRILL_ONLY=0

while [ $# -gt 0 ]; do
    case "$1" in
        --file) BACKUP_FILE="${2:-}"; shift 2 ;;
        --drill-only) DRILL_ONLY=1; shift ;;
        -h | --help) sed -n '2,22p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
        *) die "未知参数：$1" ;;
    esac
done

banner "恢复演练" "恢复出来才算备份有效（§46）"

print_drill() {
    cat <<'EOF'

  ── 人工演练清单（必须在测试环境上做，不要拿生产库试）─────────────
     [ ] 1. 准备一台测试环境（可以是同机不同端口 + 临时库，也可以是另一台机器）
     [ ] 2. 把备份 zip 复制过去（顺带验证"异地副本真的取得到"）
     [ ] 3. 在测试环境执行：hydrooj restore <备份.zip> -y
            带插件的数据要加 --withAddons
     [ ] 4. 启动测试环境服务
     [ ] 5. 打开首页，确认页面正常
     [ ] 6. 用管理员账号登录
     [ ] 7. 随机打开 1 道题目，确认题面、测试数据、时限都在
     [ ] 8. 打开题目列表页，确认题目数量与生产环境一致
     [ ] 9. 查看任一用户的历史提交记录（Submission），确认记录数与结论完整
     [ ]10. 提交一次代码，确认能正常判题（说明题库与数据都恢复到位）
     [ ]11. 把演练结果（时间 / 操作人 / 备份文件名 / 各项结果）记录进 docs/DEPLOY.md

  只要第 7 / 9 / 10 步任一失败，就说明这份备份不可用 —— 立刻排查备份策略，
  不要等到真的需要恢复时才发现。
  ────────────────────────────────────────────────────────────────
EOF
}

if [ "$DRILL_ONLY" = 1 ]; then
    print_drill
    exit 0
fi

require_root
if has_hydro_cli; then :; else
    log_warn "未找到 hydrooj CLI：仍可做机械校验，但无法核对 Mongo 连接串。"
fi

# ============================================================
log_step "1. 选定备份文件"
# ============================================================
if [ -z "$BACKUP_FILE" ]; then
    BACKUP_FILE="$(ls -1t "${BACKUP_DIR}"/sylu-oj-*.zip 2>/dev/null | head -1 || true)"
fi
[ -n "$BACKUP_FILE" ] || die "找不到备份文件。先执行 bash deploy/backup.sh"
[ -f "$BACKUP_FILE" ] || die "备份文件不存在：$BACKUP_FILE"
AGE_H=$(( ( $(date +%s) - $(stat -c %Y "$BACKUP_FILE") ) / 3600 ))
log_info "使用备份：$(basename "$BACKUP_FILE")（${AGE_H} 小时前，$(du -h "$BACKUP_FILE" | cut -f1)）"
if [ "$AGE_H" -gt 48 ]; then
    log_warn "这份备份已经 ${AGE_H} 小时，演练完请顺手检查备份定时任务是否还在跑"
fi

# ============================================================
log_step "2. zip 完整性"
# ============================================================
ensure_cmd unzip unzip "校验备份需要"
if unzip -tq "$BACKUP_FILE" >/dev/null 2>&1; then
    log_ok "zip 结构与 CRC 校验通过"
else
    die "备份 zip 已损坏 —— 这份备份不可用，请检查磁盘与备份流程"
fi

# ============================================================
log_step "3. 解出 dump"
# ============================================================
TMP="$(mktemp -d)"
SCRATCH_DB=""
DRILL_MONGOD_STARTED=0
MONGO_CLI="$(command -v mongosh || command -v mongo || true)"
[ -n "$MONGO_CLI" ] || die "缺少 mongosh/mongo，无法核对与清理恢复库"
cleanup() {
    local rc=$?
    trap - EXIT
    if [ "$DRILL_MONGOD_STARTED" = 1 ]; then
        mongod --dbpath "$TMP/mongodb" --shutdown >"$TMP/shutdown.log" 2>&1 || {
            log_err "临时 MongoDB 未停止，保留目录：$TMP"
            exit 1
        }
    fi
    rm -rf -- "$TMP"
    exit "$rc"
}
trap cleanup EXIT
unzip -q "$BACKUP_FILE" -d "$TMP" || die "解压失败"
DUMP_ROOT="$(find "$TMP" -maxdepth 3 -type d -name dump | head -1 || true)"
[ -n "$DUMP_ROOT" ] || die "备份里没有 dump 目录 —— 可能只备份了文件存储（--dbOnly 的反面）"
DB_DIR="$(find "$DUMP_ROOT" -mindepth 1 -maxdepth 1 -type d | head -1 || true)"
[ -n "$DB_DIR" ] || die "dump 目录里没有数据库子目录"
SRC_DB="$(basename "$DB_DIR")"
BSON_COUNT="$(find "$DB_DIR" -name '*.bson' | wc -l)"
log_ok "数据库：${SRC_DB}，BSON 文件 ${BSON_COUNT} 个"
if [ "$BSON_COUNT" -eq 0 ]; then
    die "dump 里没有任何 .bson —— 数据库备份是空的"
fi
log_info "集合清单："
find "$DB_DIR" -name '*.bson' -printf '        %f\n' | sort | head -40

# 顺带确认文件存储（用户上传/题目附加文件）在不在
if [ -d "${TMP}/file" ] || [ -d "${TMP}/data/file" ]; then
    log_ok "备份包含 /data/file 文件存储"
else
    log_warn "备份里未见 /data/file —— 用户上传文件可能没被备份，请确认是否接受"
fi

# ============================================================
log_step "4. 恢复到临时库（绝不碰生产库）"
# ============================================================
# 使用独立 MongoDB 实例；生产账号通常仅有 hydro 库权限，不能拿它做跨库演练。
require_cmd mongod "恢复演练需要启动独立临时 MongoDB"
PORT="$(node -e 'const s=require("net").createServer();s.listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close()})')"
mkdir -p "$TMP/mongodb"
mongod --dbpath "$TMP/mongodb" --bind_ip 127.0.0.1 --port "$PORT" \
    --nounixsocket --fork --logpath "$TMP/mongod.log" >"$TMP/start.log" 2>&1 \
    || die "无法启动临时 MongoDB"
DRILL_MONGOD_STARTED=1
URI="mongodb://127.0.0.1:${PORT}"
MONGO_CLI_RESTORE="$(command -v mongorestore || true)"
if [ -z "$MONGO_CLI_RESTORE" ]; then
    log_warn "未安装 mongorestore（mongodb-database-tools），无法做真实恢复"
    log_info "安装：apt-get install -y mongodb-database-tools"
    print_drill
    exit 1
fi

STAMP="$(date '+%Y%m%d%H%M%S')"
SCRATCH_DB="hydro_restorecheck_${STAMP}_$$_${RANDOM}"
if [ "$SCRATCH_DB" = "$SRC_DB" ]; then
    die "临时库名与生产库同名 —— 已中止（这是保护措施，不允许绕过）"
fi

log_info "生产库：${SRC_DB}（本次不会被写入）"
log_info "临时库：${SCRATCH_DB}（演练结束后删除）"

record_note "restore-check 开始 file=$(basename "$BACKUP_FILE") scratch=${SCRATCH_DB}"

if "$MONGO_CLI_RESTORE" --uri "$URI" \
        --nsFrom "${SRC_DB}.*" --nsTo "${SCRATCH_DB}.*" \
        "$DUMP_ROOT" >"${TMP}/restore.log" 2>&1; then
    log_ok "mongorestore 成功（日志：$(grep -ci . "${TMP}/restore.log") 行）"
else
    tail -30 "${TMP}/restore.log" | sed 's/^/        /'
    die "mongorestore 失败 —— 这份备份**不可恢复**。必须立即排查并重新备份。"
fi

# ============================================================
log_step "5. 核对恢复后的数据"
# ============================================================
MONGO_CLI="$(command -v mongosh || command -v mongo || true)"
if [ -z "$MONGO_CLI" ]; then
    log_warn "没有 mongosh/mongo，跳过分集合核对"
else
    COUNT_SCRIPT='
        const restored = db.getSiblingDB("'"$SCRATCH_DB"'");
        const names = restored.getCollectionNames().sort();
        const out = {};
        for (const n of names) out[n] = restored.getCollection(n).estimatedDocumentCount();
        print(JSON.stringify(out));
    '
    COUNTS="$("$MONGO_CLI" "$URI" --quiet --eval "$COUNT_SCRIPT" 2>/dev/null)" || die "无法查询恢复库集合"
    log_info "各集合文档数："
    printf '%s' "$COUNTS" | node -e '
        let s=""; process.stdin.on("data",d=>s+=d).on("end",()=>{
            let o={}; try { o = JSON.parse(s.trim()); } catch (e) {}
            for (const k of Object.keys(o)) console.log("        " + k.padEnd(16) + o[k]);
        });
    ' 2>/dev/null || printf '        %s\n' "$COUNTS"

    MISSING=""
    for C in domain user document; do
        if ! printf '%s' "$COUNTS" | grep -q "\"${C}\""; then MISSING="${MISSING} ${C}"; fi
    done
    if [ -n "$MISSING" ]; then
        die "恢复后的库里缺少关键集合：${MISSING}"
    else
        log_ok "关键集合齐全（domain / user / document）"
    fi

    PROBLEM_COUNT="$("$MONGO_CLI" "$URI" --quiet --eval \
        "print(db.getSiblingDB('${SCRATCH_DB}').getCollection('document').countDocuments({docType:10}))" 2>/dev/null || echo 0)"
    RECORD_COUNT="$("$MONGO_CLI" "$URI" --quiet --eval \
        "print(db.getSiblingDB('${SCRATCH_DB}').getCollection('record').estimatedDocumentCount())" 2>/dev/null || echo 0)"
    log_info "题目数（docType=10）：${PROBLEM_COUNT}"
    log_info "提交记录数：${RECORD_COUNT}"
    if [ "${PROBLEM_COUNT:-0}" -gt 0 ]; then
        log_ok "恢复出来的题库非空（说明题目文档结构完整）"
    else
        log_warn "恢复后题目数为 0 —— 确认一下备份时题库本来就是空的，还是备份漏了"
    fi


fi

# ============================================================
log_step "6. 结论"
# ============================================================
log_ok "机械校验通过：备份可以解出、可以恢复、关键集合与题目数据都在"
log_warn "但【备份有效】的最终判定仍需人工完成下面这份演练清单"

print_drill

record_note "restore-check 机械校验通过 file=$(basename "$BACKUP_FILE")"
printf '\n%s下一步：按上面清单在测试环境完成一次真实恢复演练，并把结果记入 docs/DEPLOY.md%s\n' "$C_BOLD" "$C_OFF"
exit 0
