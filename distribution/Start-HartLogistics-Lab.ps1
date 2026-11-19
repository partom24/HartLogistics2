<#
.SYNOPSIS
  Stable HartLogistics Git-checkout LAB operator entrypoint.
.DESCRIPTION
  Pull the approved development branch using 'git pull --ff-only', then run
  this tracked file. No separate .ps1 download or client pack extraction.
  Plan (source only), CheckLab (read-only stopped LAB), Install and Rollback
  delegate to the exact versioned, hash-guarded PowerShell/Python updater.
  This file NEVER copies packs, edits worlds or touches production itself.
  A Git pull is NOT a Minecraft installation.
.EXAMPLE
  & .\distribution\Start-HartLogistics-Lab.ps1 -Mode Plan
.EXAMPLE
  & .\distribution\Start-HartLogistics-Lab.ps1 -Mode CheckLab -ExpectedCommit <40-char SHA>
.EXAMPLE
  & .\distribution\Start-HartLogistics-Lab.ps1 -Mode Install -Apply -ExpectedCommit <40-char SHA>
.EXAMPLE
  & .\distribution\Start-HartLogistics-Lab.ps1 -Mode Rollback -BackupTag lab-1234567890ab -Apply -ExpectedCommit <installed-candidate SHA>
#>
[CmdletBinding()]
param(
    [ValidateSet('Plan','CheckLab','Install','Rollback')]
    [string]$Mode = 'Plan',
    [switch]$Apply,
    [string]$ExpectedCommit = '',
    [string]$BackupTag = '',
    [ValidateSet('1.5.1','1.5.2','1.5.3')]
    [string]$CandidateVersion = '1.5.3'
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Refuse([string]$Reason) {
    throw ('REFUSED HartLogistics Git LAB operator: ' + $Reason)
}
if ($env:OS -cne 'Windows_NT') { Refuse 'Windows operator only' }
if ($Mode -in @('Install','Rollback') -and -not $Apply) {
    Refuse 'Install/Rollback require -Apply'
}
if ($Apply -and $Mode -notin @('Install','Rollback')) {
    Refuse '-Apply is forbidden for Plan/CheckLab'
}
if ($Mode -eq 'Rollback' -and $BackupTag -cnotmatch '^lab-[0-9a-f]{12}$') {
    Refuse 'Rollback requires an exact lab-<12 lowercase hex> backup tag'
}
if ($Mode -ne 'Rollback' -and $BackupTag) {
    Refuse '-BackupTag is valid only for Rollback'
}
if ($ExpectedCommit -and $ExpectedCommit -cnotmatch '^[0-9a-f]{40}$') {
    Refuse '-ExpectedCommit must be the exact 40-character lowercase commit'
}
if ($Mode -ne 'Plan' -and -not $ExpectedCommit) {
    Refuse 'CheckLab/Install/Rollback require -ExpectedCommit'
}
if (-not (Get-Command git.exe -ErrorAction SilentlyContinue)) {
    Refuse 'Git for Windows required'
}

# The candidate registry is deliberately narrow. Do not run names/paths
# supplied by a manifest or the user. Preserve old versioned launchers
# in Git for explicit rollback of earlier installed candidates.
$approvedLaunchers = @{
    '1.5.1' = 'Start-HartLogistics-151Lab.ps1'
    '1.5.2' = 'Start-HartLogistics-152Lab.ps1'
    '1.5.3' = 'Start-HartLogistics-153Lab.ps1'
}
$approvedBranch = 'dev/urce-150-runtime-20261118'
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if ($repoRoot -match '^[A-Za-z]:\\Servers(\\|$)') {
    Refuse 'Updater source must not be inside a Minecraft server'
}

# Reject Git worktrees/paths redirected by junctions or symlinks.
$current = $repoRoot
while ($true) {
    if (Test-Path -LiteralPath $current) {
        $info = Get-Item -LiteralPath $current -Force
        if (($info.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
            Refuse ('Symlink or junction in Git source: ' + $current)
        }
    }
    $parent = [IO.Directory]::GetParent($current)
    if ($null -eq $parent) { break }
    $current = $parent.FullName
}
function GitText([string[]]$Words) {
    $output = & git.exe -C $repoRoot @Words 2>&1
    if ($LASTEXITCODE -ne 0) {
        Refuse ('Git source check failed: ' + ($Words -join ' '))
    }
    return (($output | Out-String).Trim())
}
$gitRoot = GitText -Words @('rev-parse','--show-toplevel')
if ([IO.Path]::GetFullPath($gitRoot).TrimEnd('\','/') -ine $repoRoot.TrimEnd('\','/')) {
    Refuse 'Run the launcher from its own repository checkout'
}
$origin = GitText -Words @('remote','get-url','origin')
if ($origin -notmatch '^(?:https://github\.com/|git@github\.com:|ssh://git@github\.com/)partom24/HartLogistics2(?:\.git)?/?$') {
    Refuse 'Git origin is not the approved HartLogistics2 repository'
}
if ((GitText -Words @('branch','--show-current')) -cne $approvedBranch) {
    Refuse ('Checkout the approved development branch: ' + $approvedBranch)
}
if (GitText -Words @('status','--porcelain','--untracked-files=all')) {
    Refuse 'Git checkout must be clean before running the updater'
}
$localHead = GitText -Words @('rev-parse','HEAD')
if ($localHead -cnotmatch '^[0-9a-f]{40}$') { Refuse 'Unable to pin local source' }
# Only deliberate rollback may use an older approved installed candidate SHA.
# All other modes must match the user's freshly pulled local checkout.
if ($Mode -ne 'Rollback' -and $ExpectedCommit -and $ExpectedCommit -cne $localHead) {
    Refuse 'Local checkout differs from -ExpectedCommit; do not install stale source'
}
$pin = if ($ExpectedCommit) { $ExpectedCommit } else { $localHead }
$scriptName = $approvedLaunchers[$CandidateVersion]
if (-not $scriptName) { Refuse 'Candidate version not supported by this checkout' }
$versioned = Join-Path $PSScriptRoot $scriptName
if (-not (Test-Path -LiteralPath $versioned -PathType Leaf)) {
    Refuse ('Missing Git-tracked version-specific installer: ' + $scriptName)
}

Write-Output ('Git-managed HartLogistics LAB launcher | candidate ' + $CandidateVersion)
Write-Output ('Source checkout: ' + $repoRoot)
Write-Output ('Source SHA: ' + $localHead)
Write-Output 'Git update changes SOURCE ONLY. LAB changes require explicit -Mode Install -Apply.'
$dispatch = @{ Mode = $Mode; ExpectedCommit = $pin }
if ($Apply) { $dispatch['Apply'] = $true }
if ($Mode -eq 'Rollback') { $dispatch['BackupTag'] = $BackupTag }
& $versioned @dispatch
if ($LASTEXITCODE -ne 0) {
    Refuse ('Version-specific updater failed or refused (exit ' + $LASTEXITCODE + ')')
}
