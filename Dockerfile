# Build stage — Node for Vite.
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Runtime — Bun serves dist/ + server/index.ts natively.
FROM oven/bun:1-slim
WORKDIR /app

COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server

ENV PORT=8080
EXPOSE 8080

CMD ["bun", "server/index.ts"]
