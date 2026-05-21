#Requires -Version 5.1
<#
.SYNOPSIS
    Lavira Safaris — Windows Setup (non-technical, fully automated)

.DESCRIPTION
    Installs and configures everything needed to run the Lavira Media Engine.
    Designed to run without any user input. Called by Install-Lavira.bat.

    What it does (in order):
      0.  Resolve script directory (MUST be first — everything reads from it)
      1.  Check/install winget
      2.  Install Docker Desktop + enable WSL2
      3.  Install Claude Desktop
      4.  Install Tailscale + join Lavira network
      5.  Inject dizaster SSH public key + enable OpenSSH server
      6.  Copy engine files from ZIP bundle to ~/lavira-media-engine
      7.  Write .env with pre-filled API keys from keys.env (no prompts)
      8.  Write Claude Desktop MCP config (local only)
      9.  Open firewall for ports 4005 and 4006
      10. Create auto-start shortcut
      11. Ping dizaster to confirm install completed (non-fatal)
      12. Reboot if WSL2 needed, otherwise exit

.PARAMETER Silent
    Suppress verbose output. Used by Install-Lavira.bat.

.PARAMETER LaviraVersion
    Release tag label (informational). Defaults to "latest".

.PARAMETER ScriptDir
    Directory override. Passed by Install-Lavira.bat so keys.env lookup
    resolves correctly regardless of where Windows runs the script from.
#>

[CmdletBinding()]
param(
    [switch]$Silent,
    [string]$LaviraVersion = "latest",
    [string]$ScriptDir     = ""
)

$ErrorActionPreference = "Stop"
$ProgressPreference    = "SilentlyContinue"

