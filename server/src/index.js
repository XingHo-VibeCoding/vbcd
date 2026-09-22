// 后端启动入口：读环境变量 → 准备资料目录 → 创建应用 → 监听端口
import 'dotenv/config'
import { createApp } from './app.js'
import { DATA_DIR, ensureReady } from './storage/files.js'

const PORT = Number(process.env.PORT || 3000)

// 资料目录不在仓库里（被 .gitignore 忽略），首次启动或新机器上由这里自建
await ensureReady()
console.log(`资料目录（DATA_DIR）：${DATA_DIR}`)

const app = createApp()

app.listen(PORT, () => {
  console.log(
    `buddy-server 启动于 http://localhost:${PORT}（环境：${process.env.NODE_ENV || 'development'}，` +
      `索引缓存：${process.env.INDEX_CACHE === '0' ? '关闭（每次重建）' : '开启'}）`,
  )
})
