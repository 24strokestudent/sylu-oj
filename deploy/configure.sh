#!/usr/bin/env bash
# SYLU OJ · 安装后配置与品牌落地（对应实施计划 §1.2 §10 §11 §30 §31 §32 §33 §34 §40）
#
# 设计立场：**能用 Hydro 原生设置解决的，绝不写插件。**
# 站点名称、Logo、页脚附加内容、关于页正文，Hydro 都原生支持，
# 改完还能被升级保留下来；插件只用来补原生做不到的部分。
#
# 用法：
#   bash deploy/configure.sh                       # 打印配置清单（只读，不改任何东西）
#   bash deploy/configure.sh --apply \
#        --site-url http://1.2.3.4/                # 写入品牌设置（§30 §32 §34 §40）
#   bash deploy/configure.sh --test-registration --site-url http://<IP>/
#                                                  # 测试期免邮箱验证，默认配置保留现有验证设置
#   bash deploy/configure.sh --install-addon       # 安装插件并同步应用品牌设置
#   bash deploy/configure.sh --verify --url https://oj.example.edu.cn/
#                                                  # 校验线上页面是否符合规范
#
# 关于「谁来写设置」：设置是运行数据（存在 MongoDB 的 system 集合里），
# 但本脚本**不直接写库**，而是调用 `hydrooj cli system set` ——
# 它与控制面板「系统设置」走的是同一条代码路径，属于官方接口（§56）。
# 不直接写库的原因：会被后续数据库迁移覆盖，且绕过 Schema 校验。

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
. "${SCRIPT_DIR}/lib/common.sh"

INSTALL_ADDON=0
APPLY=0
VERIFY=0
SITE_URL=""
RESTART_NEEDED=0
TEST_REGISTRATION=0

# 只要安装插件，就必须同时应用 CSS 链接等原生设置；否则插件会加载但首页仍是无样式状态。
if [ "$INSTALL_ADDON" = 1 ] && [ "$APPLY" = 0 ]; then
    APPLY=1
    log_info "--install-addon 将同时执行 --apply，确保品牌样式与插件一起生效。"
fi

while [ $# -gt 0 ]; do
    case "$1" in
        --apply) APPLY=1; shift ;;
        --test-registration) TEST_REGISTRATION=1; APPLY=1; shift ;;
        --install-addon) INSTALL_ADDON=1; shift ;;
        --verify) VERIFY=1; shift ;;
        --url | --site-url) SITE_URL="${2:-}"; shift 2 ;;
        -h | --help) sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
        *) die "未知参数：$1" ;;
    esac
done

banner "品牌与站点配置" "原生设置优先，插件只补原生做不到的"

# ============================================================
log_step "0. 前置检查"
# ============================================================
if [ "$(id -u)" -eq 0 ]; then
    require_hydro_cli
    SVC="$(hydro_service_active || true)"
    log_info "Hydro 服务状态：${SVC}"
    log_info "站点内部地址：http://127.0.0.1:8888/ -> HTTP $(hydro_http_probe)"
else
    log_warn "非 root 运行：将跳过服务检查与插件安装，只打印配置清单。"
fi

# ============================================================
log_step "1. 控制面板里要改的原生设置（这是主要工作，不是插件）"
# ============================================================
cat <<'EOF'
  路径：登录管理员 → 控制面板 → 系统设置（需要再次验证管理员密码）

  【必改】站点身份
     server.name                     SYLU OJ
                                     ← 页头站点名。不要写"沈阳理工大学官方 OJ"
     server.url                      https://<你的域名>/      （必须以 / 结尾！）
                                     ← Server BaseURL，填错会导致跳转、邮件、榜单链接全错
     server.language                 zh_CN
     server.port                     8888（保持默认，对外由 Caddy/Nginx 反代）

  【必改】品牌视觉（§32 §34）
     ui-default.nav_logo_dark        /sylu-logo.svg（由 sylu-brand 提供）
                                     ← 原生支持，不需要改任何模板
     ui-default.footer_extra_html    页脚附加 HTML，一行一条，例如：
                                       <span>SYLU OJ · 学生维护的非官方编程学习与在线评测平台</span>
                                       <span>非学校官方信息系统 · 请勿上传隐私数据 · 请勿提交恶意代码</span>
                                       <link rel="stylesheet" href="/sylu/css/tokens.css">
                                       <link rel="stylesheet" href="/sylu/css/base.css">
                                     ← 免责声明走这里，零插件、零侵入；
                                       样式也只能走这里挂——injectUI 没有注入 CSS 的能力

  【建议】关于页与公告（§40）
     ui-default.about                关于本站正文（Markdown）。放入：
                                       平台使用须知 / 判题环境 / 反馈方式 / 隐私说明
                                     以及"非学校官方信息系统"声明。

  【建议】收敛访问面（§13 §39）
     limit.problem_files_max         100       （单题文件数上限，防误传大包）
     limit.problem_files_max_size    268435456 （单题文件总大小，字节）
     server.login                    true      （保留内置注册；§10 允许正常注册）

  【不要做】
     ✗ 不要删除或隐藏页脚的 "Powered by Hydro"
       （ui-default/templates/partials/footer.html 明确写明：除非购买企业授权，
         不得隐藏、修改或移除该版权信息；§31 同样要求保留）
     ✗ 不要在客户端决定角色（§10）：注册一律默认普通用户，权限只在服务端授予

  验证：改完刷新首页，确认浏览器标签页标题变成 SYLU OJ。
