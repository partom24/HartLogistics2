<#
.SYNOPSIS
  HartLogistics URCE 1.5.9 governed direct native Sorter home LAB source candidate; generic terminal HOLD retained — one-file Git-backed launcher.
.DESCRIPTION
  Plan: checked Git source and pinned local preview validation, no LAB access.
  CheckLab: stopped LAB read-only exact installed 1.5.7 or 1.5.8 predecessor and registrations.
  Install: explicit -Apply and pinned commit; creates verified backups.
  Rollback: explicit -Apply, exact recorded backup tag and matching pinned source.
  This enables only a fully observed direct Receiver/Hopper/Sorter/native chest route.
  The original 1.4.2 physical/Q4 writers are reused. Generic network/Bulk/MR
  routing remains HOLD; this is not a full URCE release.
  No installed-world reset or automatic server restart. Never production.
.EXAMPLE
  .\Start-HartLogistics-159Lab.ps1 -Mode Plan
.EXAMPLE
  .\Start-HartLogistics-159Lab.ps1 -Mode CheckLab -ExpectedCommit <full-40-character-Plan-SHA>
.EXAMPLE
  .\Start-HartLogistics-159Lab.ps1 -Mode Install -Apply -ExpectedCommit <full-40-character-Plan-SHA>
.EXAMPLE
  .\Start-HartLogistics-159Lab.ps1 -Mode Rollback -BackupTag lab-1234567890ab -Apply -ExpectedCommit <full-40-character-Plan-SHA>
#>
[CmdletBinding()]
param(
    [ValidateSet('Plan','CheckLab','Install','Rollback')]
    [string]$Mode = 'Plan',
    [switch]$Apply,
    [string]$BackupTag = '',
    [string]$ExpectedCommit = ''
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Refuse([string]$Reason) { throw ('REFUSED URCE 1.5.9 LAB preview: ' + $Reason) }
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
if ($ExpectedCommit -and $ExpectedCommit -cnotmatch '^[0-9a-f]{40}$') {
    Refuse '-ExpectedCommit must be the exact 40-character lowercase Git SHA'
}
if ($Mode -in @('CheckLab','Install','Rollback') -and -not $ExpectedCommit) {
    Refuse 'CheckLab, Install and Rollback require the full -ExpectedCommit from the matching Plan/checkpoint'
}
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
$branch = 'dev/urce-159-governed-home-20261120'
$checkout = [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'HartLogistics2-URCE159-LAB'))
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
# Keep strict PowerShell failure behavior while allowing Git's ordinary
# stderr progress text. The helper checks the native Git exit code itself.
. (Join-Path $PSScriptRoot 'Invoke-HartLogisticsNativeGit.ps1')
function GitText([string[]]$Words) {
    return (Invoke-HartLogisticsNativeGit -GitArguments (@('-C', $checkout) + $Words))
}

Assert-Unlinked $checkout
if (-not (Test-Path -LiteralPath $checkout)) {
    if ($Mode -eq 'Rollback') {
        Refuse 'Existing pinned Git checkout required for safe rollback'
    }
    Invoke-HartLogisticsNativeGit -GitArguments @(
        'clone','--quiet','--single-branch','--branch',$branch,$origin,$checkout
    ) | Out-Null
}
Assert-Unlinked $checkout
$actualOrigin = GitText -Words @('remote','get-url','origin')
if ($actualOrigin -notmatch '^(?:https://github\.com/|git@github\.com:|ssh://git@github\.com/)partom24/HartLogistics2(?:\.git)?/?$') {
    Refuse 'Unexpected Git origin'
}
if ((GitText -Words @('branch','--show-current')) -cne $branch) {
    Refuse 'Expected URCE development branch in the isolated checkout'
}
if (GitText -Words @('status','--porcelain','--untracked-files=all')) {
    Refuse 'Git workspace contains local changes'
}
if ($Mode -ne 'Rollback') {
    Invoke-HartLogisticsNativeGit -GitArguments @(
        '-C',$checkout,'fetch','--quiet','--no-tags','origin',$branch
    ) | Out-Null
    Invoke-HartLogisticsNativeGit -GitArguments @(
        '-C',$checkout,'merge','--quiet','--ff-only','FETCH_HEAD'
    ) | Out-Null
}
$head = GitText -Words @('rev-parse','HEAD')
if ($head -notmatch '^[0-9a-f]{40}$') { Refuse 'Unable to pin Git commit' }
if ($ExpectedCommit -and $head -cne $ExpectedCommit) {
    Refuse 'Source SHA changed since CheckLab; re-run preflight and do not apply'
}
$script = Join-Path $checkout 'scripts\hartlogistics_159_lab_updater.py'
if (-not (Test-Path -LiteralPath $script -PathType Leaf)) { Refuse 'Missing Git-tracked URCE 1.5 LAB updater' }

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
if ($LASTEXITCODE -ne 0) { Refuse ('URCE preview command refused/failed (exit ' + $LASTEXITCODE + ')') }
