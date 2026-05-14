FROM node:20-alpine AS frontend-builder
WORKDIR /build
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM node:20-alpine AS backend-builder
WORKDIR /build
COPY backend/package*.json ./
RUN npm ci
COPY backend/ ./
RUN npx tsc

FROM node:20-alpine
WORKDIR /app
COPY --from=backend-builder /build/dist ./dist
COPY backend/package*.json ./
RUN npm ci --omit=dev
COPY --from=frontend-builder /build/dist ./frontend-dist
CMD ["node", "dist/server.js"]
