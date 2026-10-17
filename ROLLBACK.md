# ROLLBACK.md — 回滚手册（buddy）

> 出事了照这里做，别现场想。**每一节都是实跑过的，括号里是 2026-10-17 演练的真实耗时。**
> 本手册只覆盖「**静态托管回退**」这条路径的实操；云函数回退与数据恢复只写备查（第 7 节），**未经演练**。

## 0. 一句话

**静态回退 = 用上一版镜像重起 `web` 容器**，不碰数据、不碰后端：

```bash
cd ~/vbcd
docker rm -f vbcd-web-1
docker run -d --name vbcd-web-1 --restart unless-stopped \
  --network vbcd_internal -p 80:80 vbcd-web:prev-cc6aa14
```

**回滚前必须先备份当前镜像 tag**（§3 第 1 步），否则滚回去就滚不回来了。

> ⚠️ **不要用 `docker compose up` 来换镜像**——实测无效，原因见 §3.1。
> 这条是 2026-10-17 演练当场证伪的，不是推测。

## 1. 什么情况必须回滚（判断表）

> 判据是「**影响面 × 可修时间**」，不是「有没有 Bug」。有 Bug 不等于要回滚，判断标准是：**用户此刻是否用不了 / 是否在丢数据**。

| # | 现象 | 必须回滚？ | 为什么 / 怎么做 |
|---|---|---|---|
| R1 | 公网首页白屏、控制台 `index-xxx.js` 404 | **必须，立即** | 旧 `index.html` 指向已删产物（§6 的缓存问题）。用户**完全无法使用** → 立刻回滚 |
| R2 | 前端报错导致核心页（首页/归档/日志）打不开 | **必须，立即** | 同上，主路径断了 |
| R3 | 后端 5xx 连续、`/api/health` 非 200 | **先查再定** | 多半是 `server` 或依赖（pg/chroma）问题，**回滚前端没用**。先 `docker logs --since 10m vbcd-server-1`；确认是新版后端引入才回滚 server 镜像 |
| R4 | 数据写坏 / 误删（笔记、任务、图片） | **不回滚代码** | 回滚代码不会把数据变回来。按 §7 走数据恢复；同时**先停写**（见 R8） |
| R5 | 某个非核心功能坏（如某后台页、某个统计模块） | **不回滚** | 影响面小、可修。记录后当天修；用发布前检查 + 自测兜住不扩散 |
| R6 | 样式错位 / 字号不对 / 动效不生效 | **不回滚** | 只影响观感。评估后决定当天修还是下版修 |
| R7 | 只有个别用户报「还是老页面」 | **不回滚** | 是 CDN/浏览器缓存（§6），不是版本问题。指导硬刷新；必要时 Purge CDN |
| R8 | 怀疑正在被扫描/爆破/被写入垃圾数据 | **回滚 + 停写** | 先把写路径关掉（`AUTH_ENABLED=1` 或撤端口映射），再判断版本。**安全事件优先于版本问题** |
| R9 | 发布本身失败（构建挂了、镜像没起来） | **不需要回滚** | 老容器还在跑（`up -d` 失败不会替换运行中的容器）。确认 `docker ps` 后重试发布 |

**一句话记法**：**用户打不开 → 立刻回滚；用户能打开但某处不对 → 记录后修；数据出问题 → 停写 + 恢复，不回滚。**

## 2. 回滚目标在哪（三层，都要对得上）

| 层 | 位置 | v1.0 的值 | 上一可用版 |
|---|---|---|---|
| 源码 | git `main` | tag `v1.0` → `1387c1c` | `cc6aa14` |
| 镜像 | 服务器 docker | `vbcd-web:v1.0` / `vbcd-server:v1.0` | `vbcd-web:prev-cc6aa14` / `vbcd-server:prev-cc6aa14` |
| 产物指纹 | `index.html` 引用的 JS | `index-AshHe_0w.js`（md5 `d57b8707…`） | 构建后实测填写（§4 记录） |

## 3. 静态托管回退（主路径）

