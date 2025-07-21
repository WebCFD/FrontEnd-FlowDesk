# FlowDesk HVAC Simulation Platform
# Production-ready Docker configuration

# Use Node.js 20 LTS with Alpine Linux for smaller image size
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Install system dependencies for better compatibility
RUN apk add --no-cache \
    postgresql-client \
    curl \
    && rm -rf /var/cache/apk/*

# Copy package files first for better Docker layer caching
COPY package*.json ./

# Install Node.js dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy application source code
COPY . .

# Build the application
RUN npm run build

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs \
    && adduser -S flowdesk -u 1001 -G nodejs

# Change ownership of app directory
RUN chown -R flowdesk:nodejs /app
USER flowdesk

# Expose port 5000
EXPOSE 5000

# Health check to ensure container is running properly
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:5000/api/config || exit 1

# Start the application
CMD ["npm", "start"]