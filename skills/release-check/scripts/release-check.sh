#!/usr/bin/env bash
# buddy 发布前检查（release-check Skill 的执行体）
#
# 用法：bash skills/release-check/scripts/release-check.sh
# 退出码：0 = 全部通过；1 = 有 FAIL（阻断发布）；2 = 仅有 WARN
#
# 设计原则：
#   ① 只读，不改任何文件；
#   ② 每条检查输出 [PASS]/[FAIL]/[WARN]/[SKIP] + 一行证据，FAIL 必须能复现；
#   ③ 检查项真值不硬编码在本脚本的描述里，而是去读项目事实源（见 SKILL.md §1）。

set -uo pipefail
cd "$(dirname "$0")/../../.." || exit 1   # 仓库根

FAILS=0
WARNS=0
PASSES=0
SKIPS=0

pass() { printf '\033[32m[PASS]\033[0m %-34s %s\n' "$1" "${2:-}"; PASSES=$((PASSES+1)); }
fail() { printf '\033[31m[FAIL]\033[0m %-34s %s\n' "$1" "${2:-}"; FAILS=$((FAILS+1)); }
warn() { printf '\033[33m[WARN]\033[0m %-34s %s\n' "$1" "${2:-}"; WARNS=$((WARNS+1)); }
skip() { printf '\033[90m[SKIP]\033[0m %-34s %s\n' "$1" "${2:-}"; SKIPS=$((SKIPS+1)); }

echo "════════════════════════════════════════════════════════════════════"
echo " buddy 发布前检查  $(date '+%Y-%m-%d %H:%M:%S %Z')"
echo " 仓库：$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
echo " HEAD：$(git rev-parse --short HEAD 2>/dev/null || echo '(非 git)')  分支：$(git branch --show-current 2>/dev/null)"
echo "════════════════════════════════════════════════════════════════════"

echo
echo "── ① 密钥与凭据（红线，任一 FAIL 即阻断发布）────────────────────────"

# 1.1 已跟踪文件里不得出现真密钥特征词
HITS=$(git ls-files -z 2>/dev/null \
  | xargs -0 grep -nEI "(sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|glpat-[A-Za-z0-9_-]{20,}|postgres://[^:]+:[^@<'\"\`]{6,}@|mysql://[^:]+:[^@<'\"\`]{6,}@)" 2>/dev/null \
  | grep -viE "\\\$\{|local-test-only|planning_test|<口令>|example" || true)
if [ -z "$HITS" ]; then
  pass "无硬编码密钥" "0 命中（已排除占位符/测试夹具）"
else
  fail "无硬编码密钥" "命中 $(echo "$HITS" | wc -l) 条：$(echo "$HITS" | head -3 | tr '\n' ' ')"
fi

# 1.2 .env 必须被忽略，且不得入库
if git check-ignore -q .env 2>/dev/null; then
  pass ".env 已被忽略" "$(git check-ignore -v .env | sed 's|^\.gitignore|…gitignore|')"
else
  fail ".env 已被忽略" ".gitignore 未覆盖 .env"
fi
TRACKED_ENV=$(git ls-files 2>/dev/null | grep -E "(^|/)\.env$" || true)
if [ -z "$TRACKED_ENV" ]; then
  pass ".env 未入库" "仓库仅有 *.env.example"
else
  fail ".env 未入库" "入库了：$TRACKED_ENV"
fi

# 1.3 .env.example 三份齐全（根 / server / asr）
MISSING=""
for f in .env.example server/.env.example asr/.env.example; do
  [ -f "$f" ] || MISSING="$MISSING $f"
done
if [ -z "$MISSING" ]; then
  pass ".env.example 齐全" "根 / server / asr 三份都在"
else
  warn ".env.example 齐全" "缺：$MISSING"
fi

