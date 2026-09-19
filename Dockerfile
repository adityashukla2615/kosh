# One container: API + built web app. `docker build -t kosh . && docker run -p 8787:8787 kosh`
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY api/package.json api/
COPY web/package.json web/
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production STATIC_DIR=/app/web/dist PORT=8787
COPY package.json package-lock.json ./
COPY api/package.json api/
COPY web/package.json web/
RUN npm ci --omit=dev --workspace api && npm cache clean --force
COPY api/src api/src
COPY --from=build /app/web/dist web/dist
EXPOSE 8787
USER node
CMD ["node", "api/src/server.js"]
