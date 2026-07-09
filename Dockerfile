# ---------- build stage ----------
FROM node:22-bookworm-slim AS builder
WORKDIR /app

# Install deps (uses the lockfile for reproducible builds).
COPY package.json package-lock.json ./
RUN npm ci

# Build the React front-end into /app/dist.
COPY . .
RUN npm run build

# ---------- runtime stage ----------
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

# Reuse the node_modules built above (keeps the compiled better-sqlite3 binary),
# then drop dev-only packages (react, vite, ...).
COPY package.json package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules
RUN npm prune --omit=dev

# App code + built assets.
COPY --from=builder /app/dist ./dist
COPY server ./server

# SQLite file lives here (mount a volume to persist it).
RUN mkdir -p /app/data
VOLUME ["/app/data"]

EXPOSE 3001
CMD ["node", "server/index.js"]
