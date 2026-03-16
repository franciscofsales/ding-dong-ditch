# Build stage
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ src/
RUN npx tsc

# Production stage
FROM node:20-alpine

RUN apk add --no-cache ffmpeg

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist/ dist/
COPY src/public/ dist/public/

RUN mkdir -p /app/config /recordings

EXPOSE 3000

CMD ["node", "dist/index.js"]
