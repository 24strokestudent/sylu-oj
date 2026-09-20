#!/usr/bin/env bash
# SYLU OJ · Hydro 正式安装（对应实施计划 §6、§7、§8）
#
# 原则（§6）：
#   - 使用 Hydro 官方当前稳定安装方式，不 clone 源码自己 build 整个平台
#   - 安装过程中不修改 Hydro 业务代码
#   - 安装完成后记录版本号，写入 docs/DEPLOY.md
#
# 用法：
#   bash deploy/install-hydro.sh                          # 标准安装（含 Caddy 反向代理）
#   bash deploy/install-hydro.sh --no-caddy               # 不装反代，只监听 127.0.0.1:8888
#   bash deploy/install-hydro.sh -- --judge               # 透传额外参数给官方脚本（独立评测机）
#   bash deploy/install-hydro.sh --skip-preflight         # 跳过体检标记校验（不推荐）

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
. "${SCRIPT_DIR}/lib/common.sh"

PASSTHRU=()
SKIP_PREFLIGHT=0

while [ $# -gt 0 ]; do
    case "$1" in
        --skip-preflight) SKIP_PREFLIGHT=1; shift ;;
        --) shift; PASSTHRU=("$@"); break ;;
        -h | --help)
            sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'
            exit 0
            ;;
        *) PASSTHRU+=("$1"); shift ;;
    esac
done

banner "Hydro 正式安装" "官方脚本 + 安装后第一道 Gate"

require_root
ensure_state_dir

# ---------- 步骤 1：确认体检已通过 ----------
log_step "步骤 1/6 校验体检结果"
if [ -f "${SYLU_STATE_DIR}/preflight.ok" ]; then
    log_ok "已找到体检通过标记："
    sed 's/^/        /' "${SYLU_STATE_DIR}/preflight.ok"
else
    if [ "$SKIP_PREFLIGHT" = "1" ]; then
        log_warn "未找到 ${SYLU_STATE_DIR}/preflight.ok，但已指定 --skip-preflight，继续。"
    else
        die "未通过体检。请先运行： bash deploy/preflight.sh --domain <你的域名>
（确实要跳过请显式加 --skip-preflight，出问题自行承担）"
    fi
fi

if has_hydro_cli; then
    log_warn "已存在 hydrooj 命令，疑似已安装过 Hydro。"
    confirm "确认要在现有环境上继续执行官方安装脚本？" || die "已取消。"
fi

# ---------- 步骤 2：安装前版本快照 ----------
log_step "步骤 2/6 安装前版本快照（供回滚对比，§49）"
BEFORE_SNAP="$(snapshot_versions)"
log_ok "已记录：$BEFORE_SNAP"

# ---------- 步骤 3：运行 Hydro 官方安装脚本 ----------
log_step "步骤 3/6 运行 Hydro 官方安装脚本"
log_info "来源：${HYDRO_SETUP_URL}（官方一键脚本，默认使用清华镜像）"
log_info "该步骤耗时数分钟，会安装 Node / MongoDB / Caddy / Hydro 本体 / 评测沙箱。"

SETUP_TMP="$(mktemp /tmp/hydro-setup.XXXXXX.sh)"
trap 'rm -f "$SETUP_TMP"' EXIT
if ! curl -fsSL --retry 3 --connect-timeout 15 "$HYDRO_SETUP_URL" -o "$SETUP_TMP"; then
    die "下载官方安装脚本失败。请检查出网策略，不要因此更换技术方案（§75）。"
fi
[ -s "$SETUP_TMP" ] || die "下载到的安装脚本为空"
if ! grep -qiE 'hydro' "$SETUP_TMP"; then
    die "下载内容不像 Hydro 安装脚本，已中止（避免执行来源不明的脚本）"
fi
log_ok "已校验安装脚本（$(wc -c <"$SETUP_TMP") 字节）"

log_info "执行：LANG=zh . <官方脚本> ${PASSTHRU[*]:-}"
log_warn "以下为官方安装脚本输出，如出现交互提问请按提示作答。"
record_note "开始执行官方安装脚本 参数=${PASSTHRU[*]:-none}"
# 官方推荐的调用方式：LANG=zh . <(curl https://hydro.ac/setup.sh)
# 这里改为对已下载并校验过的副本做 source，等价且更可控。
# shellcheck disable=SC1090
if [ "${#PASSTHRU[@]}" -gt 0 ]; then
    LANG=zh . "$SETUP_TMP" "${PASSTHRU[@]}"
else
    LANG=zh . "$SETUP_TMP"
fi

# ---------- 步骤 4：安装后自检 ----------
log_step "步骤 4/6 安装后自检"
PK_PASS=0; PK_WARN=0; PK_FAIL=0

if has_hydro_cli; then
    pk_pass "hydrooj 命令可用"
else
    pk_fail "未找到 hydrooj 命令，安装可能失败"
fi

SVC="$(hydro_service_active || true)"
case "$SVC" in
    systemd:*:active | pm2:*:online) pk_pass "Hydro 服务运行中（${SVC}）" ;;
    none:*) pk_fail "未检测到 Hydro 服务（systemd unit 与 pm2 均未发现）" ;;
    *) pk_fail "Hydro 服务未处于运行状态（${SVC}）" ;;
esac

