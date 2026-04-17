#!/bin/bash
# Lavira Media Engine — clean startup (Docker Compose)
# Usage: bash start.sh [--rebuild]
set -e
cd "$(dirname "$0")"

REBUILD=${1:-""}

echo ""
echo "  ╔══════════════════════════════════════════╗"
echo "  ║   Lavira Media Engine — Starting Up      ║"
echo "  ╚══════════════════════════════════════════╝"

# ── Kill any stray tmux/node processes on our ports (non-Docker) ────────────
echo "  → Clearing port conflicts..."
for PORT in 4005 4006; do
  PIDS=$(lsof -ti :$PORT 2>/dev/null | xargs -r ps -o pid=,comm= -p 2>/dev/null | grep -v 'docker-proxy' | awk '{print $1}' || true)
  if [ -n "$PIDS" ]; then
    echo "    Killing non-Docker PIDs on :$PORT → $PIDS"
    kill $PIDS 2>/dev/null || true
  fi
done
# Kill any loose tmux sessions
tmux kill-session -t lavira 2>/dev/null || true
tmux kill-session -t lavira-mcp 2>/dev/null || true
sleep 1

# ── Rebuild if requested ─────────────────────────────────────────────────────
if [ "$REBUILD" = "--rebuild" ]; then
  echo "  → Rebuilding Docker images..."
  docker compose build --no-cache
fi

# ── Bring containers up ──────────────────────────────────────────────────────
echo "  → Starting Docker Compose stack..."
docker compose down --remove-orphans 2>/dev/null || true
sleep 1
docker compose up -d

# ── Wait for health ──────────────────────────────────────────────────────────
echo "  → Waiting for engine to be healthy..."
for i in $(seq 1 20); do
  STATUS=$(curl -s --max-time 2 http://localhost:4005/api/health 2>/dev/null | python3 -c "import sys,json;print(json.load(sys.stdin)['status'])" 2>/dev/null || echo "")
  if [ "$STATUS" = "ok" ]; then break; fi
  sleep 2
  printf "."
done
echo ""

# ── Fix DB permissions (persistent issue with Docker volume) ─────────────────
echo "  → Fixing DB permissions..."
docker exec lavira-media-engine chmod 666 /app/db/lavira.db /app/db/lavira.db-shm /app/db/lavira.db-wal 2>/dev/null || true

# ── Verify ───────────────────────────────────────────────────────────────────
HEALTH=$(curl -s --max-time 3 http://localhost:4005/api/health 2>/dev/null)
TOOLS=$(curl -s --max-time 3 http://localhost:4006/rpc -X POST -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' 2>/dev/null | \
  python3 -c "import sys,json;print(len(json.load(sys.stdin)['result']['tools']))" 2>/dev/null || echo "?")

echo ""
echo "  ╔══════════════════════════════════════════╗"
echo "  ║  ✓ Lavira Media Engine RUNNING            ║"
echo "  ║                                           ║"
echo "  ║  Web UI  : http://localhost:4005           ║"
echo "  ║  MCP RPC : http://localhost:4006/rpc       ║"
echo "  ║  MCP SSE : http://localhost:4006/sse       ║"
echo "  ║  Tools   : ${TOOLS} active MCP tools              ║"
echo "  ║                                           ║"
echo "  ║  Tailscale (share externally):            ║"
echo "  ║  tailscale funnel 4005                    ║"
echo "  ╚══════════════════════════════════════════╝"
echo ""
echo "  Docker containers:"
docker ps --format '  {{.Names}}\t{{.Status}}' | grep lavira
echo ""
