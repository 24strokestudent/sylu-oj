#!/usr/bin/env bash
# 模拟 Judge/Web 状态，验证整体恢复的停服、失败收敛和状态复原。
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf -- "$TMP"' EXIT
mkdir -p "$TMP/deploy/lib" "$TMP/bin" "$TMP/state" "$TMP/backups" "$TMP/oj"
cp "$ROOT/deploy/rollback.sh" "$TMP/deploy/rollback.sh"
cat >"$TMP/deploy/healthcheck.sh" <<'MOCK'
#!/usr/bin/env bash
[ "${HC_FAIL:-0}" = 1 ] && exit 1
exit 0
MOCK
chmod +x "$TMP/deploy/healthcheck.sh"
export SYLU_STATE_DIR="$TMP/state" SYLU_BACKUP_DIR="$TMP/backups" SYLU_OJ_ROOT="$TMP/oj" TEST_ROOT="$TMP"
export PATH="$TMP/bin:$PATH"
cat >"$TMP/deploy/lib/common.sh" <<'MOCK'
SYLU_LOG_DIR="$SYLU_STATE_DIR/logs"
C_RED= C_GREEN= C_BOLD= C_OFF=
log_info() { :; }; log_ok() { :; }; log_warn() { echo "$*" >>"$TEST_ROOT/events"; }
log_err() { echo "$*" >>"$TEST_ROOT/events"; }; log_step() { :; }; banner() { :; }
die() { echo "die:$*" >>"$TEST_ROOT/events"; exit 1; }
require_root() { :; }; require_hydro_cli() { :; }; ensure_state_dir() { mkdir -p "$SYLU_LOG_DIR"; }
ensure_cmd() { command -v "$1" >/dev/null; }
confirm() { CONFIRM_N=$((CONFIRM_N + 1)); [ "$CONFIRM_N" -ge 2 ]; }
hydro_version() { echo 5.0.6; }; hydro_db_ver() { echo 1; }
snapshot_versions() { echo "$SYLU_STATE_DIR/snapshot"; echo snapshot >"$SYLU_STATE_DIR/snapshot"; }
record_note() { :; }
hydro_service_state() { [ "$1" = hydrojudge ] && echo pm2:running || echo pm2:running; }
hydro_stop() {
    echo "stop:$1" >>"$TEST_ROOT/events"
    [ "$1" = hydrojudge ] && [ "${FAIL_JUDGE_STOP:-0}" = 1 ] && return 1
    return 0
}
hydro_restart() {
    echo "restart:$1" >>"$TEST_ROOT/events"
    [ "$1" = hydrooj ] && [ "${FAIL_WEB_START:-0}" = 1 ] && return 1
    [ "$1" = hydrojudge ] && [ "${FAIL_JUDGE_START:-0}" = 1 ] && return 1
    return 0
}
hydro_http_probe() { [ "${HTTP_FAIL:-0}" = 1 ] && echo 503 || echo 200; }
MOCK
cat >"$TMP/bin/hydrooj" <<'MOCK'
#!/usr/bin/env bash
case "$1" in
  restore) echo restore >>"$TEST_ROOT/events"; exit "${RESTORE_FAIL:-0}" ;;
  addon) exit 0 ;;
  *) exit 0 ;;
esac
MOCK
cat >"$TMP/bin/unzip" <<'MOCK'
#!/usr/bin/env bash
case "$1" in
  -tq) exit 0 ;;
  -l) echo 'dump/hydro/user.bson'; exit 0 ;;
  *) exit 0 ;;
esac
MOCK
cat >"$TMP/bin/yarn" <<'MOCK'
#!/usr/bin/env bash
case "$1 $2" in
  'config get') echo https://registry.yarnpkg.com ;;
  'global add') echo "yarn:$*" >>"$TEST_ROOT/events"; exit "${YARN_FAIL:-0}" ;;
  *) exit 0 ;;
esac
MOCK
cat >"$TMP/bin/tar" <<'MOCK'
#!/usr/bin/env bash
exit 0
MOCK
cat >"$TMP/backups/sylu-oj-20260101-000000.zip" <<'EOF'
mock
EOF
cat >"$TMP/backups/versions-20260101-000000.env" <<'EOF'
HYDROOJ=5.0.6
HYDRO_UI=5.0.6
HYDRO_JUDGE=5.0.6
HYDRO_FPS_IMPORTER=5.0.6
HYDRO_A11Y=5.0.6
EOF
chmod +x "$TMP/bin/"*

expect() {
    local expected="$1" name="$2" rc=0
    shift 2
    rm -f "$TMP/events" "$SYLU_STATE_DIR/maintenance"
    CONFIRM_N=0 "$@" >"$TMP/output" 2>&1 || rc=$?
    [ "$rc" = "$expected" ] || { cat "$TMP/output"; echo "FAIL: $name ($rc)"; exit 1; }
    echo "PASS: $name"
}

expect 0 '恢复成功后恢复 Judge 状态' bash "$TMP/deploy/rollback.sh" --from-backup "$TMP/backups/sylu-oj-20260101-000000.zip" --yes
grep -q '^stop:hydrojudge$' "$TMP/events"
grep -q '^restart:hydrojudge$' "$TMP/events"
[ ! -e "$SYLU_STATE_DIR/maintenance" ]

expect 1 '健康检查失败后停止 Web 并保留维护标记' env HC_FAIL=1 bash "$TMP/deploy/rollback.sh" --from-backup "$TMP/backups/sylu-oj-20260101-000000.zip" --yes
grep -q '^stop:hydrooj$' "$TMP/events"
[ -e "$SYLU_STATE_DIR/maintenance" ]

expect 1 'Judge 停止失败时拒绝恢复' env FAIL_JUDGE_STOP=1 bash "$TMP/deploy/rollback.sh" --from-backup "$TMP/backups/sylu-oj-20260101-000000.zip" --yes
grep -q '无法停止正在运行的 hydrojudge' "$TMP/events"

echo '回滚控制回归全部通过'
