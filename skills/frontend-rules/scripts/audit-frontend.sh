#!/usr/bin/env bash
#
# audit-frontend.sh — buddy 前端规则审计（移植自 XingHuisamaBlogs v0.3.2，已适配 .jsx/.js + brand token）
#
# 用法:
#   bash audit-frontend.sh [目标路径...] [选项]
#
# 选项:
#   --all             扫描全部 .ts/.tsx（默认在 git 仓库内只扫改动文件做「新增违规」判定）
#   --changed         只扫改动文件（git 仓库内为默认）
#   --tokens FILE     token 白名单来源，默认自动找仓库根 DESIGN.md
#   --allow REGEX     豁免路径正则（默认 siteConfig\.ts$）
#   --strict          WARN 也计为失败
#   --init-baseline   采集当前计数写入 references/baseline.env 并退出
#   --quiet           只输出汇总
#   -h, --help
#
# 退出码: 0 通过 / 1 有 FAIL / 2 用法错误
#
# 设计: 「存量基线 + 增量零容忍」
#   - 结构性检查 B~H 与 baseline.env 比较，超过基线即 FAIL（D / G 为 advisory，仅 WARN）。
#   - 新增检查（A / A2）只针对本次改动文件，新增内联 hex 或未登记颜色即 FAIL。

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(dirname "$SCRIPT_DIR")"
BASELINE_FILE="$SKILL_DIR/references/baseline.env"

TARGETS=(); MODE=""; TOKENS=""; ALLOW='siteConfig\.ts$'
STRICT=0; QUIET=0; INIT=0
Z_SCALE=" -9 -8 -7 -6 -5 -4 -3 -2 -1 0 1 2 3 4 5 6 7 8 9 10 20 30 40 50 60 65 70 "

usage() { sed -n '2,26p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --all) MODE=all ;;
    --changed) MODE=changed ;;
    --tokens) TOKENS="${2:-}"; shift ;;
    --allow) ALLOW="${2:-}"; shift ;;
    --strict) STRICT=1 ;;
    --quiet) QUIET=1 ;;
    --init-baseline) INIT=1 ;;
    -h|--help) usage; exit 0 ;;
    -*) echo "未知选项: $1" >&2; usage; exit 2 ;;
    *) TARGETS+=("$1") ;;
  esac
  shift
