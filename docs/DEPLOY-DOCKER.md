# SYLU OJ 容器部署（Docker Compose）

> 面向：想用容器而不是裸机装这套 OJ 的人。
> 定位：`docs/DEPLOY.md` 的**替代路径**，不是替代品——两条路径产出的站点是同一套
> （Hydro Web + 内嵌评测机 + go-judge 沙箱 + MongoDB + Caddy）。

---

## 0. 什么时候用这条路径

| | 裸机（`docs/DEPLOY.md`） | 容器（本文档） |
|---|---|---|
| 装法 | Hydro 官方 `setup.sh`：Nix + `yarn global` + pm2 | `docker compose up -d --build` |
| 进程托管 | pm2 | docker（`restart: unless-stopped`） |
| 沙箱挂载 | `~/.hydro/mount.yaml`（**已真机验证隔离**） | go-judge 内置默认挂载（**隔离未验证，见 §6**） |
| 真机验证 | ✅ 已在 Debian 12 跑通 | ⚠️ 仅 CI 里构建成功 + 启动探活通过，**没跑过判题** |
| 适合 | 生产、长期维护 | 快速试跑、CI、无法使用 Nix 的环境 |

> 只想把站点跑起来看看，用容器；要交付生产，先看 §6 的三个差异再决定。

## 1. 组件与端口

| 服务 | 端口 | 是否对外 | 说明 |
|---|---|---|---|
| `caddy` | 80 / 443 | **是** | 唯一对外入口，自动 HTTPS + 静态文件 + 反代 |
| `hydro` | 8888 | 否（`expose`） | Hydro Web + 内嵌评测机 + go-judge 沙箱 |
| `mongo` | 27017 | 否（仅 compose 网络） | MongoDB，**绝不对外**（§42） |

沙箱端口 `5050` 只在 `hydro` 容器内部监听 `localhost`。

## 2. 前置条件

| 项 | 要求 | 原因 |
|---|---|---|
| Docker Engine | ≥ 24，含 compose v2 | 用到 `--wait` |
| 内存 | ≥ 4 GB | 沙箱 + MongoDB |
| CPU | 支持 `avx` | 评测机依赖 |
| 磁盘 | ≥ 40 GB | 镜像、题面、测试点、数据、备份 |
| 内核 | ≥ 4.4 | go-judge 依赖 cgroup / namespace |
| 权限 | 能执行 docker | `hydro` 容器以 `privileged: true` + `cgroup: host` 运行，这是 go-judge 的硬要求 |

## 3. 部署步骤

```bash
git clone <本仓库> sylu-oj && cd sylu-oj

cp deploy/docker/.env.example deploy/docker/.env
$EDITOR deploy/docker/.env      # 必改：MONGO_ROOT_PASSWORD、HYDRO_MONGO_PASSWORD、SITE_ADDRESS

docker compose -f deploy/docker/docker-compose.yml up -d --build
docker compose -f deploy/docker/docker-compose.yml logs -f hydro
```

镜像首次构建要下载 Hydro 五个包、go-judge 与 mongodb-database-tools，**约 5–15 分钟**（之后有构建缓存）。

### 3.1 首次启动会做什么

`deploy/docker/entrypoint.sh` 按顺序执行：

1. 用 `MONGO_URI` 生成 `~/.hydro/config.json`（权限 `600`）
2. 维护 `~/.hydro/addon.json`：4 个官方包 + 挂载 `sylu-brand` 品牌插件
3. 首次启动用官方接口写设置：`server.xff` / `xhost` / `xproxy` / `name` / `url`，然后落 `.docker-initialized` 标记（失败只告警，下次启动重试）
4. 启动 `hydro-sandbox`（go-judge，监听 `localhost:5050`）
5. 启动 `hydrooj`（监听 `8888`）

> ⚠️ **第一个注册的用户会自动成为超级管理员**（§6.8 的同一个坑）。
> 先把专用维护号注册掉，别拿测试账号占位。

### 3.2 部署后验证

