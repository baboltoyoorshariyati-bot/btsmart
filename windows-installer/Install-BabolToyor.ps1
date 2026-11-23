#requires -Version 5.1
<#
  Babol Toyor - Windows Server 2025 one-click installer (readable source).
  The single file users run is BabolToyor-Setup.cmd, which embeds this script.
  Do not run this .ps1 directly; run the .cmd with: install | status | logs | restart | uninstall | help
#>
[CmdletBinding()]
param(
  [Parameter(Position = 0)]
  [ValidateSet('install','uninstall','status','logs','restart','help')]
  [string]$Action = 'install',

  [string]$InstallDir = 'C:\BabolToyor',
  [int]$Port = 80,
  [string]$SourcePath = '',
  [string]$AppZipUrl = 'https://drive.google.com/uc?export=download&id=1D-oVWpj3ty3g0dGWPeY3n2_UTtWkrcKw',
  [string]$NodeMsiUrl = '',
  [string]$InstallerDir = '',
  [ValidateSet('SYSTEM','LOCAL SERVICE')]
  [string]$ServiceAccount = 'SYSTEM',
  [switch]$NoAutoStopIis,
  [switch]$AllowStopIis,
  [switch]$PrepareHttpsFirewall,
  [switch]$SkipNodeInstall,
  [switch]$PurgeData
)

$ErrorActionPreference = 'Stop'
$ProgressPreference   = 'SilentlyContinue'
try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch {}
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch {}
$OutputEncoding = [Text.Encoding]::UTF8
try { chcp 65001 | Out-Null } catch {}

