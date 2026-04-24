@echo off
setlocal EnableDelayedExpansion
title Lavira Safaris — Setup
color 0A
mode con: cols=70 lines=40

echo.
echo  ================================================================
echo.
echo        LAVIRA SAFARIS  —  Content Engine Setup
echo.
echo        Setting up your computer. This takes about 5 minutes.
echo        Please keep this window open.
echo.
echo  ================================================================
echo.

:: ── Self-elevate to Administrator (preserves %~f0 full path) ─────────────────
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo  Requesting administrator permission...
    powershell -WindowStyle Hidden -Command "Start-Process cmd -ArgumentList '/c \"%~f0\"' -Verb RunAs"
    exit /b
)

echo  [1/4] Preparing installer...
echo.

:: ── Locate setup-remote-access.ps1 (or download it if missing) ───────────────
:: This handles the common case where the user runs the BAT directly from
:: inside a ZIP/RAR archive — Windows only extracts the BAT to a temp folder,
:: leaving the PS1 behind. We download it transparently from GitHub.
set "PS1=%~dp0setup-remote-access.ps1"

if not exist "%PS1%" (
    echo  Script not found locally — downloading from GitHub...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "$wc=[System.Net.WebClient]::new();[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12;$wc.DownloadFile('https://raw.githubusercontent.com/jaguar999paw-droid/lavira-media-engine/main/windows/setup-remote-access.ps1','%PS1%')"
    echo.
)

if not exist "%PS1%" (
    color 0C
    echo.
    echo  ================================================================
    echo   ERROR: Could not find or download the setup script.
    echo.
    echo   Option 1 (recommended):
    echo     Extract the ZIP file first, then double-click Install-Lavira.bat
    echo     from the extracted folder.
    echo.
    echo   Option 2:
    echo     Check your internet connection and try again.
    echo.
    echo   Contact: info@lavirasafaris.com
    echo  ================================================================
    echo.
    pause
    exit /b 1
)

:: ── Run the PowerShell setup script ──────────────────────────────────────────
:: -ScriptDir tells the PS1 where to look for keys.env (same folder as this BAT)
powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Normal -File "%PS1%" -Silent -ScriptDir "%~dp0"

if %errorlevel% neq 0 (
    color 0C
    echo.
    echo  ================================================================
    echo   Something went wrong during setup.
    echo   Please take a photo of this screen and send it to:
    echo   info@lavirasafaris.com
    echo  ================================================================
    echo.
    pause
    exit /b 1
)

:: ── Launch the engine ─────────────────────────────────────────────────────────
echo.
echo  [4/4] Starting Lavira engine...
echo.

set "START=%~dp0start.bat"
if not exist "%START%" set "START=%USERPROFILE%\lavira-media-engine\start.bat"
if exist "%START%" call "%START%"

endlocal
