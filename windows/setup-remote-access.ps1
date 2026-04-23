#Requires -Version 5.1
<#
.SYNOPSIS
    Lavira Media Engine — Remote Access Bootstrap
    Sets up Tailscale (tag:lavira + SSH), Docker Desktop, Claude Desktop,
    OpenSSH (fallback), and the lavira-media-engine stack on a fresh Windows machine.

.DESCRIPTION
    Run once on the remote Windows PC. After completion you can SSH in from
    dizaster via Tailscale SSH — no password, no key exchange needed.

        ssh <WINDOWS_USERNAME>@lavira-win-<HOSTNAME>

.PARAMETER TailscaleAuthKey
    Reusable pre-auth key scoped to tag:lavira.
    Generate one at: https://login.tailscale.com/admin/settings/keys
    If omitted the script prompts interactively.

.PARAMETER LaviraVersion
    GitHub release tag to pull, e.g. "v1.2.1". Defaults to "latest".

.PARAMETER SkipDocker
    Skip Docker Desktop + WSL2 install (useful on machines that already have it).

.PARAMETER DryRun
    Print every action without executing anything.

.EXAMPLE
    # Attended run — script prompts for auth key
    .\setup-remote-access.ps1

.EXAMPLE
    # Unattended with pre-supplied key
    .\setup-remote-access.ps1 -TailscaleAuthKey "tskey-auth-YOURKEY"

.EXAMPLE
    # Preview every step without changing anything
    .\setup-remote-access.ps1 -DryRun
#>