EOF

# ============================================================
log_step "1b. --apply：把上面这些设置真正写进去（官方 CLI）"
# ============================================================
if [ "$APPLY" = 1 ]; then
    [ "$(id -u)" -eq 0 ] || die "--apply 需要 root（要调用 hydrooj CLI）"
    require_hydro_cli

    if [ -z "$SITE_URL" ]; then
        SITE_URL="$(hydro_sys_get server.url 2>/dev/null || true)"
    fi
    case "$SITE_URL" in
        */) ;;
        '') die "拿不到 server.url。请显式指定：--site-url http://<IP>/ 或 --site-url https://<域名>/" ;;
        *) die "server.url 必须以 / 结尾（当前：${SITE_URL}）。否则站内跳转、榜单、邮件链接会错位（§33，见 docs/DEPLOY.md §6.3）" ;;
    esac

    # footer_extra_html 按行拆分：footer.html 会 .split('\n') 遍历，
    # 每条自动包一层 <li class="footer__extra-link-item">，所以这里**不要**自己写 <li>。
    #
    # 样式按职责拆成多份，放在 addons/sylu-brand/public/sylu/css/，由 server.ts 的
    # public 静态目录以 web 根路径托管。逐份直链而不是 @import：@import 串行阻塞渲染。
    # 挂在 /sylu/ 命名空间下，不占用 /css 这种上游将来可能用的根路径。
    #
    # 版本号取内容哈希：手动写死 ?v= 的话，改了样式却忘记 bump 就会让客户端继续吃旧缓存。
    # 链接清单同样由目录内容生成，避免"加了文件忘了挂链接"这种静默失效。
    CSS_DIR="${SYLU_OJ_ROOT}/addons/sylu-brand/public/sylu/css"
    # 层叠顺序由这个名单决定，改名单即改层叠；render.js 的 CSS_FILES 必须与之一致（check.js 断言）
    CSS_ORDER="tokens base shell home about oj responsive"
    CSS_LINKS=()
    if [ -d "$CSS_DIR" ]; then
        CSS_V="$(cat "$CSS_DIR"/*.css 2>/dev/null | md5sum | cut -c1-8)"
        for _name in $CSS_ORDER; do
            [ -f "$CSS_DIR/${_name}.css" ] || continue
            CSS_LINKS+=("<link rel='stylesheet' href='/sylu/css/${_name}.css?v=${CSS_V}'>")
        done
    else
        log_warn "找不到 ${CSS_DIR}，本次不会挂载本站样式，页面将退回 Hydro 原生外观"
    fi
    FOOTER_HTML="$(printf '%s\n' \
        '<span>SYLU OJ · 学生维护的非官方编程学习与在线评测平台</span>' \
        '<span>非学校官方信息系统 · 请勿上传隐私数据 · 请勿提交恶意代码</span>' \
        ${CSS_LINKS[@]+"${CSS_LINKS[@]}"})"

    # §40 关于页正文：只写事实，不编造统计数字、不放假联系方式（§29 §65）
    ABOUT_MD="$(cat <<'ABOUT'
## 关于本站

SYLU OJ 是一个面向程序设计学习与算法训练的在线评测平台，由学生自行搭建与维护。

**本站不是学校官方信息系统。** 本站发布的内容、数据与评测结果均不代表学校立场；
如与学校官方教学平台存在出入，请以学校官方发布为准。

### 平台使用须知

- 注册即表示你同意遵守本站使用规范；请勿上传任何隐私数据、涉密信息或他人作品。
- 请勿提交恶意代码、尝试攻击评测环境或干扰他人正常使用。
- 题目、题解与提交记录默认对已登录用户可见；请不要在代码里写入个人敏感信息。

