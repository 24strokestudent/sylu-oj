#!/usr/bin/env bash
# 隔离模拟外部服务，验证备份、恢复的失败分支不会误报成功或破坏工具。
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf -- "$TMP"' EXIT
mkdir -p "$TMP/deploy/lib" "$TMP/bin" "$TMP/state" "$TMP/backups"
cp "$ROOT"/deploy/{backup,restore-check}.sh "$TMP/deploy/"
export SYLU_STATE_DIR="$TMP/state" SYLU_BACKUP_DIR="$TMP/backups" TEST_ROOT="$TMP"
export PATH="$TMP/bin:$PATH"
cat >"$TMP/deploy/lib/common.sh" <<'MOCK'
SYLU_LOG_DIR="$SYLU_STATE_DIR/logs"
HYDRO_CONFIG=unused
C_BOLD= C_OFF= C_GREEN=
log_info() { echo "$*"; }
log_ok() { echo "$*"; }
log_warn() { echo "$*"; }
log_err() { echo "$*" >&2; }
log_step() { :; }
banner() { :; }
die() { log_err "$*"; exit 1; }
require_root() { :; }
require_hydro_cli() { :; }
has_hydro_cli() { return 0; }
ensure_cmd() { command -v "$1" >/dev/null; }
require_cmd() { ensure_cmd "$1"; }
ensure_state_dir() { mkdir -p "$SYLU_LOG_DIR"; }
record_note() { :; }
snapshot_versions() { echo snapshot >"$SYLU_STATE_DIR/snapshot"; echo "$SYLU_STATE_DIR/snapshot"; }
cd_safe_workdir() { cd "$1"; }
hydro_mongo_uri() { echo mongodb://localhost/hydro; }
MOCK
cat >"$TMP/bin/hydrooj" <<'MOCK'
#!/usr/bin/env bash
[ "${NO_ARCHIVE:-0}" = 1 ] || touch backup-new.zip
MOCK
cat >"$TMP/bin/unzip" <<'MOCK'
#!/usr/bin/env bash
if [ "$1" = -q ]; then
    mkdir -p "$4/dump/hydro" "$4/file"
    touch "$4/dump/hydro/user.bson"
fi
MOCK
cat >"$TMP/bin/restic" <<'MOCK'
#!/usr/bin/env bash
echo "$1" >>"$TEST_ROOT/restic.calls"
echo "$*" >>"$TEST_ROOT/restic.args"
[ "${RESTIC_FAIL:-0}" = 0 ]
MOCK
cat >"$TMP/bin/mongorestore" <<'MOCK'
#!/usr/bin/env bash
printf '%s\n' "$@" >"$TEST_ROOT/restore.args"
[ "${RESTORE_FAIL:-0}" = 0 ]
MOCK
cat >"$TMP/bin/mongod" <<'MOCK'
#!/usr/bin/env bash
case "$*" in *--shutdown*) echo cleaned >>"$TEST_ROOT/cleanup.calls" ;; esac
exit 0
MOCK
cat >"$TMP/bin/mongosh" <<'MOCK'
#!/usr/bin/env bash
case "$*" in
    *dropDatabase*) echo cleaned >>"$TEST_ROOT/cleanup.calls" ;;
    *'const db = db.'*) exit 1 ;;
    *getCollectionNames*)
        if [ "${MISSING_COLLECTION:-0}" = 1 ]; then echo '{}'; else echo '{"domain":1,"user":2,"document":1}'; fi ;;
    *) echo 1 ;;
esac
MOCK
# Git Bash 不提供 flock；此处只验证调用逻辑，并发锁由 Linux flock 实现。
cat >"$TMP/bin/flock" <<'MOCK'
#!/usr/bin/env bash
exit 0
MOCK
cat >"$TMP/bin/df" <<'MOCK'
#!/usr/bin/env bash
printf 'Filesystem 1024-blocks Used Available Capacity Mounted on\n/dev/mock 1000000 100000 900000 10%% /\n'
MOCK
chmod +x "$TMP/bin/"*
mkdir -p "$TMP/cfg/a" "$TMP/cfg/b"
printf 'a\n' >"$TMP/cfg/a/config.json"
printf 'b\n' >"$TMP/cfg/b/config.json"
export SYLU_BACKUP_CONFIG_PATHS="$TMP/cfg/a/config.json $TMP/cfg/b/config.json"
expect() {
    local expected="$1" name="$2" rc=0
    shift 2
    "$@" >"$TMP/output" 2>&1 || rc=$?
    if [ "$rc" != "$expected" ]; then cat "$TMP/output"; echo "FAIL: $name ($rc)"; exit 1; fi
    echo "PASS: $name"
}
expect 0 '本地备份成功' bash "$TMP/deploy/backup.sh"
[ "$(find "$TMP/backups" -path '*/sylu-oj-*/data.zip' | wc -l)" -eq 1 ] || { echo 'FAIL: 未生成完整恢复集合'; exit 1; }
[ "$(find "$TMP/backups" -path '*/sylu-oj-*/versions.env' -o -path '*/sylu-oj-*/manifest.txt' | wc -l)" -eq 2 ] || { echo 'FAIL: 恢复集合缺少版本或清单'; exit 1; }
[ "$(find "$TMP/backups" -path '*/sylu-oj-*/config/*-config.json' | wc -l)" -eq 2 ] || { echo 'FAIL: 同名配置文件发生覆盖'; exit 1; }
expect 1 '旧 ZIP 不得冒充新备份' env NO_ARCHIVE=1 bash "$TMP/deploy/backup.sh"
# 避免秒级文件名碰撞，前一份已经过校验，移到隔离测试目录中另存。
mv "$TMP/backups/"*.zip "$TMP/saved.zip"
expect 1 '异地上传失败必须返回失败' env SYLU_RESTIC_REPO=mock SYLU_RESTIC_PASS=testing RESTIC_FAIL=1 bash "$TMP/deploy/backup.sh" --offsite
expect 0 '异地上传成功执行保留策略' env SYLU_RESTIC_REPO=mock SYLU_RESTIC_PASS=testing RESTIC_FAIL=0 bash "$TMP/deploy/backup.sh" --offsite
grep -qx backup "$TMP/restic.calls"
grep -q 'forget .*--group-by host ' "$TMP/restic.args" || { echo 'FAIL: 异地保留策略按唯一标签分组'; exit 1; }
expect 1 '恢复失败返回失败' env RESTORE_FAIL=1 bash "$TMP/deploy/restore-check.sh" --file "$TMP/saved.zip"
[ -x "$TMP/bin/mongorestore" ] || { echo 'FAIL: 工具被误删'; exit 1; }
[ -s "$TMP/cleanup.calls" ] || { echo 'FAIL: 未清理临时库'; exit 1; }
expect 1 '缺少关键集合返回失败' env MISSING_COLLECTION=1 bash "$TMP/deploy/restore-check.sh" --file "$TMP/saved.zip"
expect 0 '恢复成功且核对集合通过' bash "$TMP/deploy/restore-check.sh" --file "$TMP/saved.zip"
grep -q -- '--nsFrom' "$TMP/restore.args"
echo '部署回归全部通过'
