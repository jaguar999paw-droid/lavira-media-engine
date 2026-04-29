@echo off
:: Lavira Media Engine — One-Click Installer
:: Double-click this file. That's it.
title Lavira Media Engine — Installer
color 0B

echo.
echo  ============================================================
echo   Lavira Media Engine — Installing...
echo   Please wait, this window will guide you.
echo  ============================================================
echo.
echo  Starting installer (you may see a UAC prompt — click Yes)...
echo.

:: Launch the PowerShell installer — it self-elevates
:: -ScriptDir tells the PS1 where to find keys.env (same folder as this bat)
powershell.exe -NoProfile -ExecutionPolicy Bypass ^
  -File "%~dp0setup-remote-access.ps1" -Silent -ScriptDir "%~dp0"

exit /b 0
