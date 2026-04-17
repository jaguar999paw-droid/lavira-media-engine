#!/usr/bin/env bash
# Lavira MCP stdio launcher — clean stdout for Claude Desktop
# Ensures no noise pollutes the JSON-RPC stream
# Usage: point Claude Desktop's "command" at this script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec node "$SCRIPT_DIR/src/mcp/server.js"
