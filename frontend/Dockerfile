# Etapa build: Vite produce dist/ minificado
FROM node:24-alpine AS build
WORKDIR /app

# pnpm con la misma version exacta de "packageManager" en package.json.
RUN npm install -g pnpm@12.15.0 --no-audit --no-fund

# pnpm-workspace.yaml trae allowBuilds (esbuild): sin el, pnpm falla al
# encontrar un script de instalacion sin decidir.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm run build

# Etapa runtime: nginx sirve el build estatico. SPA fallback a index.html para React Router.
FROM nginx:alpine
RUN rm -rf /usr/share/nginx/html/* /etc/nginx/conf.d/default.conf

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -q -O- http://127.0.0.1/ >/dev/null || exit 1

CMD ["nginx", "-g", "daemon off;"]
