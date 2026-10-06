# ==============================================================================
# Sahayak Backend Production Dockerfile
# ==============================================================================

FROM node:20-slim AS base
WORKDIR /app

# Install native build tools for bcrypt
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install production dependencies
COPY --chown=node:node package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy application source code
COPY --chown=node:node src/ ./src/
COPY --chown=node:node scripts/ ./scripts/

# Set production environment defaults
ENV NODE_ENV=production
ENV PORT=5000

# Use unprivileged node user for security
USER node

# Expose HTTP port
EXPOSE 5000

# Container liveness check probe
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:5000/health/live || exit 1

# Start the application
CMD ["node", "src/server.js"]
