---
name: backend-verify
description: buddy 项目后端接口的「隔离实例 + 真实 HTTP」验证套路与踩坑清单。在需要验证 server/ 下的接口行为（CRUD 是否生效、边界与错误码是否正确、四类操作是否闭环）、写新的冒烟/自测脚本、或核对 SPEC 接口响应口径与代码是否一致时使用。也用于回答「这个接口怎么验」「验证脚本怎么写」「为什么本地验证跑不起来」这类问题。不用于前端样式审查（那是 frontend-rules）、不用于部署与服务器运维。
---

# buddy 后端验证套路：隔离实例 + 真实 HTTP

本 Skill 是 buddy 项目后端验证的**通用套路**，只写「怎么起、怎么打、怎么断言、跑完怎么留证」，
**不复制任何接口清单或字段值**——那些的唯一定义处见第 1 节。

## 0. 一句话

验证 buddy 后端接口时，**不要**直接调 `services/` 函数（那绕过了路由与中间件，验不出真实行为）；
一律**进程内起一个隔离实例**，用 `fetch` 打真实 HTTP，断言状态码 + 错误码 + 数据变化，跑完自清。

## 1. 事实源在哪（动手前先读，不要凭记忆）

| 要知道什么 | 去读哪 |
|---|---|
| 接口清单与响应口径 | `SPEC.md` §3（接口表；**注意与代码核对**，见 §4） |
| 路由与方法 | `server/src/routes/*.js` |
| 路由挂载顺序与鉴权 | `server/src/app.js`（`app.use('/api/xxx', requireAuth, router)`） |
| 鉴权是否生效 | `server/src/middleware/auth.js`（`AUTH_ENABLED !== '1'` 时**直通**） |
| 现有验证脚本范例 | `server/scripts/smoke.mjs`（最权威的样板）、`server/scripts/day22-verify.mjs` |

## 2. 起隔离实例（进程内，别 spawn 后台进程）

**核心模式**（照抄，已在 smoke.mjs / day22-verify.mjs 验证）：

