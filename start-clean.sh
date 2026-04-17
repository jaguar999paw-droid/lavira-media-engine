#!/bin/bash
# ═══════════════════════════════════════════════════════════
# Lavira Media Engine — CLEAN START SCRIPT
# Fixes port conflicts, kills stale processes, verifies startup
# Usage: bash start-clean.sh
# ═══════════════════════════════════════════════════════════

cd "$(dirname "$0")" || exit 1

WEB_PORT=4005
MCP_PORT=4006

echo ""
echo "  ┌─────────────────────────────────────────────┐"
echo "  │  Lavira Media Engine — Clean Start           │"
echo "  └─────────────────────────────────────────────┘"
echo ""
echo "  [1/5] Killing any processes on ports $WEB_PORT and $MCP_PORT..."
fuser -k ${WEB_PORT}/tcp 2>/dev/null && echo "       ✓ Cleared port $WEB_PORT" || echo "       ✓ Port $WEB_PORT was free"
fuser -k ${MCP_PORT}/tcp 2>/dev/null && echo "       ✓ Cleared port $MCP_PORT" || echo "       ✓ Port $MCP_PORT was free"

echo "  [2/5] Killing stale tmux sessions..."
tmux kill-session -t lavira     2>/dev/null && echo "       ✓ Killed session: lavira"     || echo "       ✓ No session: lavira"
tmux kill-session -t lavira-mcp 2>/dev/null && echo "       ✓ Killed session: lavira-mcp" || echo "       ✓ No session: lavira-mcp"

sleep 1

echo "  [3/5] Starting Web UI on port $WEB_PORT..."
tmux new-session -d -s lavira \
  "cd $(pwd) && PORT=${WEB_PORT} npm start; exec bash"
sleep 4

echo "  [4/5] Starting MCP HTTP/SSE on port $MCP_PORT..."
tmux new-session -d -s lavira-mcp \
  "cd $(pwd) && node src/mcp/server.js --http ${MCP_PORT}; exec bash"
sleep 2

echo "  [5/5] Verifying health..."
WEB_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:${WEB_PORT}/api/health 2>/dev/null)
MCP_HEALTH=$(curl -s http://localhost:${WEB_PORT}/api/health 2>/dev/null | grep -o '"status":"ok"' || echo "pending")

if [ "$WEB_STATUS" = "200" ]; then
  WEB_ICON="✅"
else
  WEB_ICON="⚠️ ($WEB_STATUS)"
fi

echo ""
echo "  ╔══════════════════════════════════════════════════╗"
echo "  ║  LAVIRA MEDIA ENGINE — RUNNING                   ║"
echo "  ║                                                  ║"
echo "  ║  Web UI  : http://localhost:${WEB_PORT}   $WEB_ICON          ║"
echo "  ║  MCP SSE : http://localhost:${MCP_PORT}/sse              ║"
echo "  ║  MCP stdio (for Claude Desktop): node src/mcp/server.js"
echo "  ║                                                  ║"
echo "  ║  tmux sessions: lavira  |  lavira-mcp            ║"
echo "  ║  Attach: tmux attach -t lavira                   ║"
echo "  ║                                                  ║"
echo "  ║  Tailscale (if enabled):                         ║"
echo "  ║  Web: https://dizaster-1.euplectes-tegus.ts.net  ║"
echo "  ╚══════════════════════════════════════════════════╝"
echo ""
echo "  📋 Claude Desktop MCP config (claude.mcp.json):"
echo '  {
    "mcpServers": {
      "lavira-media-engine": {
        "command": "node",
        "args": ["/workspace/lavira-media-engine/src/mcp/server.js"]
      }
    }
  }'
echo ""
echo "  🔑 Required .env keys (check with: get_api_status):"
echo "     PORT=4005                    ← CRITICAL: fixes UI port mismatch"
echo "     ANTHROPIC_API_KEY=...        ✅ set"
echo "     GIPHY_API_KEY=...            ✅ set"
echo "     PEXELS_API_KEY=...           ✅ set"
echo "     INSTAGRAM_ACCESS_TOKEN=...   ❌ MISSING — add to enable publishing"
echo "     INSTAGRAM_USER_ID=...        ❌ MISSING"
echo ""
