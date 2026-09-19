// 请求日志：每条含 request_id、路径、状态码、耗时（SPEC 第 5.5 节的最小版）
import { randomUUID } from 'node:crypto'

export function requestLog(req, res, next) {
  const id = randomUUID().slice(0, 8)
  const start = Date.now()
  req.requestId = id

  res.on('finish', () => {
    const ms = Date.now() - start
    console.log(`[${id}] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${ms}ms)`)
  })

  next()
}
