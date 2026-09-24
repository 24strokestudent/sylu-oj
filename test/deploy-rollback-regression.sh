#!/usr/bin/env bash
# 模拟 Judge/Web 状态，验证整体恢复的停服、失败收敛和状态复原。
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf -- "$TMP"' EXIT
mkdir -p "$TMP/deploy/lib" "$TMP/bin" "$TMP/state" "$TMP/backups" "$TMP/oj"
cp "$ROOT/deploy/rollback.sh" "$TMP/deploy/rollback.sh"
cat >"$TMP/deploy/backup.sh" <<'MOCK'
#!/usr/bin/env bash
# 模拟安全备份触发轮转：若恢复脚本没有固定源，这里会删除它。
rm -f "$SYLU_BACKUP_DIR"/*.zip
touch "$SYLU_BACKUP_DIR/sylu-oj-new.zip"
exit 0
MOCK
chmod +x "$TMP/deploy/backup.sh"
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
require_cmd() { ensure_cmd "$1"; }
confirm() { CONFIRM_N=$((CONFIRM_N + 1)); [ "$CONFIRM_N" -ge 2 ]; }
hydro_version() { echo 5.0.6; }; hydro_db_ver() { echo 1; }
snapshot_versions() { echo "$SYLU_STATE_DIR/snapshot"; echo snapshot >"$SYLU_STATE_DIR/snapshot"; }
record_note() { :; }
hydro_service_state() { [ "$1" = hydrojudge ] && cat "$TEST_ROOT/judge.state" || cat "$TEST_ROOT/web.state"; }
hydro_stop() {
    echo "stop:$1" >>"$TEST_ROOT/events"
    [ "$1" = hydrojudge ] && [ "${FAIL_JUDGE_STOP:-0}" = 1 ] && return 1
    [ "$1" = hydrojudge ] && echo pm2:stopped >"$TEST_ROOT/judge.state"
    [ "$1" = hydrooj ] && echo pm2:stopped >"$TEST_ROOT/web.state"
    return 0
}
hydro_restart() {
    echo "restart:$1" >>"$TEST_ROOT/events"
    [ "$1" = hydrooj ] && [ "${FAIL_WEB_START:-0}" = 1 ] && return 1
    [ "$1" = hydrojudge ] && [ "${FAIL_JUDGE_START:-0}" = 1 ] && return 1
    [ "$1" = hydrojudge ] && echo pm2:running >"$TEST_ROOT/judge.state"
    [ "$1" = hydrooj ] && echo pm2:running >"$TEST_ROOT/web.state"
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
cat >"$TMP/bin/flock" <<'MOCK'
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
echo pm2:running >"$TMP/judge.state"
echo pm2:running >"$TMP/web.state"

expect() {
    local expected="$1" name="$2" rc=0
    shift 2
    rm -f "$TMP/events" "$SYLU_STATE_DIR/maintenance"
    echo pm2:running >"$TMP/judge.state"
    echo pm2:running >"$TMP/web.state"
    CONFIRM_N=0 "$@" >"$TMP/output" 2>&1 || rc=$?
    [ "$rc" = "$expected" ] || { cat "$TMP/output"; cat "$TMP/events" 2>/dev/null || true; echo "FAIL: $name ($rc)"; exit 1; }
    echo "PASS: $name"
}

expect 0 '恢复成功后恢复 Judge 状态' bash "$TMP/deploy/rollback.sh" --from-backup "$TMP/backups/sylu-oj-20260101-000000.zip" --yes
grep -q '^stop:hydrojudge$' "$TMP/events"
grep -q '^restart:hydrojudge$' "$TMP/events" || { cat "$TMP/events"; echo 'FAIL: 重试成功但未恢复 Judge'; exit 1; }
[ "$(cat "$TMP/web.state")" = pm2:running ]
[ ! -e "$SYLU_STATE_DIR/maintenance" ] || { echo 'FAIL: 重试成功但维护标记仍在'; exit 1; }

expect 1 '健康检查失败后停止 Web 并保留维护标记' env HC_FAIL=1 bash "$TMP/deploy/rollback.sh" --from-backup "$TMP/backups/sylu-oj-20260101-000000.zip" --yes
grep -q '^stop:hydrooj$' "$TMP/events"
[ "$(cat "$TMP/web.state")" = pm2:stopped ]
[ -e "$SYLU_STATE_DIR/maintenance" ] || { cat "$TMP/retry-first.out" "$TMP/events" 2>/dev/null || true; echo 'FAIL: 第一次失败未保留维护标记'; exit 1; }

expect 1 'Judge 停止失败时拒绝恢复' env FAIL_JUDGE_STOP=1 bash "$TMP/deploy/rollback.sh" --from-backup "$TMP/backups/sylu-oj-20260101-000000.zip" --yes
grep -q 'hydrojudge 未在超时时间内进入明确停止状态' "$TMP/events"

rm -f "$TMP/events" "$SYLU_STATE_DIR/maintenance"
echo pm2:running >"$TMP/judge.state"
echo pm2:running >"$TMP/web.state"
CONFIRM_N=0 HC_FAIL=1 bash "$TMP/deploy/rollback.sh" --from-backup "$TMP/backups/sylu-oj-20260101-000000.zip" --yes >"$TMP/retry-first.out" 2>&1 || true
[ -e "$SYLU_STATE_DIR/maintenance" ]
CONFIRM_N=0 HC_FAIL=0 bash "$TMP/deploy/rollback.sh" --from-backup "$TMP/backups/sylu-oj-20260101-000000.zip" --yes >"$TMP/retry-second.out" 2>&1 || {
    cat "$TMP/retry-first.out" "$TMP/retry-second.out" "$TMP/events" 2>/dev/null || true
    echo 'FAIL: 恢复失败后的重试未成功'
    exit 1
}
grep -q '^restart:hydrojudge$' "$TMP/events"
[ ! -e "$SYLU_STATE_DIR/maintenance" ]

touch "$TMP/backups/sylu-oj-20260101-000000.zip"
echo pm2:running >"$TMP/judge.state"
CONFIRM_N=1 bash "$TMP/deploy/rollback.sh" --from-backup "$TMP/backups/sylu-oj-20260101-000000.zip" --yes >"$TMP/protected-source.out" 2>&1 || {
    cat "$TMP/protected-source.out" "$TMP/events" 2>/dev/null || true
    echo 'FAIL: 安全备份轮转后恢复源不可用'
    exit 1
}

touch "$TMP/backups/sylu-oj-20260101-000000.zip"
rm -f "$TMP/events" "$SYLU_STATE_DIR/maintenance"
printf 'source=%s\njudge_initial_state=pm2:stopping\n' "$TMP/backups/sylu-oj-20260101-000000.zip" >"$SYLU_STATE_DIR/maintenance"
echo pm2:stopped >"$TMP/judge.state"
echo pm2:running >"$TMP/web.state"
CONFIRM_N=1 bash "$TMP/deploy/rollback.sh" --from-backup "$TMP/backups/sylu-oj-20260101-000000.zip" --yes >"$TMP/stopping-state.out" 2>&1 || {
    cat "$TMP/stopping-state.out" "$TMP/events" 2>/dev/null || true
    echo 'FAIL: stopping 状态确认停止后未能恢复'
    exit 1
}
! grep -q '^restart:hydrojudge$' "$TMP/events"

echo '回滚控制回归全部通过'
