# =============================================================================
# AuroraNotes API - Production Dockerfile
# Multi-stage build optimized for security, size, and performance
# =============================================================================

# -----------------------------------------------------------------------------
# Build Stage
# -----------------------------------------------------------------------------
FROM node:22-alpine AS builder

# Install build dependencies for native modules (if needed)
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy package files first for better layer caching
COPY package*.json ./

# Install all dependencies (including dev for TypeScript compilation)
RUN npm ci --ignore-scripts

# Copy TypeScript config and source
COPY tsconfig.json ./
COPY src/ ./src/

# Build the application
RUN npm run build

# Prune dev dependencies after build
RUN npm prune --omit=dev

# -----------------------------------------------------------------------------
# Production Stage
# -----------------------------------------------------------------------------
FROM node:22-alpine AS production

# Security: Add labels for container metadata
LABEL org.opencontainers.image.title="AuroraNotes API" \
      org.opencontainers.image.description="RAG-powered notes API with advanced retrieval and citation grounding" \
      org.opencontainers.image.vendor="AuroraNotes" \
      org.opencontainers.image.source="https://github.com/salscrudato/auroranotes-api"

# Security: Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Security: Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs

WORKDIR /app

# Copy package.json for reference (useful for debugging)
COPY --from=builder /app/package.json ./

# Copy production node_modules from builder
COPY --from=builder /app/node_modules ./node_modules

# Copy compiled JavaScript
COPY --from=builder /app/dist ./dist

# Security: Set ownership to non-root user
RUN chown -R nodejs:nodejs /app

# Security: Switch to non-root user
USER nodejs

# Environment configuration
ENV NODE_ENV=production \
    PORT=8080 \
    # Optimize Node.js for containers
    NODE_OPTIONS="--max-old-space-size=512 --enable-source-maps"

# Expose the application port
EXPOSE 8080

# Health check for container orchestration
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:8080/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))" || exit 1

# Use dumb-init to handle signals properly (PID 1 problem)
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "dist/index.js"]
