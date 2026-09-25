# 后端镜像（多阶段）：只带生产依赖，非 root 运行
# 基础镜像用干净的官方名；本机 Docker Hub 不通，改用镜像站预拉后 tag 成同名（见 RUN.md）。
FROM node:22-alpine AS deps
WORKDIR /app
# 只装生产依赖（vite/react 等前端依赖不进来）
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
# node 镜像内置的非 root 用户，uid 1000（与宿主机 bird 一致，绑定挂载 ./data 时权限刚好匹配）
USER node
EXPOSE 3000
# 健康检查用 Node 自带 fetch，alpine 里没有 curl 也不需要装
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "src/index.js"]