> 只换 `web` 容器：不动 server/pg/chroma，`data/` 与数据库完全不受影响——这是这条路径安全的根本原因。

```bash
# 0) 进服务器
ssh fel

# 1) 【必须先做】把「当前」镜像另存一个 tag，否则回滚后滚不回来
cd ~/vbcd
CUR=$(docker inspect vbcd-web-1 --format '{{.Image}}')
docker tag "$CUR" vbcd-web:before-rollback-$(date +%Y%m%d-%H%M)

# 2) 回退：删掉当前容器，用目标镜像原样重起
docker rm -f vbcd-web-1
docker run -d --name vbcd-web-1 --restart unless-stopped \
  --network vbcd_internal -p 80:80 vbcd-web:prev-cc6aa14

# 3) 立刻验证（不看日志先看公网）
curl -s -o /dev/null -w '%{http_code}\n' http://localhost/                 # 期望 200
curl -s http://localhost/ | grep -oE '/assets/index-[A-Za-z0-9_-]+\.js'    # 应是旧版 hash
docker inspect vbcd-web-1 --format '{{.Image}}' | cut -c8-19               # 应是目标镜像 ID
```

**为什么必须用 `docker run` 而不是 `docker compose up`**：

`docker-compose.yml` 的 `web` 服务只有 `build: ./web`、**没有 `image:` 键**。
compose 对「只有 build」的服务，`up` 时会按 build 重建，**镜像恒为 `vbcd-web:latest`**，
外部传 `WEB_IMAGE=...` 没有任何地方引用它 → 容器重建了、版本却没变（**最坏的一种「看起来成功了」**）。
`--no-build` 也无效（只禁止构建，仍解析成 latest）。

```bash
# 反例（2026-10-17 实测：容器 Recreated，但镜像仍是 c5bc0df43458）
WEB_IMAGE=vbcd-web:prev-cc6aa14 docker compose up -d --no-deps --force-recreate web
# 根因确认：
WEB_IMAGE=... docker compose config | grep -A3 '^  web:'   # → 只有 build，没有 image
```

> **归位**：`docker run` 起的容器脱离 compose 管理（`docker compose ps` 看不到它）。
> 应急可用，但下次正式发布时必须用 `docker compose up -d --build web` 让它回归 compose，
> 或先给 compose 补 `image:` 键（见 §9 待办）。

### 演练耗时（2026-10-17 实测）

| 阶段 | 耗时 |
|---|---|
| 备份当前镜像 tag | 0 s |
| `docker rm` + `docker run` | 2 s |
| 公网/源站/指纹验证 | 2 s |
| **合计（命令发出 → 公网看到旧版）** | **约 3 s** |
| 另：首次排查为什么 `compose up` 不生效 | 约 2 min（一次性成本，已写进本节） |

## 4. 回到 v1.0（恢复）

```bash
cd ~/vbcd
CUR=$(docker inspect vbcd-web-1 --format '{{.Image}}')
docker tag "$CUR" vbcd-web:rolled-back-$(date +%Y%m%d-%H%M)   # 万一恢复也失败，还能回去
docker rm -f vbcd-web-1
docker run -d --name vbcd-web-1 --restart unless-stopped \
  --network vbcd_internal -p 80:80 vbcd-web:v1.0
curl -s http://localhost/ | grep -oE '/assets/index-[A-Za-z0-9_-]+\.js'   # 应回到 index-AshHe_0w.js
```

## 5. 回滚后必须做的三件事

1. **验证而不是假设**：`index.html` 引用 + 浏览器实际能开（§6 缓存会骗人）。
2. **记录**：回滚时间、原因、回退到哪个 tag、恢复时间。写进当天 `runs/`。
3. **修根因**：回滚只是止血。把「为什么发出去的」写清楚——**是发布前检查漏了、还是检查过了但策略没查**，然后把缺的检查项补进 `skills/release-check/`。

## 6. 已知陷阱：`index.html` 缓存（v1.0 未修，**下次发版前建议先修**）

**现象**：回滚/发版后，部分浏览器仍加载**旧 `index.html`**，而它的 hash 资源已被新构建删除 → 白屏 + 控制台 404。

