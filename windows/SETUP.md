# Lavira Media Engine — Windows Setup Guide

> **Time to first post: ~10 minutes.**  
> You need Docker Desktop and an Anthropic API key. Nothing else.

---

## Step 1 — Install Docker Desktop

Download and install from: **https://www.docker.com/products/docker-desktop/**

During installation:
- ✅ Check **"Use WSL 2 instead of Hyper-V"** (recommended)
- ✅ Check **"Add Docker to PATH"**

After installing, **restart your PC**.

Open Docker Desktop from the Start Menu and wait for the whale icon in the system tray to stop animating — that means it's ready.

---

## Step 2 — Get your API Keys

You need at least one key to generate content:

| Key | Required | Where to get it |
|-----|----------|----------------|
| **Anthropic API key** | ✅ Yes | https://console.anthropic.com/settings/keys |
| **Pexels API key** | Optional | https://www.pexels.com/api/ (free) |
| **GIPHY API key** | Optional | https://developers.giphy.com/ (free) |

---

## Step 3 — Run `start.bat`

Double-click **`start.bat`** in this folder.

On first run it will:
1. Check Docker Desktop is running (starts it if not)
2. Create a `.env` file and open Notepad for you to paste your API keys
3. Pull the Docker images (~500 MB, takes a few minutes on first run)
4. Start the engine and open your browser at **http://localhost:4005**

---

## Step 4 — Connect Claude Desktop (Optional)

To control Lavira with AI via Claude Desktop, edit your Claude config file:

**Location:** `%APPDATA%\Claude\claude_desktop_config.json`

Add this:
```json
{
  "mcpServers": {
    "lavira-media-engine": {
      "url": "http://localhost:4006/sse"
    }
  }
}
```

Restart Claude Desktop. You'll see 52 Lavira tools available.

---

## Everyday use

| Task | How |
|------|-----|
| **Start the engine** | Double-click `start.bat` |
| **Open the Web UI** | http://localhost:4005 |
| **Stop the engine** | Open PowerShell: `docker compose down` |
| **View logs** | Open PowerShell: `docker compose logs -f` |
| **Update to latest** | Open PowerShell: `docker compose pull && docker compose up -d` |

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `docker: command not found` | Docker Desktop isn't open — start it from the Start Menu |
| Browser shows "This site can't be reached" | Wait 30 more seconds, engine is still loading |
| Port 4005 already in use | Open PowerShell: `netstat -ano \| findstr :4005` → `taskkill /PID <number> /F` |
| `.env` file not saved | Open `.env` with Notepad, add your keys, **File → Save** |
| Engine won't start after restart | Run `docker volume create lavira-db` in PowerShell, then `start.bat` |

---

**Full documentation:** https://github.com/jaguar999paw-droid/lavira-media-engine  
**Support:** info@lavirasafaris.com