```bash
docker compose -f deploy/docker/docker-compose.yml ps
curl -fsS -o /dev/null -w 'HTTP %{http_code}\n' http://127.0.0.1/
docker compose -f deploy/docker/docker-compose.yml exec -T hydro curl -fsS http://127.0.0.1:5050/version
```

期望：三个容器 healthy、首页 200、沙箱返回版本信息。

## 4. 域名与 HTTPS

1. 把 `.env` 里的 `SITE_ADDRESS` 从 `:80` 改成域名（如 `oj.example.edu.cn`）→ Caddy 自动申请并续期证书
2. 控制面板把 `server.url` 设为 `https://<域名>/`——**必须以 `/` 结尾**，否则跳转、邮件与榜单链接全错
3. 云主机安全组放行 80 与 443

> ⚠️ 服务器在中国大陆时，域名对外提供 Web 服务**必须先完成 ICP 备案**，否则会被阻断。

## 5. 数据卷、备份与升级

| 卷 | 内容 |
|---|---|
| `hydro-data` | `~/.hydro`（配置、addon 清单） |
| `hydro-static` | 前端静态资源（Caddy 只读挂载） |
| `hydro-files` | `/data/file` 用户上传与题目附件 |
| `hydro-backups` | `/var/backups/sylu-oj` |
| `mongo-data` | MongoDB 数据目录 |
| `caddy-data` / `caddy-config` | 证书与 Caddy 状态 |

备份（容器内跑 Hydro 官方备份）：

```bash
docker compose -f deploy/docker/docker-compose.yml exec -T hydro hydrooj backup --withAddons
```

升级：改 `.env` 里的版本号 → `docker compose -f deploy/docker/docker-compose.yml up -d --build`。
**版本必须整组一起动**（`HYDROOJ_VERSION` / `HYDRO_UI_VERSION` / `HYDRO_JUDGE_VERSION` / `HYDRO_FPS_VERSION` / `HYDRO_A11Y_VERSION` / `GO_JUDGE_VERSION` / `MONGO_TOOLS_VERSION`），与 `docs/DEPLOY.md` 的版本记录表保持一致。

## 6. 与裸机路径的三个差异（重点）

1. **沙箱隔离配置不同。** 容器路径**不提供 `mount.yaml`**，改走 go-judge 内置默认挂载。
   裸机那套隔离结论（`27017` / `5050` / `2019` / `8888` 只听 `127.0.0.1`）**不能直接套用**。
   上线前必须用 `test/sandbox-suite/` 的 6 个用例（网络隔离、文件隔离、TLE、MLE、OLE、fork）实测并记录结果。
2. **没有 pm2。** 进程由 `entrypoint.sh` 托管，任一进程退出即收敛，由 compose 的 `restart: unless-stopped` 重建容器。
3. **CI 的探活 ≠ 可用。** workflow 里的 `docker-smoke` 只 curl 两个端口，**一次代码都没提交过**。

## 7. 故障排查

| 现象 | 原因 |
|---|---|
| `MONGO_ROOT_PASSWORD is required` 直接退出 | `.env` 没填；注意 `${VAR:?}` **只拦空值，不拦占位口令**——`change-me-root` 会被当成合法口令，务必手动改掉 |
| 提交后一直 `Pending` 或 RE | 沙箱缺少 `privileged` / host cgroup / 足够的 `/dev/shm`（调 `.env` 的 `HYDRO_SHM_SIZE`） |
| 首页能开但样式全丢 | Caddy 的 `root /srv/hydro` 与 `hydro-static` 卷没对上 |
| 容器反复重启 | 看 `logs hydro`；entrypoint 在任一子进程退出时会主动退出容器 |
| `hydro` 起不来且提示连不上数据库 | `mongo` 健康检查未过（口令不一致，或 `mongo-init.js` 只在**首次**初始化数据目录时执行） |

## 8. 参考

- 裸机部署与运维：`docs/DEPLOY.md`
- 验收清单：`docs/ACCEPTANCE.md`
- 容器编排与构建入口：`deploy/docker/`（`Dockerfile`、`docker-compose.yml`、`Caddyfile`、`entrypoint.sh`、`.env.example`、`mongo-init.js`）
- CI：`.github/workflows/ci.yml`
