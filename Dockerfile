# Lavira Media Engine — Production Docker Image v3.1
# Fixes: fontconfig cache dir, healthcheck, build-time validation
FROM node:20-slim

# Install FFmpeg, Sharp dependencies, and fontconfig tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libvips-dev \
    fontconfig \
    fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/* \
    && fc-cache -f -v 2>/dev/null || true

WORKDIR /app

# Install deps first (better layer caching)
COPY package*.json ./
RUN npm ci --omit=dev

# Copy source and public assets
COPY src/ ./src/
COPY public/ ./public/

# Create runtime directories and fontconfig cache with correct permissions
RUN mkdir -p uploads outputs assets db \
    && mkdir -p /var/cache/fontconfig \
    && chmod 1777 /var/cache/fontconfig

# Non-root user — create home so fontconfig can cache there
RUN useradd -r -u 1001 -m -d /home/lavira lavira \
    && mkdir -p /home/lavira/.cache/fontconfig \
    && chown -R lavira:lavira /app /home/lavira

USER lavira

EXPOSE 4005

ENV PORT=4005 \
    UPLOADS_DIR=/app/uploads \
    OUTPUTS_DIR=/app/outputs \
    ASSETS_DIR=/app/assets \
    DB_PATH=/app/lavira.db \
    NODE_ENV=production \
    HOME=/home/lavira \
    FONTCONFIG_PATH=/etc/fonts \
    XDG_CACHE_HOME=/home/lavira/.cache

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
    CMD node -e "require('http').get('http://localhost:'+process.env.PORT+'/api/health',r=>{process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1))"

CMD ["node", "src/server.js"]
