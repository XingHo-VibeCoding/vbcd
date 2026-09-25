// 统一错误响应：{ ok:false, error:{ code, message } }（SPEC 第 5.1 节）

// 错误码 → HTTP 状态码（SPEC 第 5.2 节）：业务代码只需抛 code，状态码在这里统一映射
const STATUS_BY_CODE = {
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
  const code = err.code || 'INTERNAL'
  const status = err.status || STATUS_BY_CODE[code] || 500
  const line = `[${req.requestId || '-'}] ${code}: ${err.message}`
  if (status >= 500) console.error(line)
  else console.warn(line)
  res.status(status).json({
    ok: false,
    error: { code, message: err.message || '服务器内部错误' },
  })
}
