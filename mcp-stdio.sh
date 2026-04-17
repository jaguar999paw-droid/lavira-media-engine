#!/usr/bin/env bash
# Lavira MCP stdio launcher — clean stdout for Claude Desktop
# Ensures no noise pollutes the JSON-RPC stream
exec /usr/local/bin/node /home/kamau/lavira-media-engine/src/mcp/server.js