### 判题环境

评测在沙箱中运行，与网站服务相互隔离。题目的编译选项与资源限制以题目页面说明为准。

### 反馈方式

遇到题目描述错误、判题异常或站点无法访问等问题，请在本站「讨论」区发帖说明，
或联系本站维护账号。我们会尽量处理，但不承诺处理时限。

### 隐私说明

本站只收集运行所必需的信息（账号、提交记录、评测结果），不用于任何商业用途。
请不要在本站存放或提交任何你希望保密的内容。
ABOUT
)"

    # 写入 = 读原值 -> 完整值比较 -> 写 -> 完整值读回校验。
    # CLI 失败必须进入最终失败汇总，不能被后续 verify 或重启掩盖。
    APPLY_FAILED=0
    apply_setting() {
        local key="$1" value="$2" before want after
        before="$(hydro_sys_get "$key" 2>/dev/null || true)"
        want="$value"
        if [ "$before" = "$want" ]; then
            pk_pass "${key} 已是目标值，跳过"
            return 0
        fi
        if ! hydro_sys_set "$key" "$value"; then
            pk_fail "写入失败：${key}"
            return 1
        fi
        after="$(hydro_sys_get "$key" 2>/dev/null || true)"
        if [ "$after" = "$want" ]; then
            pk_pass "${key} 已写入"
        else
            pk_fail "${key} 写入后读回值与目标不一致"
            return 1
        fi
        return 0
    }

    PK_PASS=0; PK_WARN=0; PK_FAIL=0
    apply_setting server.name "$SYLU_SITE_NAME" || APPLY_FAILED=1
    apply_setting server.url "$SITE_URL" || APPLY_FAILED=1
    apply_setting server.language zh_CN || APPLY_FAILED=1
    # 测试期不发送注册验证邮件；注册页会直接进入密码设置步骤。
    if [ "$TEST_REGISTRATION" = 1 ]; then
        apply_setting smtp.verify false || APPLY_FAILED=1
    fi
    apply_setting ui-default.footer_extra_html "$FOOTER_HTML" || APPLY_FAILED=1
    apply_setting ui-default.about "$ABOUT_MD" || APPLY_FAILED=1

    # 首页模块编排：homepage.yaml 是唯一出处，脚本不再抄一份。
    # hydrooj.homepage 是 type: yaml 的系统设置，存的正是这份 YAML 文本本身。
    HOMEPAGE_YAML="${SYLU_OJ_ROOT}/addons/sylu-brand/homepage.yaml"
    if [ -f "$HOMEPAGE_YAML" ]; then
        apply_setting hydrooj.homepage "$(cat "$HOMEPAGE_YAML")" || APPLY_FAILED=1
    else
        pk_warn "找不到 ${HOMEPAGE_YAML}，首页模块编排保持站点当前值"
    fi

    # 首页公告属于 system 域资料，使用官方 DomainModel.edit 写入，避免直接操作 MongoDB。
    # 这里**只放长期成立的使用说明**：首屏 Hero 已由 addons/sylu-brand/templates/main.html
    # 承载，而公告会过 markdown-it-xss，class 属性会被整段剥掉（markdown-it-xss.ts:154），
    # 塞结构化的 Hero HTML 本来就立不住（计划 §51：Hero 属于代码，不属于部署配置）。
    # 也不写具体赛事/作业日期：那是当期信息，脚本每次跑都会把它盖回去，且属于未发生的假数据。
    SYLU_BULLETIN="$(cat <<'BULLETIN'
## 开始使用

题库、训练题单、比赛与讨论区都在顶部导航；登录后即可提交代码，评测结果实时返回。

## 评测环境

提交会在隔离沙箱中运行。编译器、时间限制和内存限制以题目页面显示为准；遇到题面或评测异常，请在讨论区反馈提交记录编号。
BULLETIN
    )"
    if SYLU_BULLETIN="$SYLU_BULLETIN" timeout 90 hydrooj cli execute \
        'return await global.Hydro.model.domain.edit("system", { name: "SYLU OJ", bulletin: process.env.SYLU_BULLETIN })' \
        >/dev/null 2>&1; then
        pk_pass "system 域名称与首页公告已更新"
    else
        pk_fail "system 域名称与首页公告更新失败"
        APPLY_FAILED=1
    fi
    pk_summary

    if [ "$APPLY_FAILED" -ne 0 ]; then
        die "配置写入未全部生效，已拒绝重启并返回失败。"
    fi

    # server.url 会被部分组件在启动时读入并缓存，和插件合并到脚本末尾统一重启。
    RESTART_NEEDED=1

    if hydro_sys_set ui-default.nav_logo_dark /sylu-logo.svg; then
        log_ok "ui-default.nav_logo_dark 已指向 SYLU 品牌资源"
    else
        log_warn "ui-default.nav_logo_dark 写入失败，请在系统设置中填写 /sylu-logo.svg"
    fi

    record_note "configure.sh --apply site_url=${SITE_URL}"
