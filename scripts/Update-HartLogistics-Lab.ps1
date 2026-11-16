<#
.SYNOPSIS
    Fetch and pin the source-only Hart Logistics 1.4.1 Phase A candidate,
    then delegate the ONLY LAB install operation to the guarded Python updater.
.DESCRIPTION
    Source-only: updates a clean HartLogistics2 Git checkout to the exact
    permitted candidate commit without opening any Bedrock server path.
    Default: performs that source sync, then read-only Windows LAB preflight.
    -Apply -BackupConfirmed: performs the canonical LAB-only pack update.
    Never targets or modifies production. Does not start, stop, or restart BDS.
.EXAMPLE
    .\scripts\Update-HartLogistics-Lab.ps1 -Commit <full40characterSHA>
.EXAMPLE
    .\scripts\Update-HartLogistics-Lab.ps1 -Commit <full40characterSHA> -Apply -BackupConfirmed
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[a-fA-F0-9]{40}$')]
    [string]$Commit,
    [switch]$SourceOnly,
    [switch]$Apply,
    [switch]$BackupConfirmed
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ($env:OS -ne 'Windows_NT') {
    throw 'This launcher is Windows-only. Use the Python offline source checks on other platforms.'
}
if ($SourceOnly -and $Apply) {
    throw 'REFUSED: -SourceOnly and -Apply are mutually exclusive.'
}
if ($Apply -and -not $BackupConfirmed) {
    throw 'REFUSED: -Apply requires -BackupConfirmed (a separate, stopped-LAB world backup).'
}
if ($BackupConfirmed -and -not $Apply) {
    throw 'REFUSED: -BackupConfirmed is only valid with -Apply.'
}

$Branch = 'implementation/native-first-engine-141-20261115'
$ExpectedOrigin = '^(https://github[.]com/|git@github[.]com:|ssh://git@github[.]com/)partom24/HartLogistics2([.]git)?/?$'
$RepoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$GitExe = (Get-Command git -ErrorAction Stop).Source

function Invoke-PinnedGit {
    param([string[]]$GitArguments)
    $output = & $script:GitExe -C $script:RepoRoot @GitArguments
    if ($LASTEXITCODE -ne 0) {
        throw ('REFUSED: Git command failed (exit {0}): {1}' -f $LASTEXITCODE, ($GitArguments -join ' '))
    }
    return $output
}

$actualRoot = (Invoke-PinnedGit -GitArguments @('rev-parse', '--show-toplevel') | Out-String).Trim()
if (-not [string]::Equals(
        [System.IO.Path]::GetFullPath($actualRoot).TrimEnd('\'),
        $RepoRoot.TrimEnd('\'),
        [StringComparison]::OrdinalIgnoreCase)) {
    throw 'REFUSED: The script does not belong to the selected Git checkout root.'
}
$origin = (Invoke-PinnedGit -GitArguments @('remote', 'get-url', 'origin') | Out-String).Trim()
if ($origin -notmatch $ExpectedOrigin) {
    throw ('REFUSED: unexpected Git origin: {0}' -f $origin)
}
$dirty = (Invoke-PinnedGit -GitArguments @('status', '--porcelain=v1', '--untracked-files=all') | Out-String).Trim()
if ($dirty) {
    throw 'REFUSED: checkout contains local changes or untracked files; back them up or resolve them first.'
}

# Only this exact HartLogistics2 implementation ref is fetched. A branch
# moving ahead does not automatically select an unverified newer commit.
$tracking = 'refs/remotes/origin/' + $Branch
$refspec = '+refs/heads/' + $Branch + ':' + $tracking
Invoke-PinnedGit -GitArguments @('fetch', '--quiet', '--no-tags', '--prune', 'origin', $refspec) | Out-Null
$resolved = (Invoke-PinnedGit -GitArguments @('rev-parse', ($Commit + '^{commit}')) | Out-String).Trim()
$Commit = $Commit.ToLowerInvariant()
if ($resolved -cne $Commit) {
    throw 'REFUSED: pinned Git SHA is not an exact commit object.'
}
Invoke-PinnedGit -GitArguments @('merge-base', '--is-ancestor', $Commit, $tracking) | Out-Null

$before = (Invoke-PinnedGit -GitArguments @('rev-parse', 'HEAD') | Out-String).Trim()
if ($before -cne $Commit) {
    Invoke-PinnedGit -GitArguments @('checkout', '--quiet', '--detach', $Commit) | Out-Null
}
$after = (Invoke-PinnedGit -GitArguments @('rev-parse', 'HEAD') | Out-String).Trim()
$dirty = (Invoke-PinnedGit -GitArguments @('status', '--porcelain=v1', '--untracked-files=all') | Out-String).Trim()
if ($after -cne $Commit -or $dirty) {
    throw 'REFUSED: source checkout did not reach the exact clean pinned commit.'
}
Write-Host ('Git source pinned to {0}' -f $Commit)

if ($SourceOnly) {
    Write-Host 'SOURCE ONLY: no Minecraft LAB or production server path was read or changed.'
    return
}

# No installation logic is duplicated here. The canonical Python updater
# enforces exact LAB path, clean source, known 1.4.1 installed packs/registries,
# stopped BDS, staged hashes, backups and rollback.
$Updater = Join-Path $RepoRoot 'scripts\hartlogistics_lab_updater.py'
if (-not (Test-Path -LiteralPath $Updater -PathType Leaf)) {
    throw 'REFUSED: canonical LAB updater is missing from the pinned commit.'
}
$pyLauncher = Get-Command py -ErrorAction SilentlyContinue
if ($null -ne $pyLauncher) {
    $pythonExe = $pyLauncher.Source
    $pythonArgs = @('-3', $Updater, '--commit', $Commit)
} else {
    $python = Get-Command python -ErrorAction Stop
    $pythonExe = $python.Source
    $pythonArgs = @($Updater, '--commit', $Commit)
}
if ($Apply) {
    $pythonArgs += '--apply'
    Write-Host 'Explicit LAB apply selected. Production remains forbidden.'
} else {
    Write-Host 'Guarded LAB preflight only. No BDS files will be written.'
}
& $pythonExe @pythonArgs
if ($LASTEXITCODE -ne 0) {
    throw ('REFUSED: guarded LAB updater exited with code {0}. Do not manually copy packs.' -f $LASTEXITCODE)
}
