# F13 部署实况：token 被注释污染 + B 站 412 · 留证

日期：2026-10-14 ｜ 环境：服务器 `fel`（阿里云上海 `139.224.192.94`，2 vCPU / 1.8 GiB，Docker 26.1.3，整套 compose 栈在跑且 `:80` 对外）＋ 本机 Ubuntu（对照用）
范围：排查并修复两串真实报错（401 → 412），**仓库代码 0 行改动**；只改服务器上的 `.env`、cookie 文件与容器，另把口径落进 `RUN.md` / `asr/.env.example`。
未做：任何跨机拆分、任何接口/契约改动、真转写任务的 AI 代跑。

## 结论速览

| # | 报错原文 | 真因 | 修法 | 证据 |
|---|---|---|---|---|
| ① | `提交转写失败：缺少或错误的 Bearer Token`（上游 401 `AUTH_FAILED`） | `fel:asr/.env` 的 `SERVICE_TOKEN=` **值留空、注释写在同行** → compose env_file 把那串中文注释当成了值（50 字符、非 ASCII）；而 `fel:server/.env` 未配 `ASR_SERVICE_TOKEN` → 服务侧不发 Authorization 头 | `asr/.env` 整体重写（注释移到键上一行）＋ `server/.env` 补 `ASR_SERVICE_TOKEN`（48 位 hex）＋ `docker compose up -d asr server` | asr 容器 25 个环境键**仅 4 个指纹变化**；server→asr 返回 `404 JOB_NOT_FOUND`（改前 401） |
| ② | `转写失败：下载失败：… HTTP Error 412: Precondition Failed` | B 站风控拦**出口 IP 身份**（机房 IP 一律 412，与国内/海外无关）＋ 无登录态 | 登录态 cookies → `asr/.secrets/bilibili.txt` ＋ `YTDLP_COOKIES_DIR=/app/secrets` ＋ 重建 asr | `/v1/subtitles` 由 412 变 `200 {"found":false}`；`fetch_source` 真下载成功 859 KB / 70.565 s |

## ① token 被注释污染

### 证据（改前）

```
fel: docker exec vbcd-asr-1  printenv SERVICE_TOKEN
     → len=50  ascii=False  起首字符 '# 必填：/v1/* 的'
fel: docker exec vbcd-server-1 printenv ASR_SERVICE_TOKEN
     → []（空，len=0）
fel: GET /v1/jobs/none（不带 token） → 401 AUTH_FAILED
本机对照：asr=dev-asr-token-change-me / server=同名 → 一致（所以本机 F13 是好的）
```

`fel:asr/.env` 原始行形状：`SERVICE_TOKEN=                  # 必填：/v1/* 的 Bearer token；…`（值留空 + 同行注释）。

### 口径修正（本轮最值钱的一条）

> compose 的 `env_file` **只在值非空时**才剥掉行内注释；**值留空时整段 ` # …` 会变成值本身**。
> 同一容器内可同时看到两种表现：`ASR_CHUNK_SECONDS=180  # …` → `180`（剥了），`YTDLP_PROXY=  # 下载走代理时填` → `# 下载走代理时填`（没剥）。
> 这与 `RUN.md` 8.7 原先「`docker compose` 会剥」的写法不符，已纠正。

### 修复步骤与产物

```bash
# 备份（回滚就 cp 回去再 up -d asr server）
fel:~/vbcd/asr/.env.bak.20261014-093500
fel:~/vbcd/server/.env.bak.20261014-093500

# 重写 asr/.env：值行只留 KEY=value，注释挪到上一行；SERVICE_TOKEN 换 48 位 hex
# server/.env：追加两行（注释 + ASR_SERVICE_TOKEN=<同一串>）
fel: cd ~/vbcd && docker compose up -d asr server
```

`server/.env` 与 `asr/.env` 均 `chmod 600`；值未在任何输出中打印（只用长度与 sha256 前 8 位比对）。

### 验证（改后）

```
环境指纹 diff（只列变化项，其余 21 个键逐个相同）
  SERVICE_TOKEN      变了        before=5cffb70a3c8b  after=56fb0d9c3d51
  YTDLP_COOKIES_DIR  变了（现为空）before=52ac4b7470d0  after=e3b0c44298fc
  YTDLP_COOKIES_FILE 变了（现为空）before=bb08730c3dab  after=e3b0c44298fc
  YTDLP_PROXY        变了（现为空）before=0772faa12df2  after=e3b0c44298fc

server 容器内按真实路径调 asr（node fetch）
  HTTP 404 {"error":{"code":"JOB_NOT_FOUND","message":"job __probe__ 不存在或已被清理",…}}   ← 鉴权通过
asr /healthz
  {'ok':True,'ffmpeg':True,'ffprobe':True,'ytdlp':True,'provider_configured':True,'version':'0.1.0'}
站点  http://127.0.0.1/api/health  → {"ok":true,…,"asr_configured":true}   web:200
```

