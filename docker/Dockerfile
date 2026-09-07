FROM node:22-alpine AS build-web
WORKDIR /build/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM node:22-alpine AS build-server
RUN apk add --no-cache python3 make g++
WORKDIR /build/server
COPY server/package.json server/package-lock.json ./
RUN npm ci
COPY server/ ./
RUN npm run build

FROM node:22-alpine
RUN apk add --no-cache python3 make g++
ENV NODE_ENV=production
WORKDIR /app
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build-server /build/server/dist ./dist
COPY --from=build-web /build/web/dist ./web-dist
ENV DATA_DIR=/app/data
EXPOSE 3000
CMD ["node", "dist/index.js"]
