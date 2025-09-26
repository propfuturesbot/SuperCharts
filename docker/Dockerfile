# Multi-stage build for optimized production image
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install ALL dependencies (including dev) for building
RUN npm ci && \
    npm cache clean --force

# Copy source code
COPY . .

# Build the library
RUN npm run build

# Build the React trading app
WORKDIR /app/react-trading-app
RUN npm ci
# Build directly with react-scripts to avoid prebuild hook
RUN npx react-scripts build

# Return to app directory
WORKDIR /app

# Production stage
FROM node:18-alpine

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production && \
    npm cache clean --force

# Install http-server globally (as root)
RUN npm install -g http-server

# Copy built application from builder stage
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/src ./src
COPY --from=builder --chown=nodejs:nodejs /app/react-trading-app/build ./react-app
COPY --from=builder --chown=nodejs:nodejs /app/trading-backend ./trading-backend
COPY --from=builder --chown=nodejs:nodejs /app/auth-token.json ./auth-token.json
COPY --chown=nodejs:nodejs docker/start-app.sh ./start-app.sh

# Switch to non-root user
USER nodejs

# Expose port (adjust based on your application)
EXPOSE 3000

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application using our startup script
CMD ["sh", "./start-app.sh"]