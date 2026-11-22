# Etapa deps: instala TODAS las dependencias (incluyendo dev) y deja la cache para reuso
FROM node:24-alpine AS deps
WORKDIR /app

# Necesario para compilar bcryptjs si en algun momento pasamos a bcrypt nativo
RUN apk add --no-cache python3 make g++

# pnpm con la misma version exacta de "packageManager" en package.json.
RUN npm install -g pnpm@12.15.0 --no-audit --no-fund

# pnpm-workspace.yaml trae allowBuilds: sin el, pnpm falla al encontrar el
# script de instalacion de puppeteer sin decidir.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# scripts/ va antes del install: pnpm corre el postinstall durante `pnpm install`
# y si el archivo todavia no esta, el build falla con "Cannot find module".
COPY scripts ./scripts
ENV PUPPETEER_SKIP_DOWNLOAD=true
RUN pnpm install --frozen-lockfile

# Etapa runtime: solo deps de produccion + codigo. Imagen pequena y reproducible.
FROM node:24-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3001 \
    NPM_CONFIG_LOGLEVEL=warn

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY scripts ./scripts
# Esta imagen no usa el envio automatico por WhatsApp, asi que el postinstall
# se salta la descarga de Chrome (~330 MB) y la imagen no se infla. Para
# probarlo aqui: quita esta linea y pon ENABLE_WHATSAPP=true en el compose.
ENV PUPPETEER_SKIP_DOWNLOAD=true
# pnpm solo hace falta para instalar (el contenedor arranca con node): se
# instala, se usa y se quita en la misma capa, junto con su almacen y su cache,
# y asi la imagen no carga ~100 MB de pnpm ni una segunda copia de los paquetes.
RUN npm install -g pnpm@12.15.0 --no-audit --no-fund \
 && pnpm install --frozen-lockfile --prod --store-dir /tmp/pnpm-store \
 && npm uninstall -g pnpm \
 && rm -rf /tmp/pnpm-store* /root/.cache/pnpm /root/.local/share/pnpm /root/.local/state/pnpm \
 && npm cache clean --force

# Codigo fuente y migraciones. NO copiamos node_modules (ya esta arriba).
COPY src ./src
COPY migrations ./migrations

# Migrar antes de arrancar (idempotente — registra en schema_migrations).
# Si falla, el contenedor se reinicia hasta 3 veces; Render hace lo mismo por su cuenta.
# Aqui en compose el auto-restart de docker hace ese trabajo.
RUN mkdir -p /app/logs && chown -R node:node /app
USER node

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+process.env.PORT+'/api/healthz', r => process.exit(r.statusCode===200?0:1)).on('error', ()=>process.exit(1))"

CMD ["node", "src/index.js"]
