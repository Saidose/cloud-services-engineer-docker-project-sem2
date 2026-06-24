# Стейдж 1
ARG NODE_VERSION=16
FROM node:${NODE_VERSION}-alpine AS builder

WORKDIR /app

# Зависимости отдельным слоем, кэш по package-lock.json
COPY package*.json ./
RUN npm ci

COPY . .

ARG PUBLIC_PATH=/
ARG VUE_APP_API_URL=
ENV PUBLIC_PATH=${PUBLIC_PATH} \
    VUE_APP_API_URL=${VUE_APP_API_URL}
RUN npm run build

# Стейдж второй
FROM node:${NODE_VERSION}-alpine AS dev
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
EXPOSE 8080
CMD ["npm", "run", "serve"]

# Стейдж третий
FROM nginxinc/nginx-unprivileged:1.27-alpine AS prod

# Свой конфиг fallbakck + reverse-proxy к бэкенду + /healthz для healthcheck
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Статика
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 8080

# Healthcheck бьёт в локальный /healthz (не зависит от бэкенда)
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:8080/healthz || exit 1