else
    log_info "未指定 --apply，仅打印清单，不做任何改动。"
    log_info "要写入请执行：bash deploy/configure.sh --apply --site-url http://<域名或IP>/"
fi

# ============================================================
log_step "2. 用户与权限（§9 §10 §11）"
# ============================================================
cat <<'EOF'
  V1 只保留四类身份：Guest / Student / Teacher / Admin，全部走 Hydro 原生权限系统，
  不新建角色表。

  注册规则（§10）：
     · 允许正常注册，注册后默认普通用户
     · 测试期关闭邮箱验证：注册页会直接进入密码设置，不会发送验证码邮件
     · 前端**绝对禁止**提交 role=admin / role=teacher —— 身份只能由服务端权限控制

  教师授权（§11，V1 人工授权）：
     普通账号注册 → 管理员确认身份 → 管理员在「用户管理 / 域权限」里授予
     常用命令：
       hydrooj cli user setSuperAdmin <uid>      # 仅系统维护号，不要日常使用
     域内授权请用控制面板 → 域 → 用户/角色，不要在库里直接改（§56）

  账号纪律（§8）：
     · 建一个 system-admin 专用于系统维护
     · 开发者日常刷题用普通账号
     · 不要用 admin/admin、123456 这类弱口令，也不与学生账号共用
EOF

# ============================================================
log_step "3. 图形化确认：去控制面板逐项打勾"
# ============================================================
cat <<'EOF'
     [ ] server.name        已改为 SYLU OJ
     [ ] server.url         已填完整地址且以 / 结尾
     [ ] nav_logo_dark      已指向本站 Logo
     [ ] footer_extra_html  已加入非官方声明
     [ ] ui-default.about   已写入使用须知 / 判题环境 / 反馈方式 / 隐私说明
     [ ] 已建立 system-admin 专用维护账号，且未使用弱口令
     [ ] 已注册一个普通账号，验证注册 / 登录 / 退出链路
EOF

# ============================================================
log_step "4. 可选：安装 sylu-brand 插件（只补原生做不到的两件事）"
# ============================================================
ADDON_DIR="${SYLU_OJ_ROOT}/addons/sylu-brand"
if [ "$INSTALL_ADDON" = 1 ]; then
    [ "$(id -u)" -eq 0 ] || die "安装插件需要 root"
    [ -f "${ADDON_DIR}/index.js" ] || die "找不到插件：${ADDON_DIR}/index.js"
    log_info "插件目录：${ADDON_DIR}"
    log_info "作用：顶栏「关于本站」入口 + 一页聚合的平台须知（§40）"
    log_info "不作用：站点名称、Logo、页脚 —— 那些用上面第 1 步的原生设置"
    record_note "configure.sh 安装 sylu-brand 插件"
    hydrooj addon add "$ADDON_DIR"
    RESTART_NEEDED=1
    log_ok "已登记插件，脚本结束前会统一重启并等待 Hydro 就绪。"
else
    log_info "未指定 --install-addon，跳过。"
    log_info "要装请执行：bash deploy/configure.sh --install-addon"
fi

# 应用设置和插件注册都完成后只重启一次，并等待端口恢复，避免刚重启就被误判为失败。
if [ "$RESTART_NEEDED" = 1 ]; then
    log_step "4b. 重启并等待 Hydro 就绪"
    if hydro_restart hydrooj; then
        log_ok "已重启 hydrooj"
    else
        die "自动重启 hydrooj 失败，请检查 pm2/systemd 状态后重试。"
    fi
    READY_TIMEOUT="${SYLU_CONFIGURE_READY_TIMEOUT:-60}"
    READY_CODE="000"
    for _ in $(seq 1 "$READY_TIMEOUT"); do
        READY_CODE="$(hydro_http_probe 'http://127.0.0.1:8888/')"
        case "$READY_CODE" in
            200 | 301 | 302 | 303) break ;;
        esac
        sleep 1
    done
    case "$READY_CODE" in
        200 | 301 | 302 | 303) log_ok "Hydro 已就绪（HTTP ${READY_CODE}）" ;;
        *) die "等待 ${READY_TIMEOUT}s 后 Hydro 仍未就绪（最后状态 ${READY_CODE}）。" ;;
    esac
