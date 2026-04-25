# Lavira Media Engine — Windows Setup Guide

> **For MCP + web use. Everything installs automatically.**

---

## Install

1. Right-click the ZIP file → **Extract All** → pick any folder
2. Open the extracted folder
3. Double-click **`Install-Lavira.bat`**
4. Click **Yes** when Windows asks for permission
5. Leave the window open — takes ~10 minutes
6. If Windows needs to restart, let it — setup resumes automatically
7. Done. Browser opens to **http://localhost:4005**

API keys are pre-loaded. No extra configuration needed.

---

## After install — using Lavira with Claude Desktop

Open Claude Desktop and start a new chat. Lavira tools are already connected.

Test it: type **`list my recent jobs`** — Claude should respond with Lavira data.

If tools don't appear, restart Claude Desktop once.

**Manual MCP address** (if needed):
```
http://localhost:4006/sse
```
Add under: Claude Desktop → Settings → Developer → MCP Servers

---

## Daily use

| Task | How |
|------|-----|
| Web studio | http://localhost:4005 |
| Start engine (after reboot) | Double-click `start.bat` |
| Stop engine | PowerShell: `docker compose down` |
| Restart engine | PowerShell: `docker compose up -d` |
| View logs | PowerShell: `docker compose logs -f` |

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| "Windows protected your PC" | Click **More info** → **Run anyway** |
| UAC prompt missing | Right-click `Install-Lavira.bat` → **Run as administrator** |
| Browser won't connect | Wait 30 seconds, then refresh |
| Engine stopped after reboot | Double-click `start.bat` |
| Claude Desktop shows no Lavira tools | Restart Claude Desktop |
| Port conflict on 4005/4006 | PowerShell: `docker compose down` then `docker compose up -d` |

---

## What was installed

| Component | Purpose |
|-----------|---------|
| Docker Desktop | Runs the Lavira engine in the background |
| Claude Desktop | Pre-wired to all 52 Lavira MCP tools |
| Lavira engine files | Saved to `C:\Users\<you>\lavira-media-engine` |
| Auto-start shortcut | Engine starts automatically when you log in |
| Tailscale + SSH | Allows remote support and management |
| Firewall rules | Opens ports 4005 (web) and 4006 (MCP) |

---

**Support:** info@lavirasafaris.com
**Releases:** https://github.com/jaguar999paw-droid/lavira-media-engine/releases
