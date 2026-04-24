# Build stage — Node for the proven Vite pipeline.
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Runtime stage — Bun runs server/index.ts natively, serves dist/.
FROM oven/bun:1-slim
WORKDIR /app

COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server

ENV PORT=8080
EXPOSE 8080

CMD ["bun", "server/index.ts"]
