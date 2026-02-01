FROM node:22-slim

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application code
COPY . .

# Build if TypeScript present
RUN if [ -f "tsconfig.json" ]; then npm run build || true; fi

ENV NODE_ENV=production
ENV PORT=3000

# Support running as arbitrary non-root user
RUN chmod -R 777 /app && \
    mkdir -p /home/node && \
    chmod -R 777 /home/node

# Run as non-root user
USER 1001

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=30s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/v1/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1); }).on('error', () => process.exit(1));"

# Start the application
CMD ["node", "src/index.js"]
