#!/usr/bin/env bash
# 验证显式目标版本与逐包发行清单不会被错误拼接。
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf -- "$TMP"' EXIT
cat >"$TMP/manifest.env" <<'EOF'
hydrooj=5.0.6
@hydrooj/ui-default=5.0.7
@hydrooj/fps-importer=5.0.8
@hydrooj/a11y=5.0.9
@hydrooj/hydrojudge=5.0.10
EOF

SYLU_RELEASE_MANIFEST="$TMP/manifest.env"
export SYLU_RELEASE_MANIFEST
# shellcheck source=../deploy/lib/common.sh
. "$ROOT/deploy/lib/common.sh"

mapfile -t specs < <(hydro_release_specs 5.0.6 1 0)
[ "${specs[0]}" = 'hydrooj@5.0.6' ]
[ "${specs[4]}" = '@hydrooj/hydrojudge@5.0.10' ]

cat >"$TMP/mismatch.env" <<'EOF'
hydrooj=5.0.5
@hydrooj/ui-default=5.0.7
@hydrooj/fps-importer=5.0.8
@hydrooj/a11y=5.0.9
@hydrooj/hydrojudge=5.0.10
EOF
SYLU_RELEASE_MANIFEST="$TMP/mismatch.env"
export SYLU_RELEASE_MANIFEST
if hydro_release_specs 5.0.6 1 0 >/dev/null; then
    echo 'FAIL: Hydro 核心版本不一致却通过'
    exit 1
fi

cat >"$TMP/snapshot.env" <<'EOF'
HYDRO_SNAPSHOT_FORMAT=1
HYDROOJ=5.0.6
HYDRO_UI=5.0.6
HYDRO_UI_ENABLED=1
HYDRO_JUDGE=none
HYDRO_JUDGE_ENABLED=0
HYDRO_FPS_IMPORTER=5.0.6
HYDRO_FPS_IMPORTER_ENABLED=1
HYDRO_A11Y=5.0.6
HYDRO_A11Y_ENABLED=1
EOF
mapfile -t backup_specs < <(hydro_release_specs_from_backup_snapshot "$TMP/snapshot.env")
[ "${backup_specs[0]}" = 'hydrooj@5.0.6' ]
! printf '%s\n' "${backup_specs[@]}" | grep -q '@hydrooj/hydrojudge@'

sed 's/HYDRO_UI_ENABLED=1/HYDRO_UI_ENABLED=0/' "$TMP/snapshot.env" >"$TMP/bad-snapshot.env"
if hydro_release_specs_from_backup_snapshot "$TMP/bad-snapshot.env" >/dev/null; then
    echo 'FAIL: 启用状态与版本不一致却通过'
    exit 1
fi
sed 's/HYDROOJ=5.0.6/HYDROOJ=latest/' "$TMP/snapshot.env" >"$TMP/latest-snapshot.env"
if hydro_release_specs_from_backup_snapshot "$TMP/latest-snapshot.env" >/dev/null; then
    echo 'FAIL: latest 未被视为非固定恢复版本'
    exit 1
fi

echo '发行清单回归全部通过'