[CmdletBinding()]
param(
    [string]$TailscaleAuthKey = "",
    [string]$LaviraVersion    = "latest",
    [switch]$SkipDocker,
    [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$ProgressPreference    = "SilentlyContinue"

# ── dizaster authorized public key (installed into authorized_keys so dizaster
#    can SSH in without a password the moment Tailscale is up) ─────────────────
$DIZASTER_PUBKEY = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAICRGd2AcKdoVwzfwBx/HwVRgqY6KtuNxzzFyQk7xU8Qx kamau@dizaster"

# ── Colour helpers ────────────────────────────────────────────────────────────
function Write-Step { param($msg) Write-Host "`n[>>] $msg" -ForegroundColor Cyan   }
function Write-OK   { param($msg) Write-Host "    [OK] $msg" -ForegroundColor Green  }
function Write-Warn { param($msg) Write-Host "    [!!] $msg" -ForegroundColor Yellow }
function Write-Fail { param($msg) Write-Host "    [XX] $msg" -ForegroundColor Red; exit 1 }
function Write-Dry  { param($msg) Write-Host "    [DRY] $msg" -ForegroundColor DarkCyan }

function Invoke-Safe {
    param([scriptblock]$Block, [string]$Label)
    if ($DryRun) { Write-Dry $Label; return }
    try { & $Block } catch { Write-Warn "Non-fatal: $_" }
}

# ── Privilege check + auto-elevate ────────────────────────────────────────────
$me = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $me.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "Re-launching as Administrator..." -ForegroundColor Yellow
    $args = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "`"$PSCommandPath`"")
    if ($TailscaleAuthKey) { $args += "-TailscaleAuthKey `"$TailscaleAuthKey`"" }
    if ($LaviraVersion)    { $args += "-LaviraVersion `"$LaviraVersion`"" }
    if ($SkipDocker)       { $args += "-SkipDocker" }
    if ($DryRun)           { $args += "-DryRun" }
    Start-Process powershell -Verb RunAs -ArgumentList $args
    exit
}

Write-Host ""
Write-Host "  Lavira Media Engine — Remote Access Bootstrap" -ForegroundColor Magenta
if ($DryRun) { Write-Host "  *** DRY-RUN MODE — no changes will be made ***" -ForegroundColor DarkCyan }
Write-Host "  Sets up: Tailscale + Docker Desktop + Claude Desktop + SSH" -ForegroundColor Magenta
Write-Host ""

# ── Auth key ─────────────────────────────────────────────────────────────────
if (-not $TailscaleAuthKey) {
    Write-Host "  Generate a reusable tagged key at:" -ForegroundColor Yellow
    Write-Host "  https://login.tailscale.com/admin/settings/keys" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  Enter your Tailscale auth key (tskey-auth-...): " -ForegroundColor Yellow -NoNewline
    $TailscaleAuthKey = Read-Host
}
if (-not $TailscaleAuthKey -and -not $DryRun) { Write-Fail "Tailscale auth key is required." }

# ── Paths ─────────────────────────────────────────────────────────────────────
$ScriptDir    = Split-Path -Parent $PSCommandPath
$LaviraDir    = Join-Path $env:USERPROFILE "lavira-media-engine"
$ClaudeConfig = Join-Path $env:APPDATA "Claude\claude_desktop_config.json"
$TailscaleCLI = "C:\Program Files\Tailscale\tailscale.exe"
$hostname     = $env:COMPUTERNAME.ToLower() -replace '[^a-z0-9-]', '-'

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
    if ($DryRun) { Write-Dry "$Exe $($ExeArgs -join ' ')"; return }
    $p = Start-Process $Exe -ArgumentList $ExeArgs -Wait -PassThru -NoNewWindow
    if ($p.ExitCode -ne 0) { Write-Fail "$Exe exited with code $($p.ExitCode)" }
}

# ============================================================
# 1. WINGET — install if missing (bare Windows 10 guard)
# ============================================================
Write-Step "Checking winget"
$wingetPath = $null
$candidates = @(
    (Get-Command winget -ErrorAction SilentlyContinue)?.Source,
    "$env:LOCALAPPDATA\Microsoft\WindowsApps\winget.exe"
)
foreach ($c in $candidates) {
    if ($c -and (Test-Path $c)) { $wingetPath = $c; break }
}

if (-not $wingetPath) {
    Write-Warn "winget not found — installing App Installer from Microsoft Store..."
    Invoke-Safe -Label "Download + install App Installer (winget)" -Block {
        $msixUrl  = "https://aka.ms/getwinget"
        $msixDest = "$env:TEMP\AppInstaller.msixbundle"
        Download-File $msixUrl $msixDest
        Add-AppxPackage -Path $msixDest -ErrorAction Stop
        $env:PATH += ";$env:LOCALAPPDATA\Microsoft\WindowsApps"
    }
    # Re-check after install
    $wingetPath = (Get-Command winget -ErrorAction SilentlyContinue)?.Source
    if (-not $wingetPath -and -not $DryRun) {
        Write-Fail "winget still not available. Install manually from https://aka.ms/getwinget then re-run."
    }
}
Write-OK "winget available: $wingetPath"

function Install-WingetApp {
    param([string]$AppID, [string]$AppName, [string]$VerifyPath = "")
    Write-Step "Installing $AppName"
    if ($VerifyPath -and (Test-Path $VerifyPath)) {
        Write-OK "$AppName already installed — skipping"
        return
    }
    Invoke-Safe -Label "winget install $AppID" -Block {
        $result = winget install --id $AppID --silent --accept-package-agreements --accept-source-agreements --scope machine 2>&1
        # Exit code -1978335189 = already installed (APPINSTALLER_ERROR_NO_APPLICABLE_INSTALLER)
        if ($LASTEXITCODE -ne 0 -and $LASTEXITCODE -ne -1978335189) {
            Write-Warn "winget exit $LASTEXITCODE — verify $AppName installed correctly"
        }
    }
    Start-Sleep -Seconds 3
    Write-OK "$AppName install attempted"
}

# ============================================================
# 2. TAILSCALE — install
# ============================================================
Install-WingetApp -AppID "Tailscale.Tailscale" -AppName "Tailscale" -VerifyPath $TailscaleCLI

# Fallback: direct installer if winget didn't place the exe
if (-not (Test-Path $TailscaleCLI) -and -not $DryRun) {
    Write-Warn "Falling back to direct Tailscale installer download..."
    $tsUrl  = "https://pkgs.tailscale.com/stable/tailscale-setup-latest.exe"
    $tsDest = "$env:TEMP\tailscale-setup.exe"
    Download-File $tsUrl $tsDest
    Invoke-Checked $tsDest @("/install", "/quiet", "/norestart") "Running Tailscale installer..."
    Start-Sleep -Seconds 5
}

# Wait up to 30 s for exe
$waited = 0
while (-not (Test-Path $TailscaleCLI) -and $waited -lt 30 -and -not $DryRun) {
    Start-Sleep -Seconds 2; $waited += 2
}
if (-not (Test-Path $TailscaleCLI) -and -not $DryRun) {
    Write-Fail "tailscale.exe not found at $TailscaleCLI — installation may have failed."
}

# ============================================================
# 3. TAILSCALE — authenticate as tag:lavira with Tailscale SSH
# ============================================================
Write-Step "Connecting to Lavira tailnet (tag:lavira, SSH enabled)"
Invoke-Checked $TailscaleCLI @(
    "up",
    "--authkey=$TailscaleAuthKey",
    "--advertise-tags=tag:lavira",
    "--ssh",
    "--hostname=lavira-win-$hostname",
    "--accept-routes",
    "--accept-dns",
    "--unattended"
) "Running: tailscale up --advertise-tags=tag:lavira --ssh ..."
Write-OK "Tailscale connected. Node: lavira-win-$hostname | Tag: tag:lavira | SSH: enabled"

Start-Sleep -Seconds 3
$tsIP = try { (& $TailscaleCLI ip --4 2>$null).Trim() } catch { "<pending>" }
Write-OK "Tailscale IP: $tsIP"

# ============================================================
# 4. OPENSSH SERVER — install, harden, start
# ============================================================
Write-Step "Installing OpenSSH Server (standard SSH fallback on port 22)"
Invoke-Safe -Label "Add-WindowsCapability OpenSSH.Server" -Block {
    $cap = Get-WindowsCapability -Online -Name "OpenSSH.Server*" -ErrorAction SilentlyContinue
    if ($cap -and $cap.State -eq "Installed") {
        Write-OK "OpenSSH Server already installed"
    } else {
        try {
            Add-WindowsCapability -Online -Name "OpenSSH.Server~~~~0.0.1.0" | Out-Null
            Write-OK "OpenSSH Server installed"
        } catch {
            Write-Warn "Capability install failed — trying DISM..."
            dism /Online /Add-Capability /CapabilityName:OpenSSH.Server~~~~0.0.1.0
        }
    }
}

Invoke-Safe -Label "Start + auto-start sshd" -Block {
    Set-Service -Name sshd -StartupType Automatic -ErrorAction SilentlyContinue
    Start-Service -Name sshd -ErrorAction SilentlyContinue
    Write-OK "sshd running (Automatic)"
}

# Set default shell to PowerShell 7 if present, else Windows PowerShell
Invoke-Safe -Label "Set SSH default shell" -Block {
    $pwsh7 = "C:\Program Files\PowerShell\7\pwsh.exe"
    $shell  = if (Test-Path $pwsh7) { $pwsh7 } else { (Get-Command powershell).Source }
    New-ItemProperty -Path "HKLM:\SOFTWARE\OpenSSH" -Name DefaultShell `
        -Value $shell -PropertyType String -Force | Out-Null
    Write-OK "SSH default shell: $shell"
}

# Harden sshd_config
$sshdConfig = "$env:ProgramData\ssh\sshd_config"
Invoke-Safe -Label "Harden sshd_config" -Block {
    if (Test-Path $sshdConfig) {
        (Get-Content $sshdConfig) `
            -replace '#?PubkeyAuthentication .*', 'PubkeyAuthentication yes' `
            -replace '#?PermitRootLogin .*',      'PermitRootLogin no' |
            Set-Content $sshdConfig
        Write-OK "sshd_config: PubkeyAuthentication yes, PermitRootLogin no"
    }
}

Invoke-Safe -Label "Restart sshd" -Block { Restart-Service sshd -ErrorAction SilentlyContinue }

# Firewall rule for sshd
Invoke-Safe -Label "Firewall rule port 22" -Block {
    if (-not (Get-NetFirewallRule -Name "OpenSSH-Server-In-TCP" -ErrorAction SilentlyContinue)) {
        New-NetFirewallRule -Name "OpenSSH-Server-In-TCP" `
            -DisplayName "OpenSSH Server (TCP-In)" `
            -Direction Inbound -Action Allow -Protocol TCP -LocalPort 22 | Out-Null
    }
    Write-OK "Firewall: port 22 open"
}

# ============================================================
# 5. INSTALL DIZASTER AUTHORIZED KEY
#    Allows kamau@dizaster to SSH in immediately, password-free
# ============================================================
Write-Step "Installing dizaster SSH public key (kamau@dizaster)"
Invoke-Safe -Label "Write authorized_keys" -Block {
    $sshDir  = "$env:USERPROFILE\.ssh"
    $authFile = "$sshDir\authorized_keys"
    New-Item -ItemType Directory -Path $sshDir -Force | Out-Null

    # Check if key already present
    $existing = if (Test-Path $authFile) { Get-Content $authFile } else { @() }
    if ($existing -contains $DIZASTER_PUBKEY) {
        Write-OK "dizaster public key already in authorized_keys"
    } else {
        Add-Content -Path $authFile -Value $DIZASTER_PUBKEY
        # Restrict permissions (OpenSSH on Windows requires this)
        icacls $authFile /inheritance:r /grant "${env:USERNAME}:(F)" /grant "SYSTEM:(F)" 2>$null | Out-Null
        Write-OK "dizaster key installed → $authFile"
    }
}

# ============================================================
# 6. DOCKER DESKTOP + WSL2
# ============================================================
if (-not $SkipDocker) {
    Install-WingetApp -AppID "Docker.DockerDesktop" -AppName "Docker Desktop" `
        -VerifyPath "C:\Program Files\Docker\Docker\Docker Desktop.exe"

    Write-Step "Enabling WSL 2 (required for Docker)"
    Invoke-Safe -Label "Enable WSL + VirtualMachinePlatform" -Block {
        $wsl = Get-WindowsOptionalFeature -Online -FeatureName Microsoft-Windows-Subsystem-Linux -ErrorAction SilentlyContinue
        if ($wsl -and $wsl.State -eq "Enabled") {
            Write-OK "WSL already enabled"
        } else {
            dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart | Out-Null
            dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart | Out-Null
            Write-Warn "WSL features enabled — REBOOT REQUIRED before Docker will work"
            Write-Warn "After reboot, run: wsl --set-default-version 2"
        }
    }
} else {
    Write-Step "Skipping Docker Desktop (--SkipDocker)"
}

# ============================================================
# 7. CLAUDE DESKTOP
# ============================================================
Install-WingetApp -AppID "Anthropic.Claude" -AppName "Claude Desktop"

# ============================================================
# 8. CLAUDE DESKTOP MCP CONFIG
#    Registers TWO servers:
#      a) Local engine on this Windows machine  (localhost:4006)
#      b) dizaster remote engine via Tailscale  (100.118.209.46:4006)
# ============================================================
Write-Step "Writing Claude Desktop MCP config"
Invoke-Safe -Label "Write claude_desktop_config.json" -Block {
    $claudeConfigDir = Split-Path $ClaudeConfig
    New-Item -ItemType Directory -Path $claudeConfigDir -Force | Out-Null

    $localEntry  = [PSCustomObject]@{ url = "http://localhost:4006/sse" }
    $remoteEntry = [PSCustomObject]@{
        url         = "http://100.118.209.46:4006/sse"
        description = "Lavira engine on dizaster (Tailscale)"
    }

    $servers = [PSCustomObject]@{
        "lavira-local"   = $localEntry
        "lavira-dizaster" = $remoteEntry
    }

    if (Test-Path $ClaudeConfig) {
        try {
            $cfg = Get-Content $ClaudeConfig -Raw | ConvertFrom-Json
            if (-not $cfg.mcpServers) {
                $cfg | Add-Member -NotePropertyName mcpServers -NotePropertyValue ([PSCustomObject]@{}) -Force
            }
            $cfg.mcpServers | Add-Member -NotePropertyName "lavira-local"    -NotePropertyValue $localEntry  -Force
            $cfg.mcpServers | Add-Member -NotePropertyName "lavira-dizaster"  -NotePropertyValue $remoteEntry -Force
            $cfg | ConvertTo-Json -Depth 6 | Set-Content $ClaudeConfig -Encoding UTF8
            Write-OK "Merged into existing claude_desktop_config.json"
        } catch {
            Write-Warn "Could not parse existing config — overwriting"
            [PSCustomObject]@{ mcpServers = $servers } | ConvertTo-Json -Depth 6 |
                Set-Content $ClaudeConfig -Encoding UTF8
        }
    } else {
        [PSCustomObject]@{ mcpServers = $servers } | ConvertTo-Json -Depth 6 |
            Set-Content $ClaudeConfig -Encoding UTF8
    }
    Write-OK "MCP config written: $ClaudeConfig (local + dizaster entries)"
}

# ============================================================
# 9. LAVIRA MEDIA ENGINE FILES
# ============================================================
Write-Step "Setting up lavira-media-engine files"
Invoke-Safe -Label "Fetch + extract release ZIP" -Block {
    if (Test-Path (Join-Path $LaviraDir "docker-compose.yml")) {
        Write-OK "lavira-media-engine already present at $LaviraDir"
    } else {
        New-Item -ItemType Directory -Path $LaviraDir -Force | Out-Null
        $releaseUrl = if ($LaviraVersion -eq "latest") {
            "https://github.com/jaguar999paw-droid/lavira-media-engine/releases/latest/download/lavira-media-engine-windows-setup.zip"
        } else {
            "https://github.com/jaguar999paw-droid/lavira-media-engine/releases/download/$LaviraVersion/lavira-media-engine-windows-setup.zip"
        }
        $zipDest = "$env:TEMP\lavira-setup.zip"
        try {
            Download-File $releaseUrl $zipDest
            Expand-Archive -Path $zipDest -DestinationPath $LaviraDir -Force
            Write-OK "Extracted to $LaviraDir"
        } catch {
            Write-Warn "GitHub download failed — copying bundled files from script directory"
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
        Write-OK ".env created from template — add ANTHROPIC_API_KEY before starting"
    }
}

# ============================================================
# 10. DOCKER VOLUME
# ============================================================
Write-Step "Pre-creating Docker volume (lavira-db)"
Invoke-Safe -Label "docker volume create lavira-db" -Block {
    if (Get-Command docker -ErrorAction SilentlyContinue) {
        docker volume create lavira-db 2>$null | Out-Null
        Write-OK "Docker volume 'lavira-db' ready"
    } else {
        Write-Warn "docker not in PATH yet — start.bat will create the volume on first run"
    }
}

# ============================================================
# 11. FIREWALL RULES (Lavira ports)
# ============================================================
Write-Step "Configuring Windows Firewall for Lavira ports"
Invoke-Safe -Label "Firewall rules 4005 + 4006" -Block {
    foreach ($rule in @(
        @{ Port=4005; Name="Lavira-Engine-4005"; Desc="Lavira Media Engine Web UI" },
        @{ Port=4006; Name="Lavira-MCP-4006";    Desc="Lavira MCP SSE Server"      }
    )) {
        if (-not (Get-NetFirewallRule -Name $rule.Name -ErrorAction SilentlyContinue)) {
            New-NetFirewallRule -Name $rule.Name -DisplayName $rule.Desc `
                -Direction Inbound -Action Allow -Protocol TCP -LocalPort $rule.Port | Out-Null
        }
        Write-OK "Firewall: port $($rule.Port) open ($($rule.Desc))"
    }
}