fi

# ============================================================
log_step "5. 线上校验（--verify）"
# ============================================================
if [ "$VERIFY" = 1 ]; then
    [ -n "$SITE_URL" ] || SITE_URL="http://127.0.0.1:8888/"
    log_info "检查目标：${SITE_URL}"

    PK_PASS=0; PK_WARN=0; PK_FAIL=0

    PAGE_FILE="$(mktemp)"
    trap 'rm -f -- "$PAGE_FILE"' EXIT
    CODE="$(curl -s -o "$PAGE_FILE" -w '%{http_code}' --max-time 15 "$SITE_URL" 2>/dev/null || true)"
    [ -n "$CODE" ] || CODE="000"
    case "$CODE" in
        200) pk_pass "首页返回 200" ;;
        000) pk_fail "首页无法访问（DNS / HTTPS / 反代 / 防火墙，逐项排查）" ;;
        *) pk_fail "首页返回 HTTP ${CODE}（期望 200）" ;;
    esac

    if [ -s "$PAGE_FILE" ]; then
        if grep -qi 'Powered by' "$PAGE_FILE" && grep -qi 'hydro' "$PAGE_FILE"; then
            pk_pass "页脚保留 Powered by Hydro 归属声明（§31，不得删除）"
        else
            pk_fail "页脚找不到 Powered by Hydro —— 违反 §31 与上游版权声明，必须恢复"
        fi

        if grep -qiE '沈阳理工大学|沈阳理工[[:space:]]*OJ|SYLU[[:space:]]*OJ' "$PAGE_FILE"; then
            if grep -qiE '非官方|不是.*官方|学生维护' "$PAGE_FILE"; then
                pk_pass "已声明非官方定位（§30）"
            else
                pk_warn "页面出现校名但没有非官方声明，建议在 ui-default.footer_extra_html 补上（§30）"
            fi
        else
            pk_warn "页面未出现校名（可能还没设 server.name）"
        fi

        # 去掉标签后按完整单词匹配，避免把正常的 footer 误判成 foo 占位文本。
        PAGE_TEXT="$(sed -E 's/<[^>]+>/ /g' "$PAGE_FILE")"
        if printf '%s\n' "$PAGE_TEXT" | grep -qiE '(^|[^[:alnum:]_])(foo|TODO|lorem)([^[:alnum:]_]|$)|example\.com'; then
            pk_warn "页面含占位文本（foo/example/TODO/lorem），上线前需清理（§65）"
        else
            pk_pass "未发现明显占位文本"
        fi

        # §65 无假数据：首页出现"注册用户 X 万"这类未接真实数据的文案要拦下
        if grep -qiE '[0-9]+\s*万\s*(用户|学生)|累计提交\s*[0-9]+' "$PAGE_FILE"; then
            pk_warn "首页疑似存在写死的统计数字，请确认是否已接真实数据（§29 §65）"
        else
            pk_pass "未见写死的统计数字"
        fi
    fi

    # §65 无死链接：关键路由必须可达（未登录应 200/302，不应 404/500）
    BASE="${SITE_URL%/}"
    for ROUTE in /p /ranking /contest /homework /register /login; do
        C="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "${BASE}${ROUTE}" 2>/dev/null || true)"
        [ -n "$C" ] || C="000"
        case "$C" in
            200 | 301 | 302 | 303) pk_pass "路由 ${ROUTE} 可达（HTTP ${C}）" ;;
            404) pk_fail "路由 ${ROUTE} 返回 404 —— 死链接（§65）" ;;
            000) pk_fail "路由 ${ROUTE} 无响应" ;;
            *) pk_fail "路由 ${ROUTE} 返回 HTTP ${C}" ;;
        esac
    done

    pk_summary
    [ "$PK_FAIL" -eq 0 ] || exit 1
else
    log_info "未指定 --verify，跳过线上校验。"
    log_info "上线前请执行：bash deploy/configure.sh --verify --url https://你的域名/"
fi

record_note "configure.sh 执行完毕 install_addon=${INSTALL_ADDON} verify=${VERIFY}"
printf '\n%s下一步：bash deploy/healthcheck.sh --gate   （§7 第一道 Gate 复检）%s\n' "$C_BOLD" "$C_OFF"
