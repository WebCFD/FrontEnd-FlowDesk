# FlowDesk HVAC Simulation Platform
# Production-ready Docker configuration

# Debian-based Node.js image for better Python/pyvista compatibility (Alpine musl
# breaks many manylinux wheels including VTK/PyVista)
FROM node:20-slim

WORKDIR /app

# Install system dependencies including Python3
RUN apt-get update && apt-get install -y --no-install-recommends \
    postgresql-client \
    curl \
    python3 \
    python3-pip \
    python3-venv \
    && rm -rf /var/lib/apt/lists/*

# Create a dedicated Python virtual environment so packages don't conflict with
# the system Python and are available to all worker processes
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Install Python packages required by the simulation workers (step05, etc.)
# Done BEFORE copying application code so this layer is cached between deploys
RUN pip install --no-cache-dir \
    "pyvista>=0.44.0" \
    "scipy>=1.11.0" \
    "numpy>=1.26.0" \
    "pandas>=2.2.0" \
    "requests>=2.32.5" \
    "pillow>=11.3.0" \
    "reportlab>=4.4.4" \
    "matplotlib>=3.10.7" \
    "boto3>=1.41.5" \
    "pythermalcomfort>=3.8.0" \
    "botocore>=1.41.5" \
    "shapely>=2.0.0" \
    "foamlib>=0.2.0" \
    "psutil>=5.9.0" \
    "tqdm>=4.66.0" \
    "tarsafe>=0.0.5"

# Copy package files first for better Docker layer caching
COPY package*.json ./

# Install Node.js dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy application source code
COPY . .

# Build the application
RUN npm run build

# Create non-root user for security
RUN groupadd -g 1001 nodejs \
    && useradd -r -u 1001 -g nodejs flowdesk

# Change ownership of app directory and venv
RUN chown -R flowdesk:nodejs /app \
    && chown -R flowdesk:nodejs /opt/venv
USER flowdesk

# Expose port 5000
EXPOSE 5000

# Health check to ensure container is running properly
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:5000/api/config || exit 1

# Start the application
CMD ["npm", "start"]
