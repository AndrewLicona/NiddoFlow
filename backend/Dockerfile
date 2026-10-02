FROM python:3.11-slim-bookworm

WORKDIR /app

# Configure APT retries and install system dependencies (openssl and ca-certificates are required by Prisma query engine)
RUN echo 'Acquire::Retries "3";' > /etc/apt/apt.conf.d/80-retries \
  && apt-get update && apt-get install -y --no-install-recommends \
  gcc \
  tesseract-ocr \
  tesseract-ocr-spa \
  curl \
  openssl \
  ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Set Prisma binary cache location
ENV PRISMA_BINARY_CACHE_DIR=/app/.prisma-cache

# Generate Prisma client and pre-fetch query engine binary during build
RUN prisma generate && (prisma py fetch || true)

# Create non-root user and ensure permissions on app and prisma cache
RUN mkdir -p /app/.prisma-cache \
    && useradd -m -u 1001 appuser \
    && chown -R appuser:appuser /app \
    && chmod -R 777 /app/.prisma-cache
USER appuser

# Also set the env for runtime so Prisma finds the binary
ENV PRISMA_BINARY_CACHE_DIR=/app/.prisma-cache

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8000/health || exit 1

# Run the application (PORT can be overridden via env var; default 8000 for backwards compatibility)
ENV PORT=8000
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
