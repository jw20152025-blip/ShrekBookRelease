FROM node:24-bookworm

# ============================================================
# SYSTEM PACKAGES
# ============================================================

RUN apt-get update && \
    apt-get install -y \
        python3 \
        python3-pip \
        python3-venv \
        curl \
        ca-certificates && \
    rm -rf /var/lib/apt/lists/*


# ============================================================
# APP DIRECTORY
# ============================================================

WORKDIR /app


# ============================================================
# NODE DEPENDENCIES
# ============================================================

COPY package.json package-lock.json ./

RUN npm ci --omit=dev


# ============================================================
# PYTHON DEPENDENCIES
# ============================================================

COPY ShrekAI/requirements.txt /tmp/shrekai-requirements.txt

RUN python3 -m pip install \
    --break-system-packages \
    --no-cache-dir \
    -r /tmp/shrekai-requirements.txt


# ============================================================
# COPY APPLICATION
# ============================================================

COPY . .


# ============================================================
# START SCRIPT
# ============================================================

RUN chmod +x /app/start.sh


# ============================================================
# ENVIRONMENT
# ============================================================

ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

# Render supplies PORT automatically.
# ShrekAI stays private inside the container.
ENV SHREKAI_PORT=8765


# ============================================================
# START
# ============================================================

CMD ["/app/start.sh"]