<#
.SYNOPSIS
  Two-command, fresh-world HartLogistics2 FREEFORM LAB test.
.DESCRIPTION
  Prepare selects a brand-new world. Start/stop LAB BDS once to generate it.
  Finish attaches HL2 packs to that fresh world and updates the product.
  No old LAB worlds, historical backups or other Minecraft mods needed.
  Plan is source-only. No BDS start/restart or world deletion is performed.
#>
[CmdletBinding()]
param(
    [ValidateSet('Plan','Prepare','Finish')]
    [string]$Mode = 'Plan',
    [string]$ExpectedCommit = ''
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
function Refuse([string]$Reason) { throw ('REFUSED HL2 freeform LAB: ' + $Reason) }
if ($env:OS -cne 'Windows_NT') { Refuse 'Windows LAB only' }
if ($ExpectedCommit -cnotmatch '^[0-9a-f]{40}$') {
    Refuse 'An exact pinned 40-character Git commit is required'
}
if (-not (Get-Command git.exe -ErrorAction SilentlyContinue)) {
    Refuse 'Git for Windows is required'
}
$python=Get-Command python.exe -ErrorAction SilentlyContinue
$pyArgs=@()
if (-not $python) {
    $python=Get-Command py.exe -ErrorAction SilentlyContinue
    $pyArgs=@('-3')
}
if (-not $python) { Refuse 'Python 3.11+ is required' }
$pyName=$python.Source
$version=& $pyName @pyArgs -c 'import sys;print(str(sys.version_info.major)+chr(46)+str(sys.version_info.minor))'
if ($LASTEXITCODE -ne 0 -or $version -notmatch '^3\.[0-9]+$' -or
    [version]($version+'.0') -lt [version]'3.11.0') {
    Refuse 'Python 3.11+ is required'
}
if (-not $env:LOCALAPPDATA) { Refuse 'LOCALAPPDATA missing' }
$branch='dev/uce-shared-ordinary-ledger-20261111'
$checkout=[IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'HartLogistics2-FullProduct-LAB'))
if ($checkout -match '^[A-Za-z]:\\Servers(\\|$)') {
    Refuse 'Never checkout development source under a server directory'
}
function Assert-Unlinked([string]$Path) {
    $current=[IO.Path]::GetFullPath($Path)
    while ($true) {
        if (Test-Path -LiteralPath $current) {
            $item=Get-Item -LiteralPath $current -Force
            if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
                Refuse ('Junction/symlink in source path: ' + $current)
            }
        }
        $parent=[IO.Directory]::GetParent($current)
        if ($null -eq $parent) { break }
        $current=$parent.FullName
    }
}
Assert-Unlinked $checkout
if (-not (Test-Path -LiteralPath $checkout)) {
    $clone=& git.exe clone --quiet --single-branch --branch $branch 'https://github.com/partom24/HartLogistics2.git' $checkout 2>&1
    if ($LASTEXITCODE -ne 0) { Refuse 'Cloning the pinned HL2 source failed' }
}
Assert-Unlinked $checkout
function GitText([string[]]$Words) {
    $result=& git.exe -C $checkout @Words 2>&1
    if ($LASTEXITCODE -ne 0) { Refuse ('Git failed: '+($Words -join ' ')) }
    return (($result | Out-String).Trim())
}
$origin=GitText -Words @('remote','get-url','origin')
if ($origin -notmatch '^(?:https://github\.com/|git@github\.com:|ssh://git@github\.com/)partom24/HartLogistics2(?:\.git)?/?$') {
    Refuse 'Unexpected Git remote'
}
if ((GitText -Words @('branch','--show-current')) -cne $branch) {
    Refuse 'The dedicated HL2 development branch is required'
}
if (GitText -Words @('status','--porcelain','--untracked-files=all')) {
    Refuse 'Development checkout has local changes'
}
$fetch=& git.exe -C $checkout fetch --quiet --no-tags origin $branch 2>&1
if ($LASTEXITCODE -ne 0) { Refuse 'Source fetch failed' }
$merge=& git.exe -C $checkout merge --quiet --ff-only FETCH_HEAD 2>&1
if ($LASTEXITCODE -ne 0) { Refuse 'Pinned source cannot fast-forward' }
$head=GitText -Words @('rev-parse','HEAD')
if ($head -cne $ExpectedCommit) {
    Refuse 'Source is not the exact reviewed commit; no LAB change made'
}
$script=Join-Path $checkout 'candidates\uce\freeform_lab.py'
if (-not (Test-Path -LiteralPath $script -PathType Leaf)) {
    Refuse 'Fresh-world HL2 launcher source missing'
}
$modes=@{ Plan='plan'; Prepare='prepare'; Finish='finish' }
$arguments=@($script,'--mode',$modes[$Mode],'--commit',$head)
if ($Mode -ne 'Plan') { $arguments+='--apply' }
Write-Output ('Pinned HL2 source: '+$head)
Write-Output 'Authorized target: LAB Bedrock server only'
& $pyName @pyArgs @arguments
if ($LASTEXITCODE -ne 0) { Refuse 'Fresh-world operation refused; LAB unchanged or safely held' }