# ============================================================
# 12. AUTO-START SHORTCUT
# ============================================================
Write-Step "Creating auto-start shortcut"
Invoke-Safe -Label "CommonStartup shortcut" -Block {
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
}

# ============================================================
# SUMMARY
# ============================================================
$finalIP = try { (& $TailscaleCLI ip --4 2>$null).Trim() } catch { "<check tailscale.com/admin>" }
$envFile  = Join-Path $LaviraDir ".env"

Write-Host ""
Write-Host "  ============================================================" -ForegroundColor Green
Write-Host "   SETUP COMPLETE" -ForegroundColor Green
if ($DryRun) { Write-Host "   (DRY-RUN — no actual changes were made)" -ForegroundColor DarkCyan }
Write-Host "  ============================================================" -ForegroundColor Green
Write-Host ""
Write-Host "   Tailscale IP    : $finalIP" -ForegroundColor Cyan
Write-Host "   Node hostname   : lavira-win-$hostname" -ForegroundColor Cyan
Write-Host "   Tag             : tag:lavira" -ForegroundColor Cyan
Write-Host "   dizaster key    : installed in authorized_keys" -ForegroundColor Cyan
Write-Host ""
Write-Host "   SSH from dizaster (Tailscale SSH, no password):" -ForegroundColor White
Write-Host "     ssh $env:USERNAME@lavira-win-$hostname" -ForegroundColor Yellow
Write-Host ""
Write-Host "   Claude Desktop MCP servers configured:" -ForegroundColor White
Write-Host "     lavira-local    → http://localhost:4006/sse" -ForegroundColor Gray
Write-Host "     lavira-dizaster → http://100.118.209.46:4006/sse" -ForegroundColor Gray
Write-Host ""
Write-Host "   Lavira files    : $LaviraDir" -ForegroundColor White
Write-Host "   .env to edit    : $envFile" -ForegroundColor White
Write-Host ""
Write-Host "   NEXT STEPS:" -ForegroundColor White
Write-Host "   1. SSH in from dizaster and add ANTHROPIC_API_KEY to .env" -ForegroundColor Gray
Write-Host "   2. cd ~/lavira-media-engine && .\start.bat" -ForegroundColor Gray
Write-Host "   3. Claude Desktop auto-connects on next launch (2 engines)" -ForegroundColor Gray
Write-Host ""
Write-Host "   NOTE: If WSL 2 was just enabled -> REBOOT REQUIRED" -ForegroundColor Red
Write-Host "         After reboot run: wsl --set-default-version 2" -ForegroundColor Red
Write-Host ""
Write-Host "  ============================================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Press any key to close..." -ForegroundColor DarkGray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
