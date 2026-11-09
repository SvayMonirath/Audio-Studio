#!/bin/bash
set -e
PORT="${PORT:-8000}"
HOST="${HOST:-127.0.0.1}"

echo "Starting Audio Studio on http://${HOST}:${PORT}..."
exec python3 run_server.py --port "$PORT" --host "$HOST"
