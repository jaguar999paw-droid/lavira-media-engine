@echo off
setlocal EnableDelayedExpansion
title Lavira Media Engine — Startup
color 0A

echo.
echo  ============================================================
echo   Lavira Media Engine — Windows Startup
echo   AI-powered safari content engine by Lavira Safaris
echo  ============================================================
echo.

:: ── Check Docker Desktop ─────────────────────────────────────────────────────
where docker >nul 2>&1
if %errorlevel% neq 0 (
    color 0C
    echo  [ERROR] Docker Desktop is not installed or not in PATH.
    echo.
    echo  Please install Docker Desktop for Windows first:
    echo  https://www.docker.com/products/docker-desktop/
    echo.
    echo  After installing, restart your PC and run this script again.
    echo.
    pause
    exit /b 1
)

:: ── Check Docker is running ───────────────────────────────────────────────────
docker info >nul 2>&1
if %errorlevel% neq 0 (
    color 0E
    echo  [STARTING] Docker Desktop is installed but not running.
    echo  Attempting to start Docker Desktop...
    echo.
    start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe" 2>nul
    start "" "%LOCALAPPDATA%\Programs\Docker\Docker\Docker Desktop.exe" 2>nul
    echo  Waiting 30 seconds for Docker to start...
    timeout /t 30 /nobreak >nul
    docker info >nul 2>&1
    if !errorlevel! neq 0 (
        color 0C
        echo  [ERROR] Docker Desktop did not start in time.
        echo  Please open Docker Desktop manually, wait for it to finish
        echo  loading (whale icon in system tray turns solid), then run
        echo  this script again.
        echo.
        pause
        exit /b 1
    )
)

echo  [OK] Docker Desktop is running.
echo.

:: ── Move to the project directory (parent of this script) ────────────────────
cd /d "%~dp0.."

:: ── Create persistent DB volume if it doesn't exist ──────────────────────────
docker volume inspect lavira-db >nul 2>&1
if %errorlevel% neq 0 (
    echo  [SETUP] Creating database volume...
    docker volume create lavira-db
)

:: ── Create .env from example if not present ───────────────────────────────────
if not exist ".env" (
    echo  [SETUP] No .env file found. Creating from template...
    copy ".env.example" ".env" >nul
    echo.
    color 0E
    echo  ============================================================
    echo   ACTION REQUIRED — Add your API keys to .env
    echo  ============================================================
    echo.
    echo  A .env file has been created in this folder.
    echo  Open it with Notepad and fill in at least:
    echo.
    echo    ANTHROPIC_API_KEY=sk-ant-...   (required for AI captions)
    echo    PEXELS_API_KEY=...             (optional, for stock photos)
    echo.
    echo  Get your Anthropic key at:
    echo    https://console.anthropic.com/settings/keys
    echo.
    echo  Save the file, then run start.bat again.
    echo.
    color 0A
    notepad ".env"
    echo.
    echo  Press any key once you have saved your .env file...
    pause >nul
)

:: ── Pull latest images ────────────────────────────────────────────────────────
echo  [PULLING] Fetching latest Docker images (first run may take a few minutes)...
docker compose pull --quiet
echo  [OK] Images ready.
echo.

:: ── Stop any old containers cleanly ──────────────────────────────────────────
echo  [RESTARTING] Stopping previous containers...
docker compose down --remove-orphans >nul 2>&1

:: ── Start the stack ──────────────────────────────────────────────────────────
echo  [STARTING] Launching Lavira Media Engine...
docker compose up -d

if %errorlevel% neq 0 (
    color 0C
    echo.
    echo  [ERROR] docker compose up failed. Check the output above.
    echo  Common fixes:
    echo    - Port 4005 or 4006 is used by another app: close it and retry
    echo    - .env file is missing a required key
    echo.
    pause
    exit /b 1
)

:: ── Wait for health check ─────────────────────────────────────────────────────
echo.
echo  [WAITING] Engine starting up...
set /a tries=0
:HEALTHLOOP
set /a tries+=1
if %tries% gtr 30 goto TIMEOUT
curl -sf http://localhost:4005/api/health >nul 2>&1
if %errorlevel% equ 0 goto HEALTHY
timeout /t 2 /nobreak >nul
set /a dots=tries %% 3
if !dots! equ 0 (set "BAR=...") else if !dots! equ 1 (set "BAR=..") else (set "BAR=.")
echo   Waiting!BAR!
goto HEALTHLOOP

:TIMEOUT
echo.
echo  [WARN] Engine is taking longer than expected to start.
echo  It may still be loading. Check http://localhost:4005 in a moment.
goto OPEN

:HEALTHY
echo.
echo  ============================================================
echo   Lavira Media Engine is RUNNING
echo.
echo   Web Studio  : http://localhost:4005
echo   MCP Server  : http://localhost:4006/sse
echo.
echo   Opening your browser now...
echo  ============================================================
echo.

:OPEN
timeout /t 2 /nobreak >nul
start "" "http://localhost:4005"

echo.
echo  To stop the engine:  docker compose down
echo  To view logs:        docker compose logs -f
echo  To restart:          run start.bat again
echo.
echo  Press any key to close this window (engine keeps running).
pause >nul
endlocal
