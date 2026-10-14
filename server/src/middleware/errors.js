// 统一错误响应：{ ok:false, error:{ code, message } }（SPEC 第 5.1 节）
//
// 【Day 23 三类错误归一化】
//   本文件是「用户能看到什么文案」的唯一出口。规则：
//     ① 用户输入错（400/404/409/428）：告诉用户改什么 —— 业务用 fail() 抛的中文 message，原样透出；
//     ② 网络/接口错（502/503）：提示稍后再试 —— 统一中文兜底，不透上游英文/细节；
//     ③ 服务端错（500/503）：记录日志 + 通用提示 —— 原始 err.message 只进服务端日志，不进响应。
//   判据：业务错误经 fail()/storageError() 构造，带 `expose:true` 标记 → 其 message 是人工中文，可安全透出；
//         其余（Node fs / pg / body-parser 抛的原始错误）无标记 → 一律替换为按类中文兜底。

// 错误码 → HTTP 状态码（SPEC 第 5.2 节）：业务代码只需抛 code，状态码在这里统一映射
// 导出供 SSE 路由（agent/kb）复用同一口径：它们不走 errorHandler，需自行算状态码
export const STATUS_BY_CODE = {
  VALIDATION_FAILED: 400,
  AUTH_REQUIRED: 401,
  AUTH_FAILED: 401,
  NOT_FOUND: 404,
  DUPLICATE: 409,
  CONFIRM_REQUIRED: 428,
  RATE_LIMITED: 429,
  INTERNAL: 500,
  NOT_IMPLEMENTED: 501,
  STORAGE_FAILED: 503,
  GIT_FAILED: 503,
  KB_NOT_CONFIGURED: 503,
  LLM_FAILED: 503,
  CHROMA_UNAVAILABLE: 503,
  DB_NOT_CONFIGURED: 503,
  DB_UNAVAILABLE: 503,
  GITHUB_UPSTREAM: 502,
  IMA_UPSTREAM_FAILED: 503,
  SETTINGS_READ_FAILED: 503,
  SETTINGS_WRITE_FAILED: 503,
  ENV_READ_FAILED: 503,
  FFMPEG_MISSING: 503,
}

// 各类错误在「原始错误没有人工文案」时，给用户看的中文兜底（按 SPEC §5.3 三类）
const FALLBACK_MESSAGE = {
  // ② 网络/接口错：提示稍后再试
  GITHUB_UPSTREAM: 'GitHub 暂时连不上，请稍后再试',
  IMA_UPSTREAM_FAILED: '云端知识库暂时连不上，请稍后再试',
  CHROMA_UNAVAILABLE: '知识库检索暂时不可用，请稍后再试',
  // ③ 服务端错：通用提示（细节只进日志）
  STORAGE_FAILED: '保存失败，请稍后再试',
  GIT_FAILED: '保存成功，但同步到版本库失败',
  SETTINGS_READ_FAILED: '读取站点配置失败，请稍后再试',
  SETTINGS_WRITE_FAILED: '保存站点配置失败，请稍后再试',
  ENV_READ_FAILED: '读取服务配置失败，请稍后再试',
  LLM_FAILED: '模型服务暂时不可用，请稍后再试',
  DB_UNAVAILABLE: '数据库暂时不可用，请稍后再试',
  FFMPEG_MISSING: '转写服务缺少必要的音视频组件',
  INTERNAL: '服务器处理出错，请稍后再试',
}

// 未知错误码的兜底：4xx 让用户重试输入，5xx 让用户稍后再试
const GENERIC_4XX = '请求无法处理，请检查后重试'
const GENERIC_5XX = '服务器处理出错，请稍后再试'

/**
 * 决定「返回给用户」的文案。
 * - 业务错误（带 expose 标记）→ 用其人工中文 message；
 * - 否则 → 按 code 类别的中文兜底（不透原始英文/堆栈）。
 * 注意：原始 err.message 无论如何都进服务端日志（见 errorHandler），只是不进响应体。
 */
export function userMessage(err, code, status) {
  if (err?.expose && typeof err.message === 'string' && err.message.trim()) return err.message
  if (FALLBACK_MESSAGE[code]) return FALLBACK_MESSAGE[code]
  return status >= 500 ? GENERIC_5XX : GENERIC_4XX
}

// 兜底 404：路由没有匹配上时
export function notFound(req, res) {
  res.status(404).json({
    ok: false,
    error: { code: 'NOT_FOUND', message: '接口不存在' },
  })
}

// 业务抛错统一转成 SPEC 第 5.1 节的响应体；5xx 打 error 日志，4xx 打 warn 日志
// 注意：Express 的错误处理中间件必须保留 4 个参数签名
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  // body-parser 的两类原始错误：转成 400/413 + 中文提示（Day 23 必修-1）
  if (err?.type === 'entity.parse.failed') {
    console.warn(`[${req.requestId || '-'}] VALIDATION_FAILED: ${err.message}`)
    return res.status(400).json({ ok: false, error: { code: 'VALIDATION_FAILED', message: '请求格式不正确，请检查提交的内容' } })
  }
  if (err?.type === 'entity.too.large') {
    console.warn(`[${req.requestId || '-'}] VALIDATION_FAILED: ${err.message}`)
    return res.status(413).json({ ok: false, error: { code: 'VALIDATION_FAILED', message: '提交内容过大（上限 1MB），请精简后重试' } })
  }

  const code = err.code || 'INTERNAL'
  const status = err.status || STATUS_BY_CODE[code] || 500
  const message = userMessage(err, code, status)
  // 原始细节只进服务端日志，不进响应（SPEC §5.3「不暴露堆栈」）
  // detail（业务错误附带的原始 err）优先，其次回落到 err.message
  const detail = err.detail?.message || err.cause?.message || err.message
  const line = `[${req.requestId || '-'}] ${code}: ${detail}`
  if (status >= 500) console.error(line)
  else console.warn(line)
  res.status(status).json({ ok: false, error: { code, message } })
}
