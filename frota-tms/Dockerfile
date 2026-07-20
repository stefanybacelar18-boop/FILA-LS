# Imagem única FrotaTMS: build do web + API Express (serve /public)
# NÃO faz parte do FilaDock. Deploy separado (Docker / Render / Railway).

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
COPY scripts/prepare-postgres-schema.sh /tmp/prepare-postgres-schema.sh
RUN chmod +x /tmp/prepare-postgres-schema.sh \
  && /tmp/prepare-postgres-schema.sh /app/prisma/schema.prisma
RUN npm ci
RUN npx prisma generate

FROM node:22-alpine AS api-build
WORKDIR /app
COPY --from=api-deps /app/node_modules ./node_modules
COPY api/ ./
COPY scripts/prepare-postgres-schema.sh /tmp/prepare-postgres-schema.sh
RUN chmod +x /tmp/prepare-postgres-schema.sh \
  && /tmp/prepare-postgres-schema.sh /app/prisma/schema.prisma
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
COPY scripts/prepare-postgres-schema.sh ./scripts/prepare-postgres-schema.sh
COPY --from=web-build /web/dist ./public
RUN chmod +x docker-entrypoint.sh scripts/prepare-postgres-schema.sh \
  && mkdir -p /app/data /app/backups /app/uploads
EXPOSE 4000
ENTRYPOINT ["./docker-entrypoint.sh"]
