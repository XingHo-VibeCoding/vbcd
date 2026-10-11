# 组件配方（buddy · 从 XHBlogs 移植）

所有交互元素必备四件套：`hover` / `active:scale-95` / `disabled:opacity-50` / `focus:ring-2 ring-brand/50`。
动画已解禁（Q5）——`transition-all duration-300` 可用。

## 1. 卡片

### 玻璃卡（默认）
```jsx
<div className="bg-white/50 dark:bg-slate-800/50 backdrop-blur-xl
                border border-white/40 dark:border-white/10
                rounded-2xl shadow-lg p-6
                hover:shadow-xl transition-all duration-300">
  <h3 className="text-xl font-black text-slate-900 dark:text-slate-100">标题</h3>
  <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">正文</p>
</div>
```
大卡圆角换 `rounded-3xl`；禁止在玻璃卡上再叠实色底。

## 2. 按钮

### Filled（主操作）
```jsx
<button className="px-6 py-3 bg-brand hover:bg-brand-hover text-white text-sm font-black
                   rounded-2xl shadow-lg shadow-brand-glow transition-all
                   flex items-center gap-2
                   active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed">
```
变体：成功 `bg-success` · 危险 `bg-danger hover:bg-danger-hover` · 创意 `bg-creative` · 中性 `bg-slate-100 dark:bg-slate-700 hover:bg-slate-200`。

### Outline（次操作）
```jsx
<button className="px-4 py-2 border border-slate-300 dark:border-slate-600
                   hover:border-brand hover:bg-brand hover:text-white
                   bg-transparent font-bold rounded-2xl transition-colors
                   disabled:opacity-20 disabled:cursor-not-allowed">
```

### Ghost（弱操作）
```jsx
<button className="text-slate-500 hover:text-brand dark:text-slate-400 dark:hover:text-brand-dark-text
                   font-bold transition-colors">
```

## 3. 输入框
```jsx
<input className="w-full rounded-2xl py-3.5 px-5 font-medium
                  bg-white/50 dark:bg-slate-950/50
                  border border-slate-200 dark:border-slate-700/50
                  text-slate-800 dark:text-slate-200
                  placeholder-slate-500 dark:placeholder-slate-400
                  focus:outline-none focus:ring-2 focus:ring-brand/50" />
```

## 4. 徽章
```jsx
// 微标签（主色）
<span className="inline-flex items-center px-2 py-0.5 rounded-full bg-brand text-white text-[10px] font-black tracking-widest">NEW</span>

// 软底标签
<span className="text-[10px] font-bold px-2.5 py-1 rounded-full
                 bg-brand/10 text-brand dark:text-brand-dark-text border border-brand/10">分类</span>

// 状态点
<span className="w-1.5 h-1.5 bg-success rounded-full" />
```

## 5. 导航

### 桌面顶栏
```jsx
<header className="hidden md:block fixed top-0 inset-x-0 z-50
                   bg-white/40 dark:bg-slate-900/50 backdrop-blur-xl
                   border-b border-white/20 dark:border-white/5 shadow-sm">
  <div className="w-[90%] max-w-6xl mx-auto h-16 flex items-center justify-between">
```

### 移动底部 tab bar
```jsx
<nav className="md:hidden fixed bottom-0 inset-x-0 z-50
                bg-white/40 dark:bg-slate-900/50 backdrop-blur-xl
                border-t border-white/20 dark:border-white/5
                flex justify-around items-center h-14 px-2">
```

## 6. L0 背景层
```jsx
// 渐变兜底（site.json background.type === 'gradient' 或无图时）
<div className="fixed inset-0 z-[-9] pointer-events-none
                bg-gradient-to-br from-slate-50 via-indigo-50/40 to-slate-100
                dark:from-slate-950 dark:via-slate-900 dark:to-slate-950" />
// type='image' 时改为 <img> 或 background-image，同样 fixed inset-0 z-[-9]
```