# 1.4 compose 里被注释掉的 env 行（部署事故高发点）
# 典型事故：Dockerfile 里写 `# ENV DATA_DIR=/app/data`、compose 里写
# `#   DATABASE_URL: postgres://…` —— 作者以为「约定等于配置」，实际镜像里根本没有这个变量，
# 部署后表现为「本地能跑、上线就炸 / 静默走了默认值」，且报错现场离病根很远。
# ⚠️ 但 compose 的注释大量是**说明性**的（`# 不要删除下面的 DATA_DIR`、中文注解），
#    真正有歧义的只有「注释行本身就是一条 KEY=VALUE 赋值」这一种写法。
#    所以判据收窄成：整行是注释、且其**去掉注释符后的首个 token 就是赋值**。
if [ -f docker-compose.yml ]; then
  FAKE_ENV=$(grep -nE '^[[:space:]]*#[[:space:]]*[A-Za-z_][A-Za-z0-9_]*[[:space:]]*[:=]' docker-compose.yml 2>/dev/null || true)
  if [ -z "$FAKE_ENV" ]; then
    pass "compose 无注释掉的 env" "0 命中（注释里没有伪装成赋值的行）"
  else
    fail "compose 无注释掉的 env" "命中 $(echo "$FAKE_ENV" | wc -l) 行：$(echo "$FAKE_ENV" | head -2 | tr '\n' ' ')"
  fi
else
  skip "compose 无注释掉的 env" "无 docker-compose.yml"
fi

echo
echo "── ② 资料与本地数据不得入库（隐私边界）──────────────────────────────"

for p in data memory drafts .workbuddy .pi; do
  if git check-ignore -q "$p" 2>/dev/null; then
    pass "$p 已被忽略" "$(git check-ignore -v "$p" 2>/dev/null | sed 's|^\.gitignore|…gitignore|')"
  else
    # 不存在的路径 check-ignore 也会返回非 0，需区分
    if [ -e "$p" ]; then
      fail "$p 已被忽略" "存在但未被忽略"
    else
      pass "$p 已被忽略" "（当前不存在，规则已就位）" 
    fi
  fi
done

# data/ 根锚定：不能误伤 web/src/data/
if [ -d web/src/data ]; then
  if git check-ignore -q web/src/data 2>/dev/null; then
    fail "data/ 根锚定正确" "web/src/data 被误伤"
  else
    pass "data/ 根锚定正确" "未误伤 web/src/data"
  fi
else
  pass "data/ 根锚定正确" "（web/src/data 不存在，跳过误伤检查）"
fi

echo
echo "── ③ 构建与自测（任一 FAIL 即阻断发布）──────────────────────────────"

# 3.1 后端语法：所有 src 下 js 可解析
BAD=$(find server/src -name "*.js" -print0 2>/dev/null | xargs -0 -n1 node --check 2>&1 | head -5 || true)
if [ -z "$BAD" ]; then
  pass "后端 js 语法检查" "$(find server/src -name '*.js' | wc -l) 个文件通过"
else
  fail "后端 js 语法检查" "$BAD"
fi

# 3.2 前端构建
if [ -f web/package.json ]; then
  if [ -d web/node_modules ]; then
    BUILD=$(cd web && npm run build 2>&1)
    if echo "$BUILD" | grep -qiE "error|failed"; then
      fail "前端构建" "$(echo "$BUILD" | grep -iE 'error|failed' | head -2 | tr '\n' ' ')"
    else
      pass "前端构建" "$(echo "$BUILD" | grep -oE 'index-[A-Za-z0-9]+\.js' | head -1)"
    fi
  else
    skip "前端构建" "web/node_modules 未安装"
  fi
else
  skip "前端构建" "无 web/package.json"
fi

# 3.3 后端验证脚本（各套断言）
# ⚠️ 判据用**退出码**，不要 grep "FAIL" 文本 —— 这些脚本的日志里会打印
#    `VALIDATION_FAILED` 等业务码（含 "FAIL" 子串），文本搜索必误判。
for s in day22-verify day23-verify day24-verify; do
  if [ -f "server/scripts/$s.mjs" ]; then
    OUT=$(cd server && node "scripts/$s.mjs" 2>&1)
    RC=$?
    TAIL=$(echo "$OUT" | grep -oE "[0-9]+/[0-9]+ 通过|共 [0-9]+ 项断言通过" | tail -1)
    if [ "$RC" -ne 0 ]; then
      fail "$s" "退出码 $RC；$(echo "$OUT" | tail -3 | tr '\n' ' ')"
    else
      pass "$s" "${TAIL:-退出码 0}"
    fi
  else
    skip "$s" "脚本不存在"
  fi
