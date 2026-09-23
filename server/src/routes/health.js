import { Router } from 'express'

const router = Router()

// 健康检查：用来证明"服务活着"（部署、监控、排错都用它）；
// 顺带返回 auth_enabled 供前端与 smoke 判断当前是公开还是隐私模式。
router.get('/health', (req, res) => {
  res.json({
    ok: true,
    data: {
      status: 'ok',
      time: new Date().toISOString(),
      auth_enabled: process.env.AUTH_ENABLED === '1',
    },
  })
})

export default router