**原因**：
- `web/nginx.conf` **没有**给 `index.html` 下发 `Cache-Control`，nginx 只给 `Last-Modified`/`ETag`；
- 浏览器对无显式缓存头的 HTML 用 **heuristic 缓存**（约 `(now - Last-Modified) × 10%`，通常几分钟到十几分钟）；
- 带 hash 的 `assets/*` 反而应长缓存——**恰好反过来**才是对的。

**正确做法**（改 `web/nginx.conf`，需回归验证后再发版）：

```nginx
location = /index.html {
    add_header Cache-Control "no-cache, must-revalidate";
}
location /assets/ {
    add_header Cache-Control "public, max-age=31536000, immutable";
}
```

**临时缓解**：CDN 侧 Purge 该 URL；或指导用户硬刷新（`Ctrl/Cmd+Shift+R`）。

## 7. 备查：本轮未实操的两条路径

> 清单明确今日**不做**这两条实操，只写备查。**没演练过 = 出事时不要指望它。**

### 7.1 云函数回退

本项目**当前没有云函数**（后端是自托管 Node 容器，不是 serverless）。若将来开始用云函数：

- 回退单位是**函数版本号**而不是镜像；部署前必须留一个可回指的版本（阿里云 FC/SF 的 `versionId`、CloudBase 的版本列表）；
- 回退**不连带数据**：函数版本回退后，若新版已写过新结构数据，旧函数可能读不了——先确认 schema 是否向后兼容；
- **未演练**，接入云函数当天须补一次演练并更新本节。

### 7.2 数据恢复

- 数据在服务器 `~/vbcd/data/`（绑定挂载）+ Postgres 命名卷 `vbcd_pg-data`，**镜像回滚不覆盖它们**；
- 现状：**没有定时备份**（技术债）。最低限度的手工备份：

```bash
# 文件型资料
tar czf ~/backup-data-$(date +%F).tgz -C ~/vbcd data
# 数据库
docker compose exec -T pg pg_dump -U buddy buddy | gzip > ~/backup-db-$(date +%F).sql.gz
```

- 恢复 = 解包覆盖 `data/` + `psql` 回灌；**顺序是先停 server 再恢复**（否则正在写的请求会把恢复结果又写乱）；
- **未演练**。下次有备份后再演练一次「删一条真笔记 → 恢复 → 核验」。

## 8. 禁止事项

| 禁止 | 原因 | 该怎么做 |
|---|---|---|
| `docker volume rm vbcd_pg-data` / `chroma-data` | 删库不可逆 | 永远不要为了「重新开始」删卷 |
| `git reset --hard` + `git push -f` | 覆盖他人/历史，且不可撤回 | `git revert`（保留历史） |
| 回滚时 `git checkout` 服务器工作区 | 服务器 `docker-compose.yml` 有**本地有效改动**（`OPENAI_BASE_URL` 注释掉、切 DashScope），checkout 会抹掉 | 只换镜像，不动源码；需同步代码时先 `git stash` 并备份 |
| 回滚后不验证就说「好了」 | 缓存会骗人 | 看 `index.html` 引用 + 真实浏览器打开 |

## 9. 待办（本手册的已知短板，按优先级）

| 优先 | 事项 | 为什么 |
|---|---|---|
| 高 | 给 `docker-compose.yml` 的 `web`/`server` 补 `image:` 键 | 补了之后才能用「改镜像 tag + `up -d`」的正规做法回滚，不必 `docker rm`/`docker run` |
| 高 | `web/nginx.conf` 给 `index.html` 下发 `no-cache`（§6） | 从根上消掉「回滚了但用户还看到旧页/白屏」 |
| 中 | 加数据定时备份（§7.2） | 现在**零备份**，数据恢复这条路等于不存在 |
| 中 | 每次发布前跑一次「演练脚本」：确认 `prev-*` 镜像指纹 ≠ `v*` 镜像指纹 | 今天差点因为两个 tag 指向同一镜像而做了假演练 |
| 低 | 云函数回退（§7.1） | 当前无云函数，等真用了再补 |
