$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot\..
Write-Host 'Starting Babol Toyor; settings load from .env (process environment has priority)...'
node .\server.js
