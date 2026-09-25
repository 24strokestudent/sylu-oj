#!/usr/bin/env bash
# SYLU OJ · Docker 容器入口
#
# 职责：
#   1. 从环境变量生成 ~/.hydro/config.json（数据库连接串，权限 600）
#   2. 维护 ~/.hydro/addon.json（官方包 + sylu-brand 品牌插件）
#   3. 首次启动写入反代/品牌相关系统设置
#   4. 启动 go-judge 沙箱（hydro-sandbox）与 Hydro Web（内嵌评测机）
#
# 设计约束（对应仓库三条硬边界）：
#   - 不魔改 Hydro Core：设置全部走 `hydrooj cli system set`（官方接口）
#   - 沙箱不依赖 Nix 版 mount.yaml：使用 go-judge 内置默认挂载，amd64 / arm64 通用
#   - 任一子进程退出即收敛，让 compose 的 restart 策略接管
set -euo pipefail

log() { printf '[sylu] %s\n' "$*"; }
warn() { printf '[sylu][WARN] %s\n' "$*" >&2; }

HYDRO_HOME="${HOME:-/root}/.hydro"
BRAND_DIR="${SYLU_BRAND_DIR:-/opt/sylu-oj/addons/sylu-brand}"
SANDBOX_TMPFS="${SYLU_SANDBOX_TMPFS:-512m}"

mkdir -p "$HYDRO_HOME" /data/file /data/db

# ---------- 1. 数据库连接串 ----------
if [ ! -f "$HYDRO_HOME/config.json" ]; then
    if [ -z "${MONGO_URI:-}" ]; then
        warn "未设置 MONGO_URI，且 ${HYDRO_HOME}/config.json 不存在，无法启动。"
        exit 1
    fi
    node -e 'require("fs").writeFileSync(process.argv[1], JSON.stringify({ uri: process.argv[2] }))' \
        "$HYDRO_HOME/config.json" "$MONGO_URI"
    log "已写入数据库连接串：${HYDRO_HOME}/config.json"
fi
chmod 600 "$HYDRO_HOME/config.json"

# ---------- 2. 插件清单（官方包整组 + sylu-brand） ----------
SYLU_ADDON_JSON="$HYDRO_HOME/addon.json" \
    SYLU_BRAND_DIR="$BRAND_DIR" \
    SYLU_BRAND_ADDON="${SYLU_BRAND_ADDON:-1}" \
    node <<'NODE'
const fs = require('fs');
const file = process.env.SYLU_ADDON_JSON;
let list = [];
try { list = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { list = []; }
if (!Array.isArray(list)) list = [];
const wanted = [
    '@hydrooj/ui-default',
    '@hydrooj/hydrojudge',
    '@hydrooj/fps-importer',
    '@hydrooj/a11y',
];
if (process.env.SYLU_BRAND_ADDON !== '0') wanted.push(process.env.SYLU_BRAND_DIR);
for (const item of wanted) if (!list.includes(item)) list.push(item);
fs.writeFileSync(file, JSON.stringify(list, null, 2));
NODE
log "插件清单：$(tr -d '\n' < "$HYDRO_HOME/addon.json")"

# ---------- 3. 让 sylu-brand 能解析到 hydrooj 本体 ----------
if [ -z "${SYLU_HYDRO_CORE:-}" ] && command -v yarn >/dev/null 2>&1; then
    ygd="$(yarn global dir 2>/dev/null | tr -d '\r' | tail -1)"
    [ -n "$ygd" ] && export SYLU_HYDRO_CORE="${ygd}/node_modules"
fi

# ---------- 4. 首次启动：写入反代与品牌设置 ----------
# 只在初始化标记不存在时执行，避免每次启动都多起一个 Hydro CLI 进程。
if [ ! -f "$HYDRO_HOME/.docker-initialized" ]; then
    set_setting() {
        local key="$1" value="$2" i
        for i in $(seq 1 30); do
            if timeout 90 hydrooj cli system set "$key" "$value" >/dev/null 2>&1; then
                return 0
            fi
            sleep 2
        done
        warn "设置 ${key} 失败（继续启动，可稍后在控制面板修改）"
        return 1
    }
    log "首次启动：等待数据库并写入基础设置（可能需要一两分钟）..."
    INIT_OK=1
    set_setting server.xff x-forwarded-for || INIT_OK=0
    set_setting server.xhost x-forwarded-host || INIT_OK=0
    set_setting server.xproxy true || INIT_OK=0
    [ -n "${SYLU_SITE_NAME:-}" ] && { set_setting server.name "$SYLU_SITE_NAME" || INIT_OK=0; }
    [ -n "${SYLU_SITE_URL:-}" ] && { set_setting server.url "$SYLU_SITE_URL" || INIT_OK=0; }
    if [ "$INIT_OK" = 1 ]; then
        touch "$HYDRO_HOME/.docker-initialized"
        log "基础设置写入完成。"
    else
        warn "部分设置未写入，下次启动会重试。"
    fi
fi

# ---------- 5. 启动 go-judge 沙箱 ----------
# 不提供 mount.yaml，让 go-judge 使用内置默认挂载（/bin /lib /lib64 /usr ...）。
# -container-cred-start 1536：沙箱内以非 root 身份运行（对应裸机 uid/gid 1536）。
ulimit -s unlimited 2>/dev/null || true
log "启动 hydro-sandbox（go-judge）..."
hydro-sandbox \
    -http-addr=localhost:5050 \
    -tmp-fs-param "size=${SANDBOX_TMPFS},nr_inodes=8k" \
    -container-cred-start 1536 &
SANDBOX_PID=$!

# ---------- 6. 启动 Hydro Web（内嵌评测机） ----------
log "启动 hydrooj Web..."
hydrooj &
HYDRO_PID=$!

stop_all() {
    kill -TERM "$HYDRO_PID" "$SANDBOX_PID" 2>/dev/null || true
}
trap stop_all TERM INT

# 任一进程退出即收敛，交由 compose 的 restart 策略重建容器
wait -n "$HYDRO_PID" "$SANDBOX_PID" || true
warn "hydrooj 或 hydro-sandbox 已退出，停止另一进程并让容器重启。"
stop_all
wait || true
exit 1
