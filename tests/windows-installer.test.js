'use strict';
// Contract tests for the single-file Windows Server 2025 installer.
// Static contracts + a real interop test against lib/load-env.js and lib/config.js.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.join(__dirname, '..');
const installerDir = path.join(root, 'windows-installer');
const ps1Path = path.join(installerDir, 'Install-BabolToyor.ps1');
const cmdPath = path.join(installerDir, 'BabolToyor-Setup.cmd');
const ps1Bytes = fs.readFileSync(ps1Path);
const ps1 = ps1Bytes.toString('utf8').replace(/^\uFEFF/, '');
const cmdBytes = fs.readFileSync(cmdPath);
const cmd = cmdBytes.toString('ascii');

test('installer source is UTF-8 with BOM (Windows PowerShell 5.1 + Persian text)', () => {
  assert.deepEqual([...ps1Bytes.slice(0, 3)], [0xef, 0xbb, 0xbf]);
  assert.match(ps1, /INSTALL-INFO\.txt/);
  assert.doesNotMatch(ps1, /[\u4e00-\u9fff\u3040-\u30ff]/);
});

test('default port is 80 and the URL needs no port', () => {
  assert.match(ps1, /\[int\]\$Port = 80/);
  assert.match(ps1, /if \(\$Port -eq 80\) \{ return 'http:\/\/localhost\/' \}/);
  assert.match(ps1, /no port needed/);
});

