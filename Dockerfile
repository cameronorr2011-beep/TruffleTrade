# TruffleTrade — build the site + run the engine in one container
FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --include=dev

FROM node:22-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY package.json next.config.ts tsconfig.json postcss.config.mjs ./
COPY core ./core
COPY engine ./engine
COPY scripts ./scripts
COPY data ./data
RUN npm rebuild better-sqlite3
VOLUME ["/app/data"]
EXPOSE 3210
CMD ["sh", "-c", "npx tsx scripts/migrate.ts & npx tsx engine/index.ts & npx next start -p 3210"]
