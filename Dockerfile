FROM node:20-alpine AS frontend-builder
WORKDIR /build
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY backend/package*.json ./
RUN npm ci --only=production
COPY backend/src ./src
COPY backend/tsconfig.json ./
RUN npx tsc
COPY backend/drizzle.config.ts ./
COPY --from=frontend-builder /build/dist ./frontend-dist
CMD ["node", "dist/server.js"]
