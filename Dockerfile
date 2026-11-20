# syntax=docker/dockerfile:1

FROM node:24-alpine AS builder

WORKDIR /app

COPY package*.json ./

RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

COPY . .

# Vite embeds public API URLs at build time (runtime env alone is not enough).
ARG VITE_Backend_URL=https://penalyze-api.jrmsu-tc.online
ENV VITE_Backend_URL=${VITE_Backend_URL}

RUN npm run build

FROM nginxinc/nginx-unprivileged:1.29-alpine AS production

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html

USER nginx

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:8080/health || exit 1

CMD ["nginx", "-g", "daemon off;"]
