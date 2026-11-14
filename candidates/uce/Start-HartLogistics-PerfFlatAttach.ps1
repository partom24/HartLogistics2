<#
.SYNOPSIS
  Guarded attach/rollback of HL2 1.5.16 onto ALREADY-GENERATED
  HartLogistics15PerfFlat LAB world, not the restored 1.4.1 world.
.DESCRIPTION
  Verify exact Git SHA, exact original 1.4.1 BP/RP, flat-world stage
  SHA receipt, empty pack registrations, stopped LAB server; transactional
  pack backup. No LevelDB writes, no production, no BDS restart.
#>
[CmdletBinding()]
param(
  [ValidateSet('Check','Install','CheckRollback','Rollback')]
  [string]$Mode='Check',
  [switch]$Apply,
  [string]$ExpectedCommit='',
  [string]$BackupTag=''
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
function Refuse([string]$message){throw ('HL2 PERF FLAT REFUSED: '+$message)}
if($env:OS -cne 'Windows_NT'){Refuse 'Windows LAB only'}
if($ExpectedCommit -cnotmatch '^[a-f0-9]{40}$'){Refuse 'Exact Git SHA required'}
if(($Mode -in @('Install','Rollback')) -ne [bool]$Apply){Refuse 'Apply must match write mode'}
if(($Mode -in @('Rollback','CheckRollback')) -and $BackupTag -cnotmatch '^lab-[a-f0-9]{12}$'){
  Refuse 'Exact rollback backup tag required'
}
if(($Mode -in @('Install','Check')) -and $BackupTag){Refuse 'Unexpected backup tag'}
if(-not (Get-Command git.exe -ErrorAction SilentlyContinue)){Refuse 'Git for Windows missing'}
$python=Get-Command python.exe -ErrorAction SilentlyContinue
$pyArgs=@()
if(-not $python){$python=Get-Command py.exe -ErrorAction SilentlyContinue;$pyArgs=@('-3')}
if(-not $python){Refuse 'Python 3.11+ required'}
$pyName=$python.Source
$version=& $pyName @pyArgs -c 'import sys;print(str(sys.version_info.major)+chr(46)+str(sys.version_info.minor))'
if($LASTEXITCODE -ne 0 -or [version]($version+'.0') -lt [version]'3.11.0'){
  Refuse 'Python 3.11+ required'
}
if(-not $env:LOCALAPPDATA){Refuse 'LOCALAPPDATA missing'}
$branch='dev/uce-shared-ordinary-ledger-20261111'
$checkout=[IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'HartLogistics2-PerfFlat-LAB'))
if($checkout -match '^[a-zA-Z]:\\Servers(\\|$)'){Refuse 'Checkout inside server root prohibited'}
function Unlinked([string]$name){
  $path=[IO.Path]::GetFullPath($name)
  while($true){
    if(Test-Path -LiteralPath $path){
      $item=Get-Item -LiteralPath $path -Force
      if(($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0){
        Refuse ('Reparse path: '+$path)
      }
    }
    $p=[IO.Directory]::GetParent($path)
    if($null -eq $p){break}
    $path=$p.FullName
  }
}
Unlinked $checkout
if(-not (Test-Path -LiteralPath $checkout -PathType Container)){
  if($Mode -in @('Rollback','CheckRollback')){
    Refuse 'Rollback needs exact existing pinned source checkout'
  }
  & git.exe clone --quiet --single-branch --branch $branch 'https://github.com/partom24/HartLogistics2.git' $checkout
  if($LASTEXITCODE -ne 0){Refuse 'Exact Git checkout failed'}
}
Unlinked $checkout
function GitText([string[]]$words){
  $result=& git.exe -C $checkout @words 2>&1
  if($LASTEXITCODE -ne 0){Refuse ('Git command failed: '+($words -join ' '))}
  return (($result|Out-String).Trim())
}
$origin=GitText -words @('remote','get-url','origin')
if($origin -notmatch '^(?:https://github\.com/|git@github\.com:|ssh://git@github\.com/)partom24/HartLogistics2(?:\.git)?/?$'){
  Refuse 'Unexpected source Git origin'
}
if((GitText -words @('branch','--show-current')) -cne $branch){
  Refuse 'Unexpected source branch'
}
if(GitText -words @('status','--porcelain','--untracked-files=all')){
  Refuse 'Source checkout modified'
}
if($Mode -in @('Check','Install')){
  & git.exe -C $checkout fetch --quiet --no-tags origin $branch
  if($LASTEXITCODE -ne 0){Refuse 'Git fetch failed'}
  & git.exe -C $checkout merge --quiet --ff-only FETCH_HEAD
  if($LASTEXITCODE -ne 0){Refuse 'Fast-forward failed'}
}
$head=GitText -words @('rev-parse','HEAD')
if($head -cne $ExpectedCommit){Refuse ('Expected '+$ExpectedCommit+' but checkout is '+$head)}
$script=Join-Path $checkout 'candidates\uce\perf_flat_attach.py'
if(-not (Test-Path -LiteralPath $script -PathType Leaf)){Refuse 'Missing vetted LAB attachment script'}
$pyMode=@{Check='check';Install='install';CheckRollback='check-rollback';Rollback='rollback'}[$Mode]
$argsPy=@($script,'--mode',$pyMode,'--commit',$head)
if($Apply){$argsPy+='--apply'}
if($BackupTag){$argsPy+=@('--backup-tag',$BackupTag)}
Write-Host 'Pinned Git source:' $head
Write-Host 'Authorized LAB ONLY: C:\Servers\Thomas_MCBedrock - Copy (2)'
Write-Host 'Selected world: HartLogistics15PerfFlat'
& $pyName @pyArgs @argsPy
if($LASTEXITCODE -ne 0){Refuse ('Exact stopped-LAB preflight failed: '+$LASTEXITCODE)}
