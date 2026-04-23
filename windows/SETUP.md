# Lavira Media Engine — Windows Setup Guide

> **Time to first post: ~10 minutes.**  
> You need Docker Desktop and an Anthropic API key. Nothing else.

---

## Option A — Local setup (use this machine for content creation)

### Step 1 — Install Docker Desktop

Download and install from: **https://www.docker.com/products/docker-desktop/**

During installation:
- ✅ Check **"Use WSL 2 instead of Hyper-V"** (recommended)
- ✅ Check **"Add Docker to PATH"**

After installing, **restart your PC**.

Open Docker Desktop from the Start Menu and wait for the whale icon in the system tray to stop animating — that means it's ready.

---

### Step 2 — Get your API Keys

| Key | Required | Where to get it |
|-----|----------|----------------|
| **Anthropic API key** | ✅ Yes | https://console.anthropic.com/settings/keys |
| **Pexels API key** | Optional | https://www.pexels.com/api/ (free) |
| **GIPHY API key** | Optional | https://developers.giphy.com/ (free) |

---

### Step 3 — Run `start.bat`

Double-click **`start.bat`** in this folder.

On first run it will:
1. Check Docker Desktop is running (starts it if not)
2. Create a `.env` file and open Notepad for you to paste your API keys
3. Pull the Docker images (~500 MB, takes a few minutes on first run)
4. Start the engine and open your browser at **http://localhost:4005**

---

### Step 4 — Connect Claude Desktop (Optional)

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

Restart Claude Desktop. You'll see all Lavira tools available.

---

## Option B — Remote access setup (headless / managed remotely from dizaster)

Use this option when you want to set up a Windows PC so it can be managed
remotely over Tailscale SSH from the `dizaster` admin node. Run this once on
the Windows machine — you never need to touch it again.

### Run the bootstrap script

Open **PowerShell as Administrator** and run:

```powershell
Set-ExecutionPolicy Bypass -Scope Process -Force
.\setup-remote-access.ps1
```

The script will prompt you for a Tailscale auth key. Generate one at:
**https://login.tailscale.com/admin/settings/keys**

Use a **reusable, pre-authenticated key** scoped to `tag:lavira`.

> **Do not share your auth key publicly.** The script accepts it interactively
> or via `-TailscaleAuthKey` parameter — it is never stored in the source code.

#### What the script installs and configures

| Component | Details |
|-----------|---------|
| **Tailscale** | Joins tailnet as `lavira-win-<hostname>`, tagged `tag:lavira`, Tailscale SSH enabled |
| **OpenSSH Server** | Fallback SSH on port 22, hardened (`PubkeyAuthentication yes`) |
| **dizaster pubkey** | `kamau@dizaster` key installed in `authorized_keys` — no password needed |
| **Docker Desktop** | WSL 2 backend, auto-started |
| **Claude Desktop** | Pre-wired to both local engine (`localhost:4006`) and dizaster engine |
| **Firewall rules** | Ports 22, 4005, 4006 opened |
| **Auto-start shortcut** | Engine starts on login |

#### Script flags

```powershell
# Preview every step without making changes
.\setup-remote-access.ps1 -DryRun

# Skip Docker install (if already installed)
.\setup-remote-access.ps1 -SkipDocker

# Supply key non-interactively (CI/automated use)
.\setup-remote-access.ps1 -TailscaleAuthKey "tskey-auth-YOURKEY"
```

---

### SSH in from dizaster after setup

Once the script finishes, connect from `dizaster` with no password:

```bash
# By Tailscale hostname (MagicDNS)
ssh USERNAME@lavira-win-HOSTNAME

# Or by Tailscale IP (shown at end of script output)
ssh USERNAME@<tailscale-ip>
```

Then finish setup:

```powershell
# Add your API keys
notepad ~/lavira-media-engine/.env

# Start the engine
cd ~/lavira-media-engine
.\start.bat
```

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
| Tailscale SSH won't connect | Check node is online at https://login.tailscale.com/admin/machines |
| `authorized_keys` permission error | Run: `icacls "$env:USERPROFILE\.ssh\authorized_keys" /inheritance:r /grant "${env:USERNAME}:(F)"` |

---

**Full documentation:** https://github.com/jaguar999paw-droid/lavira-media-engine  
**Support:** info@lavirasafaris.com
