// 主题（F10）：浅 / 深二态，全站生效。
// 真值放在 <html data-theme="light|dark"> 上 —— 首屏由 index.html 的内联脚本先写好，
// 这样不会先渲染浅色再跳深色；本模块只负责运行期的读取与切换。
// 用户点过之后把选择写进 localStorage（键名 THEME_KEY），此后不再跟随系统；
// 没点过则跟随系统 prefers-color-scheme 的实时变化。
const THEME_KEY = 'buddy-theme'
const LIGHT = 'light'
const DARK = 'dark'

/** 当前主题：以 <html data-theme> 为准，异常或缺省都按浅色 */
export function getTheme() {
  return document.documentElement.dataset.theme === DARK ? DARK : LIGHT
}

/** 只改当前页面的主题，不碰存储 */
export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme === DARK ? DARK : LIGHT
}

/** 记住用户的选择；隐私模式等场景 localStorage 不可用时静默失败（当次会话仍生效） */
function saveTheme(theme) {
  try {
    localStorage.setItem(THEME_KEY, theme)
  } catch {
    /* 存不进去不影响使用 */
  }
}

/** 是否已存过用户选择：存过就不再跟随系统 */
function hasSavedTheme() {
  try {
    const saved = localStorage.getItem(THEME_KEY)
    return saved === LIGHT || saved === DARK
  } catch {
    return false
  }
}

/** 切换主题，返回切换后的值，供调用方同步组件状态 */
export function toggleTheme() {
  const next = getTheme() === DARK ? LIGHT : DARK
  applyTheme(next)
  saveTheme(next)
  return next
}

/** 未保存过选择时跟随系统主题；返回取消监听的函数 */
export function watchSystemTheme(onChange) {
  const media = window.matchMedia?.('(prefers-color-scheme: dark)')
  if (!media) return () => {}

  const onMediaChange = () => {
    if (hasSavedTheme()) return // 用户已明确选过，系统变化不覆盖
    const next = media.matches ? DARK : LIGHT
    applyTheme(next)
    onChange(next)
  }

  media.addEventListener('change', onMediaChange)
  return () => media.removeEventListener('change', onMediaChange)
}

/** 多标签页同步：别的标签页切换后，本标签页跟着变；返回取消监听的函数 */
export function watchOtherTabs(onChange) {
  const onStorage = (event) => {
    if (event.key !== THEME_KEY) return
    if (event.newValue !== LIGHT && event.newValue !== DARK) return
    applyTheme(event.newValue)
    onChange(event.newValue)
  }

  window.addEventListener('storage', onStorage)
  return () => window.removeEventListener('storage', onStorage)
}
