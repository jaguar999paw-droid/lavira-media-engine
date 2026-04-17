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
- **MCP (HTTP/SSE)**: `http://localhost:4006` (started by `start.sh`

### Notes

- Never commit `.env`, `node_modules/`, `uploads/`, or `outputs/`.
- Post Outputs are written to `outputs/` and are downloadable under `/outputs/<filename>`.

