# Build stage — Node for Vite.
FROM node:24-alpine@sha256:d1b3b4da11eefd5941e7f0b9cf17783fc99d9c6fc34884a665f40a06dbdfc94f AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Runtime — Bun serves dist/ + server/index.ts natively.
FROM oven/bun:1-slim@sha256:7e8ed3961db1cdedf17d516dda87948cfedbd294f53bf16462e5b57ed3fff0f1
WORKDIR /app

COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server

ENV PORT=8080
EXPOSE 8080

CMD ["bun", "server/index.ts"]