done

# 3.4 链接链路自测（同样以退出码为准）
if [ -f server/scripts/link-selftest.mjs ]; then
  OUT=$(cd server && timeout 90 node scripts/link-selftest.mjs 2>&1)
  RC=$?
  R=$(echo "$OUT" | grep -oE "结果：[0-9]+ 通过 / [0-9]+ 失败" | tail -1)
  if [ "$RC" -eq 0 ]; then
    pass "链接链路自测" "${R:-退出码 0}"
  else
    fail "链接链路自测" "退出码 $RC；${R:-无结果行}"
  fi
fi

echo
echo "── ④ 发布形态一致性（文档/配置 vs 实际）────────────────────────────"

# 4.1 公网健康检查（可达才查）
if command -v curl >/dev/null 2>&1; then
  URL=$(grep -oE "http://[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+" RUN.md 2>/dev/null | head -1)
  if [ -n "$URL" ] && curl -s -m 8 -o /dev/null -w "%{http_code}" "$URL/api/health" 2>/dev/null | grep -q "^200$"; then
    BODY=$(curl -s -m 8 "$URL/api/health" 2>/dev/null)
    pass "公网 /api/health" "$(echo "$BODY" | head -c 100)"
  else
    warn "公网 /api/health" "不可达或非 200（URL=${URL:-未从 RUN.md 解析到}）"
  fi
else
  skip "公网 /api/health" "无 curl"
fi

# 4.2 SPEC 接口数与代码路由数对齐（口径漂移检查）
# SPEC §3 的接口表分三组：纯数字（业务 24）+ S 前缀（管理 6）+ M 前缀（运维 8）= 38。
# 正则必须同时覆盖三种前缀，否则会误报「漂移」。
SPEC_N=$(grep -cE "^\| [A-Za-z]*[0-9]+ \| \`(GET|POST|PATCH|DELETE|PUT)" SPEC.md 2>/dev/null || echo 0)
CODE_N=$(grep -rhoE "router\.(get|post|patch|delete|put)\('" server/src/routes/*.js 2>/dev/null | wc -l | tr -d ' ')
if [ "$SPEC_N" -gt 0 ]; then
  if [ "$SPEC_N" = "$CODE_N" ]; then
    pass "SPEC 接口数 vs 代码" "两侧均 $SPEC_N"
  else
    warn "SPEC 接口数 vs 代码" "SPEC=$SPEC_N 代码=$CODE_N（口径可能漂移，需人工核对）"
  fi
else
  skip "SPEC 接口数 vs 代码" "未从 SPEC 解析到接口行"
fi

# 4.3 工作区是否有未提交改动（发布前应干净）
DIRTY=$(git status --porcelain 2>/dev/null | grep -vE "^\?\?" | wc -l)
if [ "$DIRTY" -eq 0 ]; then
  pass "工作区干净" "无未提交改动"
else
  warn "工作区干净" "$DIRTY 个文件有未提交改动（发布前建议先提交）"
fi

# 4.4 未推送提交
UNPUSHED=$(git log --oneline @{u}..HEAD 2>/dev/null | wc -l)
if [ "$UNPUSHED" -eq 0 ]; then
  pass "本地已推送" "与远端同步"
else
  warn "本地已推送" "$UNPUSHED 个提交未推送"
fi

echo
echo "════════════════════════════════════════════════════════════════════"
printf ' 结果：\033[32m%d 通过\033[0m  \033[31m%d 失败\033[0m  \033[33m%d 警告\033[0m  \033[90m%d 跳过\033[0m\n' "$PASSES" "$FAILS" "$WARNS" "$SKIPS"
if [ "$FAILS" -gt 0 ]; then
  echo -e " \033[31m→ 有 FAIL，阻断发布\033[0m"
  EXIT=1
elif [ "$WARNS" -gt 0 ]; then
  echo -e " \033[33m→ 无 FAIL，有 WARN，可发布但建议先看警告\033[0m"
  EXIT=2
else
  echo -e " \033[32m→ 全部通过，可发布\033[0m"
  EXIT=0
fi
echo "════════════════════════════════════════════════════════════════════"
exit $EXIT
