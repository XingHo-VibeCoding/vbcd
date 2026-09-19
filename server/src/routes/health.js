import { Router } from 'express'

const router = Router()

// 健康检查：用来证明"服务活着"（部署、监控、排错都用它）
router.get('/health', (req, res) => {
  res.json({
    ok: true,
    data: { status: 'ok', time: new Date().toISOString() },
  })
})

export default router
