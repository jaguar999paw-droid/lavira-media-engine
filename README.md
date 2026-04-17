## Lavira Media Engine

Node.js content automation engine for Lavira Safaris.

### Quick start

```bash
cd /home/kamau/lavira-media-engine
npm install
cp .env.example .env
# edit .env with your keys
bash start.sh
```

### URLs

- **Web UI**: `http://localhost:4005`
- **MCP (HTTP/SSE)**: `http://localhost:4006` (started by `start.sh`)

### Key docs

- `LAVIRA_MCP_HANDOFF.md`
- `AGENT_HANDOFF.md`
- `HANDOFFFFFF.md`

### Notes

- Never commit `.env`, `node_modules/`, `uploads/`, or `outputs/`.
- Outputs are written to `outputs/` and are downloadable under `/outputs/<filename>`.

