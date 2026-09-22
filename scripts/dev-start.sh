#!/usr/bin/env bash
# Start both AI5K dev servers fully detached (survives the launching shell).
# Usage: bash scripts/dev-start.sh
set -u
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Stop anything already listening on our ports
pkill -f "uvicorn app.main:app" 2>/dev/null || true
pkill -f "next dev" 2>/dev/null || true
sleep 1

# Backend (FastAPI) on :8000
cd "$ROOT/backend"
setsid nohup .venv/bin/python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 \
  > /tmp/ai5k-api.log 2>&1 < /dev/null &

# Frontend (Next.js dev) on :3000
cd "$ROOT/frontend"
setsid nohup npm run dev \
  > /tmp/ai5k-web.log 2>&1 < /dev/null &

# Wait until both respond
for i in $(seq 1 45); do
  B=$(curl -s --max-time 2 http://localhost:8000/health 2>/dev/null || true)
  F=$(curl -s --max-time 2 -o /dev/null -w "%{http_code}" http://localhost:3000 2>/dev/null || true)
  if [ -n "$B" ] && [ "$F" = "200" ]; then
    echo "backend  : http://localhost:8000  ($B)"
    echo "frontend : http://localhost:3000"
    echo "api docs : http://localhost:8000/docs"
    echo "logs     : /tmp/ai5k-api.log, /tmp/ai5k-web.log"
    exit 0
  fi
  sleep 2
done

echo "Timed out waiting for servers. Check /tmp/ai5k-api.log and /tmp/ai5k-web.log"
exit 1
