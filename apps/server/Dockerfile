# Verified Node.js 22.23.4 multi-arch image index (Docker Hub official library/node)
FROM node:22.23.4-alpine@sha256:0e1754758c2df4cfa3e68d59e2e1b7374bb7fd9ea6328eaaacf15cc934af8202

WORKDIR /app

# Copy root workspace files
COPY package.json package-lock.json ./

# Copy scripts
COPY scripts scripts

# Copy all package.json files first
COPY packages/core/package.json packages/core/package.json
COPY packages/crdt/package.json packages/crdt/package.json
COPY apps/server/package.json apps/server/package.json

# Install dependencies
RUN npm ci

# Copy source files
COPY packages/core packages/core
COPY packages/crdt packages/crdt
COPY apps/server apps/server
COPY tsconfig.base.json ./

# Build packages; strip npm from the final runtime image. The server runs node directly,
# while bundled npm CLI dependencies needlessly increase production attack surface.
RUN npm run build -w @colanode/core && \
    npm run build -w @colanode/crdt && \
    npm run build -w @colanode/server && \
    npm prune --omit=dev && \
    rm -rf /usr/local/lib/node_modules/npm && \
    rm -f /usr/local/bin/npm /usr/local/bin/npx

ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "apps/server/dist/index.js"]
