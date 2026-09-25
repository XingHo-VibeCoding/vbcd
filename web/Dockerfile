# 前端镜像（多阶段）：Vite 构建 → Nginx 托管静态产物 + 反代 /api
# 注意：构建上下文必须是 web/（nginx.conf 就放在这里，才 COPY 得进去）
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine AS runtime
# 用项目自己的配置替换默认站点配置
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