test('installer writes .env with PORT=80 and enforces it on upgrades too', () => {
  assert.match(ps1, /\$values\['PORT'\]\s+= \[string\]\$Port/);
  assert.match(ps1, /\$values\['HOST'\]\s+= '0\.0\.0\.0'/);
  assert.match(ps1, /\$values\['DATA_DIR'\] = \$DataDir/);
  assert.match(ps1, /\$values\['ADMIN_INITIAL_PASSWORD'\]/);
  assert.match(ps1, /enforced on every install/);
  assert.match(ps1, /WriteAllText\(\$EnvPath/);
  assert.match(ps1, /SQLITE_FILE/);
  assert.match(ps1, /baboltoyoor\.db/);
  assert.match(ps1, /Protect-File \$EnvPath/);
});

test('admin password is random and .env-safe (no quotes, hash or whitespace)', () => {
  assert.match(ps1, /RandomNumberGenerator\]::Create\(\)/);
  assert.match(ps1, /function New-AdminPassword/);
  const alphabet = ps1.match(/\$alphabet = '([^']+)'/);
  assert.ok(alphabet, 'password alphabet must exist');
  assert.doesNotMatch(alphabet[1], /[\s#'"\\]/);
  assert.match(alphabet[1], /[A-Z]/);
  assert.match(alphabet[1], /[0-9]/);
  assert.doesNotMatch(ps1, /ADMIN_INITIAL_PASSWORD=[^\s$'"]{8,}/);
});

test('Node.js 22+ is required and the downloaded MSI is SHA256 verified', () => {
  assert.match(ps1, /-and \[int\]\$Matches\[1\] -ge 22/);
  assert.match(ps1, /Node\.js 22\+/);
  assert.match(ps1, /nodejs\.org\/dist\/index\.json/);
  assert.match(ps1, /SHASUMS256\.txt/);
  assert.match(ps1, /\[int\]\$Matches\[1\] -ge 22/);
  assert.match(ps1, /Get-FileHash -LiteralPath \$msi -Algorithm SHA256/);
  assert.match(ps1, /checksum mismatch/);
  assert.match(ps1, /node-v\*-win-x64\.zip/);
  assert.match(ps1, /OpenJS\.NodeJS\.LTS/);
});

test('port 80 conflicts (IIS / HTTP.sys) are detected and handled', () => {
  assert.match(ps1, /function Resolve-Port/);
  assert.match(ps1, /-contains 4/);
  assert.match(ps1, /Stop-Website/);
  assert.match(ps1, /serverAutoStart/);
  assert.match(ps1, /W3SVC/);
  assert.match(ps1, /NoAutoStopIis/);
  assert.match(ps1, /Test-Tcp/);
});

test('firewall opens inbound TCP $Port for all profiles', () => {
  assert.match(ps1, /New-NetFirewallRule/);
  assert.match(ps1, /-Direction Inbound -Protocol TCP -LocalPort \$Port -Action Allow/);
  assert.match(ps1, /@\('Domain','Private','Public'\)/);
});

test('auto-start runs as SYSTEM at boot and restarts on crash', () => {
  assert.match(ps1, /New-ScheduledTaskTrigger -AtStartup/);
  assert.match(ps1, /New-ScheduledTaskPrincipal -UserId 'SYSTEM'/);
  assert.match(ps1, /Register-ScheduledTask/);
  assert.match(ps1, /ExecutionTimeLimit = 'PT0S'/);
  assert.match(ps1, /-RestartCount 3/);
  assert.match(ps1, /-MultipleInstances IgnoreNew/);
  assert.match(ps1, /Stop-App/);
});

test('supervisor restarts node and uses a marker so it can be stopped safely', () => {
  assert.match(ps1, /while \(\$true\)/);
  assert.match(ps1, /Start-Process -FilePath \$nodeExe/);
  assert.match(ps1, /\$p\.WaitForExit\(\)/);
  assert.match(ps1, /Start-Sleep -Seconds 5/);
  assert.match(ps1, /--baboltoyor=/);
  assert.match(ps1, /--disable-warning=ExperimentalWarning/);
  assert.match(ps1, /Rotate-Log/);
  // the embedded supervisor is a here-string with terminators at column 0
  for (const line of ps1.split('\n')) {
    if (line.trim() === "'@" || line.trim() === '"@') assert.equal(line, line.trim());
  }
});

test('all actions exist; uninstall keeps data unless -PurgeData', () => {
  assert.match(ps1, /ValidateSet\('install','uninstall','status','logs','restart','help'\)/);
  for (const fn of ['Invoke-Install', 'Invoke-Uninstall', 'Invoke-Status', 'Invoke-Logs', 'Invoke-Restart', 'Invoke-Help']) {
    assert.match(ps1, new RegExp('function ' + fn));
  }
  assert.match(ps1, /\$preserve = @\('data','\.env','logs','INSTALL-INFO\.txt'\)/);
  assert.match(ps1, /PurgeData/);
  assert.match(ps1, /Your data is still in/);
});

test('the single .cmd is pure ASCII with CRLF, self-elevates and bypasses execution policy', () => {
  assert.ok(cmdBytes.every((b) => b < 128), 'cmd must be pure ASCII');
  assert.ok(cmdBytes.includes(Buffer.from('\r\n')), 'cmd must use CRLF');
  assert.equal(cmd.replace(/\r\n/g, '').includes('\n'), false, 'no lone LF');
  for (const needle of ['net session', 'RunAs', '-ExecutionPolicy Bypass', 'BT_INSTALLER_DIR', '-File "%PS1%" %*', 'FromBase64String', 'WriteAllBytes', 'pause']) {
    assert.ok(cmd.includes(needle), 'cmd must contain ' + needle);
  }
});

test('the embedded payload decodes byte-for-byte to the installer source', () => {
  const chunks = cmd.split('\r\n').filter((l) => l.startsWith('echo('));
  assert.ok(chunks.length > 10, 'payload must be split into several lines');
  for (const c of chunks) assert.ok(c.length - 5 <= 1000, 'each line stays below the cmd length limit');
  const decoded = Buffer.from(chunks.map((c) => c.slice(5)).join(''), 'base64');
  assert.deepEqual(decoded, ps1Bytes);
  assert.equal(decoded.toString('utf8').replace(/^\uFEFF/, ''), ps1);
});

test('generated .env is parsed by the real lib/load-env.js and config.js yields port 80', () => {
  const { loadEnv } = require('../lib/load-env');
  const password = 'Aa7!Bx92Qz4Rt6Yw8Km3Vn5';
  const envText = [
    '# Babol Toyor - generated by BabolToyor-Setup.cmd. Do not edit by hand.',
    'PORT=80',
    'HOST=0.0.0.0',
    'DATA_DIR=C:\\BabolToyor\\data',
    'ADMIN_INITIAL_PASSWORD=' + password,
    'APP_ENV=production',
    'COOKIE_SECURE=false',
    'TRUST_PROXY=false',
    '',
  ].join('\n');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bt-installer-env-'));
  try {
    const file = path.join(tmp, '.env');
    fs.writeFileSync(file, envText, 'utf8');
    const env = {};
    loadEnv(file, env);
    assert.equal(env.PORT, '80');
    assert.equal(env.HOST, '0.0.0.0');
    assert.equal(env.DATA_DIR, 'C:\\BabolToyor\\data');
    assert.equal(env.ADMIN_INITIAL_PASSWORD, password);
    assert.equal(env.COOKIE_SECURE, 'false');

    const saved = {};
    for (const [k, v] of Object.entries(env)) { saved[k] = process.env[k]; process.env[k] = v; }
    try {
      delete require.cache[require.resolve('../lib/config')];
      const config = require('../lib/config');
      assert.equal(config.PORT, 80, 'the app must listen on port 80 from the installer .env');
      assert.equal(config.HOST, '0.0.0.0');
      assert.equal(config.DATA_DIR, 'C:\\BabolToyor\\data');
      assert.equal(config.ADMIN_INITIAL_PASSWORD, password);
      assert.equal(config.COOKIE_SECURE, false);
    } finally {
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k]; else process.env[k] = v;
      }
      delete require.cache[require.resolve('../lib/config')];
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('docs describe the real installer and the port-80 no-port URL', () => {
  const readme = fs.readFileSync(path.join(installerDir, 'README-fa.md'), 'utf8');
  assert.match(readme, /BabolToyor-Setup\.cmd/);
  assert.match(readme, /http:\/\/localhost/);
  assert.match(readme, /پورت ۸۰|PORT=80/);
  assert.match(readme, /app\.zip/);
  const doc = fs.readFileSync(path.join(root, 'docs', 'deployment-windows-server-2025.md'), 'utf8');
  assert.match(doc, /BabolToyor-Setup\.cmd/);
  assert.doesNotMatch(doc, /BabolToyorSmart-Setup-37\.2\.10\.exe/);
  const mainReadme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
  assert.match(mainReadme, /windows-installer\/BabolToyor-Setup\.cmd/);
  assert.match(mainReadme, /SQLite/);
  assert.match(doc, /SQLite/);
  assert.match(readme, /SQLite|baboltoyoor\.db/);
  const sqlDoc = fs.readFileSync(path.join(root, 'docs', 'sqlite-database-fa.md'), 'utf8');
  assert.match(sqlDoc, /baboltoyoor\.db/);
  assert.match(sqlDoc, /SELECT/);
});

test('step-by-step guide exists, answers the SQLite question and gives exact download links', () => {
  const md = fs.readFileSync(path.join(installerDir, 'INSTALL-STEPS-fa.md'), 'utf8');
  const html = fs.readFileSync(path.join(installerDir, 'INSTALL-STEPS-fa.html'), 'utf8');
  for (const doc of [md, html]) {
    assert.match(doc, /SQLite/);
    assert.match(doc, /خیر/);
    assert.match(doc, /22[./]5|۲۲[./]۵/);
    assert.match(doc, /nodejs\.org/);
    assert.match(doc, /INSTALLATION FINISHED/);
    assert.match(doc, /Run as administrator/);
    assert.match(doc, /INSTALL-INFO\.txt/);
    assert.match(doc, /http:\/\/localhost/);
    const releaseVersion = fs.readFileSync(path.join(root, 'RELEASE_VERSION.txt'), 'utf8').trim();
    assert.ok(doc.includes(`BabolToyor-Windows-Setup-${releaseVersion}.zip`));
  }
  assert.match(html, /dir="rtl"/);
  assert.match(html, /lang="fa"/);
  assert.match(md, /sqlite\.org\/download\.html/);
  assert.match(md, /sqlite-tools-win-x64/);
  assert.match(md, /node-v22\.x\.x-win-x64\.zip/);
  assert.match(md, /backup-db\.js/);
  const deploy = fs.readFileSync(path.join(root, 'docs', 'deployment-windows-server-2025.md'), 'utf8');
  assert.match(deploy, /INSTALL-STEPS-fa\.md/);
  const readme = fs.readFileSync(path.join(installerDir, 'README-fa.md'), 'utf8');
  assert.match(readme, /INSTALL-STEPS-fa\.md/);
});