done
[[ ${#TARGETS[@]} -eq 0 ]] && TARGETS=(".")

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo "")"
if [[ -z "$MODE" ]]; then
  [[ -n "$REPO_ROOT" ]] && MODE=changed || MODE=all
fi

if [[ -z "$TOKENS" ]]; then
  for cand in "$REPO_ROOT/web/DESIGN.md" "$REPO_ROOT/DESIGN.md" "./DESIGN.md" "$SKILL_DIR/../DESIGN.md" "./web/DESIGN.md"; do
    [[ -n "$cand" && -f "$cand" ]] && { TOKENS="$cand"; break; }
  done
fi

# ---------------------------------------------------------------- 文件收集
collect_all() {
  local t
  for t in "${TARGETS[@]}"; do
    [[ -e "$t" ]] || continue
    find "$t" -type f \( -name '*.jsx' -o -name '*.js' -o -name '*.tsx' -o -name '*.ts' \) \
      -not -path '*/node_modules/*' -not -path '*/.next/*' \
      -not -path '*/dist/*' -not -path '*/build/*' -not -path '*/out/*' \
      -not -path '*/src/admin/*' -not -path '*/src/agent/*'
  done | sort -u
}

collect_changed() {
  [[ -n "$REPO_ROOT" ]] || { collect_all; return; }
  {
    git -C "$REPO_ROOT" diff --name-only HEAD --
    git -C "$REPO_ROOT" ls-files --others --exclude-standard
  } 2>/dev/null | grep -E '\.(jsx|js|tsx|ts)$' | while read -r f; do
    [[ -f "$REPO_ROOT/$f" ]] && echo "$REPO_ROOT/$f"
  done | sort -u
}

mapfile -t ALL_FILES < <(collect_all)
if [[ "$MODE" == changed ]]; then
  mapfile -t SCAN_FILES < <(collect_changed)
else
  SCAN_FILES=("${ALL_FILES[@]}")
fi

# 结构化检查始终针对全量文件（它们是项目基线，不是 diff 检查）
ALLOWED=()
for f in "${ALL_FILES[@]}"; do [[ -n "$ALLOW" && "$f" =~ $ALLOW ]] && continue; ALLOWED+=("$f"); done
CHANGED_OK=()
for f in "${SCAN_FILES[@]}"; do [[ -n "$f" ]] || continue; [[ -n "$ALLOW" && "$f" =~ $ALLOW ]] && continue; CHANGED_OK+=("$f"); done

grep_lines() { # $1=regex  $2..=files
  local re="$1"; shift
  [[ $# -eq 0 ]] && return 0
  grep -nE "$re" "$@" 2>/dev/null || true
}
count_lines() { if [[ -z "$1" ]]; then echo 0; else printf '%s\n' "$1" | grep -c ''; fi; }

FAILS=0; WARNS=0
ROWS=()

row() { # id name status count baseline hint
  local id="$1" name="$2" status="$3" cnt="$4" base="$5" hint="${6:-}"
  ROWS+=("$id|$name|$status|$cnt|$base|$hint")
  [[ "$status" == FAIL ]] && FAILS=$((FAILS+1))
  [[ "$status" == WARN ]] && WARNS=$((WARNS+1))
}

detail() { [[ "$QUIET" -eq 1 || -z "$1" ]] && return 0; printf '%s\n' "$1" | head -6 | sed 's/^/        /'; }

# 增量检查（changed 模式零容忍；all 模式与基线比较）
# A: 内联 hex 颜色
a_out="$(grep_lines '#[0-9a-fA-F]{3,8}\b' "${CHANGED_OK[@]}")"
a_n=$(count_lines "$a_out")
A_HINT="改用 atomics（如 bg-brand）；确需 hex 先写 web/DESIGN.md"

# A2: 改动文件出现未登记在 token 表的颜色
a2_out=""
if [[ "$a_n" -gt 0 && -n "$TOKENS" && -f "$TOKENS" ]]; then
  token_hex="$(grep -oiE '#[0-9a-f]{3,8}\b' "$TOKENS" | tr 'A-Z' 'a-z' | sort -u)"
  used_hex="$(printf '%s\n' "$a_out" | grep -oiE '#[0-9a-f]{3,8}\b' | tr 'A-Z' 'a-z' | sort -u)"
  while read -r h; do
    [[ -z "$h" ]] && continue
    raw="${h#\#}"
    if [[ ${#raw} -eq 3 ]]; then raw="${raw:0:1}${raw:0:1}${raw:1:1}${raw:1:1}${raw:2:1}${raw:2:1}"; fi
    full="#$raw"
    grep -qxF -- "$h" <<< "$token_hex" || grep -qxF -- "$full" <<< "$token_hex" || \
      a2_out+="$(printf '%s\n' "$a_out" | grep -i -- "$h" | head -1)"$'\n'
  done <<< "$used_hex"
  a2_out="${a2_out%$'\n'}"
fi
a2_n=$(count_lines "$a2_out")
A2_HINT="先把 hex 加入 ${TOKENS:-web/DESIGN.md} 再使用"
declare -A BASE=()
if [[ -f "$BASELINE_FILE" ]]; then
  while IFS='=' read -r k v; do [[ -n "$k" ]] && BASE[$k]="$v"; done < <(grep -E '^[A-Z_]+=[0-9]+$' "$BASELINE_FILE")
fi
base_of() { echo "${BASE[$1]:-0}"; }

# A / A2 定级：changed 模式零容忍，all 模式与基线比较
a_base=$(base_of INLINE_HEX); a2_base=$(base_of UNDOC_COLOR)
if [[ "$MODE" == changed ]]; then
  if (( a_n > 0 )); then row A "改动文件内联 hex 颜色" FAIL "$a_n" 0 "$A_HINT"; else row A "改动文件内联 hex 颜色" PASS "$a_n" 0 "$A_HINT"; fi
  if (( a2_n > 0 )); then row A2 "改动文件未登记颜色" FAIL "$a2_n" 0 "$A2_HINT"; else row A2 "改动文件未登记颜色" PASS "$a2_n" 0 "$A2_HINT"; fi
else
  if (( a_n > a_base )); then row A "全量内联 hex 颜色" FAIL "$a_n" "$a_base" "$A_HINT"; else row A "全量内联 hex 颜色" WARN "$a_n" "$a_base" "$A_HINT"; fi
  if (( a2_n > a2_base )); then row A2 "全量未登记颜色" FAIL "$a2_n" "$a2_base" "$A2_HINT"; else row A2 "全量未登记颜色" WARN "$a2_n" "$a2_base" "$A2_HINT"; fi
fi
detail "$a_out"
detail "$a2_out"

# ---------------------------------------------------------------- 基线检查
# B: 亮色专用类缺暗色配对
b_out="$(grep_lines 'bg-white/|bg-slate-50([^0-9]|$)|text-slate-900|border-white/|bg-brand-soft([^0-9a-z-]|$)' "${ALLOWED[@]}" | grep -v 'dark:' || true)"
b_n=$(count_lines "$b_out")
b_base=$(base_of MISSING_DARK)
if (( b_n > b_base )); then row B "亮色类缺 dark: 配对" FAIL "$b_n" "$b_base" "补 dark:bg-slate-800/50 / dark:text-slate-100"
else row B "亮色类缺 dark: 配对" WARN "$b_n" "$b_base" "补 dark:bg-slate-800/50 / dark:text-slate-100"; fi
detail "$b_out"

# C: 直角
c_out="$(grep_lines 'rounded-none' "${ALLOWED[@]}")"
c_n=$(count_lines "$c_out"); c_base=$(base_of ROUNDED_NONE)
if (( c_n > c_base )); then row C "出现直角 rounded-none" FAIL "$c_n" "$c_base" "卡片/按钮用 rounded-2xl，胶囊用 rounded-full"
else row C "出现直角 rounded-none" PASS "$c_n" "$c_base" "卡片/按钮用 rounded-2xl，胶囊用 rounded-full"; fi
detail "$c_out"

# D: 8-11px 微字号（仅提示，不阻断：项目内 300+ 处均为合法做标签）
d_out="$(grep_lines 'text-\[(8|9|10|11)px\]' "${ALLOWED[@]}")"
d_n=$(count_lines "$d_out"); d_base=$(base_of MICRO_FONT)
d_delta=$(( d_n - d_base ))
row D "微字号 8-11px 使用" WARN "$d_n" "$d_base" "仅限标签/角标；正文提至 text-sm(14px)；较基线 +${d_delta}"
detail "$d_out"

# E: z-index 超出层级白名单
e_out=""
while IFS= read -r line; do
  [[ -z "$line" ]] && continue
  file="${line%%:*}"; rest="${line#*:}"
  for zv in $(printf '%s' "$rest" | grep -oE '\-?z-\[[0-9]+\]|\-?z-[0-9]+' | sed -E 's/\[//g; s/\]//g; s/^z-//; s/^-z-/-/'); do
    [[ "$Z_SCALE" == *" $zv "* ]] || e_out+="$file: z=$zv 不在层级白名单"$'\n'
  done
done < <(grep_lines '\-?z-\[[0-9]+\]|\-?z-[0-9]+' "${ALLOWED[@]}")
e_out="${e_out%$'\n'}"
e_n=$(count_lines "$e_out"); e_base=$(base_of Z_OUT_OF_SCALE)
if (( e_n > e_base )); then row E "z-index 超出五层白名单" FAIL "$e_n" "$e_base" "见 SKILL.md 第 1 节 L0-L5"
else row E "z-index 超出五层白名单" PASS "$e_n" "$e_base" "见 SKILL.md 第 1 节 L0-L5"; fi
detail "$e_out"

# F: focus:outline-none 缺 focus:ring
f_out="$(grep_lines 'focus:outline-none' "${ALLOWED[@]}" | grep -v 'focus:ring' || true)"
f_n=$(count_lines "$f_out"); f_base=$(base_of FOCUS_NO_RING)
if (( f_n > f_base )); then row F "focus:outline-none 缺 focus:ring" FAIL "$f_n" "$f_base" "补 focus:ring-2 focus:ring-brand/50"
else row F "focus:outline-none 缺 focus:ring" WARN "$f_n" "$f_base" "补 focus:ring-2 focus:ring-brand/50"; fi
detail "$f_out"

# G: brand 填充按钮缺 hover 态（仅提示：条件类名里的选中态属合法例外）
g_out="$(grep_lines 'bg-brand([^0-9a-z-]|$)' "${ALLOWED[@]}" | grep -v 'hover:bg-brand-hover' || true)"
g_n=$(count_lines "$g_out"); g_base=$(base_of FILLED_NO_HOVER)
g_delta=$(( g_n - g_base ))
row G "brand 按钮缺 hover 态" WARN "$g_n" "$g_base" "补 hover:bg-brand-hover；选中态等例外需人工确认；较基线 +${g_delta}"
detail "$g_out"

# H: 触控目标 < 44px 的图标按钮
h_out="$(grep_lines '(^|[^0-9a-z-])w-8 h-8([^0-9a-z-]|$)|(^|[^0-9a-z-])w-9 h-9([^0-9a-z-]|$)' "${ALLOWED[@]}")"
h_n=$(count_lines "$h_out"); h_base=$(base_of SMALL_TAP)
if (( h_n > h_base )); then row H "触控目标 < 44px" FAIL "$h_n" "$h_base" "p-2.5+ 或 w-11 h-11"
else row H "触控目标 < 44px" WARN "$h_n" "$h_base" "p-2.5+ 或 w-11 h-11"; fi
detail "$h_out"

# ---------------------------------------------------------------- 基线写入
if [[ "$INIT" -eq 1 ]]; then
  mkdir -p "$(dirname "$BASELINE_FILE")"
  {
    echo "# 由 audit-frontend.sh --init-baseline 生成：$(date -Iseconds)"
    echo "# 超过以下计数即判定为规则劣化"
    echo "MISSING_DARK=$b_n"
    echo "INLINE_HEX=$a_n"
    echo "UNDOC_COLOR=$a2_n"
    echo "ROUNDED_NONE=$c_n"
    echo "MICRO_FONT=$d_n"
    echo "Z_OUT_OF_SCALE=$e_n"
    echo "FOCUS_NO_RING=$f_n"
    echo "FILLED_NO_HOVER=$g_n"
    echo "SMALL_TAP=$h_n"
  } > "$BASELINE_FILE"
  echo "已写入基线: $BASELINE_FILE"
  echo "  MISSING_DARK=$b_n INLINE_HEX=$a_n UNDOC_COLOR=$a2_n ROUNDED_NONE=$c_n MICRO_FONT=$d_n Z_OUT_OF_SCALE=$e_n"
  echo "  FOCUS_NO_RING=$f_n FILLED_NO_HOVER=$g_n SMALL_TAP=$h_n"
  exit 0
fi

# ---------------------------------------------------------------- 输出
echo "== buddy 前端规则审计 =="
echo "模式: $MODE  目标: ${TARGETS[*]}  扫描: ${#ALL_FILES[@]} 个全量文件 / ${#CHANGED_OK[@]} 个扫描集文件"
echo "token来源: ${TOKENS:-<未找到>}   基线: $([[ -f "$BASELINE_FILE" ]] && echo "$BASELINE_FILE" || echo "<无，按 0 严格判定>")"
echo
for r in "${ROWS[@]}"; do
  IFS='|' read -r id name status cnt base hint <<< "$r"
  printf '[%-4s] %-28s %-4s 当前=%-4s 基线=%-4s %s\n' "$id" "$name" "$status" "$cnt" "$base" "$hint"
done
echo
echo "汇总: FAIL=$FAILS WARN=$WARNS"
if [[ "$FAILS" -gt 0 ]]; then echo "结果: 不通过"; exit 1; fi
if [[ "$STRICT" -eq 1 && "$WARNS" -gt 0 ]]; then echo "结果: --strict 下 WARN 视为不通过"; exit 1; fi
echo "结果: 通过"
exit 0
