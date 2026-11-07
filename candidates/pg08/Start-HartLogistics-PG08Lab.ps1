<# 
.SYNOPSIS
  One-file Git-backed launcher for PG08 Collector/Receiver menu LAB testing.
.DESCRIPTION
  Plan: checks Git source only (no server access). CheckLab: server-stopped
  read-only preflight. Install/Rollback: require -Apply, exact LAB-only guards,
  pinned Git source, and the existing Python transaction/backup utility.
  No production operations, experiments, world resets or auto-restarts.
  Old failed 1.5.0 can be replaced; all unrelated mods/world data remain.
.EXAMPLE
  .\Start-HartLogistics-PG08Lab.ps1
.EXAMPLE
  .\Start-HartLogistics-PG08Lab.ps1 -Mode CheckLab
.EXAMPLE
  .\Start-HartLogistics-PG08Lab.ps1 -Mode Install -Apply
.EXAMPLE
  .\Start-HartLogistics-PG08Lab.ps1 -Mode Rollback -BackupTag lab-1234567890ab -Apply
#>
[CmdletBinding()]
param(
    [ValidateSet('Plan','CheckLab','Install','Rollback')]
    [string]$Mode = 'Plan',
    [switch]$Apply,
    [string]$BackupTag = ''
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Refuse([string]$Reason) { throw ('REFUSED PG08 launcher: ' + $Reason) }
if ($env:OS -cne 'Windows_NT') { Refuse 'Windows LAB operator only' }
if ($Mode -in @('Install','Rollback') -and -not $Apply) {
    Refuse 'Install/Rollback require explicit -Apply'
}
if ($Apply -and $Mode -notin @('Install','Rollback')) {
    Refuse '-Apply permitted only for Install/Rollback'
}
if ($Mode -eq 'Rollback' -and $BackupTag -cnotmatch '^lab-[0-9a-f]{12}$') {
    Refuse 'Rollback needs the exact prior lab-<12 lowercase hex> backup tag'
}
if ($Mode -ne 'Rollback' -and $BackupTag) { Refuse '-BackupTag is only for Rollback' }
if (-not (Get-Command git.exe -ErrorAction SilentlyContinue)) {
    Refuse 'Git for Windows is required'
}
# Use the already-installed python.exe (including 3.12), rather than
# requiring a missing py.exe -3.11 interpreter on the LAB host.
$python = Get-Command python.exe -ErrorAction SilentlyContinue
$pyArgs = @()
if (-not $python) {
    $python = Get-Command py.exe -ErrorAction SilentlyContinue
    $pyArgs = @('-3')
}
if (-not $python) { Refuse 'Python 3.11+ (3.x) is required; no installation attempted' }
$pyName = $python.Source
$version = (& $pyName @pyArgs -c 'import sys;print(str(sys.version_info.major)+chr(46)+str(sys.version_info.minor))')
if ($LASTEXITCODE -ne 0 -or $version -notmatch '^3\.[0-9]+$') {
    Refuse 'Compatible Python 3.11+ (3.x) was not found; no installation attempted'
}
if ([version]($version + '.0') -lt [version]'3.11.0') {
    Refuse ('Python '+$version+' is too old; Python 3.11+ (3.x) is required')
}
Write-Output ('Using Python '+$version+' at '+$pyName)
if (-not $env:LOCALAPPDATA) { Refuse 'LOCALAPPDATA missing' }

$origin = 'https://github.com/partom24/HartLogistics2.git'
$branch = 'main'
$checkout = [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'HartLogistics2-PG08-LAB'))
if ($checkout -match '^[A-Za-z]:\\Servers(\\|$)') {
    Refuse 'Git source workspace may not be inside a Minecraft server'
}
function Assert-Unlinked([string]$Path) {
    $current = [IO.Path]::GetFullPath($Path)
    while ($true) {
        if (Test-Path -LiteralPath $current) {
            $item = Get-Item -LiteralPath $current -Force
            if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
                Refuse ('Junction/symlink not authorized: ' + $current)
            }
        }
        $parent = [IO.Directory]::GetParent($current)
        if ($null -eq $parent) { break }
        $current = $parent.FullName
    }
}
function GitText([string[]]$Words) {
    $output = & git.exe -C $checkout @Words 2>&1
    if ($LASTEXITCODE -ne 0) { Refuse ('Git failed: ' + ($Words -join ' ')) }
    return (($output | Out-String).Trim())
}

Assert-Unlinked $checkout
if (-not (Test-Path -LiteralPath $checkout)) {
    if ($Mode -eq 'Rollback') {
        Refuse 'Existing pinned Git checkout required for safe rollback'
    }
    $output = & git.exe clone --quiet --single-branch --branch $branch $origin $checkout 2>&1
    if ($LASTEXITCODE -ne 0) { Refuse ('Authorized Git clone failed: ' + ($output | Out-String)) }
}
Assert-Unlinked $checkout
$actualOrigin = GitText -Words @('remote','get-url','origin')
if ($actualOrigin -notmatch '^(?:https://github\.com/|git@github\.com:|ssh://git@github\.com/)partom24/HartLogistics2(?:\.git)?/?$') {
    Refuse 'Unexpected Git origin'
}
if ((GitText -Words @('branch','--show-current')) -cne $branch) {
    Refuse 'Expected main branch in the isolated PG08 workspace'
}
if (GitText -Words @('status','--porcelain','--untracked-files=all')) {
    Refuse 'Git workspace contains local changes'
}
if ($Mode -ne 'Rollback') {
    $output = & git.exe -C $checkout fetch --quiet --no-tags origin $branch 2>&1
    if ($LASTEXITCODE -ne 0) { Refuse 'Git fetch failed' }
    $output = & git.exe -C $checkout merge --quiet --ff-only FETCH_HEAD 2>&1
    if ($LASTEXITCODE -ne 0) { Refuse 'Git fast-forward failed; no changes forced' }
}
$head = GitText -Words @('rev-parse','HEAD')
if ($head -notmatch '^[0-9a-f]{40}$') { Refuse 'Unable to pin Git commit' }
$script = Join-Path $checkout 'candidates\pg08\lab_deploy.py'
if (-not (Test-Path -LiteralPath $script -PathType Leaf)) { Refuse 'Missing Git-tracked PG08 LAB updater' }

Write-Output ('Pinned Git source: ' + $head)
Write-Output ('Source workspace: ' + $checkout)
Write-Output 'AUTHORIZED LAB ONLY: C:\Servers\Thomas_MCBedrock - Copy (2)'
$modeArgs = @($script, '--commit', $head)
if ($Mode -in @('CheckLab','Install','Rollback')) { $modeArgs += '--check-lab' }
if ($Mode -in @('Install','Rollback')) {
    $modeArgs += @('--apply', '--confirm-lab-only')
}
if ($Mode -eq 'Rollback') { $modeArgs += @('--rollback-tag', $BackupTag) }

& $pyName @pyArgs @modeArgs
if ($LASTEXITCODE -ne 0) { Refuse ('PG08 command refused/failed (exit ' + $LASTEXITCODE + ')') }
