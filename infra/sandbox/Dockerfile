FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy executor
COPY executor.py .

# Create non-root user
RUN useradd -r -s /bin/false sandbox

# Create writable tmp directory
RUN mkdir -p /tmp/sandbox && chown sandbox:sandbox /tmp/sandbox

USER sandbox

EXPOSE 8000

# Use gunicorn for production, flask dev server for dev
CMD ["gunicorn", "--bind", "0.0.0.0:8000", "--timeout", "60", "--workers", "2", "executor:app"]
