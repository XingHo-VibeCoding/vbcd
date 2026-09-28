import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 本地开发配置：端口 5174；host 打开后同一网络下的手机也能访问（接公网前的过渡）。
// 端口不用 Vite 默认的 5173 —— 本机上已被其他项目占用（2026-09-27 实测），
// 与 5173 冲突时 Vite 会自己 +1，但那会让「访问哪个地址」变得不确定，不如写死。
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5174,
    // 开发态把 /api 代理到后端（同源，Cookie 无跨站问题；手机同网段访问 :5174 也能用）。
    // 后端端口 3100：本机 3000 同样被其他项目（next-server）占用，见 server/.env。
    proxy: {
      '/api': 'http://localhost:3100',
    },
  },
})
