# Installation Guide

Detailed setup instructions for Lavira Media Engine on Windows, Linux, and macOS, plus the manual Claude Desktop MCP wiring, environment variables, and troubleshooting. For a project overview and current architecture, see the [main README](../README.md).

---

## Windows Setup

**Requirements:** Windows 10 or 11 (64-bit) · internet connection · ~15 min on first run

**1. Download the ZIP**

Go to the [latest release](https://github.com/jaguar999paw-droid/lavira-media-engine/releases/latest) and download `lavira-media-engine-windows-setup.zip`.

**2. Extract it**

Right-click the ZIP → **Extract All** → choose any folder (e.g. your Desktop).

**3. Run the installer**

Double-click `Install-Lavira.bat` inside the extracted folder, then click **Yes** on the UAC prompt.

The installer handles everything automatically:
- Docker Desktop
- Claude Desktop (pre-wired to Lavira)
- API keys from `keys.env` (if present — see below)
- Auto-start on login

**4. Done**

Your browser opens to `http://localhost:4005` once the engine is ready.

### API keys

The public ZIP ships with no keys. Two options:

**Option A — zero-touch (recommended for managed installs)**
Place a `keys.env` file next to `Install-Lavira.bat` before running it. The installer reads it silently and fills in all keys — no prompts.

```ini
ANTHROPIC_API_KEY=sk-ant-...
PEXELS_API_KEY=...
GIPHY_API_KEY=...
TS_AUTH_KEY=...
```

**Option B — interactive**
Run without `keys.env`. The installer opens Notepad once for your Anthropic key. Get a free key at https://console.anthropic.com/settings/keys.

### After install — Claude Desktop

Open Claude Desktop and start a chat — Lavira tools are already connected via MCP. Test with `list my recent jobs`; Claude should respond with Lavira data. If tools don't appear, restart Claude Desktop once.

### Daily use

| Task | How |
|------|-----|
| Open web studio | `http://localhost:4005` |
| Start engine after reboot | Double-click `start.bat` in the install folder |
| Stop engine | PowerShell: `docker compose down` |
| View logs | PowerShell: `docker compose logs -f` |

### Troubleshooting

| Problem | Fix |
|---------|-----|
| "Windows protected your PC" | Click **More info** → **Run anyway** |
| UAC prompt doesn't appear | Right-click `Install-Lavira.bat` → **Run as administrator** |
| Browser says "can't connect" | Wait 30s, then refresh — first build takes ~10 min |
| Engine stopped after reboot | Double-click `start.bat` in the install folder |
| Claude Desktop shows no tools | Restart Claude Desktop |
| Port 4005 already in use | PowerShell: `docker compose down` then `docker compose up -d` |
| Install log | `%TEMP%\\lavira-install.log` |

---

## Linux / macOS Setup

```bash
git clone https://github.com/jaguar999paw-droid/lavira-media-engine.git
cd lavira-media-engine
cp .env.example .env && nano .env   # add your API keys
bash start.sh
# Web UI:  http://localhost:4005
# MCP SSE: http://localhost:4006/sse
```

---

## Manual Claude Desktop MCP wiring

If the installer didn't wire Claude Desktop automatically, edit `%APPDATA%\\Claude\\claude_desktop_config.json` (Windows) or `~/.config/Claude/claude_desktop_config.json` (Linux/macOS):

```json
{
  "mcpServers": {
    "lavira": {
      "command": "node",
      "args": ["<path-to-install>/lavira-media-engine/src/mcp/server.js"]
    }
  }
}
```

Restart Claude Desktop. The Lavira tools will appear in every conversation.

---

## Environment variables

| Variable | Required | Notes |
|----------|----------|-------|
| `ANTHROPIC_API_KEY` | Recommended | AI captions + scripts |
| `PEXELS_API_KEY` | Recommended | Stock photos + videos (free tier) |
| `GIPHY_API_KEY` | Optional | GIF search |
| `INSTAGRAM_ACCESS_TOKEN` | Optional | Direct publishing |
| `FACEBOOK_ACCESS_TOKEN` | Optional | Direct publishing |
| `TIKTOK_ACCESS_TOKEN` | Optional | Direct publishing |
| `PORT` | No (default: 4005) | Web UI port |
