// 组装 Express 应用：中间件 + 路由 + 错误处理
// 与启动入口分离，方便以后接测试与部署（SPEC 第 1 章 server/src 结构）
import express from 'express'
import { requestLog } from './middleware/request-log.js'
import { notFound, errorHandler } from './middleware/errors.js'
import healthRouter from './routes/health.js'

export function createApp() {
  const app = express()

  // 解析 JSON 请求体（限制 1MB，防止超大请求）
  app.use(express.json({ limit: '1mb' }))

  // 请求日志（每条含 request_id 与耗时）
  app.use(requestLog)

  // 业务路由：先挂健康检查；后续子步骤在此挂 /notes、/tasks 等
  app.use('/api', healthRouter)

  // 兜底：找不到的路由返回统一的 404
  app.use(notFound)

  // 兜底：所有抛错统一为 { ok:false, error:{code,message} }
  app.use(errorHandler)

  return app
}
