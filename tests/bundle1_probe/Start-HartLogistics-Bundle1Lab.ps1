# TEMP_TEST:PG03-05-LAUNCH
<#
.SYNOPSIS
  One-file launcher for the Git-sourced Hart Logistics disposable BDS LAB probe.
.DESCRIPTION
  Gets the approved HartLogistics2 branch through Git for Windows and then
  delegates to its guarded PowerShell source updater. Default Plan never
  accesses any Minecraft server. It never runs the HartBots production updater.
.EXAMPLE
  .\Start-HartLogistics-Bundle1Lab.ps1
.EXAMPLE
  .\Start-HartLogistics-Bundle1Lab.ps1 -Mode CheckLab
.EXAMPLE
  .\Start-HartLogistics-Bundle1Lab.ps1 -Mode Install -Apply
.EXAMPLE
  .\Start-HartLogistics-Bundle1Lab.ps1 -Mode Cleanup -Apply -ConfirmProbeCleared
#>
[CmdletBinding()]
param(
  [ValidateSet('Plan','Sync','CheckLab','Install','Cleanup')][string]$Mode='Plan',
  [switch]$Apply,
  [switch]$ConfirmProbeCleared
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'

function Refuse([string]$Reason) { throw ('REFUSED Hart Logistics LAB launcher: '+$Reason) }
if ($env:OS -cne 'Windows_NT') { Refuse 'This launcher runs only on Windows' }
if ($Mode -in @('Install','Cleanup') -and -not $Apply) {
  Refuse 'Install and Cleanup require explicit -Apply'
}
if ($Apply -and $Mode -notin @('Install','Cleanup')) {
  Refuse '-Apply is valid only for Install or Cleanup'
}
if ($Mode -eq 'Cleanup' -and -not $ConfirmProbeCleared) {
  Refuse 'Cleanup requires -ConfirmProbeCleared after test items are saved/disposable'
}
if (-not (Get-Command git.exe -ErrorAction SilentlyContinue)) {
  Refuse 'Git for Windows is required; install Git before using this launcher'
}

$branch='docs/hart-logistics-planning'
$origin='https://github.com/partom24/HartLogistics2.git'
if (-not $env:LOCALAPPDATA) { Refuse 'LOCALAPPDATA is missing' }
$checkout=Join-Path $env:LOCALAPPDATA 'HartLogistics2-PG03-05'
$normalized=[IO.Path]::GetFullPath($checkout)
if ($normalized -match '^[A-Za-z]:\\Servers(\\|$)') {
  Refuse 'Git workspace must not be inside a Minecraft server folder'
}
function Ensure-Unlinked([string]$Value) {
  $current=[IO.Path]::GetFullPath($Value)
  while ($true) {
    if (Test-Path -LiteralPath $current) {
      $item=Get-Item -LiteralPath $current -Force
      if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
        Refuse ('Unapproved Git path junction or symlink: '+$current)
      }
    }
    $parent=[IO.Directory]::GetParent($current)
    if ($null -eq $parent) {break}
    $current=$parent.FullName
  }
}
function GitText([string[]]$Words) {
  $output=& git.exe -C $checkout @Words 2>&1
  if ($LASTEXITCODE -ne 0) {Refuse ('Git failed: '+($Words -join ' '))}
  return (($output | Out-String).Trim())
}
Ensure-Unlinked $checkout
if (-not (Test-Path -LiteralPath $checkout)) {
  if ($Mode -eq 'Cleanup') {Refuse 'Existing Git checkout is required for cleanup'}
  $output=& git.exe clone --quiet --single-branch --branch $branch $origin $checkout 2>&1
  if ($LASTEXITCODE -ne 0) {Refuse ('Git clone failed: '+($output | Out-String))}
}
Ensure-Unlinked $checkout
$actualOrigin=GitText -Words @('remote','get-url','origin')
if ($actualOrigin -notmatch '^(?:https://github\.com/|git@github\.com:|ssh://git@github\.com/)partom24/HartLogistics2(?:\.git)?/?$') {
  Refuse 'Unexpected Git remote; only partom24/HartLogistics2 is allowed'
}
$actualBranch=GitText -Words @('branch','--show-current')
if ($actualBranch -cne $branch) {Refuse 'Checkout must be on the authorized development branch'}
if (GitText -Words @('status','--porcelain','--untracked-files=all')) {
  Refuse 'Git checkout must be clean; refusing to overwrite local changes'
}
if ($Mode -ne 'Cleanup') {
  $output=& git.exe -C $checkout fetch --quiet --no-tags origin $branch 2>&1
  if ($LASTEXITCODE -ne 0) {Refuse 'Unable to fetch the authorized branch'}
  $output=& git.exe -C $checkout merge --quiet --ff-only FETCH_HEAD 2>&1
  if ($LASTEXITCODE -ne 0) {Refuse 'Git checkout cannot fast-forward safely'}
}
$head=GitText -Words @('rev-parse','HEAD')
if ($head -notmatch '^[0-9a-f]{40}$') {Refuse 'Git HEAD is not a full commit SHA'}
$main=Join-Path $checkout 'tests\bundle1_probe\Update-HartLogistics-Bundle1Lab.ps1'
if (-not (Test-Path -LiteralPath $main -PathType Leaf)) {Refuse 'Git checkout lacks the temporary LAB updater'}
Write-Output ('Authorized Git source at: '+$checkout)
Write-Output ('Pinned source commit: '+$head)
if ($Mode -eq 'Sync') {
  Write-Output 'Git source synchronized. No Minecraft server accessed.'
  return
}
if ($Mode -eq 'Install') {
  & $main -Mode Install -Commit $head -Apply
} elseif ($Mode -eq 'Cleanup') {
  & $main -Mode Cleanup -Commit $head -Apply -ConfirmProbeCleared
} elseif ($Mode -eq 'CheckLab') {
  & $main -Mode CheckLab -Commit $head
} else {
  & $main -Mode Plan -Commit $head
}
