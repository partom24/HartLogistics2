#requires -Version 5.1
[CmdletBinding()]
param(
    [ValidateSet('Plan','CheckLab','Install')][string]$Mode='Plan',
    [switch]$Apply
)
$ErrorActionPreference='Stop'
$pin='6f70c263bb58d89e6277f485f4bb3c7ee96a389c'
if ($Apply -and $Mode -ne 'Install') { throw '-Apply requires Install mode.' }
if ($Mode -eq 'Install' -and !$Apply) { throw 'Install requires explicit -Apply.' }
Write-Output "Q4 storage-only LAB candidate $pin"
if ($Mode -eq 'Plan') {
    Write-Output 'Target C:\Servers\Thomas_MCBedrock - Copy (2)'
    Write-Output 'CheckLab previews the target. Install -Apply prompts, backs up the packs, stages the candidate, and starts copied LAB BDS.'
    return
}
$stage=Join-Path ([IO.Path]::GetTempPath()) ('HartQ4Storage-' + [guid]::NewGuid().ToString('N'))
& git init --quiet "$stage"
if ($LASTEXITCODE -ne 0) { throw 'Could not initialize the staging checkout.' }
& git -C "$stage" fetch --quiet --depth=1 https://github.com/partom24/HartLogistics2.git $pin
if ($LASTEXITCODE -ne 0) { throw 'Could not fetch the pinned candidate. Use the Git credentials for HartLogistics2.' }
& git -C "$stage" checkout --quiet --detach FETCH_HEAD
if ($LASTEXITCODE -ne 0) { throw 'Could not check out the pinned candidate.' }
$actual=& git -C "$stage" rev-parse HEAD
if ($LASTEXITCODE -ne 0 -or $actual -cne $pin) { throw 'Candidate revision mismatch.' }
$installer=Join-Path $stage 'scripts\Start-HartMigrationAcceptance.ps1'
if (!(Test-Path -LiteralPath $installer -PathType Leaf)) { throw 'Pinned LAB installer missing.' }
& $installer -Apply:($Mode -eq 'Install')
