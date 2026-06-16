# Build stage — Node for Vite.
FROM node:24-alpine@sha256:21f403ab171f2dc89bad4dd69d7721bfd15f084ccb46cdd225f31f2bc59b5c9a AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Runtime — Bun serves dist/ + server/index.ts natively.
FROM oven/bun:1-slim@sha256:d56a2534ffd262e92c12fd3249d3924d296d97086da773f821d7d0477435ea04
WORKDIR /app

COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server

ENV PORT=8080
EXPOSE 8080

CMD ["bun", "server/index.ts"]
