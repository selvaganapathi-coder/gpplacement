# Multi-stage production image for Render / Docker trial host.
# Serves Vite `dist/` + Express API on $PORT.

FROM node:20-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

FROM deps AS build
WORKDIR /app
COPY . .
# Dummy URL so `prisma generate` works at build time (real URL at runtime).
ENV DATABASE_URL="postgresql://placement:placement@localhost:5432/placement?schema=public"
ENV JWT_SECRET="build-time-placeholder-not-used-at-runtime-32chars"
RUN npx prisma generate
RUN npm run build

FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN groupadd -r app && useradd -r -g app app

COPY package.json package-lock.json ./
COPY prisma ./prisma
ENV DATABASE_URL="postgresql://placement:placement@localhost:5432/placement?schema=public"
RUN npm ci --omit=dev && npm install prisma --no-save \
  && npx prisma generate \
  && chown -R app:app /app

COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server
COPY --from=build /app/shared ./shared
COPY scripts/docker-start.sh ./scripts/docker-start.sh
RUN chmod +x ./scripts/docker-start.sh && chown -R app:app /app

USER app
EXPOSE 3001
CMD ["./scripts/docker-start.sh"]
