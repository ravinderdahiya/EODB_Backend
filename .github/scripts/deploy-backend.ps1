param(
  [Parameter(Mandatory = $true)]
  [string]$SourceDir,

  [Parameter(Mandatory = $true)]
  [string]$TargetDir,

  [string]$AppPoolName = "EODB_Backend",
  [string]$RunDbPush = "false"
)

$ErrorActionPreference = "Stop"
$runMigration = $RunDbPush.Trim().ToLowerInvariant() -eq "true"

Write-Host "Backend deploy started"
Write-Host "SourceDir: $SourceDir"
Write-Host "TargetDir: $TargetDir"
Write-Host "RunDbPush: $runMigration"

if (-not (Test-Path -LiteralPath $SourceDir)) {
  throw "Source directory does not exist: $SourceDir"
}

if (-not (Test-Path -LiteralPath $TargetDir)) {
  New-Item -ItemType Directory -Path $TargetDir -Force | Out-Null
}

# Mirror source to IIS backend folder but preserve server-managed .env and runtime folders.
& robocopy `
  $SourceDir `
  $TargetDir `
  /MIR /R:2 /W:2 /NFL /NDL /NP /NJH /NJS `
  /XD ".git" ".github" "node_modules" "iisnode" "logs" `
  /XF ".env"

$robocopyCode = $LASTEXITCODE
if ($robocopyCode -ge 8) {
  throw "Robocopy failed with exit code $robocopyCode"
}

Push-Location $TargetDir
try {
  if (-not (Test-Path -LiteralPath ".env")) {
    Write-Warning ".env not found in target folder. Backend may fail to start without secrets."
  }

  npm ci --omit=dev
  if ($LASTEXITCODE -ne 0) {
    throw "npm ci failed"
  }

  npx prisma generate
  if ($LASTEXITCODE -ne 0) {
    throw "prisma generate failed"
  }

  if ($runMigration) {
    npx prisma db push
    if ($LASTEXITCODE -ne 0) {
      throw "prisma db push failed"
    }
  }
}
finally {
  Pop-Location
}

Import-Module WebAdministration
if (Test-Path -LiteralPath "IIS:\AppPools\$AppPoolName") {
  Restart-WebAppPool -Name $AppPoolName
  Write-Host "Restarted IIS app pool: $AppPoolName"
} else {
  Write-Warning "App pool '$AppPoolName' not found. Restart manually if required."
}

Write-Host "Backend deploy completed"
