# Build stage: VITE_API_URL is inlined into the bundle at build time.
FROM node:22-bookworm-slim AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# Runtime stage: nginx serves the static bundle and proxies /api to the server.
# nginx.conf is a template; the image renders it into conf.d at startup,
# substituting API_UPSTREAM.
FROM nginx:1.27-alpine

ENV API_UPSTREAM=http://server:3001
COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
