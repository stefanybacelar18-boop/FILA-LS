# Imagem única FrotaTMS: build do web + API Express (serve /web/dist)
# NÃO faz parte do FilaDock.

FROM node:22-alpine AS web-build
WORKDIR /web
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM node:22-alpine AS api-deps
WORKDIR /app
COPY api/package*.json ./
COPY api/prisma ./prisma/
# Gera client já para PostgreSQL (produção)
RUN sed -i 's/provider = "sqlite"/provider = "postgresql"/' prisma/schema.prisma \
  && sed -i 's/provider = "sqlite"/provider = "postgresql"/' prisma/migrations/migration_lock.toml || true
RUN npm ci
RUN npx prisma generate

FROM node:22-alpine AS api-build
WORKDIR /app
COPY --from=api-deps /app/node_modules ./node_modules
COPY api/ ./
RUN sed -i 's/provider = "sqlite"/provider = "postgresql"/' prisma/schema.prisma \
  && sed -i 's/provider = "sqlite"/provider = "postgresql"/' prisma/migrations/migration_lock.toml || true
RUN npx prisma generate && npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache wget openssl
COPY --from=api-deps /app/node_modules ./node_modules
COPY --from=api-build /app/dist ./dist
COPY --from=api-build /app/prisma ./prisma
COPY --from=api-build /app/package*.json ./
COPY api/docker-entrypoint.sh ./
COPY --from=web-build /web/dist ./public
RUN chmod +x docker-entrypoint.sh \
  && mkdir -p /app/data /app/backups
EXPOSE 4000
ENTRYPOINT ["./docker-entrypoint.sh"]
