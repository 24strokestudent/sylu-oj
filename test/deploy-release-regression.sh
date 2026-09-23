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

echo '发行清单回归全部通过'
