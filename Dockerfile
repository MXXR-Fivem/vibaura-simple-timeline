# ---------- build stage ----------
FROM node:22-bookworm-slim AS builder
WORKDIR /app

# Install deps (uses the lockfile for reproducible builds).
COPY package.json package-lock.json ./
RUN npm ci

# Compile le serveur TS vers /app/build et builde le front React vers /app/dist.
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

# Front buildé + serveur compilé (build/ contient server/ ET shared/).
# Ne jamais poser de package.json dans build/ : paths.ts remonte au premier
# package.json pour situer la racine (et donc publicDir = /app/dist).
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/build ./build

# SQLite file lives here (mount a volume to persist it). The runtime runs as the
# unprivileged `node` user (uid 1000) — least privilege + host data files stay
# owned by uid 1000 instead of root.
RUN mkdir -p /app/data && chown -R node:node /app/data
VOLUME ["/app/data"]
USER node

EXPOSE 8790

# /api/me répond vite (401 sans session) => process vivant. `PORT` par défaut 8790.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8790)+'/api/me').then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"

CMD ["node", "build/server/index.js"]
