'use strict';
// Generates the ONE file a Windows Server admin needs: BabolToyor-Setup.cmd.
// It embeds Install-BabolToyor.ps1 as base64 so the .cmd stays pure ASCII
// (no execution-policy, codepage or Mark-of-the-Web problems) and so a single
// downloaded file is enough to install the whole system.
//
// Usage: node windows-installer/build-single-file.js
// (Developer tool only; the server just runs the generated .cmd.)

const fs = require('node:fs');
const path = require('node:path');

const DIR = __dirname;
const SOURCE = path.join(DIR, 'Install-BabolToyor.ps1');
const TARGET = path.join(DIR, 'BabolToyor-Setup.cmd');
const RELEASE_VERSION = fs.readFileSync(path.join(DIR, '..', 'RELEASE_VERSION.txt'), 'utf8').trim();

const sourceBytes = fs.readFileSync(SOURCE);
if (!sourceBytes.slice(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))) {
  throw new Error('Install-BabolToyor.ps1 must be UTF-8 with BOM (Windows PowerShell 5.1).');
}
const encoded = sourceBytes.toString('base64');
const CHUNK = 1000; // keep every cmd line far below the 8191-char limit
const chunks = [];
for (let i = 0; i < encoded.length; i += CHUNK) chunks.push(encoded.slice(i, i + CHUNK));
const payload = chunks.map((c) => `echo(${c}`).join('\n');

const template = `@echo off
setlocal EnableExtensions DisableDelayedExpansion
title Babol Toyor ${RELEASE_VERSION} Setup - Windows Server 2025
chcp 65001 >nul 2>&1

rem ===== 1. Require administrator (port 80, firewall and scheduled task) =====
net session >nul 2>&1
if %errorlevel%==0 goto elevated
echo.
echo Requesting administrator privileges - please accept the UAC prompt ...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -ArgumentList '%*' -Verb RunAs" >nul 2>&1
if errorlevel 1 (
  echo.
  echo ERROR: could not elevate. Right-click this file and choose "Run as administrator".
  pause
  exit /b 1
)
exit /b 0

:elevated
set "BT_INSTALLER_DIR=%~dp0"
set "SETUPTMP=%TEMP%\\BabolToyorSetup_%RANDOM%%RANDOM%"
mkdir "%SETUPTMP%" >nul 2>&1
set "B64=%SETUPTMP%\\payload.b64"
set "PS1=%SETUPTMP%\\Install-BabolToyor.ps1"

rem ===== 2. Rebuild the embedded PowerShell installer =====
> "%B64%" (
__PAYLOAD__
)

powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $b=[Convert]::FromBase64String((Get-Content -LiteralPath '%B64%' -Raw)); [IO.File]::WriteAllBytes('%PS1%', $b)"
if errorlevel 1 goto fail

rem ===== 3. Run it (install is the default action) =====
powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" %*
set "RC=%ERRORLEVEL%"
rmdir /s /q "%SETUPTMP%" >nul 2>&1
echo.
echo ==================================================================
echo   Babol Toyor setup finished (exit code %RC%)
echo   Log: C:\\BabolToyor\\logs\\install.log
echo   Commands: BabolToyor-Setup.cmd status / logs / restart / uninstall
echo ==================================================================
echo.
pause
exit /b %RC%

:fail
echo.
echo ERROR: could not prepare the embedded installer payload.
echo Make sure Windows PowerShell 5.1 and .NET Framework are available.
pause
exit /b 1
`;

const cmd = template.replace('__PAYLOAD__', payload).replace(/\n/g, '\r\n');
fs.writeFileSync(TARGET, Buffer.from(cmd, 'ascii'));
console.log(`Wrote ${TARGET}`);
console.log(`  payload: ${sourceBytes.length} bytes -> ${chunks.length} base64 lines`);
console.log(`  cmd:     ${fs.statSync(TARGET).size} bytes`);
