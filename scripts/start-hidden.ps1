$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot\..
Start-Process node -ArgumentList '.\server.js' -WindowStyle Hidden
Write-Host 'Application started in background.'
