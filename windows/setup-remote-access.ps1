#Requires -Version 5.1
<#
.SYNOPSIS
    Lavira Media Engine — Remote Access Bootstrap
    Sets up Tailscale (tag:lavira + SSH), Docker Desktop, Claude Desktop,
    OpenSSH (fallback), and the lavira-media-engine stack on a fresh Windows machine.

.DESCRIPTION
    Run once on the remote Windows PC. After completion you can SSH in from
    your dizaster/admin node via:
        ssh <WINDOWS_USERNAME>@lavira-win-<HOSTNAME>   (Tailscale SSH)

.PARAMETER TailscaleAuthKey
    Pre-auth key (tag:lavira). Baked in — just run the script.

.PARAMETER LaviraVersion
    GitHub release tag to pull, e.g. "v1.2.0". Defaults to "latest".

.EXAMPLE
    .\setup-remote-access.ps1
#>

[CmdletBinding()]
param(
    [string]$TailscaleAuthKey = "tskey-auth-kBRtGUq2J111CNTRL-b2aUfgxS6hEJtCwzaUtXgEVauUrSPQYpC",
    [string]$LaviraVersion    = "latest"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# --- Colour helpers
function Write-Step { param($msg) Write-Host "`n[>>] $msg" -ForegroundColor Cyan  }
function Write-OK   { param($msg) Write-Host "    [OK] $msg" -ForegroundColor Green  }
function Write-Warn { param($msg) Write-Host "    [!!] $msg" -ForegroundColor Yellow }
function Write-Fail { param($msg) Write-Host "    [XX] $msg" -ForegroundColor Red; exit 1 }

# --- Must run as Administrator
$me = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $me.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "Re-launching as Administrator..." -ForegroundColor Yellow
    $relaunchArgs = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "`"$PSCommandPath`"")
    if ($TailscaleAuthKey) { $relaunchArgs += "-TailscaleAuthKey `"$TailscaleAuthKey`"" }
    if ($LaviraVersion)    { $relaunchArgs += "-LaviraVersion `"$LaviraVersion`"" }
    Start-Process powershell -Verb RunAs -ArgumentList $relaunchArgs
    exit
}

Write-Host ""
Write-Host "  Lavira Media Engine - Remote Access Bootstrap" -ForegroundColor Magenta
Write-Host "  Sets up: Tailscale + Docker Desktop + Claude Desktop + SSH" -ForegroundColor Magenta
Write-Host ""

if (-not $TailscaleAuthKey) {
    Write-Host "  Enter your Tailscale auth key (tskey-auth-...): " -ForegroundColor Yellow -NoNewline
    $TailscaleAuthKey = Read-Host
}
if (-not $TailscaleAuthKey) { Write-Fail "Tailscale auth key is required." }

# --- Paths & constants
$ScriptDir    = Split-Path -Parent $PSCommandPath
$LaviraDir    = Join-Path $env:USERPROFILE "lavira-media-engine"
$ClaudeConfig = Join-Path $env:APPDATA "Claude\claude_desktop_config.json"
$TailscaleCLI = "C:\Program Files\Tailscale\tailscale.exe"

function Download-File {
    param([string]$Url, [string]$Dest)
    Write-Warn "Downloading $([IO.Path]::GetFileName($Dest))..."
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $wc = New-Object Net.WebClient
    $wc.DownloadFile($Url, $Dest)
    Write-OK "Downloaded to $Dest"
}

function Invoke-Checked {
    param([string]$Exe, [string[]]$ExeArgs, [string]$Desc = "")
    if ($Desc) { Write-Warn $Desc }
    $p = Start-Process $Exe -ArgumentList $ExeArgs -Wait -PassThru -NoNewWindow
    if ($p.ExitCode -ne 0) { Write-Fail "$Exe exited with code $($p.ExitCode)" }
}

# ============================================================
# 1. WINGET
# ============================================================
Write-Step "Checking winget"
$wingetCmd = Get-Command winget -ErrorAction SilentlyContinue
if (-not $wingetCmd) {
    Write-Warn "winget not found - installing App Installer..."
    $msixUrl  = "https://aka.ms/getwinget"
    $msixDest = "$env:TEMP\AppInstaller.msixbundle"
    Download-File $msixUrl $msixDest
    Add-AppxPackage -Path $msixDest
    $env:PATH += ";$env:LOCALAPPDATA\Microsoft\WindowsApps"
}
Write-OK "winget available"

# ============================================================
# 2. TAILSCALE — install
# ============================================================
Write-Step "Installing Tailscale"
if (Test-Path $TailscaleCLI) {
    Write-OK "Tailscale already installed"
} else {
    try {
        winget install --id Tailscale.Tailscale --silent --accept-package-agreements --accept-source-agreements
        Write-OK "Tailscale installed via winget"
    } catch {
        Write-Warn "winget failed - falling back to direct installer"
        $tsUrl  = "https://pkgs.tailscale.com/stable/tailscale-setup-latest.exe"
        $tsDest = "$env:TEMP\tailscale-setup.exe"
        Download-File $tsUrl $tsDest
        Invoke-Checked $tsDest @("/install", "/quiet", "/norestart") "Installing Tailscale..."
    }
}
Start-Sleep -Seconds 3

# ============================================================
# 3. TAILSCALE — auth as tag:lavira with SSH enabled
# ============================================================
Write-Step "Authenticating Tailscale as tag:lavira (Tailscale SSH enabled)"

if (-not (Test-Path $TailscaleCLI)) {
    $found = Get-Command tailscale -ErrorAction SilentlyContinue
    if ($found) { $TailscaleCLI = $found.Source } else { Write-Fail "Cannot locate tailscale.exe" }
}

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
Invoke-Checked $TailscaleCLI $tsArgs "Running: tailscale up --advertise-tags=tag:lavira --ssh ..."
Write-OK "Tailscale connected. Node tagged as tag:lavira, SSH enabled."

Start-Sleep -Seconds 3
try {
    $tsIP = & $TailscaleCLI ip --4 2>$null
    Write-OK "Tailscale IP: $tsIP"
} catch {
    Write-Warn "Could not retrieve Tailscale IP yet - check tailscale.com/admin"
}

# ============================================================
# 4. OPENSSH SERVER — fallback access
# ============================================================
Write-Step "Installing OpenSSH Server (fallback)"
$sshFeature = Get-WindowsCapability -Online -Name "OpenSSH.Server*" -ErrorAction SilentlyContinue
if ($sshFeature -and $sshFeature.State -eq "Installed") {
    Write-OK "OpenSSH Server already installed"
} else {
    try {
        Add-WindowsCapability -Online -Name "OpenSSH.Server~~~~0.0.1.0"
        Write-OK "OpenSSH Server installed"
    } catch {
        Write-Warn "Capability install failed - trying DISM..."
        dism /Online /Add-Capability /CapabilityName:OpenSSH.Server~~~~0.0.1.0
    }
}

Set-Service -Name sshd -StartupType Automatic -ErrorAction SilentlyContinue
Start-Service -Name sshd -ErrorAction SilentlyContinue

$psExe = (Get-Command pwsh -ErrorAction SilentlyContinue)?.Source
if (-not $psExe) { $psExe = (Get-Command powershell -ErrorAction SilentlyContinue)?.Source }
if ($psExe) {
    New-ItemProperty -Path "HKLM:\SOFTWARE\OpenSSH" -Name DefaultShell `
        -Value $psExe -PropertyType String -Force | Out-Null
}

if (-not (Get-NetFirewallRule -Name "OpenSSH-Server-In-TCP" -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -Name "OpenSSH-Server-In-TCP" `
        -DisplayName "OpenSSH Server (TCP-In)" `
        -Direction Inbound -Action Allow -Protocol TCP -LocalPort 22 | Out-Null
}
Write-OK "OpenSSH Server running on port 22 (PowerShell default shell)"

# ============================================================
# 5. DOCKER DESKTOP
# ============================================================
Write-Step "Installing Docker Desktop"
$dockerExe = "C:\Program Files\Docker\Docker\Docker Desktop.exe"
if (Test-Path $dockerExe) {
    Write-OK "Docker Desktop already installed"
} else {
    try {
        winget install --id Docker.DockerDesktop --silent --accept-package-agreements --accept-source-agreements
        Write-OK "Docker Desktop installed via winget"
    } catch {
        Write-Warn "winget failed - downloading Docker Desktop directly..."
        $ddUrl  = "https://desktop.docker.com/win/main/amd64/Docker%20Desktop%20Installer.exe"
        $ddDest = "$env:TEMP\DockerDesktopInstaller.exe"
        Download-File $ddUrl $ddDest
        Invoke-Checked $ddDest @("install", "--quiet", "--accept-license", "--backend=wsl-2")
    }
}

# ============================================================
# 6. WSL 2
# ============================================================
Write-Step "Enabling WSL 2 (required for Docker)"
$wslFeature = Get-WindowsOptionalFeature -Online -FeatureName Microsoft-Windows-Subsystem-Linux -ErrorAction SilentlyContinue
if ($wslFeature -and $wslFeature.State -eq "Enabled") {
    Write-OK "WSL 2 already enabled"
} else {
    try {
        dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart
        dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart
        Write-Warn "WSL features enabled - REBOOT REQUIRED before Docker will work"
        Write-Warn "After reboot run: wsl --set-default-version 2"
    } catch {
        Write-Warn "WSL feature enable failed - Docker may fall back to Hyper-V"
    }
}

# ============================================================
# 7. CLAUDE DESKTOP
# ============================================================
Write-Step "Installing Claude Desktop"
$claudeExe = Join-Path $env:LOCALAPPDATA "Programs\claude-desktop\claude.exe"
if (Test-Path $claudeExe) {
    Write-OK "Claude Desktop already installed"
} else {
    try {
        winget install --id Anthropic.Claude --silent --accept-package-agreements --accept-source-agreements
        Write-OK "Claude Desktop installed via winget"
    } catch {
        Write-Warn "Claude Desktop not in winget - download from: https://claude.ai/download"
        Write-Warn "Install it, then re-run this script or manually edit:"
        Write-Warn "  %APPDATA%\Claude\claude_desktop_config.json"
    }
}

# ============================================================
# 8. CLAUDE DESKTOP MCP CONFIG
# ============================================================
Write-Step "Writing Claude Desktop MCP config (lavira-media-engine)"
$claudeConfigDir = Split-Path $ClaudeConfig
if (-not (Test-Path $claudeConfigDir)) {
    New-Item -ItemType Directory -Path $claudeConfigDir -Force | Out-Null
}

$newEntry = @{ url = "http://localhost:4006/sse" }
if (Test-Path $ClaudeConfig) {
    try {
        $existing = Get-Content $ClaudeConfig -Raw | ConvertFrom-Json
        if (-not $existing.mcpServers) {
            $existing | Add-Member -NotePropertyName mcpServers -NotePropertyValue ([PSCustomObject]@{})
        }
        $existing.mcpServers | Add-Member -NotePropertyName "lavira-media-engine" `
            -NotePropertyValue $newEntry -Force
        $existing | ConvertTo-Json -Depth 5 | Set-Content $ClaudeConfig -Encoding UTF8
        Write-Warn "Merged lavira-media-engine into existing claude_desktop_config.json"
    } catch {
        Write-Warn "Could not parse existing config - overwriting"
        @{ mcpServers = @{ "lavira-media-engine" = $newEntry } } `
            | ConvertTo-Json -Depth 5 | Set-Content $ClaudeConfig -Encoding UTF8
    }
} else {
    @{ mcpServers = @{ "lavira-media-engine" = $newEntry } } `
        | ConvertTo-Json -Depth 5 | Set-Content $ClaudeConfig -Encoding UTF8
}
Write-OK "MCP config written: $ClaudeConfig"

# ============================================================
# 9. LAVIRA MEDIA ENGINE FILES
# ============================================================
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
        Write-OK "Extracted release to $LaviraDir"
    } catch {
        Write-Warn "GitHub release download failed - using bundled files alongside script"
        foreach ($f in @("docker-compose.yml", ".env.example", "start.bat", "SETUP.md", "Dockerfile")) {
            $src = Join-Path $ScriptDir $f
            if (Test-Path $src) { Copy-Item $src $LaviraDir -Force }
        }
    }
}

$envFile    = Join-Path $LaviraDir ".env"
$envExample = Join-Path $LaviraDir ".env.example"
if (-not (Test-Path $envFile) -and (Test-Path $envExample)) {
    Copy-Item $envExample $envFile
    Write-OK ".env created from template - add ANTHROPIC_API_KEY before starting"
}

# ============================================================
# 10. DOCKER VOLUME
# ============================================================
Write-Step "Pre-creating Docker volume (lavira-db)"
$dockerBin = Get-Command docker -ErrorAction SilentlyContinue
if ($dockerBin) {
    try {
        docker volume create lavira-db 2>$null | Out-Null
        Write-OK "Docker volume 'lavira-db' ready"
    } catch {
        Write-Warn "Volume creation failed now - start.bat will handle it"
    }
} else {
    Write-Warn "docker not in PATH yet (Docker Desktop needs restart) - volume deferred"
}

# ============================================================
# 11. FIREWALL RULES
# ============================================================
Write-Step "Configuring Windows Firewall for Lavira ports"
foreach ($rule in @(
    @{ Port=4005; Name="Lavira-Engine-4005"; Desc="Lavira Media Engine Web UI" },
    @{ Port=4006; Name="Lavira-MCP-4006";    Desc="Lavira MCP SSE Server"      }
)) {
    if (-not (Get-NetFirewallRule -Name $rule.Name -ErrorAction SilentlyContinue)) {
        New-NetFirewallRule -Name $rule.Name -DisplayName $rule.Desc `
            -Direction Inbound -Action Allow -Protocol TCP -LocalPort $rule.Port | Out-Null
        Write-OK "Firewall: opened port $($rule.Port) ($($rule.Desc))"
    } else {
        Write-OK "Firewall: port $($rule.Port) already open"
    }
}

# ============================================================
# 12. STARTUP SHORTCUT
# ============================================================
Write-Step "Creating auto-start shortcut for Lavira engine"
$startupDir   = [Environment]::GetFolderPath("CommonStartup")
$shortcutPath = Join-Path $startupDir "Lavira Media Engine.lnk"
if (-not (Test-Path $shortcutPath)) {
    $wsh  = New-Object -ComObject WScript.Shell
    $link = $wsh.CreateShortcut($shortcutPath)
    $link.TargetPath       = Join-Path $LaviraDir "start.bat"
    $link.WorkingDirectory = $LaviraDir
    $link.WindowStyle      = 1
    $link.Description      = "Start Lavira Media Engine"
    $link.Save()
    Write-OK "Startup shortcut: $shortcutPath"
} else {
    Write-OK "Startup shortcut already exists"
}

# ============================================================
# SUMMARY
# ============================================================
$finalIP = try { (& $TailscaleCLI ip --4 2>$null).Trim() } catch { "<check tailscale.com/admin>" }

Write-Host ""
Write-Host "  ============================================================" -ForegroundColor Green
Write-Host "   SETUP COMPLETE" -ForegroundColor Green
Write-Host "  ============================================================" -ForegroundColor Green
Write-Host ""
Write-Host "   Tailscale IP   : $finalIP" -ForegroundColor Cyan
Write-Host "   Node hostname  : lavira-win-$hostname" -ForegroundColor Cyan
Write-Host "   Tag            : tag:lavira" -ForegroundColor Cyan
Write-Host ""
Write-Host "   SSH from dizaster (Tailscale SSH, no password):" -ForegroundColor White
Write-Host "     ssh $env:USERNAME@lavira-win-$hostname" -ForegroundColor Yellow
Write-Host ""
Write-Host "   Lavira files   : $LaviraDir" -ForegroundColor White
Write-Host "   .env to edit   : $envFile" -ForegroundColor White
Write-Host ""
Write-Host "   NEXT STEPS:" -ForegroundColor White
Write-Host "   1. SSH in and add ANTHROPIC_API_KEY to .env" -ForegroundColor Gray
Write-Host "   2. cd ~/lavira-media-engine && .\start.bat" -ForegroundColor Gray
Write-Host "   3. Claude Desktop auto-connects on next launch" -ForegroundColor Gray
Write-Host ""
Write-Host "   NOTE: If WSL 2 was just enabled -> REBOOT REQUIRED" -ForegroundColor Red
Write-Host "         After reboot run: wsl --set-default-version 2" -ForegroundColor Red
Write-Host ""
Write-Host "  ============================================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Press any key to close..." -ForegroundColor DarkGray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
