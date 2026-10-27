import express from 'express'
import cookieParser from 'cookie-parser'
import { requestLog } from './middleware/request-log.js'
import { DATA_DIR } from './storage/files.js'
import path from 'node:path'
import { notFound, errorHandler } from './middleware/errors.js'
import { optionalAuth, requireAuth, requireAuthForWrite } from './middleware/auth.js'
import healthRouter from './routes/health.js'
import authRouter from './routes/auth.js'
import notesRouter from './routes/notes.js'
import tasksRouter from './routes/tasks.js'
import confirmationsRouter from './routes/confirmations.js'
import kbRouter from './routes/kb.js'
import meRouter from './routes/me.js'
import imaRouter from './routes/ima.js'
import dbRouter from './routes/db.js'
import agentRouter from './routes/agent.js'
import githubRouter from './routes/github.js'
import adminRouter from './routes/admin.js'
import planningRouter from './routes/planning.js'
import homeRouter from './routes/home.js'

export function createApp() {
  const app = express()

  // 仅信任 compose 内部的 Nginx 代理网段，避免把任意客户端提供的
  // X-Forwarded-For 当成真实来源；登录失败限流依赖 req.ip（SPEC §5.6.12）。
  // TRUST_PROXY=0 可在直连/特殊部署中显式关闭，其他值应填写明确的代理 CIDR。
  const trustProxy = String(process.env.TRUST_PROXY ?? '172.30.0.0/16').trim()
  app.set('trust proxy', trustProxy === '0' ? false : trustProxy)

  // 解析 JSON 请求体（限制 1MB，防止超大请求）
  app.use(express.json({ limit: '1mb' }))

  // 解析 Cookie（登录态用）
  app.use(cookieParser())

  // 请求日志（每条含 request_id 与耗时）
  app.use(requestLog)

  // 业务路由（SPEC §5.6 三闸门模型）：
  //   公开组      → optionalAuth（读公开，req.session 可能为 null）
  //   敏感读+写组 → requireAuthForWrite（AUTH_WRITE_REQUIRED=1 时未登录 401；同时挂 requireAuth 兼容隐私模式）
  //   混合组      → 外层 optionalAuth + 路由内部按需挂 requireAuthForWrite（GET 公开 / 写或敏感读要登录）
  app.use('/api', healthRouter)
  app.use('/api', authRouter)
  // 混合组：notes（GET 公开，POST/PATCH/DELETE 登录）、planning（GET 公开，drafts 写登录）、
  //        agent（chat/tools 公开，runs/sessions 登录，chat 按 session 过滤只读工具）
  app.use('/api/notes', optionalAuth, requireAuth, notesRouter)
  app.use('/api/planning', optionalAuth, requireAuth, planningRouter)
  app.use('/api/agent', optionalAuth, requireAuth, agentRouter)
  // 敏感读+写组：全部走 requireAuthForWrite（AUTH_WRITE_REQUIRED=1 时未登录一律 401）
  // 同时保留 requireAuth：隐私模式（AUTH_ENABLED=1）时它先挡，顺序无关紧要
  app.use('/api/tasks', optionalAuth, requireAuth, requireAuthForWrite, tasksRouter)
  app.use('/api/confirmations', optionalAuth, requireAuth, requireAuthForWrite, confirmationsRouter)
  app.use('/api/kb', optionalAuth, requireAuth, requireAuthForWrite, kbRouter)
  app.use('/api/ima', optionalAuth, requireAuth, requireAuthForWrite, imaRouter)
  app.use('/api/admin', optionalAuth, requireAuth, requireAuthForWrite, adminRouter)
  // 纯公开读组：data/home/me/github/db（本路由内部若含写端点自行加 requireAuthForWrite）
  app.use('/api/me', optionalAuth, requireAuth, meRouter)
  app.use('/api/db', optionalAuth, requireAuth, dbRouter)
  app.use('/api/github', optionalAuth, requireAuth, githubRouter)
  app.use('/api/home', optionalAuth, requireAuth, homeRouter)

  // 站点图片资产：data/images/ → /images/*（背景/轮播/封面/头像等；公开只读，不进 git）
  app.use('/images', express.static(path.join(DATA_DIR, 'images'), { maxAge: '1h' }))

  // 兜底：找不到的路由返回统一的 404
  app.use(notFound)

  // 兜底：所有抛错统一为 { ok:false, error:{code,message} }
  app.use(errorHandler)

  return app
}