## ② B 站 412

### 三条出口实测（同一条命令：yt-dlp 直连页面）

| 出口 | 结果 | 结论 |
|---|---|---|
| `fel` 阿里云上海机房 IP | `HTTP Error 412: Precondition Failed` | 国内机房照样被拦 |
| 海外机房 IP（最初观察） | 412 | 同上 |
| 本机家宽住宅 IP | 过页面请求（`Downloading wbi sign` → `video formats`），取流需登录态 | 住宅 IP 能过 WAF |

→ **「把服务搬到国内」不能单独解决 412**；真正的判据是出口 IP 身份 + 登录态。

### 修复步骤

```bash
# ① 上传（cookies 来自使用者 2026-10-04 导出的 ~/下载/bilibili.txt：Netscape 格式、仅 .bilibili.com 域）
scp ~/下载/bilibili.txt fel:/tmp/bilibili.txt
# ⚠️ fel:~/vbcd/asr/.secrets 是 root:root（compose 首次创建），bird 写不进 → 用 docker 以 root 写入并交回属主
fel: docker run --rm -u root -v /home/bird/vbcd/asr/.secrets:/s -v /tmp/bilibili.txt:/in:ro vbcd-asr \
       sh -c 'cp /in /s/bilibili.txt && chmod 644 /s/bilibili.txt && chown -R 1002:1002 /s'
# ② asr/.env：YTDLP_COOKIES_DIR=/app/secrets（单独一行，无行内注释）
fel: cd ~/vbcd && docker compose up -d asr
```

> cookie 内容未打印；`asr/.secrets/` 已被 `.gitignore` 排除（实测第 52 行）。

### 验证（改后）

```
① 容器身份可读（不花额度）
   env YTDLP_COOKIES_DIR='/app/secrets'｜文件存在 True 可读 True｜B 站条目 19｜SESSDATA/DedeUserID/bili_jct/sid 齐
② 字幕链路（改前必 412）
   HTTP 200 {"found":false}          ← 412 消失；该视频本无 CC，按设计回落转写
③ 转写真正用的音轨下载链路（真下载，不烧转写额度）
   平台=bilibili 时长=70.565s 文件=src-BV1iYea6zEVC.m4a 859KB
   标题: 够夯！！来自民间开发者的GitHub开源APP，狂揽2.8k stars，Folia 一款开源的沉浸式可视化音乐播放器
```

## 本轮入库的仓库改动（仅文档/模板，代码 0 行）

| 文件 | 改动 | 自检 |
|---|---|---|
| `asr/.env.example` | 注释一律改为键的上一行；文件头写明原因与一行排查命令 | 24 键、顺序与键集合一致；非空默认值逐项未变；原先被污染的 4 个空值键恢复为空；`grep -E '^[A-Za-z_]+=[[:space:]]+#'` 无命中 |
| `RUN.md` | 8.7 纠正剥注释口径 + 新增「值变成一整段中文注释」行；8.8 重写 401 行、新增 412 行与 `scp` 权限行 | 新增/修改 6 行管道数均为 4（三列表格格式正确） |
| `AGENTS.md` | §4 纠正 2026-09-29 那条旧口径；追加本轮进度条目 | — |

## 遗留 / 待办

- ⏸ **真实转写任务未由 AI 触发**：等使用者在 UI 把那条 `failed` 任务退回待办重试（`failed→todo` 合法迁移，轮询器自动重提交），会花 DashScope 额度。
- ⏸ `YTDLP_PROXY` 住宅出口方案未上（作为 cookies 之外的叠加手段，成功率更高）；`youtube.txt` 未配。
- ⏸ 拆分方案的落地未开始：连接方式（SSH 反向隧道 / 公网 TLS 高阶端口 / WireGuard）、契约冻结（asr 单副本 + 4 端点）、容器内 `127.0.0.1` 需写 `host.docker.internal` 等，**仅口头给出建议**。
- ⚠️ cookies 有效期未知；**过期后的症状与本次完全相同（412）**，重新导出覆盖 `asr/.secrets/bilibili.txt` 即可，无需重建容器（bind 挂载、每次下载现读）。
- 勘误：`fel:docker-compose.yml` 有一处使用者未提交的改动（去掉硬钉的 `OPENAI_BASE_URL`，改由 `server/.env` 提供 DashScope 兼容模式），重建 server 时顺带生效，已当面告知。
