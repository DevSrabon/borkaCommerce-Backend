# ===================================================================
# Stage 1: Build stage
# ===================================================================
FROM node:20-alpine AS builder

WORKDIR /app

# Install native dependencies required for Prisma & build tooling on Alpine
RUN apk add --no-cache openssl libc6-compat

# Copy dependency manifests first for Docker layer caching
COPY package*.json ./
COPY prisma ./prisma/

# Clean install all dependencies (including devDependencies needed for build)
RUN npm ci

# Copy source code and configuration
COPY . .

# Generate Prisma Client
RUN npx prisma generate

# Compile NestJS TypeScript application into dist/
RUN npm run build

# ===================================================================
# Stage 2: Production runtime stage
# ===================================================================
FROM node:20-alpine AS runner

WORKDIR /app

# Default environment configuration
ENV NODE_ENV=production
ENV PORT=8080

# Install runtime dependencies:
# - openssl & libc6-compat: required by Prisma query engine & native modules
# - dumb-init: lightweight init system to handle PID 1 & signal forwarding
RUN apk add --no-cache openssl libc6-compat dumb-init

# Create storage and log directories and set ownership for non-root user
RUN mkdir -p /app/uploads /app/logs && chown -R node:node /app

# Copy application artifacts and dependencies from builder
COPY --chown=node:node --from=builder /app/package*.json ./
COPY --chown=node:node --from=builder /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/dist ./dist
COPY --chown=node:node --from=builder /app/prisma ./prisma
COPY --chown=node:node docker-entrypoint.sh ./docker-entrypoint.sh

# Ensure entrypoint script is executable
RUN chmod +x ./docker-entrypoint.sh

# Run as non-root user for security
USER node

# Expose backend service port
EXPOSE 8080

# Use dumb-init and entrypoint script
ENTRYPOINT ["dumb-init", "--", "./docker-entrypoint.sh"]

# Start the NestJS application
CMD ["node", "dist/main.js"]
