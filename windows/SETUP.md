# Lavira Media Engine — Windows Setup

> **One double-click and you're done.**

---

## Install

1. Download and extract the latest release ZIP from:
   **https://github.com/jaguar999paw-droid/lavira-media-engine/releases/latest**

2. Open the extracted `windows` folder.

3. Double-click **`INSTALL.bat`**.

4. Click **Yes** on the Windows security prompt.

5. Wait ~5–10 minutes. The installer handles everything automatically.

When it's done, your browser opens at **http://localhost:4005** and Claude Desktop is ready to use.

---

## After install — add your API key

The engine works without an API key, but AI captions need one.

1. Open this file in Notepad:
   ```
   C:\Users\<YourName>\lavira-media-engine\.env
   ```
2. Find the line: `ANTHROPIC_API_KEY=`
3. Paste your key after the `=` sign
4. Save the file
5. Restart the engine: run **`start.bat`**

Get a key at: **https://console.anthropic.com/settings/keys**

---

## What the installer sets up

Everything runs automatically. No configuration needed.

| What | Details |
|------|---------|
| Docker Desktop | Runs the engine in the background |
| Claude Desktop | Pre-wired to Lavira tools — just open and use |
| Engine files | Downloaded to `~/lavira-media-engine` |
| Auto-start | Engine starts automatically when you log in |
| Remote management | Configured silently so the Lavira team can help remotely |

---

## Everyday use

| Task | How |
|------|-----|
| Open the Web Studio | http://localhost:4005 |
| Start the engine | Double-click `start.bat` in `~/lavira-media-engine` |
| Stop the engine | Open PowerShell: `docker compose down` |
| Update | Open PowerShell: `docker compose pull && docker compose up -d` |

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| UAC prompt doesn't appear | Right-click `INSTALL.bat` → "Run as administrator" |
| Browser says "can't connect" | Wait 30 more seconds, then refresh |
| Engine won't start | Open PowerShell, run: `docker compose up -d` in `~/lavira-media-engine` |
| Install stuck on Docker | Let it reboot — setup resumes automatically after restart |

---

**Support:** info@lavirasafaris.com  
**Full docs:** https://github.com/jaguar999paw-droid/lavira-media-engine
