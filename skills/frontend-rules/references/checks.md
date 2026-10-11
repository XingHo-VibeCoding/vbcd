# 修改前 / 修改后检查（buddy 命令版）

## A. 修改前（Pre-flight）
```bash
# 1. 定层级：这次改动落在哪层，z 值是否在白名单
grep -rn "z-\[" web/src

# 2. 查 token：目标样式在 web/DESIGN.md / references/tokens.md 是否已有
grep -rn "bg-brand" web/src

# 3. 查既有实现：优先复用
grep -rln "backdrop-blur-xl" web/src

# 4. 列改动清单（亮暗/窄宽/空态/影响面）
git status --short

# 5. 定验证计划 → B 节
```

## B. 修改后（Verification）
```bash
# B1. 规则审计
bash skills/frontend-rules/scripts/audit-frontend.sh web/src
#   默认 changed 模式：改动文件零容忍；--all 扫全量对基线
#   --init-baseline 采基线（迁移完成后才跑）

# B2. 构建
cd web && npm run build

# B3. 视觉核对（人工，不能靠 grep）
#   亮/暗 × <768px/≥1280px 四态；focus ring；禁用/空态；玻璃不透穿
```

## C. 常见违规 → 修复
| 违规 | 修复 |
|---|---|
| jsx 内联 hex | 换 atomics `bg-brand`；确需 → 先写 DESIGN.md |
| 只写亮色无 `dark:` | 补 `dark:bg-slate-800/50` 等 |
| `rounded-none` | `rounded-2xl` / `rounded-full` |
| 正文 <14px | `text-sm`；微字号只留徽章 |
| z 白名单外 | 归位 L0–L5 |
| `focus:outline-none` 无 ring | 补 `focus:ring-2 focus:ring-brand/50` |
| 主按钮缺 hover | 补 `hover:bg-brand-hover active:scale-95` |
| 触控 <44px | `p-2.5`+ 或 `w-11 h-11` |
