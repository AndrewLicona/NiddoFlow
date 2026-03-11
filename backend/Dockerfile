FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
  gcc \
  tesseract-ocr \
  tesseract-ocr-spa \
  curl \
  && rm -rf /var/lib/apt/lists/*

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Set Prisma binary cache to a location accessible by non-root users
ENV PRISMA_BINARY_CACHE_DIR=/app/.prisma-cache

# Generate Prisma client (needs schema.prisma; binary goes to /app/.prisma-cache)
RUN prisma generate

# Create non-root user and give them ownership of /app (includes prisma cache)
RUN useradd -m -u 1001 appuser \
    && chown -R appuser:appuser /app
USER appuser

# Also set the env for runtime so Prisma finds the binary
ENV PRISMA_BINARY_CACHE_DIR=/app/.prisma-cache

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8000/health || exit 1

# Run the application
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