HTTP_CODE="$(hydro_http_probe "http://127.0.0.1:8888/")"
case "$HTTP_CODE" in
    200 | 301 | 302 | 303) pk_pass "Hydro Web 响应 127.0.0.1:8888 -> HTTP ${HTTP_CODE}" ;;
    000) pk_fail "127.0.0.1:8888 无响应" ;;
    *) pk_warn "127.0.0.1:8888 返回 HTTP ${HTTP_CODE}（非预期，请查看日志）" ;;
esac

if command -v mongosh >/dev/null 2>&1 || command -v mongo >/dev/null 2>&1; then
    MONGO_URI="$(hydro_mongo_uri || true)"
    MONGO_CLI="$(command -v mongosh || command -v mongo)"
    if [ -n "$MONGO_URI" ] && "$MONGO_CLI" "$MONGO_URI" --quiet --eval 'db.runCommand({ping:1}).ok' >/dev/null 2>&1; then
        pk_pass "MongoDB 可连接且 ping 正常"
    else
        pk_fail "MongoDB 无法 ping 通（连接串取自 ${HYDRO_CONFIG}）"
    fi
else
    pk_warn "未安装 mongosh，跳过数据库连通性检查"
fi

mongo_bind_ok
case "$?" in
    0) pk_pass "MongoDB 仅监听 127.0.0.1（符合 §42）" ;;
    1) pk_fail "MongoDB 监听在非本机地址上！这会把数据库暴露到公网（违反 §42）" ;;
    2) pk_warn "无 ss 命令，无法确认 MongoDB 监听地址" ;;
esac

pk_summary

# ---------- 步骤 5：记录版本并生成 DEPLOY.md 表格 ----------
log_step "步骤 5/6 记录组件版本（§6 要求写入 DEPLOY.md）"
AFTER_SNAP="$(snapshot_versions)"
log_ok "快照已保存：$AFTER_SNAP"

VER_JSON="$(hydro_versions_json || true)"
{
    printf '\n---------- 复制以下内容到 docs/DEPLOY.md 的「当前部署版本记录」表格 ----------\n'
    printf '| 项目 | 版本 |\n|---|---|\n'
    printf '| 操作系统 | %s |\n' "$(. /etc/os-release 2>/dev/null && echo "${PRETTY_NAME:-unknown}")"
    printf '| 内核 | %s |\n' "$(uname -r)"
    printf '| 架构 | %s |\n' "$(uname -m)"
    printf '| Node.js | %s |\n' "$(node -v 2>/dev/null || echo 未安装)"
    printf '| MongoDB | %s |\n' "$(mongod --version 2>/dev/null | head -1 | sed 's/^db version //' || echo 未知)"
    printf '| NPM | %s |\n' "$(npm -v 2>/dev/null || echo 未知)"
    if [ -n "$VER_JSON" ]; then
        printf '%s\n' "$VER_JSON" | node -e '
            let s = "";
            process.stdin.on("data", (d) => s += d).on("end", () => {
                try {
                    const v = JSON.parse(s.trim().split("\n").pop());
                    for (const k of Object.keys(v)) console.log(`| Hydro ${k} | ${v[k]} |`);
                } catch (e) { console.log("| Hydro 版本 | 解析失败，请手动执行 hydrooj cli execute \"return global.Hydro.version\" |"); }
            });
        ' 2>/dev/null || true
    else
        printf '| Hydro 版本 | 请手动执行：hydrooj cli execute "return global.Hydro.version" |\n'
    fi
    printf '| 安装时间 | %s |\n' "$(date '+%Y-%m-%d %H:%M:%S %z')"
    printf '%s\n' '------------------------------------------------------------------------------'
} | tee "${SYLU_LOG_DIR}/install-versions-$(date '+%Y%m%d-%H%M%S').md"

# ---------- 步骤 6：第一道 Gate ----------
log_step "步骤 6/6 第一道 Gate（§7）— 以下 8 项全部 PASS 才允许开始改 UI"
cat <<'EOF'
    [ ] Hydro Web 页面打开
    [ ] MongoDB 正常
    [ ] Hydro 服务正常
    [ ] Judge 服务正常
    [ ] Sandbox 正常
    [ ] 管理员登录
    [ ] 普通用户注册
    [ ] 普通用户登录

  机器可判定的部分已由本脚本输出结果；手工部分请按下面顺序完成：
    1) 浏览器打开 http://<服务器IP>/ （或你的域名），注册第一个账号
       —— 注意：不要把第一个账号当作日常刷题号，系统需要它做初始化
    2) 在终端执行： hydrooj cli user setSuperAdmin 2
       （1 号账号用于系统消息，首个注册用户通常是 2 号）
    3) 刷新页面，导航栏应出现「控制面板」
    4) 进入控制面板 → 系统设置，把 Server BaseURL 填成完整访问地址并以 / 结尾
       例：https://oj.example.edu.cn/
    5) 再注册一个普通账号，验证注册/登录链路

  完整 Gate 复检： bash deploy/healthcheck.sh --gate
EOF

record_note "install-hydro.sh 结束 HTTP=${HTTP_CODE} 服务=${SVC}"
printf '\n%s下一步：bash deploy/configure.sh（品牌与站点配置）%s\n' "$C_BOLD" "$C_OFF"

if [ "$PK_FAIL" -gt 0 ]; then
    printf '%s注意：自检存在 %d 项失败，请先处理再继续。%s\n' "$C_RED" "$PK_FAIL" "$C_OFF"
    exit 1
fi
exit 0
