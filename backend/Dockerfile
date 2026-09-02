# Etapa deps: instala TODAS las dependencias (incluyendo dev) y deja la cache para reuso
FROM node:24-alpine AS deps
WORKDIR /app

# Necesario para compilar bcryptjs si en algun momento pasamos a bcrypt nativo
RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json* ./
# Si falla lockf strict, npm ci --no-audit --no-fund --prefer-offline
RUN npm install --no-audit --no-fund

# Etapa runtime: solo deps de produccion + codigo. Imagen pequena y reproducible.
FROM node:24-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3001 \
    NPM_CONFIG_LOGLEVEL=warn

COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force

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
