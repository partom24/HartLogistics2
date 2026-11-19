<#
.SYNOPSIS
  HartLogistics2 integrated-product, exact-SHA, stopped-LAB launcher.
.DESCRIPTION
  Plan is source-only. All other modes require an exact Git pin. Only explicit
  -Apply modes may stage/bind a new world, install/rollback the Hart packs,
  or restore PG42 after exact pack rollback. Never starts BDS or migrates Q4.
#>
[CmdletBinding()]
param(
    [ValidateSet('Plan','CheckStage','Stage','CheckBind','Bind',
                 'CheckInstall','Install','CheckRollback','Rollback',
                 'CheckRestore','Restore')]
    [string]$Mode = 'Plan',
    [switch]$Apply,
    [string]$ExpectedCommit = '',
    [string]$BackupTag = ''
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
function Refuse([string]$Reason) { throw ('REFUSED HL2 integrated LAB: ' + $Reason) }
$writes = @('Stage','Bind','Install','Rollback','Restore')
$rollback = @('CheckRollback','Rollback')
if ($env:OS -cne 'Windows_NT') { Refuse 'Windows LAB only' }
if ($writes -contains $Mode -and -not $Apply) { Refuse 'Mutations require -Apply' }
if ($Apply -and $writes -notcontains $Mode) { Refuse '-Apply refused for read-only mode' }
if ($rollback -contains $Mode -and $BackupTag -cnotmatch '^lab-[0-9a-f]{12}$') {
    Refuse 'Rollback requires exact lab-<12 lowercase hex> backup tag'
}
if ($rollback -notcontains $Mode -and $BackupTag) { Refuse 'BackupTag only for rollback modes' }
if ($ExpectedCommit -and $ExpectedCommit -cnotmatch '^[0-9a-f]{40}$') {
    Refuse 'ExpectedCommit requires exact lowercase 40-character SHA'
}
if ($Mode -ne 'Plan' -and -not $ExpectedCommit) { Refuse 'Explicit Git SHA required' }
if (-not (Get-Command git.exe -ErrorAction SilentlyContinue)) {
    Refuse 'Git for Windows required'
}
$python = Get-Command python.exe -ErrorAction SilentlyContinue
$pyArgs = @()
if (-not $python) {
    $python = Get-Command py.exe -ErrorAction SilentlyContinue
    $pyArgs = @('-3')
}
if (-not $python) { Refuse 'Python 3.11+ required' }
$pyName = $python.Source
$pyVersion = & $pyName @pyArgs -c 'import sys;print(str(sys.version_info.major)+chr(46)+str(sys.version_info.minor))'
if ($LASTEXITCODE -ne 0 -or $pyVersion -notmatch '^3\.[0-9]+$' -or
    [version]($pyVersion+'.0') -lt [version]'3.11.0') {
    Refuse 'Python 3.11+ required without installing dependencies'
}
if (-not $env:LOCALAPPDATA) { Refuse 'LOCALAPPDATA missing' }
$branch='dev/uce-shared-ordinary-ledger-20261111'
$checkout=[IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'HartLogistics2-FullProduct-LAB'))
if ($checkout -match '^[A-Za-z]:\\Servers(\\|$)') {
    Refuse 'Source checkout may not be inside a server root'
}
function Assert-Unlinked([string]$Path) {
    $current=[IO.Path]::GetFullPath($Path)
    while ($true) {
        if (Test-Path -LiteralPath $current) {
            $item=Get-Item -LiteralPath $current -Force
            if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
                Refuse ('Junction/symlink in source path: '+$current)
            }
        }
        $parent=[IO.Directory]::GetParent($current)
        if ($null -eq $parent) { break }
        $current=$parent.FullName
    }
}
Assert-Unlinked $checkout
if (-not (Test-Path -LiteralPath $checkout)) {
    if ($Mode -in @('Rollback','Restore')) {
        Refuse 'Existing pinned checkout required for rollback/restore'
    }
    $clone = & git.exe clone --quiet --single-branch --branch $branch 'https://github.com/partom24/HartLogistics2.git' $checkout 2>&1
    if ($LASTEXITCODE -ne 0) { Refuse ('Git clone failed: '+($clone | Out-String)) }
}
Assert-Unlinked $checkout
function GitText([string[]]$Words) {
    $result = & git.exe -C $checkout @Words 2>&1
    if ($LASTEXITCODE -ne 0) { Refuse ('Git error: '+($Words -join ' ')) }
    return (($result | Out-String).Trim())
}
$origin = GitText -Words @('remote','get-url','origin')
if ($origin -notmatch '^(?:https://github\.com/|git@github\.com:|ssh://git@github\.com/)partom24/HartLogistics2(?:\.git)?/?$') {
    Refuse 'Unexpected Git origin'
}
if ((GitText -Words @('branch','--show-current')) -cne $branch) {
    Refuse 'Dedicated full-product LAB branch required'
}
if (GitText -Words @('status','--porcelain','--untracked-files=all')) {
    Refuse 'Git checkout is dirty'
}
if ($Mode -notin @('Rollback','Restore')) {
    $fetch = & git.exe -C $checkout fetch --quiet --no-tags origin $branch 2>&1
    if ($LASTEXITCODE -ne 0) { Refuse 'Git fetch failed' }
    $merge = & git.exe -C $checkout merge --quiet --ff-only FETCH_HEAD 2>&1
    if ($LASTEXITCODE -ne 0) { Refuse 'Git fast-forward failed' }
}
$head = GitText -Words @('rev-parse','HEAD')
if ($head -cnotmatch '^[0-9a-f]{40}$') { Refuse 'Cannot pin checkout' }
if ($ExpectedCommit -and $head -cne $ExpectedCommit) {
    Refuse 'Source changed since pinned Check; do not apply'
}
$script = Join-Path $checkout 'candidates\uce\full_product_lab.py'
if (-not (Test-Path -LiteralPath $script -PathType Leaf)) {
    Refuse 'Missing Git-tracked integrated product installer'
}
$modes=@{
    Plan='plan';CheckStage='check-stage';Stage='stage'
    CheckBind='check-bind';Bind='bind'
    CheckInstall='check-install';Install='install'
    CheckRollback='check-rollback';Rollback='rollback'
    CheckRestore='check-restore';Restore='restore'
}
$argsPy=@($script,'--mode',$modes[$Mode],'--commit',$head)
if ($writes -contains $Mode) { $argsPy+='--apply' }
if ($rollback -contains $Mode) { $argsPy+=@('--backup-tag',$BackupTag) }
Write-Output ('Pinned Git source: '+$head)
Write-Output ('Source workspace: '+$checkout)
Write-Output 'LAB ONLY: C:\Servers\Thomas_MCBedrock - Copy (2)'
& $pyName @pyArgs @argsPy
if ($LASTEXITCODE -ne 0) { Refuse ('Source gate failed: '+$LASTEXITCODE) }
