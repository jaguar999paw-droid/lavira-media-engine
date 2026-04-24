#Requires -Version 5.1
<#
.SYNOPSIS
    Lavira Media Engine — Remote Access Bootstrap
    Sets up Tailscale (tag:lavira + SSH), Docker Desktop, Claude Desktop,
    OpenSSH (fallback), and the lavira-media-engine stack on a fresh Windows machine.

.DESCRIPTION
    Run once on the remote Windows PC. After completion you can SSH in from
    your dizaster/admin node via:
        ssh <WINDOWS_USERNAME>@<tailscale-ip>   (Tailscale SSH)
    or:
        ssh <WINDOWS_USERNAME>@<tailscale-hostname>

.PARAMETER TailscaleAuthKey
    Pre-auth key from tailscale.com/admin/settings/keys.
    Must have tag:lavira capability. If omitted the script will prompt.

.PARAMETER LaviraVersion
    GitHub release tag to pull, e.g. "v1.2.0". Defaults to "latest".

.EXAMPLE
    .\setup-remote-access.ps1 -TailscaleAuthKey "tskey-auth-xxxx"
#>

[CmdletBinding()]
param(
    [string]$TailscaleAuthKey = "",
    [string]$LaviraVersion    = "latest"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ─── Colour helpers ──────────────────────────────────────────────────────────
function Write-Step   { param($msg) Write-Host "`n[»] $msg" -ForegroundColor Cyan  }
function Write-OK     { param($msg) Write-Host "    [✓] $msg" -ForegroundColor Green  }
function Write-Warn   { param($msg) Write-Host "    [!] $msg" -ForegroundColor Yellow }
function Write-Fail   { param($msg) Write-Host "    [✗] $msg" -ForegroundColor Red; exit 1 }

# ─── Must run as Administrator ───────────────────────────────────────────────
$me = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $me.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "Re-launching as Administrator..." -ForegroundColor Yellow
    $args = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "`"$PSCommandPath`"")
    if ($TailscaleAuthKey) { $args += "-TailscaleAuthKey `"$TailscaleAuthKey`"" }
    if ($LaviraVersion)    { $args += "-LaviraVersion `"$LaviraVersion`"" }
    Start-Process powershell -Verb RunAs -ArgumentList $args
    exit
}

Write-Host @"

  ╔══════════════════════════════════════════════════════════╗
  ║   Lavira Media Engine — Remote Access Bootstrap          ║
  ║   Sets up: Tailscale · Docker · Claude Desktop · SSH     ║
  ╚══════════════════════════════════════════════════════════╝

"@ -ForegroundColor Magenta

# ─── Prompt for auth key if not supplied ─────────────────────────────────────
if (-not $TailscaleAuthKey) {
    Write-Host "  Enter your Tailscale auth key (tskey-auth-...): " -ForegroundColor Yellow -NoNewline
    $TailscaleAuthKey = Read-Host
}
if (-not $TailscaleAuthKey) { Write-Fail "Tailscale auth key is required." }

# ─── Paths & constants ───────────────────────────────────────────────────────
$ScriptDir   = Split-Path -Parent $PSCommandPath
$LaviraDir   = Join-Path $env:USERPROFILE "lavira-media-engine"
$ClaudeConfig= Join-Path $env:APPDATA "Claude\claude_desktop_config.json"
$TailscaleCLI= "C:\Program Files\Tailscale\tailscale.exe"

# ─── Helper: download a file with progress ───────────────────────────────────
function Download-File {
    param([string]$Url, [string]$Dest)
    Write-Warn "Downloading $([IO.Path]::GetFileName($Dest))..."
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $wc = New-Object Net.WebClient
    $wc.DownloadFile($Url, $Dest)
    Write-OK "Downloaded → $Dest"
}

# ─── Helper: run a command and check exit code ───────────────────────────────
function Run {
    param([string]$Exe, [string[]]$Args, [string]$Desc = "")
    if ($Desc) { Write-Warn $Desc }
    $p = Start-Process $Exe -ArgumentList $Args -Wait -PassThru -NoNewWindow
    if ($p.ExitCode -ne 0) { Write-Fail "$Exe exited with code $($p.ExitCode)" }
}

# ─── 1. WINGET — ensure it's available ───────────────────────────────────────
Write-Step "Checking winget availability"
$winget = Get-Command winget -ErrorAction SilentlyContinue
if (-not $winget) {
    Write-Warn "winget not found — installing App Installer from Microsoft Store..."
    # Fallback: direct MSIX download for older Win10 builds
    $msixUrl  = "https://aka.ms/getwinget"
    $msixDest = "$env:TEMP\AppInstaller.msixbundle"
    Download-File $msixUrl $msixDest
    Add-AppxPackage -Path $msixDest
    $env:PATH += ";$env:LOCALAPPDATA\Microsoft\WindowsApps"
}
Write-OK "winget is available"

# ─── 2. TAILSCALE — install ───────────────────────────────────────────────────
Write-Step "Installing Tailscale"
if (Test-Path $TailscaleCLI) {
    Write-OK "Tailscale already installed at $TailscaleCLI"
} else {
    try {
        winget install --id Tailscale.Tailscale --silent --accept-package-agreements --accept-source-agreements
        Write-OK "Tailscale installed via winget"
    } catch {
        Write-Warn "winget install failed — falling back to direct MSI"
        $tsUrl  = "https://pkgs.tailscale.com/stable/tailscale-setup-latest.exe"
        $tsDest = "$env:TEMP\tailscale-setup.exe"
        Download-File $tsUrl $tsDest
        Run $tsDest @("/install", "/quiet", "/norestart") "Installing Tailscale MSI..."
    }
}

# Give the service a moment to register
Start-Sleep -Seconds 3

# ─── 3. TAILSCALE — authenticate + advertise tag:lavira + enable SSH ──────────
Write-Step "Authenticating Tailscale as tag:lavira (with SSH enabled)"

# Resolve the CLI path after install
if (-not (Test-Path $TailscaleCLI)) {
    $TailscaleCLI = (Get-Command tailscale -ErrorAction SilentlyContinue)?.Source
    if (-not $TailscaleCLI) { Write-Fail "Cannot locate tailscale.exe after install" }
}

# tailscale up with:
#   --authkey          : pre-auth with your key
#   --advertise-tags   : brands this node as tag:lavira
#   --ssh              : enables Tailscale's built-in SSH server (no OpenSSH config needed)
#   --hostname         : friendly name visible in admin console
$hostname = $env:COMPUTERNAME.ToLower() -replace '[^a-z0-9-]', '-'
$tsArgs = @(
    "up",
    "--authkey=$TailscaleAuthKey",
    "--advertise-tags=tag:lavira",
    "--ssh",
    "--hostname=lavira-win-$hostname",
    "--accept-routes",
    "--accept-dns"
)
Run $TailscaleCLI $tsArgs "Running: tailscale up --advertise-tags=tag:lavira --ssh ..."
Write-OK "Tailscale connected. Node tagged as tag:lavira, SSH enabled."

# Print the assigned Tailscale IP for reference
Start-Sleep -Seconds 3
try {
    $tsStatus = & $TailscaleCLI ip --4 2>$null
    Write-OK "Tailscale IP: $tsStatus"
} catch {
    Write-Warn "Could not retrieve Tailscale IP yet — check tailscale.com/admin"
}

# ─── 4. OPENSSH SERVER — fallback access (Windows optional feature) ───────────
Write-Step "Installing OpenSSH Server (fallback)"
$sshFeature = Get-WindowsCapability -Online -Name "OpenSSH.Server*" -ErrorAction SilentlyContinue
if ($sshFeature -and $sshFeature.State -eq "Installed") {
    Write-OK "OpenSSH Server already installed"
} else {
    try {
        Add-WindowsCapability -Online -Name "OpenSSH.Server~~~~0.0.1.0"
        Write-OK "OpenSSH Server installed"
    } catch {
        Write-Warn "Could not install OpenSSH via capability — trying DISM..."
        dism /Online /Add-Capability /CapabilityName:OpenSSH.Server~~~~0.0.1.0
    }
}

# Enable and start sshd
Set-Service -Name sshd -StartupType Automatic -ErrorAction SilentlyContinue
Start-Service -Name sshd -ErrorAction SilentlyContinue

# Set default shell for SSH to PowerShell
$psPath = (Get-Command pwsh -ErrorAction SilentlyContinue)?.Source
if (-not $psPath) { $psPath = (Get-Command powershell)?.Source }
New-ItemProperty -Path "HKLM:\SOFTWARE\OpenSSH" -Name DefaultShell `
    -Value $psPath -PropertyType String -Force | Out-Null

# Firewall rule for OpenSSH
$existingRule = Get-NetFirewallRule -Name "OpenSSH-Server-In-TCP" -ErrorAction SilentlyContinue
if (-not $existingRule) {
    New-NetFirewallRule -Name "OpenSSH-Server-In-TCP" -DisplayName "OpenSSH Server (TCP-In)" `
        -Direction Inbound -Action Allow -Protocol TCP -LocalPort 22 | Out-Null
}
Write-OK "OpenSSH Server running on port 22 (PowerShell as default shell)"

# ─── 5. DOCKER DESKTOP ───────────────────────────────────────────────────────
Write-Step "Installing Docker Desktop"
$dockerExe = "C:\Program Files\Docker\Docker\Docker Desktop.exe"
if (Test-Path $dockerExe) {
    Write-OK "Docker Desktop already installed"
} else {
    try {
        winget install --id Docker.DockerDesktop --silent --accept-package-agreements --accept-source-agreements
        Write-OK "Docker Desktop installed via winget"
    } catch {
        Write-Warn "winget failed — downloading Docker Desktop installer..."
        $ddUrl  = "https://desktop.docker.com/win/main/amd64/Docker%20Desktop%20Installer.exe"
        $ddDest = "$env:TEMP\DockerDesktopInstaller.exe"
        Download-File $ddUrl $ddDest
        Run $ddDest @("install", "--quiet", "--accept-license", "--backend=wsl-2") "Installing Docker Desktop..."
    }
}

# ─── 6. ENABLE WSL 2 (required by Docker) ────────────────────────────────────
Write-Step "Enabling WSL 2"
$wslFeature = Get-WindowsOptionalFeature -Online -FeatureName Microsoft-Windows-Subsystem-Linux -ErrorAction SilentlyContinue
if ($wslFeature?.State -ne "Enabled") {
    try {
        dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart
        dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart
        Write-Warn "WSL features enabled — a REBOOT is required before Docker works."
        Write-Warn "After reboot, run: wsl --set-default-version 2"
    } catch {
        Write-Warn "WSL feature enable failed — Docker may need Hyper-V mode instead."
    }
} else {
    Write-OK "WSL 2 already enabled"
}

# ─── 7. CLAUDE DESKTOP ───────────────────────────────────────────────────────
Write-Step "Installing Claude Desktop"
$claudeExe = Join-Path $env:LOCALAPPDATA "Programs\claude-desktop\claude.exe"
if (Test-Path $claudeExe) {
    Write-OK "Claude Desktop already installed"
} else {
    try {
        winget install --id Anthropic.Claude --silent --accept-package-agreements --accept-source-agreements
        Write-OK "Claude Desktop installed via winget"
    } catch {
        Write-Warn "Claude Desktop not in winget — download manually from:"
        Write-Warn "  https://claude.ai/download"
        Write-Warn "  (Skipping — you can install it after SSH access is established)"
    }
}

# ─── 8. CONFIGURE CLAUDE DESKTOP MCP — point at lavira-media-engine ──────────
Write-Step "Writing Claude Desktop MCP config"
$claudeConfigDir = Split-Path $ClaudeConfig
if (-not (Test-Path $claudeConfigDir)) {
    New-Item -ItemType Directory -Path $claudeConfigDir -Force | Out-Null
}

$mcpConfig = @{
    mcpServers = @{
        "lavira-media-engine" = @{
            url = "http://localhost:4006/sse"
        }
    }
} | ConvertTo-Json -Depth 5

# Merge if existing config found
if (Test-Path $ClaudeConfig) {
    try {
        $existing = Get-Content $ClaudeConfig -Raw | ConvertFrom-Json
        if (-not $existing.mcpServers) { $existing | Add-Member -NotePropertyName mcpServers -NotePropertyValue @{} }
        $existing.mcpServers."lavira-media-engine" = @{ url = "http://localhost:4006/sse" }
        $mcpConfig = $existing | ConvertTo-Json -Depth 5
        Write-Warn "Merged into existing claude_desktop_config.json"
    } catch {
        Write-Warn "Existing config unreadable — overwriting."
    }
}
Set-Content -Path $ClaudeConfig -Value $mcpConfig -Encoding UTF8
Write-OK "Claude Desktop MCP config written → $ClaudeConfig"

# ─── 9. DOWNLOAD LAVIRA MEDIA ENGINE ─────────────────────────────────────────
Write-Step "Setting up lavira-media-engine"
if (Test-Path (Join-Path $LaviraDir "docker-compose.yml")) {
    Write-OK "lavira-media-engine already present at $LaviraDir"
} else {
    New-Item -ItemType Directory -Path $LaviraDir -Force | Out-Null

    if ($LaviraVersion -eq "latest") {
        $releaseUrl = "https://github.com/jaguar999paw-droid/lavira-media-engine/releases/latest/download/lavira-media-engine-windows-setup.zip"
    } else {
        $releaseUrl = "https://github.com/jaguar999paw-droid/lavira-media-engine/releases/download/$LaviraVersion/lavira-media-engine-windows-setup.zip"
    }

    $zipDest = "$env:TEMP\lavira-setup.zip"
    try {
        Download-File $releaseUrl $zipDest
        Expand-Archive -Path $zipDest -DestinationPath $LaviraDir -Force
        Write-OK "Extracted to $LaviraDir"
    } catch {
        Write-Warn "GitHub release download failed — using bundled files from script directory"
        # Fallback: copy files bundled alongside this script in the ZIP
        $bundledFiles = @("docker-compose.yml", ".env.example", "start.bat", "SETUP.md", "Dockerfile")
        foreach ($f in $bundledFiles) {
            $src = Join-Path $ScriptDir $f
            if (Test-Path $src) { Copy-Item $src $LaviraDir -Force }
        }
    }
}

# Create .env from template if absent
$envFile = Join-Path $LaviraDir ".env"
$envExample = Join-Path $LaviraDir ".env.example"
if (-not (Test-Path $envFile) -and (Test-Path $envExample)) {
    Copy-Item $envExample $envFile
    Write-OK ".env created from template → $envFile"
    Write-Warn "Remember to add your ANTHROPIC_API_KEY to $envFile"
}

# ─── 10. CREATE DOCKER VOLUME ─────────────────────────────────────────────────
Write-Step "Pre-creating Docker volume"
try {
    $dockerCmd = Get-Command docker -ErrorAction SilentlyContinue
    if ($dockerCmd) {
        docker volume create lavira-db 2>$null | Out-Null
        Write-OK "Docker volume 'lavira-db' ready"
    } else {
        Write-Warn "docker not in PATH yet (Docker Desktop may need a restart) — volume will be created on first run"
    }
} catch {
    Write-Warn "Could not create Docker volume now — will be created when engine first starts"
}

# ─── 11. FIREWALL — allow lavira ports ────────────────────────────────────────
Write-Step "Configuring firewall rules for Lavira"
$ports = @(
    @{ Port=4005; Name="Lavira-Engine-4005" ; Desc="Lavira Media Engine Web UI"  },
    @{ Port=4006; Name="Lavira-MCP-4006"    ; Desc="Lavira MCP SSE Server"       }
)
foreach ($p in $ports) {
    $existing = Get-NetFirewallRule -Name $p.Name -ErrorAction SilentlyContinue
    if (-not $existing) {
        New-NetFirewallRule -Name $p.Name -DisplayName $p.Desc `
            -Direction Inbound -Action Allow -Protocol TCP -LocalPort $p.Port | Out-Null
        Write-OK "Firewall rule added: $($p.Desc) (:$($p.Port))"
    } else {
        Write-OK "Firewall rule already exists: $($p.Name)"
    }
}

# ─── 12. CREATE A STARTUP SHORTCUT for start.bat ─────────────────────────────
Write-Step "Creating startup shortcut"
$startupDir = [Environment]::GetFolderPath("CommonStartup")
$shortcutPath = Join-Path $startupDir "Lavira Media Engine.lnk"
if (-not (Test-Path $shortcutPath)) {
    $wsh  = New-Object -ComObject WScript.Shell
    $link = $wsh.CreateShortcut($shortcutPath)
    $link.TargetPath       = Join-Path $LaviraDir "start.bat"
    $link.WorkingDirectory = $LaviraDir
    $link.WindowStyle      = 1
    $link.Description      = "Start Lavira Media Engine"
    $link.Save()
    Write-OK "Startup shortcut created → $shortcutPath"
} else {
    Write-OK "Startup shortcut already exists"
}

# ─── SUMMARY ─────────────────────────────────────────────────────────────────
$tsIP = try { & $TailscaleCLI ip --4 2>$null } catch { "<check tailscale admin>" }

Write-Host @"

  ╔══════════════════════════════════════════════════════════════╗
  ║   Setup complete!                                            ║
  ╠══════════════════════════════════════════════════════════════╣
  ║                                                              ║
  ║  Tailscale IP   : $($tsIP.PadRight(39))║
  ║  Tailscale node : lavira-win-$($hostname.PadRight(31))║
  ║  Tag            : tag:lavira                                 ║
  ║                                                              ║
  ║  SSH from dizaster:                                          ║
  ║    ssh $($env:USERNAME)@lavira-win-$hostname
  ║    (Tailscale SSH — no password, key-based via tailnet)      ║
  ║                                                              ║
  ║  Lavira engine dir : $LaviraDir
  ║  .env to fill in   : $envFile
  ║                                                              ║
  ║  NEXT STEPS:                                                 ║
  ║  1. Add ANTHROPIC_API_KEY to .env (edit remotely via SSH)    ║
  ║  2. SSH in and run: cd ~/lavira-media-engine && .\start.bat  ║
  ║  3. Claude Desktop will auto-connect on next launch          ║
  ║                                                              ║
  ║  ⚠  If WSL 2 was just enabled → REBOOT REQUIRED first       ║
  ╚══════════════════════════════════════════════════════════════╝

"@ -ForegroundColor Green

Write-Host "  Press any key to close..." -ForegroundColor DarkGray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
