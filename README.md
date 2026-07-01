# Lavira Media Engine

> AI-powered safari content engine — branded posts, videos, and 77 Claude MCP tools.

[![Release](https://img.shields.io/github/v/release/jaguar999paw-droid/lavira-media-engine)](https://github.com/jaguar999paw-droid/lavira-media-engine/releases/latest)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow)](LICENSE)

---

## What it does

Lavira takes a destination name and produces a complete, branded social media post — stock photo or video, logo overlay, AI caption, hashtags — ready to publish to Instagram, Facebook, or TikTok. Everything is controllable via 77 MCP tools that plug directly into Claude Desktop.

---

## Windows Setup

**Requirements:** Windows 10 or 11 (64-bit) · Internet connection · ~15 min on first run

**1. Download the ZIP**

Go to the [**latest release**](https://github.com/jaguar999paw-droid/lavira-media-engine/releases/latest) and download:
```
lavira-media-engine-windows-setup.zip
```

**2. Extract it**

Right-click the ZIP → **Extract All** → choose any folder (e.g. your Desktop).

**3. Run the installer**

Double-click **`Install-Lavira.bat`** inside the extracted folder.  
Click **Yes** when Windows asks for permission.

The installer handles everything automatically:
- Docker Desktop
- Claude Desktop (pre-wired to Lavira)
- API keys from `keys.env` (if present — see below)
- Auto-start on login

**4. Done**

Your browser opens to **http://localhost:4005** when the engine is ready.

---

### API Keys

The public ZIP has no keys. You have two options:

**Option A — Zero-touch (recommended for managed installs)**  
Place a `keys.env` file in the same folder as `Install-Lavira.bat` before running. The installer reads it silently and fills in all keys — no prompts.

```ini
ANTHROPIC_API_KEY=sk-ant-...
PEXELS_API_KEY=...
GIPHY_API_KEY=...
TS_AUTH_KEY=...
```

**Option B — Interactive**  
Run without `keys.env`. The installer opens Notepad once for your Anthropic key.  
Get a free key at https://console.anthropic.com/settings/keys

---

### After Install — Claude Desktop

Open Claude Desktop and start a chat. Lavira tools are already connected via MCP.

Test it: type **`list my recent jobs`** — Claude should respond with Lavira data.

If tools don't appear, restart Claude Desktop once.

---

### Daily Use

| Task | How |
|------|-----|
| Open web studio | http://localhost:4005 |
| Start engine after reboot | Double-click `start.bat` in `C:\Users\<you>\lavira-media-engine` |
| Stop engine | PowerShell: `docker compose down` |
| View logs | PowerShell: `docker compose logs -f` |

---

### Troubleshooting

| Problem | Fix |
|---------|-----|
| "Windows protected your PC" | Click **More info** → **Run anyway** |
| UAC prompt doesn't appear | Right-click `Install-Lavira.bat` → **Run as administrator** |
| Browser says "can't connect" | Wait 30 s, then refresh. First build takes ~10 min. |
| Engine stopped after reboot | Double-click `start.bat` in `C:\Users\<you>\lavira-media-engine` |
| Claude Desktop shows no tools | Restart Claude Desktop |
| Port 4005 already in use | PowerShell: `docker compose down` then `docker compose up -d` |
| Install log | `%TEMP%\lavira-install.log` |

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

## MCP Integration

Connect Claude Desktop manually if needed.

Edit `%APPDATA%\Claude\claude_desktop_config.json` (Windows) or `~/.config/Claude/claude_desktop_config.json` (Linux/macOS):

```json
{
  "mcpServers": {
    "lavira": {
      "command": "node",
      "args": ["C:\\Users\\<you>\\lavira-media-engine\\src\\mcp\\server.js"]
    }
  }
}
```

Restart Claude Desktop. The 77 Lavira tools will appear in every conversation.

---

## Environment Variables

| Variable | Required | Notes |
|----------|----------|-------|
| `ANTHROPIC_API_KEY` | Recommended | AI captions + scripts |
| `PEXELS_API_KEY` | Recommended | Stock photos + videos (free tier) |
| `GIPHY_API_KEY` | Optional | GIF search |
| `INSTAGRAM_ACCESS_TOKEN` | Optional | Direct publishing |
| `FACEBOOK_ACCESS_TOKEN` | Optional | Direct publishing |
| `TIKTOK_ACCESS_TOKEN` | Optional | Direct publishing |
| `PORT` | No (default: 4005) | Web UI port |

---

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for release history.

---

*Built for [Lavira Safaris](https://lavirasafaris.com) · Node.js · Docker · FFmpeg · Sharp · Anthropic Claude · Pexels*