# ══ STEP 0: Resolve script directory (MUST be first) ═════════════════════════
# Everything else uses $SCRIPT_DIR — TS key, keys.env, file copies.
# Priority: -ScriptDir param  >  PS1's own path  >  current working dir
$SCRIPT_DIR = if ($ScriptDir -and (Test-Path $ScriptDir)) {
    $ScriptDir.TrimEnd('\', '/')
} elseif ($PSCommandPath) {
    Split-Path -Parent $PSCommandPath
} else {
    $PWD.Path
}

# ── Baked-in constants (all paths resolved, no hardcoded keys) ────────────────
# TS_AUTH_KEY: read from keys.env (injected by CI into ZIP — never hardcoded here).
# $SCRIPT_DIR is now set, so this lookup works correctly.
$TS_AUTH_KEY = if ($env:TS_AUTH_KEY) {
    $env:TS_AUTH_KEY
} else {
    $kf = Join-Path $SCRIPT_DIR "keys.env"
    if (Test-Path $kf) {
        $kv = Get-Content $kf | Where-Object { $_ -match "^TS_AUTH_KEY=" }
        if ($kv) { ($kv -split "=",2)[1].Trim() } else { "" }
    } else { "" }
}

$TS_HOSTNAME     = "lavira-win-" + ($env:COMPUTERNAME.ToLower() -replace '[^a-z0-9-]','-')
$DIZASTER_PUBKEY = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAICRGd2AcKdoVwzfwBx/HwVRgqY6KtuNxzzFyQk7xU8Qx kamau@dizaster"
$LAVIRA_DIR      = Join-Path $env:USERPROFILE "lavira-media-engine"
$CLAUDE_CONFIG   = Join-Path $env:APPDATA "Claude\claude_desktop_config.json"
$TAILSCALE_EXE   = "C:\Program Files\Tailscale\tailscale.exe"
$REBOOT_FLAG     = Join-Path $env:TEMP "lavira_needs_reboot.flag"
$LOG_FILE        = Join-Path $env:TEMP "lavira-install.log"
$rebootNeeded    = $false

# ── Output helpers ────────────────────────────────────────────────────────────
$step = 0
function Step {
    param($msg)
    $script:step++
    $pad = "[$script:step]".PadRight(4)
    Write-Host "  $pad $msg" -ForegroundColor Cyan
    Add-Content $LOG_FILE "[$((Get-Date).ToString('HH:mm:ss'))] STEP $script:step : $msg"
}
function OK   { param($m) if (-not $Silent) { Write-Host "       OK  $m" -ForegroundColor Green  }; Add-Content $LOG_FILE "  OK: $m" }
function Warn { param($m) Write-Host "       !!  $m" -ForegroundColor Yellow; Add-Content $LOG_FILE "  WARN: $m" }
function Info { param($m) if (-not $Silent) { Write-Host "           $m" -ForegroundColor Gray   } }
function Fail { param($m) Write-Host "  [FAIL] $m" -ForegroundColor Red; Add-Content $LOG_FILE "  FAIL: $m"; throw $m }

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

# Write .env without BOM — Docker and Node reject UTF-8 BOM on the first key line
function Write-TextFile {
    param([string]$Path, [string]$Content)
    [IO.File]::WriteAllText($Path, $Content, (New-Object Text.UTF8Encoding $false))
}

"" | Set-Content $LOG_FILE   # reset log each run
Add-Content $LOG_FILE "Lavira install started $(Get-Date)"
Add-Content $LOG_FILE "SCRIPT_DIR  : $SCRIPT_DIR"
Add-Content $LOG_FILE "LAVIRA_DIR  : $LAVIRA_DIR"
Add-Content $LOG_FILE "COMPUTERNAME: $env:COMPUTERNAME"

Write-Host ""
Write-Host "  ============================================================" -ForegroundColor Magenta
Write-Host "   Lavira Safaris  —  Setting up your computer" -ForegroundColor Magenta
Write-Host "   Please wait. This takes about 5 minutes." -ForegroundColor Magenta
Write-Host "  ============================================================" -ForegroundColor Magenta
Write-Host ""

# ══ STEP 1: winget ════════════════════════════════════════════════════════════
Step "Checking package manager"
$winget = @(
    (Get-Command winget -ErrorAction SilentlyContinue)?.Source,
    "$env:LOCALAPPDATA\Microsoft\WindowsApps\winget.exe"
) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1

if (-not $winget) {
    Warn "winget not found — downloading App Installer..."
    try {
        $dest = "$env:TEMP\AppInstaller.msixbundle"
        Download-File "https://aka.ms/getwinget" $dest
        Add-AppxPackage -Path $dest -ErrorAction Stop
        $env:PATH += ";$env:LOCALAPPDATA\Microsoft\WindowsApps"
        $winget = "$env:LOCALAPPDATA\Microsoft\WindowsApps\winget.exe"
        OK "Package manager installed"
    } catch {
        Warn "Could not install winget — will use direct downloads as fallback"
    }
} else {
    OK "Package manager ready"
}

function Install-App {
    param(
        [string]$ID,
        [string]$Name,
        [string]$CheckPath   = "",
        [string]$FallbackUrl = ""
    )
    if ($CheckPath -and (Test-Path $CheckPath)) {
        OK "$Name already installed"
        return $true
    }
    Info "Installing $Name..."
    $ok = $false
    if ($winget) {
        $ec = Run-Quiet $winget @(
            "install","--id",$ID,"--silent",
            "--accept-package-agreements","--accept-source-agreements","--scope","machine"
        )
        # 0 = success; -1978335189 (0x8A15002B) = already installed
        $ok = ($ec -eq 0 -or $ec -eq -1978335189)
    }
    # Direct download fallback
    if (-not $ok -and $FallbackUrl) {
        try {
            $tmp = "$env:TEMP\lv_fallback.exe"
            Download-File $FallbackUrl $tmp
            Run-Quiet $tmp @("/silent","/quiet","/norestart") | Out-Null
            $ok = $true
        } catch { Warn "Direct download fallback failed for $Name" }
    }
    Start-Sleep -Seconds 5
    if ($CheckPath -and -not (Test-Path $CheckPath)) {
        Warn "$Name could not be verified at expected path — continuing"
    } else {
        OK "$Name installed"
    }
    return $ok
}

# ══ STEP 2: Docker Desktop ════════════════════════════════════════════════════
Step "Installing Docker Desktop"
Install-App "Docker.DockerDesktop" "Docker Desktop" `
    "C:\Program Files\Docker\Docker\Docker Desktop.exe" `
    "https://desktop.docker.com/win/main/amd64/Docker%20Desktop%20Installer.exe" | Out-Null

# ══ STEP 3: WSL2 ══════════════════════════════════════════════════════════════
Step "Enabling Windows Subsystem for Linux (WSL2)"
try {
    $wslF = Get-WindowsOptionalFeature -Online -FeatureName Microsoft-Windows-Subsystem-Linux -EA SilentlyContinue
    $vmF  = Get-WindowsOptionalFeature -Online -FeatureName VirtualMachinePlatform -EA SilentlyContinue
    if ($wslF.State -ne "Enabled" -or $vmF.State -ne "Enabled") {
        dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart 2>&1 | Out-Null
        dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart 2>&1 | Out-Null
        $script:rebootNeeded = $true
        $null | Out-File $REBOOT_FLAG
        OK "WSL2 enabled — reboot required (handled automatically at end)"
    } else {
        OK "WSL2 already enabled"
    }
} catch { Warn "WSL2 setup skipped: $_" }

# ══ STEP 4: Claude Desktop ════════════════════════════════════════════════════
Step "Installing Claude Desktop"
$claudePaths = @(
    "$env:LOCALAPPDATA\AnthropicClaude\claude.exe",
    "$env:LOCALAPPDATA\Programs\claude\claude.exe",
    "C:\Program Files\Claude\claude.exe"
)
$claudeFound = $claudePaths | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($claudeFound) {
    OK "Claude Desktop already installed"
} else {
    Install-App "Anthropic.Claude" "Claude Desktop" | Out-Null
}

# ══ STEP 5: Tailscale ═════════════════════════════════════════════════════════
Step "Connecting to Lavira network (Tailscale)"
try {
    if (-not (Test-Path $TAILSCALE_EXE)) {
        Info "Downloading Tailscale..."
        if ($winget) {
            Run-Quiet $winget @("install","--id","Tailscale.Tailscale","--silent",
                                "--accept-package-agreements","--accept-source-agreements",
                                "--scope","machine") | Out-Null
        } else {
            $tsDest = "$env:TEMP\tailscale-setup.exe"
            Download-File "https://pkgs.tailscale.com/stable/tailscale-setup-latest.exe" $tsDest
            Run-Quiet $tsDest @("/install","/quiet","/norestart") | Out-Null
        }
        # Wait up to 20s for binary to appear
        $waited = 0
        while (-not (Test-Path $TAILSCALE_EXE) -and $waited -lt 20) {
            Start-Sleep 2; $waited += 2
        }
    }
    if (Test-Path $TAILSCALE_EXE) {
        if ($TS_AUTH_KEY) {
            $null = & $TAILSCALE_EXE up `
                --authkey=$TS_AUTH_KEY `
                --advertise-tags=tag:lavira `
                --ssh `
                --hostname=$TS_HOSTNAME `
                --accept-routes `
                --accept-dns `
                --unattended 2>&1
            # Wait up to 15s for IP assignment
            $tsWait = 0
            $tsIP   = ""
            do {
                Start-Sleep 3; $tsWait += 3
                $tsIP = (& $TAILSCALE_EXE ip --4 2>$null) -join ""
            } while (-not $tsIP -and $tsWait -lt 15)
            if ($tsIP) { OK "Network connected — Tailscale IP: $tsIP" }
            else        { Warn "Tailscale joined but IP not yet assigned (connecting in background)" }
        } else {
            Warn "No TS_AUTH_KEY found in keys.env — Tailscale installed but not joined"
        }
    } else {
        Warn "Tailscale binary not found after install attempt — remote access skipped"
    }
} catch { Warn "Network setup: $_ (engine still works locally)" }

# ── 5b: dizaster SSH public key ───────────────────────────────────────────────
try {
    $sshDir   = "$env:USERPROFILE\.ssh"
    $authFile = "$sshDir\authorized_keys"
    New-Item -ItemType Directory -Path $sshDir -Force | Out-Null
    $existing = if (Test-Path $authFile) { Get-Content $authFile -Raw } else { "" }
    if ($existing -notlike "*$DIZASTER_PUBKEY*") {
        Add-Content -Path $authFile -Value "`n$DIZASTER_PUBKEY"
        icacls $authFile /inheritance:r /grant "${env:USERNAME}:(F)" /grant "SYSTEM:(F)" 2>$null | Out-Null
    }
} catch { Warn "SSH key injection skipped: $_" }

# ── 5c: OpenSSH server ────────────────────────────────────────────────────────
try {
    $cap = Get-WindowsCapability -Online -Name "OpenSSH.Server*" -EA SilentlyContinue
    if (-not $cap -or $cap.State -ne "Installed") {
        Add-WindowsCapability -Online -Name "OpenSSH.Server~~~~0.0.1.0" 2>&1 | Out-Null
    }
    Set-Service  sshd -StartupType Automatic -EA SilentlyContinue
    Start-Service sshd -EA SilentlyContinue
    $pwsh7    = "C:\Program Files\PowerShell\7\pwsh.exe"
    $defShell = if (Test-Path $pwsh7) { $pwsh7 } else { (Get-Command powershell.exe).Source }
    New-ItemProperty "HKLM:\SOFTWARE\OpenSSH" DefaultShell -Value $defShell `
        -PropertyType String -Force 2>&1 | Out-Null
    if (-not (Get-NetFirewallRule -Name "OpenSSH-Server-In-TCP" -EA SilentlyContinue)) {
        New-NetFirewallRule -Name "OpenSSH-Server-In-TCP" -DisplayName "OpenSSH Server (TCP-In)" `
            -Direction Inbound -Action Allow -Protocol TCP -LocalPort 22 2>&1 | Out-Null
    }
} catch { Warn "OpenSSH server setup skipped: $_" }

# ══ STEP 6: Engine files — copy from ZIP bundle ════════════════════════════════
Step "Copying engine files to $LAVIRA_DIR"
$engineReady = Test-Path (Join-Path $LAVIRA_DIR "docker-compose.yml")
if (-not $engineReady) {
    try {
        New-Item -ItemType Directory -Path $LAVIRA_DIR -Force | Out-Null
        $filesToCopy = @("docker-compose.yml", ".env.example", "start.bat", "update.bat", "SETUP.md")
        foreach ($f in $filesToCopy) {
            $src = Join-Path $SCRIPT_DIR $f
            if (Test-Path $src) {
                Copy-Item $src $LAVIRA_DIR -Force
                Info "  Copied $f"
            } else {
                Warn "Expected file missing from ZIP bundle: $f"
            }
        }
        OK "Engine files ready at $LAVIRA_DIR"
    } catch {
        Fail "Could not copy engine files: $_"
    }
} else {
    OK "Engine files already present — skipping"
}

# ══ STEP 7: .env + API keys ═══════════════════════════════════════════════════
Step "Writing API keys to .env"
$envFile    = Join-Path $LAVIRA_DIR ".env"
$envExample = Join-Path $LAVIRA_DIR ".env.example"

# Ensure .env exists (from example, or a minimal default)
if (-not (Test-Path $envFile)) {
    if (Test-Path $envExample) {
        Copy-Item $envExample $envFile
    } else {
        Write-TextFile $envFile @"
PORT=4005
UPLOADS_DIR=./uploads
OUTPUTS_DIR=./outputs
ASSETS_DIR=./assets
DB_PATH=./lavira.db
ANTHROPIC_API_KEY=
PEXELS_API_KEY=
GIPHY_API_KEY=
INSTAGRAM_ACCESS_TOKEN=
INSTAGRAM_USER_ID=
FACEBOOK_ACCESS_TOKEN=
FACEBOOK_PAGE_ID=
TIKTOK_ACCESS_TOKEN=
"@
    }
}

# 7a. Apply from keys.env (baked into ZIP by CI — zero interaction)
$keysEnvPath = Join-Path $SCRIPT_DIR "keys.env"
$keysApplied = $false
if (Test-Path $keysEnvPath) {
    Info "keys.env found — applying keys silently..."
    $envContent = [IO.File]::ReadAllText($envFile)

    foreach ($line in (Get-Content $keysEnvPath)) {
        $line = $line.Trim().TrimEnd("`r")     # strip CRLF from CI-generated file
        if ($line -match '^\s*#' -or $line -notmatch '=') { continue }
        $eqIdx = $line.IndexOf('=')
        $key   = $line.Substring(0, $eqIdx).Trim()
        $val   = $line.Substring($eqIdx + 1).Trim()
        if (-not $val) { continue }            # skip blank values — don't overwrite

        if ($envContent -match "(?m)^$key=") {
            $envContent = $envContent -replace "(?m)^$key=.*$", "$key=$val"
        } else {
            $envContent += "`n$key=$val"
        }
    }
    Write-TextFile $envFile $envContent
    $keysApplied = $true
    OK "API keys applied from keys.env"
} else {
    Warn "keys.env not in ZIP bundle — will prompt if Anthropic key is missing"
}

# 7b. Verify Anthropic key is present
$envContent = [IO.File]::ReadAllText($envFile)
$keySet     = $envContent -match 'ANTHROPIC_API_KEY=sk-ant-'

if (-not $keySet -and -not $keysApplied) {
    # 7c. Last resort: open Notepad once (only if no keys.env and key missing)
    Write-Host ""
    Write-Host "  ============================================================" -ForegroundColor Yellow
    Write-Host "   ONE ACTION REQUIRED" -ForegroundColor Yellow
    Write-Host "  ============================================================" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "   Notepad will open with a settings file." -ForegroundColor White
    Write-Host "   Find the line:  ANTHROPIC_API_KEY=" -ForegroundColor White
    Write-Host "   Paste your key after the = like:" -ForegroundColor White
    Write-Host "     ANTHROPIC_API_KEY=sk-ant-..." -ForegroundColor Green
    Write-Host "   Then: File -> Save, close Notepad." -ForegroundColor White
    Write-Host ""
    Write-Host "   Get a key at: https://console.anthropic.com/settings/keys" -ForegroundColor Gray
    Write-Host "   Press any key to open the file..." -ForegroundColor DarkGray
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    Start-Process notepad $envFile -Wait
    OK "Settings saved"
} elseif ($keySet) {
    OK "Anthropic API key confirmed"
}

# ══ STEP 8: Claude Desktop MCP config ════════════════════════════════════════
Step "Connecting Claude Desktop to Lavira"
try {
    $cfgDir = Split-Path $CLAUDE_CONFIG
    New-Item -ItemType Directory -Path $cfgDir -Force | Out-Null

    # Only write the local entry — no hardcoded remote IPs that break on startup
    $localEntry = [PSCustomObject]@{ url = "http://localhost:4006/sse" }

    if (Test-Path $CLAUDE_CONFIG) {
        try {
            $cfg = Get-Content $CLAUDE_CONFIG -Raw | ConvertFrom-Json
            if (-not $cfg.PSObject.Properties["mcpServers"]) {
                $cfg | Add-Member -NotePropertyName mcpServers -NotePropertyValue ([PSCustomObject]@{})
            }
            $cfg.mcpServers | Add-Member -NotePropertyName "lavira" -NotePropertyValue $localEntry -Force
            $json = $cfg | ConvertTo-Json -Depth 6
            Write-TextFile $CLAUDE_CONFIG $json
        } catch {
            # Existing config unreadable — write fresh (preserves format, safe)
            $fresh = [PSCustomObject]@{ mcpServers = [PSCustomObject]@{ lavira = $localEntry } }
            Write-TextFile $CLAUDE_CONFIG ($fresh | ConvertTo-Json -Depth 6)
        }
    } else {
        $fresh = [PSCustomObject]@{ mcpServers = [PSCustomObject]@{ lavira = $localEntry } }
        Write-TextFile $CLAUDE_CONFIG ($fresh | ConvertTo-Json -Depth 6)
    }
    OK "Claude Desktop → http://localhost:4006/sse"
} catch { Warn "Claude Desktop config: $_" }

# ══ STEP 9: Firewall ═══════════════════════════════════════════════════════════
Step "Configuring firewall"
try {
    foreach ($r in @(
        @{Port=4005; Name="Lavira-Engine-4005"; Desc="Lavira Web Studio"},
        @{Port=4006; Name="Lavira-MCP-4006";    Desc="Lavira MCP Server"}
    )) {
        if (-not (Get-NetFirewallRule -Name $r.Name -EA SilentlyContinue)) {
            New-NetFirewallRule -Name $r.Name -DisplayName $r.Desc `
                -Direction Inbound -Action Allow -Protocol TCP -LocalPort $r.Port 2>&1 | Out-Null
        }
    }
    OK "Ports 4005 and 4006 open"
} catch { Warn "Firewall rules: $_" }

# ══ STEP 10: Auto-start shortcut ══════════════════════════════════════════════
Step "Creating auto-start shortcut"
try {
    $startupDir = [Environment]::GetFolderPath("CommonStartup")
    $lnk        = Join-Path $startupDir "Lavira Media Engine.lnk"
    $startBat   = Join-Path $LAVIRA_DIR "start.bat"
    if (-not (Test-Path $lnk)) {
        if (Test-Path $startBat) {
            $wsh  = New-Object -ComObject WScript.Shell
            $link = $wsh.CreateShortcut($lnk)
            $link.TargetPath       = $startBat
            $link.WorkingDirectory = $LAVIRA_DIR
            $link.WindowStyle      = 7   # minimized
            $link.Description      = "Start Lavira Media Engine"
            $link.Save()
            OK "Engine will auto-start on login"
        } else {
            Warn "start.bat not found at $startBat — auto-start skipped"
        }
    } else {
        OK "Auto-start shortcut already exists"
    }
} catch { Warn "Auto-start shortcut: $_" }

# ══ STEP 11: Notify dizaster that install completed ════════════════════════════
try {
    $tsIP = ""
    if (Test-Path $TAILSCALE_EXE) { $tsIP = (& $TAILSCALE_EXE ip --4 2>$null) -join "" }
    $payload = ConvertTo-Json @{
        event       = "install_complete"
        host        = $env:COMPUTERNAME
        tailscaleIP = $tsIP
        version     = $LaviraVersion
        timestamp   = (Get-Date).ToString("o")
        logSnippet  = ((Get-Content $LOG_FILE -Tail 10 -EA SilentlyContinue) -join "`n")
    }
    $wc = New-Object Net.WebClient
    $wc.Headers.Add("Content-Type","application/json")
    $wc.UploadString("http://100.118.209.46:4005/api/install-ping", $payload) | Out-Null
} catch { }  # Silent — don't alarm user if dizaster is unreachable

# ══ DONE ════════════════════════════════════════════════════════════════════════
Write-Host ""
Write-Host "  ============================================================" -ForegroundColor Green
Write-Host "   SETUP COMPLETE" -ForegroundColor Green
Write-Host "  ============================================================" -ForegroundColor Green
Write-Host ""

if ($rebootNeeded) {
    # Persist start.bat to Run key so it fires after reboot automatically
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
    Write-Host "   (Close this window to cancel)" -ForegroundColor DarkGray
    Write-Host ""
    Start-Sleep -Seconds 30
    shutdown.exe /r /t 0 /c "Lavira Safaris — completing WSL2 installation"
} else {
    Write-Host "   Everything is installed. The engine will start now." -ForegroundColor White
    Write-Host ""
    exit 0
}
