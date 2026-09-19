// 后端启动入口：读环境变量 → 创建应用 → 监听端口
import 'dotenv/config'
import { createApp } from './app.js'

const PORT = Number(process.env.PORT || 3000)

const app = createApp()

app.listen(PORT, () => {
  console.log(`buddy-server 启动于 http://localhost:${PORT}（环境：${process.env.NODE_ENV || 'development'}）`)
})
