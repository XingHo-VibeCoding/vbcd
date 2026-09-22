import express from 'express'
import cookieParser from 'cookie-parser'
import { requestLog } from './middleware/request-log.js'
import { notFound, errorHandler } from './middleware/errors.js'
import { requireAuth } from './middleware/auth.js'
import healthRouter from './routes/health.js'
import authRouter from './routes/auth.js'
import notesRouter from './routes/notes.js'

export function createApp() {
  const app = express()

  // 解析 JSON 请求体（限制 1MB，防止超大请求）
  app.use(express.json({ limit: '1mb' }))

  // 解析 Cookie（登录态用）
  app.use(cookieParser())

  // 请求日志（每条含 request_id 与耗时）
  app.use(requestLog)

  // 业务路由：health、auth 公开（登录本身不需要登录）；资料接口需要有效会话
  app.use('/api', healthRouter)
  app.use('/api', authRouter)
  app.use('/api/notes', requireAuth, notesRouter)

  // 兜底：找不到的路由返回统一的 404
  app.use(notFound)

  // 兜底：所有抛错统一为 { ok:false, error:{code,message} }
  app.use(errorHandler)

  return app
}
