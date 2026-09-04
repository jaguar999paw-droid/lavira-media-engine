# Lavira Media Engine — Windows Setup

This is the reference for what `Install-Lavira.bat` / `setup-remote-access.ps1` do, and how to
manage the engine and its MCP servers afterward. Most people never need this file — the
installer is zero-touch — but keep it for troubleshooting or manual setup.

## What gets installed

Running `Install-Lavira.bat` (as Administrator) does the following, in order:

1. Installs Docker Desktop (+ enables WSL2) — runs the engine via `docker compose`
2. Installs Claude Desktop
3. Installs Tailscale and joins the Lavira network (for remote support access)
4. Enables OpenSSH server + injects the operator's public key (for remote support)
5. Copies engine files to `%USERPROFILE%\lavira-media-engine`
6. Writes `.env` with pre-filled API keys (baked into the ZIP at build time — never typed by hand)
7. Registers the **federated MCP server cluster** with Claude Desktop (see below)
8. Opens firewall ports 4005 (web studio) and 4006 (legacy MCP SSE port, no longer used by default)
9. Creates an auto-start shortcut so the engine comes up on login
10. Reboots automatically if WSL2 needed enabling, otherwise finishes immediately

## MCP servers — how they're wired

Lavira uses a **federated 6-server MCP architecture**, not a single monolith process. Each
server is a standalone Node.js script under `src\mcp\servers\`, run over stdio:

| Server | File | What it covers |
|---|---|---|
| `lavira-ops` | `ops-server.js` | health, cache, files, admin |
| `lavira-search` | `search-server.js` | stock photo/video + GIPHY + library search |
| `lavira-brand` | `brand-server.js` | brand context, AI captions, memory |
| `lavira-media` | `media-server.js` | video/image/audio editing primitives |
| `lavira-design` | `design-server.js` | cards, overlays, compositor, intelligence-router |
| `lavira-publish` | `publish-server.js` | social publishing, scheduling, bookings |

The installer writes all 6 into `%APPDATA%\Claude\claude_desktop_config.json` under
`mcpServers`, each pointing `node.exe` at its server file with `DOTENV_CONFIG_PATH` set to
`%USERPROFILE%\lavira-media-engine\.env`. Claude Desktop spawns each one on demand over stdio
(no port, no "is it running" race) whenever a conversation needs a Lavira tool — this is the
same architecture proven live on the reference (Linux) deployment, not the older single-file
`src\mcp\server.js` monolith, which is intentionally left unregistered.

**Bringing servers up manually** (if you ever need to, e.g. for testing one in isolation):

```powershell
cd $env:USERPROFILE\lavira-media-engine
$env:DOTENV_CONFIG_PATH = "$env:USERPROFILE\lavira-media-engine\.env"
node src\mcp\servers\ops-server.js
```

It will sit and wait for JSON-RPC on stdin — that's normal; it's designed to be driven by
Claude Desktop, not run interactively. Ctrl+C to stop.

**Verifying registration after install:**

1. Open Claude Desktop → Settings → Developer → you should see 6 `lavira-*` entries listed
2. Start a new chat, ask Claude something that needs a Lavira tool (e.g. "list my recent Lavira jobs")
3. If tools don't appear: restart Claude Desktop completely (quit from the system tray, not just
   close the window), then check step 2 again

**If MCP registration was skipped during install** (Node.js wasn't found on PATH): install
[Node.js LTS](https://nodejs.org) for Windows, then re-run `Install-Lavira.bat`, or edit
`%APPDATA%\Claude\claude_desktop_config.json` by hand using the table above as a guide.

## Daily use

| Task | How |
|---|---|
| Open web studio | http://localhost:4005 |
| Start engine after reboot (if auto-start didn't fire) | Double-click `start.bat` in the install folder |
| Stop engine | PowerShell → `docker compose down` |
| Check engine is running | PowerShell → `docker compose ps` |
| Swap an API key | Edit `.env` in the install folder, then `docker compose restart` |

## Troubleshooting

| Problem | Fix |
|---|---|
| "Windows protected your PC" dialog | Click **More info** → **Run anyway** |
| UAC prompt doesn't appear | Right-click `Install-Lavira.bat` → **Run as administrator** |
| Browser says "can't connect" right after install | Wait ~30s and refresh — Docker is still starting containers |
| Engine stopped after a reboot | Double-click `start.bat` in the install folder |
| Port 4005 already in use | PowerShell → `docker compose down` then `docker compose up -d` |
| Claude Desktop doesn't show Lavira tools | Fully restart Claude Desktop (quit from tray, relaunch) |
| Install log | `%TEMP%\lavira-install.log` |

**Support:** info@lavirasafaris.com
