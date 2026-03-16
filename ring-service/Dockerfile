FROM node:20-slim

RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY src/ src/

RUN mkdir -p /app/config /recordings

EXPOSE 3000

CMD ["node", "src/index.js"]
