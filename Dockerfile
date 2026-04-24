FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
RUN printf 'server {\n  listen 8080;\n  root /usr/share/nginx/html;\n  index index.html;\n  gzip on;\n  gzip_types text/css application/javascript application/json image/svg+xml;\n  location / {\n    try_files $uri $uri/ /index.html;\n  }\n  location ~* \\.(js|css|svg|png|woff2?)$ {\n    expires 7d;\n    add_header Cache-Control "public, immutable";\n  }\n}\n' > /etc/nginx/conf.d/default.conf
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