if (-not $InstallerDir) { $InstallerDir = $env:BT_INSTALLER_DIR }
if (-not $InstallerDir) { $InstallerDir = $PSScriptRoot }
$InstallerDir = $InstallerDir.TrimEnd('\')

$TaskName     = 'Babol Toyor - Application Server'
$FwRuleName   = "Babol Toyor - HTTP (TCP $Port)"
$ShortcutName = 'Babol Toyor.url'
$DataDir      = Join-Path $InstallDir 'data'
$LogDir       = Join-Path $InstallDir 'logs'
$SvcDir       = Join-Path $InstallDir 'service'
$EnvPath      = Join-Path $InstallDir '.env'
$InfoPath     = Join-Path $InstallDir 'INSTALL-INFO.txt'
$Supervisor   = Join-Path $SvcDir 'supervisor.ps1'
$InstallLog   = Join-Path $LogDir 'install.log'
$OutLog       = Join-Path $LogDir 'server.out.log'
$ErrLog       = Join-Path $LogDir 'server.err.log'
$SupLog       = Join-Path $LogDir 'supervisor.log'
$Utf8Bom      = [System.Text.UTF8Encoding]::new($true)
$Utf8NoBom    = [System.Text.UTF8Encoding]::new($false)
$script:AdminPassword = $null

# ----------------------------------------------------------------- helpers
function Write-Log {
  param([string]$Message, [string]$Level = 'INFO')
  $line = ('{0} [{1}] {2}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Level, $Message)
  try {
    if (-not (Test-Path -LiteralPath $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null }
    Add-Content -LiteralPath $InstallLog -Value $line -Encoding UTF8 -ErrorAction SilentlyContinue
  } catch {}
  switch ($Level) {
    'ERROR' { Write-Host $line -ForegroundColor Red }
    'WARN'  { Write-Host $line -ForegroundColor Yellow }
    'OK'    { Write-Host $line -ForegroundColor Green }
    default { Write-Host $line }
  }
}
function Step([string]$m) { Write-Log ('==> ' + $m) }
function Ok([string]$m)   { Write-Log $m 'OK' }
function Warn([string]$m) { Write-Log $m 'WARN' }
function Fail([string]$m) { Write-Log $m 'ERROR'; throw $m }

function Test-Admin {
  try {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    $p  = New-Object Security.Principal.WindowsPrincipal -ArgumentList $id
    return $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
  } catch { return $false }
}

function Get-AppUrl {
  if ($Port -eq 80) { return 'http://localhost/' }
  return "http://localhost:$Port/"
}

function Protect-File([string]$Path) {
  try {
    $acl = Get-Acl -LiteralPath $Path
    $acl.SetAccessRuleProtection($true, $true)
    foreach ($r in @($acl.Access)) {
      $id = $r.IdentityReference.Value
      if ($id -match '^(Everyone|BUILTIN\\Users|NT AUTHORITY\\Authenticated Users)$') {
        [void]$acl.RemoveAccessRuleSpecific($r)
      }
    }
    foreach ($id in @('NT AUTHORITY\SYSTEM','BUILTIN\Administrators')) {
      $rule = New-Object System.Security.AccessControl.FileSystemAccessRule -ArgumentList @($id, 'FullControl', 'Allow')
      $acl.AddAccessRule($rule)
    }
    Set-Acl -LiteralPath $Path -AclObject $acl
  } catch { Warn ("ACL not restricted for " + $Path + ": " + $_.Exception.Message) }
}

function Grant-System([string]$Path) {
  try {
    $acl = Get-Acl -LiteralPath $Path
    $flags = [System.Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit'
    $prop  = [System.Security.AccessControl.PropagationFlags]'None'
    $type  = [System.Security.AccessControl.AccessControlType]'Allow'
    $rights= [System.Security.AccessControl.FileSystemRights]'FullControl'
    $rule  = New-Object System.Security.AccessControl.FileSystemAccessRule -ArgumentList @('NT AUTHORITY\SYSTEM', $rights, $flags, $prop, $type)
    $acl.AddAccessRule($rule)
    Set-Acl -LiteralPath $Path -AclObject $acl
  } catch { Warn ("Could not grant SYSTEM access: " + $_.Exception.Message) }
}

# Explicit opt-in preserves the identity of existing deployments by default.
function Grant-ServiceAccess {
  if ($ServiceAccount -ne 'LOCAL SERVICE') { return }
  $sid = New-Object System.Security.Principal.SecurityIdentifier('S-1-5-19')
  foreach ($entry in @(@($InstallDir,'ReadAndExecute'), @($DataDir,'Modify'), @($LogDir,'Modify'))) {
    $acl = Get-Acl -LiteralPath $entry[0]
    $rule = New-Object System.Security.AccessControl.FileSystemAccessRule -ArgumentList @($sid, $entry[1], 'ContainerInherit,ObjectInherit', 'None', 'Allow')
    $acl.AddAccessRule($rule)
    Set-Acl -LiteralPath $entry[0] -AclObject $acl
  }
  # An existing protected TLS directory needs explicit DACL-management rights.
  $tlsDirectory = Join-Path $DataDir 'tls'
  if (Test-Path -LiteralPath $tlsDirectory) {
    $acl = Get-Acl -LiteralPath $tlsDirectory
    $rule = New-Object System.Security.AccessControl.FileSystemAccessRule -ArgumentList @($sid, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
    $acl.AddAccessRule($rule)
    Set-Acl -LiteralPath $tlsDirectory -AclObject $acl
  }
  # .env is protected from inheritance, so grant this file explicitly, read only.
  $acl = Get-Acl -LiteralPath $EnvPath
  $rule = New-Object System.Security.AccessControl.FileSystemAccessRule -ArgumentList @($sid, 'Read', 'Allow')
  $acl.AddAccessRule($rule)
  Set-Acl -LiteralPath $EnvPath -AclObject $acl
}

function Refresh-Path {
  $machine = [Environment]::GetEnvironmentVariable('Path','Machine')
  $user    = [Environment]::GetEnvironmentVariable('Path','User')
  $env:Path = ($machine + ';' + $user)
}

# ------------------------------------------------------------- port helpers
function Get-PortListeners([int]$p) {
  try {
    $c = @(Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction Stop)
    return @($c | ForEach-Object { [int]$_.OwningProcess } | Select-Object -Unique)
  } catch {
    $ids = @()
    foreach ($ln in @(netstat -ano -p tcp 2>$null)) {
      if ($ln -match '^\s*TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+(\d+)\s*$') {
        if ([int]$Matches[1] -eq $p) { $ids += [int]$Matches[2] }
      }
    }
    return @($ids | Select-Object -Unique)
  }
}

function Resolve-Port {
  $owners = @(Get-PortListeners $Port)
  if ($owners.Count -eq 0) { return }
  Warn ("Port $Port is already in use by PID(s): " + ($owners -join ', '))
  if ($owners -contains 4) {
    Warn 'PID 4 = HTTP.sys / IIS.'
    if ($NoAutoStopIis -or -not $AllowStopIis) { Fail "Port $Port is held by IIS. Use another port, stop IIS manually, or explicitly allow changes with -AllowStopIis." }
    $handled = $false
    try {
      Import-Module WebAdministration -ErrorAction Stop
      $sites = @(Get-Website -ErrorAction Stop | Where-Object {
        @($_.Bindings.Collection | Where-Object { $_.bindingInformation -match (':' + $Port + '(:|$)') }).Count -gt 0
      })
      foreach ($s in $sites) {
        Step ("Stopping IIS site '" + $s.Name + "' on port $Port")
        try { Stop-Website -Name $s.Name -ErrorAction Stop } catch {}
        try { Set-ItemProperty -Path ('IIS:\Sites\' + $s.Name) -Name serverAutoStart -Value $false -ErrorAction Stop } catch {}
        $handled = $true
      }
    } catch { Warn ("IIS PowerShell module unavailable: " + $_.Exception.Message) }
    if (-not $handled) {
      try {
        Step 'Stopping W3SVC to free port 80'
        Stop-Service -Name W3SVC -Force -ErrorAction Stop
        Set-Service -Name W3SVC -StartupType Manual -ErrorAction SilentlyContinue
        $handled = $true
        Warn 'W3SVC stopped and set to Manual so it does not take port 80 after reboot.'
      } catch { Warn ("Could not stop W3SVC: " + $_.Exception.Message) }
    }
    Start-Sleep -Seconds 2
  }
  $still = @(Get-PortListeners $Port)
  if ($still.Count -gt 0) {
    $desc = @($still | ForEach-Object {
      $processId = $_
      $pr = Get-Process -Id $processId -ErrorAction SilentlyContinue
      if ($pr) { "$($pr.ProcessName) (PID $processId)" } else { "PID $processId" }
    }) -join ', '
    Fail "Port $Port is still used by: $desc. Free that port and re-run, or re-run with -Port <other>."
  }
  Ok "Port $Port is free."
}

function Test-Tcp([string]$hostName, [int]$p) {
  try {
    $client = [Net.Sockets.TcpClient]::new()
    $iar = $client.BeginConnect($hostName, $p, $null, $null)
    $ok = $iar.AsyncWaitHandle.WaitOne(1500, $false)
    $connected = $ok -and $client.Connected
    $client.Close()
    return $connected
  } catch { return $false }
}

# ------------------------------------------------------------- Node.js
function Get-NodeExe {
  $candidates = New-Object System.Collections.ArrayList
  $cmd = Get-Command node -ErrorAction SilentlyContinue
  if ($cmd -and $cmd.Source) { [void]$candidates.Add($cmd.Source) }
  $paths = @()
  if ($env:ProgramFiles) { $paths += (Join-Path $env:ProgramFiles 'nodejs\node.exe') }
  if (${env:ProgramFiles(x86)}) { $paths += (Join-Path ${env:ProgramFiles(x86)} 'nodejs\node.exe') }
  if ($env:LOCALAPPDATA) { $paths += (Join-Path $env:LOCALAPPDATA 'Programs\nodejs\node.exe') }
  $paths += (Join-Path $InstallDir 'node\node.exe')
  foreach ($p in $paths) { if (Test-Path -LiteralPath $p) { [void]$candidates.Add($p) } }
  foreach ($c in @($candidates | Select-Object -Unique)) {
    try {
      $v = (& $c '--version' 2>$null | Select-Object -First 1)
      if ($v -match '^v(\d+)\.' -and [int]$Matches[1] -ge 22) { return $c }
    } catch {}
  }
  return $null
}

function Install-NodeMsi([string]$MsiPath) {
  Step 'Installing Node.js (silent MSI) ...'
  $p = Start-Process -FilePath 'msiexec.exe' -ArgumentList @('/i', ('"' + $MsiPath + '"'), '/qn', '/norestart') -Wait -PassThru
  if ($p.ExitCode -ne 0 -and $p.ExitCode -ne 3010) { Fail ("msiexec failed with exit code " + $p.ExitCode) }
}

function Install-Node([string]$WorkDir) {
  # 1) portable Node.js zip shipped next to the installer (offline friendly)
  $z = Get-ChildItem -LiteralPath $InstallerDir -Filter 'node-v*-win-x64.zip' -File -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $z) { $z = Get-ChildItem -LiteralPath $InstallerDir -Filter 'node-*-x64.zip' -File -ErrorAction SilentlyContinue | Select-Object -First 1 }
  if ($z) {
    Step ('Extracting bundled portable Node.js: ' + $z.Name)
    $dest = Join-Path $InstallDir 'node'
    if (Test-Path -LiteralPath $dest) { Remove-Item -LiteralPath $dest -Recurse -Force }
    Expand-Archive -LiteralPath $z.FullName -DestinationPath $dest -Force
    $exe = Get-ChildItem -LiteralPath $dest -Filter 'node.exe' -Recurse -File | Select-Object -First 1
    if ($exe) { return $exe.FullName }
  }
  # 2) Node.js MSI shipped next to the installer
  $m = Get-ChildItem -LiteralPath $InstallerDir -Filter 'node-v*-x64.msi' -File -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($m) { Install-NodeMsi $m.FullName; Refresh-Path; return $null }
  # 3) winget
  $winget = Get-Command winget -ErrorAction SilentlyContinue
  if ($winget) {
    Step 'Trying winget (OpenJS.NodeJS.LTS) ...'
    try {
      & $winget.Source install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements --silent --disable-interactivity | Out-Null
      Refresh-Path
    } catch { Warn ("winget failed: " + $_.Exception.Message) }
    $n = Get-NodeExe
    if ($n) { return $n }
  }
  # 4) official nodejs.org MSI with SHA256 verification
  Step 'Downloading Node.js LTS from nodejs.org (SHA256 verified) ...'
  $index = Invoke-RestMethod -Uri 'https://nodejs.org/dist/index.json' -TimeoutSec 30 -UseBasicParsing
  $rel = @($index | Where-Object { $_.lts -and ($_.files -contains 'win-x64-msi') -and ($_.version -match '^v(\d+)\.') -and ([int]$Matches[1] -ge 22) } | Select-Object -First 1)
  if ($rel.Count -eq 0) { Fail 'Could not determine the latest Node.js LTS release.' }
  $ver  = [string]$rel[0].version
  $name = "node-$ver-x64.msi"
  $url  = if ($NodeMsiUrl) { $NodeMsiUrl } else { "https://nodejs.org/dist/$ver/$name" }
  $msi  = Join-Path $WorkDir $name
  Invoke-WebRequest -Uri $url -OutFile $msi -UseBasicParsing -TimeoutSec 600
  $sums = Invoke-RestMethod -Uri "https://nodejs.org/dist/$ver/SHASUMS256.txt" -TimeoutSec 30 -UseBasicParsing
  $expected = $null
  foreach ($ln in @($sums -split "`r?`n")) {
    if ($ln -match ('^([0-9a-fA-F]{64})\s+\*?' + [regex]::Escape($name) + '\s*$')) { $expected = $Matches[1].ToLowerInvariant(); break }
  }
  if (-not $expected) { Fail "SHA256 entry for $name was not found." }
  $actual = (Get-FileHash -LiteralPath $msi -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actual -ne $expected) { Fail "Node.js MSI checksum mismatch ($actual != $expected)." }
  Ok "Node.js $ver checksum verified."
  Install-NodeMsi $msi
  Refresh-Path
  return $null
}

# ------------------------------------------------------------- app source
function Find-AppRoot([string]$Root) {
  if (-not $Root -or -not (Test-Path -LiteralPath $Root)) { return $null }
  $resolved = (Resolve-Path -LiteralPath $Root).Path.TrimEnd('\')
  if ($resolved -ieq $InstallDir.TrimEnd('\')) { return $null }
  if (Test-Path -LiteralPath (Join-Path $resolved 'server.js')) { return $resolved }
  # ZIP archives have exactly one top-level folder; never recurse over a whole drive.
  foreach ($d in @(Get-ChildItem -LiteralPath $resolved -Directory -ErrorAction SilentlyContinue)) {
    $cand = Join-Path $d.FullName 'server.js'
    if (Test-Path -LiteralPath $cand) { return $d.FullName }
  }
  return $null
}

function Resolve-Source([string]$WorkDir) {
  if ($SourcePath) {
    $item = Get-Item -LiteralPath $SourcePath -ErrorAction SilentlyContinue
    if (-not $item) { Fail "SourcePath not found: $SourcePath" }
    if ($item.PSIsContainer) {
      $r = Find-AppRoot $item.FullName
      if ($r) { return $r }
    } else {
      $ex = Join-Path $WorkDir 'app-param'
      Expand-Archive -LiteralPath $item.FullName -DestinationPath $ex -Force
      $r = Find-AppRoot $ex
      if ($r) { return $r }
    }
    Fail "SourcePath does not contain server.js: $SourcePath"
  }
  # 1) source files next to the installer, or directly in its parent (repo checkout)
  $r = Find-AppRoot $InstallerDir
  if (-not $r) {
    $parent = Split-Path -Parent $InstallerDir
    if ($parent -and (Test-Path -LiteralPath (Join-Path $parent 'server.js'))) { $r = $parent }
  }
  if ($r) { Step ('Using local source: ' + $r); return $r }
  # 2) app.zip (or a released BabolToyor zip) next to the installer
  $z = Get-ChildItem -LiteralPath $InstallerDir -Filter 'app.zip' -File -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $z) {
    $z = Get-ChildItem -LiteralPath $InstallerDir -Filter 'BabolToyor-*.zip' -File -ErrorAction SilentlyContinue |
         Where-Object { $_.Name -notlike '*Setup*' -and $_.Name -notlike '*Windows*' } | Select-Object -First 1
  }
  if ($z) {
    Step ('Using bundled application package: ' + $z.Name)
    $ex = Join-Path $WorkDir 'app-bundled'
    Expand-Archive -LiteralPath $z.FullName -DestinationPath $ex -Force
    $r = Find-AppRoot $ex
    if ($r) { return $r }
  }
  # 3) download the matching application release asset from GitHub
  $urls = @($AppZipUrl) | Select-Object -Unique
  foreach ($u in $urls) {
    try {
      Step ('Downloading application package: ' + $u)
      $zip = Join-Path $WorkDir 'app-download.zip'
      if (Test-Path -LiteralPath $zip) { Remove-Item -LiteralPath $zip -Force }
      Invoke-WebRequest -Uri $u -OutFile $zip -UseBasicParsing -TimeoutSec 300
      $ex = Join-Path $WorkDir ('app-download-' + [guid]::NewGuid().ToString('N').Substring(0,6))
      Expand-Archive -LiteralPath $zip -DestinationPath $ex -Force
      $r = Find-AppRoot $ex
      if ($r) { return $r }
    } catch { Warn ("Download failed: " + $_.Exception.Message) }
  }
  Fail 'Application files not found. Put app.zip next to the installer, or check internet access.'
}

function Install-AppFiles([string]$Source) {
  if (-not (Test-Path -LiteralPath $InstallDir)) { New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null }
  $preserve = @('.env','data','logs','service','node','INSTALL-INFO.txt','INITIAL-ADMIN-PASSWORD.txt','BabolToyor-Setup.cmd')
  foreach ($item in @(Get-ChildItem -LiteralPath $InstallDir -Force -ErrorAction SilentlyContinue)) {
    if ($preserve -notcontains $item.Name) {
      try { Remove-Item -LiteralPath $item.FullName -Recurse -Force -ErrorAction Stop }
      catch { Warn ("Could not remove " + $item.Name + ": " + $_.Exception.Message) }
    }
  }
  $exclude = @('.git','node_modules','data','logs','service','.env','node','dist','build','*.log')
  foreach ($item in @(Get-ChildItem -LiteralPath $Source -Force)) {
    if ($exclude -contains $item.Name) { continue }
    if ($item.Name -like '*.log') { continue }
    Copy-Item -LiteralPath $item.FullName -Destination $InstallDir -Recurse -Force
  }
  if (-not (Test-Path -LiteralPath (Join-Path $InstallDir 'server.js'))) { Fail 'server.js was not copied; installation aborted.' }
  Ok ('Application files installed in ' + $InstallDir)
}

# ------------------------------------------------------------- .env
function New-AdminPassword {
  $alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@$*?-_'
  $bytes = New-Object byte[] 20
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
  return ('Aa7!' + (-join @($bytes | ForEach-Object { $alphabet[$_ % $alphabet.Length] })))
}

function Set-AppEnv {
  $values = @{}
  if (Test-Path -LiteralPath $EnvPath) {
    foreach ($ln in @([IO.File]::ReadAllLines($EnvPath))) {
      if ($ln -match '^\s*#') { continue }
      if ($ln -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$' -and -not $values.ContainsKey($Matches[1])) {
        $values[$Matches[1]] = $Matches[2].Trim()
      }
    }
    Warn 'Existing .env found: keeping your settings and database.'
  } else {
    $script:AdminPassword = New-AdminPassword
    $values['ADMIN_INITIAL_PASSWORD'] = $script:AdminPassword
  }
  # These three are enforced on every install so the app always answers on port 80.
  $values['PORT']     = [string]$Port
  $values['HOST']     = '0.0.0.0'
  $values['DATA_DIR'] = $DataDir
  if (-not $values.ContainsKey('SQLITE_FILE')) { $values['SQLITE_FILE'] = Join-Path $DataDir 'baboltoyoor.db' }
  if (-not $values.ContainsKey('APP_ENV'))       { $values['APP_ENV'] = 'production' }
  if (-not $values.ContainsKey('COOKIE_SECURE')) { $values['COOKIE_SECURE'] = 'false' }
  if (-not $values.ContainsKey('TRUST_PROXY'))   { $values['TRUST_PROXY'] = 'false' }

  if ($ServiceAccount -eq 'LOCAL SERVICE' -or $PrepareHttpsFirewall) { $values['TLS_FIREWALL_MANAGED_EXTERNALLY'] = 'true' }

  $order = @('PORT','HOST','DATA_DIR','SQLITE_FILE','ADMIN_INITIAL_PASSWORD','APP_ENV','COOKIE_SECURE','TRUST_PROXY')
  $lines = @('# Babol Toyor - generated by BabolToyor-Setup.cmd. Do not edit by hand.')
  foreach ($k in $order) {
    if ($values.ContainsKey($k)) { $lines += ($k + '=' + $values[$k]); $values.Remove($k) }
  }
  foreach ($k in @($values.Keys | Sort-Object)) { $lines += ($k + '=' + $values[$k]) }
  [IO.File]::WriteAllText($EnvPath, (($lines -join "`r`n") + "`r`n"), $Utf8NoBom)
  Protect-File $EnvPath
  Ok (".env written: PORT=$Port, HOST=0.0.0.0, DATA_DIR=$DataDir")
}

# ------------------------------------------------------------- supervisor
function New-Supervisor([string]$NodeExe) {
  $template = @'
$ErrorActionPreference = 'Continue'
$appDir   = '__APPDIR__'
$nodeExe  = '__NODEEXE__'
$logDir   = '__LOGDIR__'
$outLog   = Join-Path $logDir 'server.out.log'
$errLog   = Join-Path $logDir 'server.err.log'
$supLog   = Join-Path $logDir 'supervisor.log'
$maxBytes = 8MB
$marker   = '--baboltoyor=' + $appDir

function Rotate-Log([string]$path) {
  try {
    if (Test-Path -LiteralPath $path) {
      $f = Get-Item -LiteralPath $path
      if ($f.Length -gt $maxBytes) {
        $old = "$path.1"
        if (Test-Path -LiteralPath $old) { Remove-Item -LiteralPath $old -Force }
        Move-Item -LiteralPath $path -Destination $old -Force
      }
    }
  } catch {}
}

Set-Location -LiteralPath $appDir
while ($true) {
  Rotate-Log $outLog
  Rotate-Log $errLog
  try {
    $argLine = '--disable-warning=ExperimentalWarning server.js "' + $marker + '"'
    $p = Start-Process -FilePath $nodeExe -ArgumentList $argLine -WorkingDirectory $appDir -PassThru -RedirectStandardOutput $outLog -RedirectStandardError $errLog
    $p.WaitForExit()
    $code = $p.ExitCode
    Add-Content -LiteralPath $supLog -Value ("{0} node exited with code {1}; restarting in 5s" -f (Get-Date -Format s), $code) -Encoding UTF8
  } catch {
    Add-Content -LiteralPath $supLog -Value ("{0} supervisor error: {1}" -f (Get-Date -Format s), $_.Exception.Message) -Encoding UTF8
  }
  Start-Sleep -Seconds 5
}
'@
  $content = $template.Replace('__APPDIR__', $InstallDir).Replace('__NODEEXE__', $NodeExe).Replace('__LOGDIR__', $LogDir)
  [IO.File]::WriteAllText($Supervisor, $content, $Utf8Bom)
  Ok 'Supervisor created (auto-restart on crash).'
}

# ------------------------------------------------------------- task / firewall
function Stop-App {
  $t = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  if ($t) {
    try { Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue } catch {}
    Start-Sleep -Seconds 2
  }
  try {
    Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
      Where-Object { $_.CommandLine -and $_.CommandLine -like ('*--baboltoyor=' + $InstallDir + '*') } |
      ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue } catch {} }
  } catch {}
  try {
    Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe'" -ErrorAction SilentlyContinue |
      Where-Object { $_.CommandLine -and $_.CommandLine -like ('*' + $Supervisor + '*') } |
      ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue } catch {} }
  } catch {}
}

function Register-AutoStart {
  $psExe = Join-Path $PSHOME 'powershell.exe'
  $argLine = '-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "' + $Supervisor + '"'
  $action = New-ScheduledTaskAction -Execute $psExe -Argument $argLine -WorkingDirectory $SvcDir
  $trigger = New-ScheduledTaskTrigger -AtStartup
  $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew
  try { $settings.ExecutionTimeLimit = 'PT0S' } catch {}
  try { $settings.DisallowStartIfOnBatteries = $false } catch {}
  try { $settings.StopIfGoingOnBatteries = $false } catch {}
  if ($ServiceAccount -eq 'LOCAL SERVICE') {
    $principal = New-ScheduledTaskPrincipal -UserId 'S-1-5-19' -LogonType ServiceAccount -RunLevel Limited
  } else {
    $principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
  }
  Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description 'Babol Toyor application server (auto-start + auto-restart)' -Force | Out-Null
  Start-ScheduledTask -TaskName $TaskName | Out-Null
  Ok ('Auto-start task registered and started (account: ' + $ServiceAccount + ').')
}

function Enable-Firewall {
  $old = Get-NetFirewallRule -DisplayName $FwRuleName -ErrorAction SilentlyContinue
  if ($old) { Remove-NetFirewallRule -DisplayName $FwRuleName -ErrorAction SilentlyContinue }
  New-NetFirewallRule -DisplayName $FwRuleName -Description 'Babol Toyor web interface' -Direction Inbound -Protocol TCP -LocalPort $Port -Action Allow -Profile @('Domain','Private','Public') -Enabled True | Out-Null
  if ($PrepareHttpsFirewall) {
    if (@(Get-PortListeners 443).Count -gt 0) { Fail 'Port 443 is already occupied; review the listener before changing its firewall.' }
    $https = Get-NetFirewallRule -Name 'BabolToyor-HTTPS-443' -ErrorAction SilentlyContinue
    if ($https) { $https | Remove-NetFirewallRule -ErrorAction Stop }
    New-NetFirewallRule -Name 'BabolToyor-HTTPS-443' -DisplayName 'BabolToyor HTTPS' -Direction Inbound -Protocol TCP -LocalPort 443 -Action Allow -Profile @('Domain','Private','Public') -Enabled True | Out-Null
  }
  if ($ServiceAccount -eq 'LOCAL SERVICE' -and -not $PrepareHttpsFirewall) { Warn 'HTTPS firewall must be prepared separately by an administrator (or pass -PrepareHttpsFirewall).' }
  Ok ("Windows Firewall opened for TCP $Port.")
}

function New-Shortcuts {
  $body = "[InternetShortcut]`r`nURL=" + (Get-AppUrl) + "`r`nIconIndex=0`r`n"
  $targets = @()
  try { $targets += [Environment]::GetFolderPath('CommonDesktopDirectory') } catch {}
  try { $targets += [Environment]::GetFolderPath('CommonPrograms') } catch {}
  foreach ($t in @($targets | Select-Object -Unique)) {
    if ($t -and (Test-Path -LiteralPath $t)) {
      try { [IO.File]::WriteAllText((Join-Path $t $ShortcutName), $body, [Text.Encoding]::ASCII) } catch {}
    }
  }
  Ok 'Desktop / Start Menu shortcut created.'
}

function Wait-Health {
  $url = (Get-AppUrl).Replace('localhost','127.0.0.1') + 'api/health'
  for ($i = 0; $i -lt 30; $i++) {
    try {
      $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 3
      if ($r.StatusCode -eq 200) {
        $health = $r.Content | ConvertFrom-Json
        if ($health.service -eq 'baboltoyoor' -and $health.status -eq 'ok') { return $true }
      }
    } catch {}
    Start-Sleep -Seconds 2
  }
  return $false
}

function Write-InfoFile {
  $ip = $null
  try {
    $ip = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
      Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254*' } |
      Select-Object -First 1).IPAddress
  } catch {}
  if (-not $ip) { $ip = 'IP-سرور' }
  $lanUrl = if ($Port -eq 80) { "http://$ip/" } else { "http://$ip`:$Port/" }
  if ($script:AdminPassword) {
    $pwText = $script:AdminPassword
    $note = 'این رمز فقط یکبار نمایش داده میشود. پس از اولین ورود حتماً آن را عوض کنید و سپس این فایل را حذف کنید.'
  } else {
    $pwText = '—'
    $note = 'این یک بروزرسانی است؛ همان رمزی را وارد کنید که هنگام نصب اولیه (یا پس از تعویض اجباری) تعیین کرده اید. در صورت فراموشی، فایل .env را بررسی کنید.'
  }
  $text = @"
========================================================
  سامانهٔ یکپارچهٔ عملیات بابل طیور
  نصب خودکار ویندوز سرور ۲۰۲۵ — $(Get-Date -Format 'yyyy-MM-dd HH:mm')
========================================================

آدرس سامانه (بدون نوشتن پورت):
    روی خود سرور : $(Get-AppUrl)
    از شبکه داخلی: $lanUrl
    پورت         : $Port

ورود به سامانه:
    نام کاربری : admin
    رمز اولیه  : $pwText

    $note
    سامانه در اولین ورود تعویض رمز را اجباری میکند.

مسیرها:
    برنامه  : $InstallDir
    دادهها  : $DataDir      (فایل SQL: baboltoyoor.db — حتماً پشتیبان بگیرید)
    تنظیمات: $EnvPath
    لاگها   : $LogDir

دستورات (همان فایل نصبی را با آرگومان اجرا کنید):
    BabolToyor-Setup.cmd status     وضعیت سامانه
    BabolToyor-Setup.cmd logs       نمایش لاگهای اخیر
    BabolToyor-Setup.cmd restart    راهاندازی مجدد
    BabolToyor-Setup.cmd uninstall حذف سامانه (دادهها حفظ میشوند)

دیتابیس SQLite است (جداول واقعی SQL). اگر از نسخهٔ قدیمی با db.json میآیید،
    اولین اجرا بهصورت خودکار اطلاعات را به SQL منتقل کرده و فایل قدیمی را بایگانی میکند.

نکته: قاعدهٔ فایروال برای TCP $Port باز شده است. اگر از شبکهای دیگر
به سامانه دسترسی ندارید، پروفایل شبکه و فایروال سرور را بررسی کنید.
========================================================
"@
  [IO.File]::WriteAllText($InfoPath, $text, $Utf8Bom)
  Protect-File $InfoPath
}

# ------------------------------------------------------------- actions
function Invoke-Install {
  Write-Host ''
  Write-Host '========================================================' -ForegroundColor Cyan
  Write-Host '  Babol Toyor 1.1.20 - Windows Server 2025 one-click setup' -ForegroundColor Cyan
  Write-Host ("  Install dir : " + $InstallDir) -ForegroundColor Cyan
  Write-Host ("  Web address : " + (Get-AppUrl) + "  (port $Port)") -ForegroundColor Cyan
  Write-Host '========================================================' -ForegroundColor Cyan
  Write-Host ''
  if (-not (Test-Admin)) { Fail 'Administrator privileges are required. Right-click the .cmd and choose "Run as administrator".' }

  foreach ($d in @($InstallDir, $DataDir, $LogDir, $SvcDir)) {
    if (-not (Test-Path -LiteralPath $d)) { New-Item -ItemType Directory -Path $d -Force | Out-Null }
  }
  Grant-System $InstallDir
  Write-Log ('--- INSTALL START (action=install, port=' + $Port + ', dir=' + $InstallDir + ') ---')
  $WorkDir = Join-Path $env:TEMP ('BabolToyorSetup-' + [guid]::NewGuid().ToString('N').Substring(0,8))
  New-Item -ItemType Directory -Path $WorkDir -Force | Out-Null

  Step 'Stopping any previous instance ...'
  Stop-App

  Step 'Checking Node.js 22+ ...'
  $nodeExe = Get-NodeExe
  if (-not $nodeExe) {
    if ($SkipNodeInstall) { Fail 'Node.js 22+ not found (node:sqlite is built in from 22.5). Install it manually and re-run.' }
    $nodeExe = Install-Node $WorkDir
    if (-not $nodeExe) { $nodeExe = Get-NodeExe }
  }
  if (-not $nodeExe) { Fail 'Node.js 22+ could not be installed. Install it manually and re-run this setup.' }
  Ok ('Node.js: ' + $nodeExe + ' (' + (& $nodeExe '--version' 2>$null) + ')')

  Step ("Checking TCP port $Port ...")
  Resolve-Port

  Step 'Preparing application files ...'
  $source = Resolve-Source $WorkDir
  Install-AppFiles $source

  Step 'Writing configuration (.env) ...'
  Set-AppEnv

  Step 'Creating supervisor ...'
  New-Supervisor $nodeExe

  Step 'Granting service account permissions ...'
  Grant-ServiceAccess

  Step 'Configuring Windows Firewall ...'
  Enable-Firewall

  Step 'Registering automatic startup ...'
  Register-AutoStart

  Step 'Creating shortcuts ...'
  New-Shortcuts

  Step 'Waiting for the application to become healthy ...'
  if (Wait-Health) {
    Ok ('Application is responding on ' + (Get-AppUrl))
  } else {
    Warn 'Health check timed out. See the logs below; the supervisor keeps retrying.'
  }

  Write-InfoFile
  Write-Host ''
  Write-Host '========================================================' -ForegroundColor Green
  Write-Host '  INSTALLATION FINISHED' -ForegroundColor Green
  if ($Port -eq 80) { Write-Host "  Open: http://localhost/   (no port needed)" -ForegroundColor Green }
  else { Write-Host ("  Open: " + (Get-AppUrl)) -ForegroundColor Green }
  Write-Host '  User: admin' -ForegroundColor Green
  if ($script:AdminPassword) { Write-Host ("  Initial password: " + $script:AdminPassword) -ForegroundColor Green }
  Write-Host ("  Full details (Persian): " + $InfoPath) -ForegroundColor Green
  Write-Host '  Change the admin password at first login, then delete that file.' -ForegroundColor Yellow
  Write-Host '========================================================' -ForegroundColor Green
  Write-Host ''
  Write-Log '--- INSTALL DONE ---' 'OK'
}

function Invoke-Uninstall {
  if (-not (Test-Admin)) { Fail 'Administrator privileges are required.' }
  if (-not (Test-Path -LiteralPath $InstallDir)) { Warn ('Nothing to remove: ' + $InstallDir); return }
  Step 'Stopping application and removing auto-start task ...'
  Stop-App
  $t = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  if ($t) { Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue }
  $rule = Get-NetFirewallRule -DisplayName $FwRuleName -ErrorAction SilentlyContinue
  if ($rule) { Remove-NetFirewallRule -DisplayName $FwRuleName -ErrorAction SilentlyContinue }
  $httpsRule = Get-NetFirewallRule -Name 'BabolToyor-HTTPS-443' -ErrorAction SilentlyContinue
  if ($httpsRule) { Remove-NetFirewallRule -Name 'BabolToyor-HTTPS-443' -ErrorAction SilentlyContinue }
  foreach ($d in @([Environment]::GetFolderPath('CommonDesktopDirectory'), [Environment]::GetFolderPath('CommonPrograms'))) {
    if (-not $d) { continue }
    $f = Join-Path $d $ShortcutName
    if (Test-Path -LiteralPath $f) { Remove-Item -LiteralPath $f -Force -ErrorAction SilentlyContinue }
  }
  if ($PurgeData) {
    Step 'Removing ALL files including data (PurgeData) ...'
    Remove-Item -LiteralPath $InstallDir -Recurse -Force
    Ok 'Application and data removed.'
  } else {
    Step 'Removing application files (data / .env / logs are kept) ...'
    $preserve = @('data','.env','logs','INSTALL-INFO.txt')
    foreach ($item in @(Get-ChildItem -LiteralPath $InstallDir -Force)) {
      if ($preserve -notcontains $item.Name) { Remove-Item -LiteralPath $item.FullName -Recurse -Force -ErrorAction SilentlyContinue }
    }
    Ok ('Application removed. Your data is still in ' + $DataDir)
  }
}

function Invoke-Status {
  Write-Host ''
  Write-Host '=== Babol Toyor status ===' -ForegroundColor Cyan
  $t = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  if ($t) {
    $info = Get-ScheduledTaskInfo -TaskName $TaskName -ErrorAction SilentlyContinue
    Write-Host ("Task        : " + $t.TaskName + ' / ' + $t.State)
    if ($info) { Write-Host ("Last run    : " + $info.LastRunTime + '  result=' + $info.LastTaskResult) }
  } else { Write-Host 'Task        : NOT INSTALLED' }
  $listeners = @(Get-PortListeners $Port)
  Write-Host ("Port $Port : " + $(if ($listeners.Count -gt 0) { 'LISTENING (PID ' + ($listeners -join ',') + ')' } else { 'not listening' }))
  Write-Host ("Node procs  : " + @(Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like '*--baboltoyor=*' }).Count)
  Write-Host ("URL         : " + (Get-AppUrl))
  Write-Host ("Install dir : " + $InstallDir)
  if (Test-Path -LiteralPath $InfoPath) { Write-Host ("Info file   : " + $InfoPath) }
  try {
    $url = (Get-AppUrl).Replace('localhost','127.0.0.1') + 'api/health'
    $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 4
    Write-Host ("Health      : HTTP " + $r.StatusCode + ' OK') -ForegroundColor Green
  } catch { Write-Host 'Health      : NOT RESPONDING' -ForegroundColor Red }
  Write-Host ''
}

function Invoke-Logs {
  foreach ($f in @($OutLog, $ErrLog, $SupLog, $InstallLog)) {
    if (Test-Path -LiteralPath $f) {
      Write-Host ''
      Write-Host ('=== ' + $f + ' (last 40 lines) ===') -ForegroundColor Cyan
      Get-Content -LiteralPath $f -Tail 40 -ErrorAction SilentlyContinue
    }
  }
  if (-not (Test-Path -LiteralPath $OutLog)) { Warn 'No log files found yet.' }
}

function Invoke-Restart {
  if (-not (Test-Admin)) { Fail 'Administrator privileges are required.' }
  Stop-App
  $t = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  if (-not $t) { Fail 'Auto-start task is not installed. Run the installer first.' }
  Start-ScheduledTask -TaskName $TaskName | Out-Null
  if (Wait-Health) { Ok 'Application restarted and healthy.' } else { Warn 'Restarted, but health check timed out; check the logs.' }
}

function Invoke-Help {
  Write-Host @'
Babol Toyor - Windows Server 2025 one-click setup
==================================================
Double-click BabolToyor-Setup.cmd (right-click > Run as administrator),
or run one of these commands:

  BabolToyor-Setup.cmd                 install  (default; port 80, no port in URL)
  BabolToyor-Setup.cmd status         show service / port / health
  BabolToyor-Setup.cmd logs           show recent logs
  BabolToyor-Setup.cmd restart        restart the application
  BabolToyor-Setup.cmd uninstall      remove the app (data is kept)
  BabolToyor-Setup.cmd help           this text

Optional parameters (append to the install command):
  -Port 8080                         use another port instead of 80
  -InstallDir "D:\BabolToyor"        change install folder
  -NoAutoStopIis                     do not touch IIS if it owns port 80
  -SkipNodeInstall                   fail instead of installing Node.js
  -PurgeData                         (uninstall) delete data too
  -AppZipUrl <url>                   custom application ZIP
  -SourcePath <folder-or-zip>        install from a local source

Database: SQLite (baboltoyoor.db in the data folder); Node.js 22+ is required.
Offline install: put app.zip (project files) and, if Node.js is absent,
node-vXX-win-x64.zip next to the .cmd file.
'@
}

# ------------------------------------------------------------- main
try {
  switch ($Action) {
    'install'   { Invoke-Install }
    'uninstall' { Invoke-Uninstall }
    'status'    { Invoke-Status }
    'logs'      { Invoke-Logs }
    'restart'   { Invoke-Restart }
    'help'      { Invoke-Help }
  }
  exit 0
} catch {
  try { Write-Log ('FAILED: ' + $_.Exception.Message) 'ERROR' } catch {}
  Write-Host ''
  Write-Host ('ERROR: ' + $_.Exception.Message) -ForegroundColor Red
  Write-Host ('Log  : ' + $InstallLog) -ForegroundColor Red
  exit 1
}
