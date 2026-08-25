# ---- Build stage ----
FROM node:20-alpine AS build
WORKDIR /app

# Install all deps (including dev) for the build.
COPY package*.json ./
RUN npm ci

# Compile TypeScript to dist/.
COPY tsconfig*.json ./
COPY src ./src
RUN npm run build

# Prune to production dependencies only.
RUN npm prune --omit=dev

# ---- Runtime stage ----
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Run as the built-in non-root user for security.
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./

USER node
EXPOSE 3000

# Basic container healthcheck hitting the /health endpoint.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:'+(process.env.PORT||3000)+'/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "dist/server.js"]
