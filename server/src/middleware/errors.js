// 统一错误响应：{ ok:false, error:{ code, message } }（SPEC 第 5.1 节）

// 兜底 404：路由没有匹配上时
export function notFound(req, res) {
  res.status(404).json({
    ok: false,
    error: { code: 'NOT_FOUND', message: '接口不存在' },
  })
}

// 兜底 500：业务抛错时
// 注意：Express 的错误处理中间件必须保留 4 个参数签名
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  const status = err.status || 500
  const code = err.code || 'INTERNAL'
  console.error(`[${req.requestId || '-'}] ${code}:`, err.message)
  res.status(status).json({
    ok: false,
    error: { code, message: err.message || '服务器内部错误' },
  })
}
