import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 本地开发配置：端口 5173；host 打开后同一网络下的手机也能访问（接公网前的过渡）
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    // 开发态把 /api 代理到后端（同源，Cookie 无跨站问题；手机同网段访问 :5173 也能用）
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
})
