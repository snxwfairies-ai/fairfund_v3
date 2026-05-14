# ─── Stage 1: build ───────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ─── Stage 2: development ─────────────────────────────────────────────────────
FROM node:20-alpine AS development
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
EXPOSE 5000
CMD ["npm", "run", "start:dev"]

# ─── Stage 3: production ──────────────────────────────────────────────────────
FROM node:20-alpine AS production
RUN addgroup -g 1001 -S appgroup && adduser -u 1001 -S appuser -G appgroup
RUN apk add --no-cache dumb-init
WORKDIR /app
COPY --from=builder /app/dist         ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package*.json ./
RUN chown -R appuser:appgroup /app
USER appuser
EXPOSE 5000
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main"]
