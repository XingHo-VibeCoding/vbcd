# release-check 实跑记录 · 2026-10-17（Day 26 · 发布 v1.0 前）

- 环境：本机（sandbox），文件模式；HEAD `1387c1c`；分支 `main`；CST
- 命令：`bash skills/release-check/scripts/release-check.sh`
- 性质：**只读**，不改被检查产物、不 commit、不 push
- 用途：作为 **v1.0 正式发布前的门禁**（第一次真正用于「发布」这个动作，而不是日常自检）

## 一、基线结果

```
结果：21 通过  0 失败  1 警告  0 跳过
→ 无 FAIL，有 WARN，可发布但建议先看警告
```

退出码 `2`。原始输出见 `runs/2026-10-16-day26-2-precheck.txt`。

| 节 | 通过 | 失败 | 警告 | 跳过 |
|---|---|---|---|---|
| ① 密钥与凭据 | 5 | 0 | 0 | 0 |
| ② 隐私边界 | 6 | 0 | 0 | 0 |
| ③ 构建与自测 | 6 | 0 | 0 | 0 |
| ④ 发布形态一致性 | 4 | 0 | 1 | 0 |

> 相比 10-14 的 20 项：④ 由 3 → 4（新增「`dist` 引用完整」），故总数 20 → **21**。

**唯一 WARN**：`工作区干净 — 7 个文件有未提交改动`。
这 7 个是本次 Day 26 的改动（提交前状态），属预期；**不是**在制品污染。

### 本次新增的 ④-4.5「dist 引用完整」

```
[PASS] dist 引用完整    index.html 引用的 2 个 assets 均存在
```

判据：`web/dist/index.html` 里每个 `/assets/*.js|css` 都要能在 `web/dist/` 下找到实体文件。
拦的事故长相：构建产物不完整／被半覆盖，`index.html` 指向一个不存在的 bundle → 线上白屏，但 HTTP 仍是 200。

## 二、缺陷自检：新增的这条查得出来吗？

**答案：查得出，但第一次是「假通过」——修好检查脚本后才真查得出。** 这是今天最重要的一段落。

### 2.1 第一次植入 → 假通过（错在检查脚本，不在判据）

植入方式：把 `web/dist/index.html` 里引用的 `index-AshHe_0w.js` 改成 `index-Deleted_old9.js`。

预期：4.5 报 FAIL。
实际：**全绿 21 通过，退出码 2** —— 失败没被拦住。

**根因**：同一个脚本里 ③-3.2「前端构建」跑的是 `npm run build`，输出目录就是 `web/dist/`。
它在我植入之后、4.5 检查之前，把 `web/dist` **整个重建了**，植入随之被覆盖 → 4.5 检查的是一份全新完好的产物。

```
时间线（错的版本）：
  植入 index.html 引用 ──▶ ③-3.2 npm run build（重建 web/dist，植入被抹掉）──▶ 4.5 检查 → PASS
```

**这是检查脚本最阴的一类 bug：它自己把证据销毁了，然后报告「一切正常」。**

### 2.2 修法：构建不再落在被检查目录里

```bash
RC_TMP=$(mktemp -d); RC_BUILD_DIR="$RC_TMP/dist"
BUILD=$(cd web && npx vite build --outDir "$RC_BUILD_DIR" --emptyOutDir 2>&1)
```

构建产物落到临时目录，`web/dist` 在整轮检查里**只读**。
同时把构建的成功判据从「输出里不含 error」改为**退出码**：

```bash
BRC=$?
if [ "$BRC" -ne 0 ]; then fail "前端构建" "退出码 $BRC；..."; else pass ... fi
```

（原因：构建成功的输出里也会出现 `error` 字样，grep 文本会误判。）

### 2.3 第二次植入 → 真 FAIL

| 阶段 | 结果计数 | `dist 引用完整` | 退出码 |
|---|---|---|---|
| 修复脚本前·植入 | 21 通过 / 0 失败 / 1 警告 | **PASS（假！）** | `2` |
| 修复脚本后·植入 | **20 通过 / 1 失败 / 1 警告** | **FAIL — `缺失: /assets/index-Deleted_old9.js —— 复核：ls web/dist/assets/index-Deleted_old9.js`** | **`1`** |
| 还原后 | 21 通过 / 0 失败 / 1 警告 | PASS | `2` |

FAIL 行给出**缺失文件的具体路径 + 一条能直接复跑的复核命令**，其余 20 项保持 PASS（②③④ 其余项全绿）→ 定点命中。
还原后 `web/dist` 与植入前一致，退出码回到 `2`。

原始输出见 `runs/2026-10-16-day26-shot1-planted-fail.txt`。

## 三、本轮一并修掉的 3 处自身缺陷

| # | 缺陷 | 修法 |
|---|---|---|
| 1 | 检查脚本自己重建被检查的产物 → 假通过 | 构建改到 `mktemp -d`，`web/dist` 全程只读 |
| 2 | 构建判据用 grep 文本（成功输出也含 `error`） | 改判**退出码** |
| 3 | 公网地址从 `RUN.md` 里抓（那是给人看的叙述，会变） | 改读 `README.md` 的「## 线上地址」节；且**取不到/不可达判 FAIL**（原来是 WARN） |

第 3 条还牵出一个文档结构决定：**`README.md` 的「## 线上地址」成为「发布形态的唯一事实源」**（公网入口、当前版本、部署形态、发布/回滚入口都在那里）。`RUN.md` 只讲步骤，不承载事实。

## 四、未做 / 遗留

- 未接 CI（清单未要求）。
- `index.html` 仍无 `Cache-Control: no-cache`（源站 nginx 只发 `ETag`/`Last-Modified`）→ 已登记进 `ROLLBACK.md` §6 与 §9 待办，等拍板。
- `docker-compose.yml` 的 `web` 服务仍只有 `build:`、无 `image:` → 这是「`compose up` 换镜像无效」的根因，已登记 `ROLLBACK.md` §9。
