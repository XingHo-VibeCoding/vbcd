import { Router } from 'express'
import { getHome } from '../services/home.js'

const router = Router()
router.get('/', async (req, res, next) => {
  try { res.json({ ok: true, data: await getHome({ date: req.query.date }) }) } catch (err) { next(err) }
})
export default router