```js
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

const directory = await mkdtemp(path.join(tmpdir(), 'buddy-verify-'))
Object.assign(process.env, {
  DATA_DIR: directory,          // 隔离数据目录
  DATABASE_URL: '',             // 置空 = 文件模式（未配库时唯一能本机跑的模式）
  AUTH_ENABLED: '0',            // 公开模式（= 当前公网口径）；验证鉴权时改 '1'
  OPENAI_API_KEY: '', CHROMA_URL: '', ASR_SERVICE_URL: '', GITHUB_USERNAME: '',
  IMA_OPENAPI_CLIENTID: '', IMA_OPENAPI_APIKEY: '',
  INDEX_CACHE: '0',
})

const { createApp } = await import('../src/app.js')
const appServer = createApp().listen(0, '127.0.0.1')   // 端口 0 = 由系统分配
await new Promise(r => appServer.once('listening', r))
const base = `http://127.0.0.1:${appServer.address().port}`
// ... 断言 ...
// finally: close server + rm -rf 临时目录
```

**为什么是进程内**：Bash 工具用 `&` 起的后台进程**在调用结束时被回收**（今天实测：`ps` 查不到、`curl` 连接被拒）。
唯一稳妥做法是把「起服务 + 发请求 + 断言 + 关服务」放在**同一个脚本**里跑完。

## 3. 断言三件套

每次 `fetch` 后断言：**状态码 + 错误码（失败时）+ 数据实际变化**。

```js
const api = async (method, url, body) => {
  const res = await fetch(`${base}${url}`, {
    method,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  let payload; try { payload = await res.json() } catch { payload = null }
  return { status: res.status, ...(payload ?? {}) }
}

// 成功：assert([200,201].includes(r.status))
// 失败：assert.equal(r.status, 400); assert.equal(r.error?.code, 'VALIDATION_FAILED')
// 变化：GET 复读，断言值确实变了（且「不该变的没变」，如 created_at 保留）
```

**四类操作闭环**（CRUD 一条链，必跑）：
`CREATE(201) → READ(200) → UPDATE(200) → READ(200,已改) → DELETE → READ(404)`

**跨秒技巧**：验证 `updated_at` 变化时，`PATCH` 前 `await sleep(1100)`；否则创建/更新同秒，看不出差异。

## 4. 口径核对（写验证前先做，常能抓出文档缺陷）

逐行比对 `SPEC.md` 接口表与代码实际返回：
- 成功响应体形状（如 `DELETE` 究竟是 `204` 无体还是 `200 {id,path}`）
- 错误码集合
- **本项目实例**：`DELETE /api/notes/:id` 的 SPEC 曾写 `204`，代码实为 `200 {id, path}` → Day 22 已更正（`55cfe66`）。这说明「文档写的 ≠ 代码做的」，验证时顺手核。

## 5. 踩坑清单（都是实测踩过的）

| 坑 | 现象 | 解法 |
|---|---|---|
| **临时目录别用 `/tmp`** | sandbox 隔离：前台 `ls`/`curl` 看不到后台进程写的东西；`Connection refused` | 临时目录用 `mkdtemp(tmpdir())`（脚本内自清）或项目内 `.tmp-*`（已被 `.gitignore` 覆盖）；**不要**手动在 `/tmp` 建目录再期望前台可见 |
| **后台进程被回收** | `node src/index.js &` 起服务后，下一条命令 `curl` 报 connection refused | 见 §2：进程内起服务，一次脚本跑完 |
| **`DATA_DIR` 模块加载时读取** | 设晚了不生效，**静默写进真实 `data/`** | 必须用**动态 import**：先 `Object.assign(process.env, …)`，再 `const { createApp } = await import('../src/app.js')`。⚠️ **静态 `import` 语句会被提升到文件顶部执行**，哪怕你把它写在设 env 之后也没用——Day 24 就是这样把探针数据写进了真实 `data/`（事后清理）。**看到脚本写文件，先确认这行是 `await import()` 而非 `import`。** |
| **`server/.env` 会被自动注入** | 日志出现 `injected env (N) from .env` | 用 `Object.assign(process.env, ...)` 显式覆盖关键项，别只依赖命令行前缀 |
| **无 docker daemon** | `--source-selftest` 等 PG 容器模式跑不了 | 本机只能跑**文件模式**；PG 相关断言留给有 docker 的环境（`smoke.mjs` 里已备） |
| **直接调 service 函数** | 绕过 routing/中间件，验不出 401/404/400 | 一律走 HTTP（`fetch`） |
| **`parseNote` 以文件名为 id** | 文件模式下 id 与 frontmatter 的 `id` 不一致会告警 | 文件模式断言用文件名匹配 |
| **`git mv` 对「预览中」的文件报 `设备或资源忙`** | 改名失败（文件被 present_files 预览占用） | 用 `cp` 再 `rm` 绕开 |

## 5.1 找 Bug：刁钻输入扫面法（Day 24 实战）

要「找一个真实 Bug」时，别靠读代码猜，**用一批刁钻输入把接口扫一遍**，让异常自己冒出来。
可复用脚本：`server/scripts/day24-hunt.mjs`（照它改即可）。

**输入清单**（每组都要，缺一类就少一分发现概率）：

| 类别 | 样例 |
|---|---|
| 超长 | 标题 200 字、正文 1MB+、id 500 字 |
| 空/空白 | `title: '   '`、`content: ''`、`tags: ['', '  ']` |
| 特殊字符 | `'!!!'`、`'a/b/c'`、`'../../etc/passwd'`、含空字节 `\u0000` |
| **边界+归一（高价值）** | `'a'.repeat(39) + '!!!b'` —— 让「归一后的第 N 个字符」正好落在截断/边界点上 |
| 类型错误 | `title: {a:1}` / `['a']`、整体传数组或字符串 |
| 越界 | `tags` 11 个、`limit=0/abc/1.5`、`offset=-1` |
| 畸形 id | `..%2f..%2fetc%2fpasswd`、不存在 id |

**判读原则**：
- **「大多数正常、个别异常」是最有价值的信号** —— 它把嫌疑范围从「整层」压到「某条特定路径」。
- 异常点出现后，**立刻缩到纯函数**反复试（同输入稳定复现 ⇒ 排除偶发/并发/环境）。
- 再做**单变量对照**：只改一处实现，看差异是否**只落在**你怀疑的那类输入上。
- 最后用**不变量**收尾：常规输入产出**逐例不变** + 各套回归全绿 ⇒ 反证真因就是那一处。

**边界测试的通用配方**：取「归一/清洗/截断」类函数的阈值 N，构造**长度恰好使第 N 个字符是特殊字符**的输入（本节 `'a'×39 + '!!!b'` 就是让第 40 位归一成连字符）。这类输入专打「清理与截断的顺序」「slice 后是否再清洗」。

## 6. 留证格式

产物写 `runs/YYYY-MM-DD-dayNN.md`，至少含：
- 环境一句（本机隔离实例 / 公网；文件模式 or 库模式；`AUTH_ENABLED` 口径）
- **原始输出**（脚本打印的 ✅ 行 + 关键前后对照表）——不转述、不改写
- 完成标准逐条核对表
- 未做清单（如实登记）

## 7. 收尾自检

- [ ] 临时目录已自清（`rm -rf`），无 `.tmp-*` 残留
- [ ] 未碰真实 `data/`、未碰公网、未碰数据库
- [ ] 脚本 `node --check` 通过
- [ ] 若脚本是新产物：归入当天任务，与留证同批提交
