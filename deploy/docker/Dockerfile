# syntax=docker/dockerfile:1
#
# SYLU OJ · Hydro 应用镜像（Web + 内嵌评测机 + go-judge 沙箱）
#
# 与裸机部署（deploy/install-hydro.sh，走 Nix + pm2 + 主机 Caddy/MongoDB）的区别：
#   - 不用 Nix：编译器与工具链由 apt 提供，沙箱直接用 go-judge 内置默认挂载
#   - 不用 pm2：进程由 deploy/docker/entrypoint.sh 托管
#   - 不含 MongoDB / Caddy：分别由 docker-compose 的 mongo / caddy 服务提供
#
# 版本与 docs/DEPLOY.md「版本记录表」保持一致，升级时整组一起动。
#
# 构建（在仓库根目录执行，构建上下文必须是仓库根）：
#   docker build -f deploy/docker/Dockerfile -t sylu-oj/hydro:local .
# 通常直接用 compose：
#   docker compose -f deploy/docker/docker-compose.yml build

FROM node:24-bookworm-slim

ARG DEBIAN_FRONTEND=noninteractive
ARG GO_JUDGE_VERSION=1.12.3
ARG MONGO_TOOLS_VERSION=100.13.0
ARG HYDROOJ_VERSION=5.0.7
ARG HYDRO_UI_VERSION=4.58.5
ARG HYDRO_JUDGE_VERSION=4.0.6
ARG HYDRO_FPS_VERSION=1.6.0
ARG HYDRO_A11Y_VERSION=0.0.4

ENV TZ=Asia/Shanghai \
    LANG=C.UTF-8 \
    LC_ALL=C.UTF-8 \
    HOME=/root \
    SYLU_OJ_ROOT=/opt/sylu-oj

# ---------- 系统依赖 ----------
# gcc/g++/python3：判题编译器；zip/unzip/diffutils/patch：hydrooj backup 与补丁
RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends \
        ca-certificates curl gnupg gcc g++ make python3 \
        unzip zip diffutils patch procps tini; \
    rm -rf /var/lib/apt/lists/*

# ---------- MongoDB 命令行工具（hydrooj backup / restore 依赖 mongodump、mongorestore） ----------
# 官方 Debian apt 源不提供 arm64 包，这里直接取官方预编译包，按架构选择。
RUN set -eux; \
    arch="$(dpkg --print-architecture)"; \
    case "$arch" in \
        amd64) tools_pkg="debian12-x86_64" ;; \
        arm64) tools_pkg="ubuntu2204-arm64" ;; \
        *) echo "不支持的架构：$arch" >&2; exit 1 ;; \
    esac; \
    curl -fsSL -o /tmp/mongo-tools.tgz \
        "https://fastdl.mongodb.org/tools/db/mongodb-database-tools-${tools_pkg}-${MONGO_TOOLS_VERSION}.tgz"; \
    tar -xzf /tmp/mongo-tools.tgz -C /tmp; \
    install -m 0755 /tmp/mongodb-database-tools-*/bin/mongodump /usr/local/bin/; \
    install -m 0755 /tmp/mongodb-database-tools-*/bin/mongorestore /usr/local/bin/; \
    rm -rf /tmp/mongo-tools.tgz /tmp/mongodb-database-tools-*; \
    mongodump --version | head -1

# ---------- go-judge -> hydro-sandbox（评测沙箱） ----------
RUN set -eux; \
    arch="$(dpkg --print-architecture)"; \
    case "$arch" in \
        amd64) gj_arch="amd64v2" ;; \
        arm64) gj_arch="arm64" ;; \
        *) echo "不支持的架构：$arch" >&2; exit 1 ;; \
    esac; \
    curl -fsSL -o /tmp/go-judge.tar.gz \
        "https://github.com/criyle/go-judge/releases/download/v${GO_JUDGE_VERSION}/go-judge_${GO_JUDGE_VERSION}_linux_${gj_arch}.tar.gz"; \
    tar -xzf /tmp/go-judge.tar.gz -C /tmp go-judge; \
    install -m 0755 /tmp/go-judge /usr/local/bin/hydro-sandbox; \
    rm -rf /tmp/go-judge.tar.gz /tmp/go-judge; \
    hydro-sandbox -version

# ---------- yarn（Hydro 官方用 yarn global add 安装） ----------
RUN set -eux; \
    npm install -g yarn@1.22.22; \
    yarn --version

# ---------- Hydro 组件（整组安装，版本与 docs/DEPLOY.md 记录一致） ----------
COPY deploy/docker/esbuild-resolutions.cjs /tmp/esbuild-resolutions.cjs
RUN set -eux; \
    ygd="$(yarn global dir)"; \
    mkdir -p "$ygd"; \
    node /tmp/esbuild-resolutions.cjs "$ygd"; \
    yarn global add \
        "hydrooj@${HYDROOJ_VERSION}" \
        "@hydrooj/ui-default@${HYDRO_UI_VERSION}" \
        "@hydrooj/hydrojudge@${HYDRO_JUDGE_VERSION}" \
        "@hydrooj/fps-importer@${HYDRO_FPS_VERSION}" \
        "@hydrooj/a11y@${HYDRO_A11Y_VERSION}"; \
    rm -f /tmp/esbuild-resolutions.cjs

# 让 sylu-brand 插件能解析到 hydrooj 本体（index.js 的 SYLU_HYDRO_CORE 兜底）
ENV SYLU_HYDRO_CORE=/usr/local/share/.config/yarn/global/node_modules

# ---------- 品牌插件与入口 ----------
COPY addons/sylu-brand /opt/sylu-oj/addons/sylu-brand
COPY deploy/docker/entrypoint.sh /usr/local/bin/sylu-entrypoint
RUN chmod 0755 /usr/local/bin/sylu-entrypoint

WORKDIR /opt/sylu-oj
EXPOSE 8888

HEALTHCHECK --interval=30s --timeout=10s --start-period=180s --retries=10 \
    CMD curl -fsS -o /dev/null http://127.0.0.1:8888/ || exit 1

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/sylu-entrypoint"]
