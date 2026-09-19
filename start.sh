#!/bin/bash

set -e

echo "=========================================="
echo "        SHREKBOOK PRODUCTION START"
echo "=========================================="

PORT="${PORT:-10000}"
SHREKAI_PORT="${SHREKAI_PORT:-8765}"

MODEL_PATH="/var/data/shrekai/shrekai.pt"
CHECKPOINT_PATH="/var/data/shrekai/latest.pt"

echo "[startup] Render PORT: ${PORT}"
echo "[startup] ShrekAI PORT: ${SHREKAI_PORT}"
echo "[startup] Model path: ${MODEL_PATH}"


# ============================================================
# VERIFY SHREKAI SOURCE
# ============================================================

REQUIRED_FILES=(
    "/app/ShrekAI/config.py"
    "/app/ShrekAI/core/model.py"
    "/app/ShrekAI/core/inference.py"
    "/app/ShrekAI/api/server.py"
    "/app/ShrekAI/training/dataset.py"
    "/app/ShrekAI/datasets/subword_vocab.json"
)

for FILE in "${REQUIRED_FILES[@]}"; do
    if [ ! -f "$FILE" ]; then
        echo "[FATAL] Missing required file:"
        echo "        $FILE"
        exit 1
    fi
done


# ============================================================
# VERIFY PERSISTENT DISK
# ============================================================

if [ ! -d "/var/data/shrekai" ]; then
    echo "[FATAL] Persistent ShrekAI disk is not mounted."
    echo ""
    echo "Expected:"
    echo "  /var/data/shrekai"
    echo ""
    echo "ShrekAI will NOT start without the persistent disk."
    exit 1
fi


# ============================================================
# VERIFY MODEL
# ============================================================

if [ -f "$MODEL_PATH" ]; then
    echo "[startup] Found deployed ShrekAI model:"
    echo "          $MODEL_PATH"
elif [ -f "$CHECKPOINT_PATH" ]; then
    echo "[startup] Found deployed ShrekAI checkpoint:"
    echo "          $CHECKPOINT_PATH"
else
    echo "[FATAL] No ShrekAI model exists on the persistent disk."
    echo ""
    echo "Expected one of:"
    echo "  $MODEL_PATH"
    echo "  $CHECKPOINT_PATH"
    echo ""
    echo "The server will NOT start a fake fallback."
    exit 1
fi


# ============================================================
# LINK PERSISTENT MODEL INTO SHREKAI
# ============================================================

mkdir -p /app/ShrekAI/models
mkdir -p /app/ShrekAI/checkpoints

if [ -f "$MODEL_PATH" ]; then
    ln -sf "$MODEL_PATH" "/app/ShrekAI/models/shrekai.pt"
    echo "[startup] Linked persistent model -> ShrekAI/models/shrekai.pt"
fi

if [ -f "$CHECKPOINT_PATH" ]; then
    ln -sf "$CHECKPOINT_PATH" "/app/ShrekAI/checkpoints/latest.pt"
    echo "[startup] Linked persistent checkpoint -> ShrekAI/checkpoints/latest.pt"
fi


# ============================================================
# START REAL SHREKAI
# ============================================================

echo ""
echo "[startup] Starting REAL ShrekAI..."
echo ""

cd /app/ShrekAI

SHREKAI_PORT="$SHREKAI_PORT" python3 -m api.server &
SHREKAI_PID=$!


# ============================================================
# WAIT FOR SHREKAI
# ============================================================

echo "[startup] Waiting for ShrekAI..."

SHREKAI_READY=0

for i in $(seq 1 300); do

    if ! kill -0 "$SHREKAI_PID" 2>/dev/null; then
        echo "[FATAL] ShrekAI process died during startup."
        exit 1
    fi

    if curl -fsS "http://127.0.0.1:${SHREKAI_PORT}/health" > /dev/null 2>&1; then
        SHREKAI_READY=1
        break
    fi

    sleep 1
done


if [ "$SHREKAI_READY" -ne 1 ]; then
    echo "[FATAL] ShrekAI did not become healthy within 300 seconds."
    exit 1
fi


echo ""
echo "=========================================="
echo "        SHREKAI ONLINE"
echo "=========================================="
echo ""


# ============================================================
# START SHREKBOOK
# ============================================================

echo "[startup] Starting ShrekBook..."
echo "[startup] Node port: ${PORT}"
echo ""

cd /app

PORT="$PORT" node server.js &
NODE_PID=$!


# ============================================================
# SHUTDOWN HANDLING
# ============================================================

shutdown() {
    echo ""
    echo "[shutdown] Stopping ShrekBook..."
    kill "$NODE_PID" 2>/dev/null || true

    echo "[shutdown] Stopping ShrekAI..."
    kill "$SHREKAI_PID" 2>/dev/null || true

    wait "$NODE_PID" 2>/dev/null || true
    wait "$SHREKAI_PID" 2>/dev/null || true

    echo "[shutdown] Done."
}

trap shutdown SIGTERM SIGINT


# ============================================================
# KEEP CONTAINER ALIVE
# ============================================================

wait "$NODE_PID"