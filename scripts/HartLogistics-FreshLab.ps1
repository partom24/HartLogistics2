#requires -Version 5.1
<#
Git-managed source updater and LAB-only installer for HartLogistics Fresh LAB.
Update changes SOURCE ONLY. Install never fetches or changes the source checkout.
For the first installation, bootstrap the fresh-lab Git branch with Bootstrap-FreshLabGit.ps1.
#>
[CmdletBinding()]
param(
    [ValidateSet('Status', 'Update', 'Install')]
    [string]$Mode = 'Status',
    [string]$Commit,
    [switch]$Apply
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'PackJson.ps1')
$source = Split-Path -Parent $PSScriptRoot
$serverRoot = 'C:\Servers\Thomas_MCBedrock - Copy (2)'
$worldName = 'LabWorld'
$remoteUrl = 'https://github.com/partom24/HartLogistics2.git'
$branch = 'fresh-lab'
$bpId = 'f450bff5-6b68-42e5-a07d-616f87c01918'
$rpId = '39f2d6c6-9b79-4754-a2e2-fd27c1ec1d63'
$bpDir = 'HartLogistics_Fresh_LAB_BP'
$rpDir = 'HartLogistics_Fresh_LAB_RP'

function Assert-That([bool]$condition, [string]$message) {
    if (-not $condition) { throw $message }
}
function Run-Git([string[]]$argList) {
    # Windows PowerShell 5.1 treats redirected native stderr as a terminating
    # NativeCommandError under Stop, even when git exits successfully.
    # Capture git's diagnostic output without masking a nonzero exit code.
    $previousPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $result = & git -C $source @argList 2>&1
        $gitExitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previousPreference
    }
    if ($gitExitCode -ne 0) {
        throw ('Git command failed: git ' + ($argList -join ' ') + "`n" + ($result -join "`n"))
    }
    return @($result)
}
function Get-GitOne([string[]]$argList) {
    $lines = @(Run-Git $argList)
    return ($lines -join "`n").Trim()
}
function Assert-CleanSource {
    $dirty = @(Run-Git @('status', '--porcelain=v1', '--untracked-files=all'))
    Assert-That (($dirty -join '').Trim().Length -eq 0) 'Source has local changes. Commit or revert them before an update or LAB install.'
}
function Assert-GitIdentity {
    Assert-That (Test-Path -LiteralPath (Join-Path $source '.git')) 'Not a Git checkout; run the one-time bootstrap first.'
    $root = Get-GitOne @('rev-parse','--show-toplevel')
    Assert-That ([System.IO.Path]::GetFullPath($root).TrimEnd('\') -ieq [System.IO.Path]::GetFullPath($source).TrimEnd('\')) 'Unexpected Git worktree root.'
    $remote = Get-GitOne @('remote','get-url','origin')
    $remoteNorm = $remote.TrimEnd('/')
    if ($remoteNorm.EndsWith('.git')) { $remoteNorm = $remoteNorm.Substring(0, $remoteNorm.Length - 4) }
    $expectedNorm = $remoteUrl.TrimEnd('/')
    if ($expectedNorm.EndsWith('.git')) { $expectedNorm = $expectedNorm.Substring(0, $expectedNorm.Length - 4) }
    Assert-That ($remoteNorm -ieq $expectedNorm) ("Wrong Git remote: $remote")
    $current = Get-GitOne @('symbolic-ref', '--quiet', '--short', 'HEAD')
    Assert-That ($current -ceq $branch) ("Wrong branch: $current; expected $branch")
}
function Read-Pack([string]$packPath,[string]$uuid) {
    $file = Join-Path $packPath 'manifest.json'
    Assert-That (Test-Path -LiteralPath $file -PathType Leaf) "Missing manifest: $file"
    $p = ConvertFrom-PackJson ([IO.File]::ReadAllText($file))
    Assert-That ($p.header.uuid -eq $uuid) "Unexpected pack identity in $file"
    Assert-That ($p.header.version.Count -eq 3) "Invalid pack version in $file"
    return $p
}
function Check-SourcePacks {
    $script:srcBP = Join-Path $source 'behavior_pack'
    $script:srcRP = Join-Path $source 'resource_pack'
    $b = Read-Pack $script:srcBP $bpId
    $r = Read-Pack $script:srcRP $rpId
    $script:packVersion = @([int]$b.header.version[0], [int]$b.header.version[1], [int]$b.header.version[2])
    Assert-That (($packVersion -join '.') -eq ($r.header.version -join '.')) 'BP/RP versions disagree.'
    # Both Bedrock script modules (module_name) and pack refs (uuid) appear here.
    # StrictMode forbids reading a missing uuid, so filter by property existence first.
    $rpDep = @($b.dependencies | Where-Object { $_.PSObject.Properties.Name -contains 'uuid' -and $_.uuid -eq $rpId })
    Assert-That ($rpDep.Count -eq 1) 'BP must depend on the matching Fresh LAB RP.'
    Assert-That (($rpDep[0].version -join '.') -eq ($packVersion -join '.')) 'BP/RP dependency versions disagree.'
    Assert-That (Test-Path -LiteralPath (Join-Path $script:srcBP 'scripts\main.js') -PathType Leaf) 'Missing routing source.'
}
function Check-WorldTarget {
    # Intentional fixed boundary: this launcher never accepts a production world or server path.
    $script:worldDir = Join-Path $serverRoot ('worlds\' + $worldName)
    $script:bpDest = Join-Path $serverRoot ('behavior_packs\' + $bpDir)
    $script:rpDest = Join-Path $serverRoot ('resource_packs\' + $rpDir)
    $script:bpReg = Join-Path $worldDir 'world_behavior_packs.json'
    $script:rpReg = Join-Path $worldDir 'world_resource_packs.json'
    $props = Join-Path $serverRoot 'server.properties'
    Assert-That (Test-Path -LiteralPath $props -PathType Leaf) "Missing LAB server.properties: $props"
    Assert-That (Test-Path -LiteralPath $worldDir -PathType Container) "LAB world missing: $worldDir"
    $match = Select-String -LiteralPath $props -Pattern '^\s*level-name\s*=\s*LabWorld\s*$' -Quiet
    Assert-That $match 'LAB server.properties must set level-name=LabWorld.'
    foreach ($pair in @(@($bpDest,$bpId), @($rpDest,$rpId))) {
        $dest = [string]$pair[0]
        if (Test-Path -LiteralPath $dest) { [void](Read-Pack $dest ([string]$pair[1])) }
    }
}
function Assert-LabStopped {
    # Check executable identity, not "any BDS is running". Production may remain online.
    try { $processes = @(Get-CimInstance Win32_Process -Filter "Name = 'bedrock_server.exe'") }
    catch { throw "Cannot query running BDS processes; refusing deployment: $_" }
    $labExe = [System.IO.Path]::GetFullPath((Join-Path $serverRoot 'bedrock_server.exe')).TrimEnd('\')
    foreach ($p in $processes) {
        if (-not $p.ExecutablePath) { throw "Cannot identify bedrock_server.exe PID $($p.ProcessId); refusing deployment rather than risk a running LAB." }
        $exe = [System.IO.Path]::GetFullPath($p.ExecutablePath).TrimEnd('\')
        if ($exe -ieq $labExe) { throw "LAB BDS is still running (PID $($p.ProcessId)); stop only LAB before -Apply." }
    }
}
function Write-Registry([string]$registry,[string]$uuid,[int[]]$version) {
    $text = if (Test-Path -LiteralPath $registry) { [IO.File]::ReadAllText($registry) } else { '[]' }
    $out = Set-PackRegistryVersion $text $uuid $version
    if ($out -ceq $text) { return }
    $tmp = $registry + '.stage-' + [guid]::NewGuid().ToString('N')
    [System.IO.File]::WriteAllText($tmp, $out, (New-Object System.Text.UTF8Encoding($false)))
    Move-Item -LiteralPath $tmp -Destination $registry -Force
}
function Install-Packs([string]$sha) {
    Assert-LabStopped
    $bkRoot = Join-Path $serverRoot '_HartLogisticsFreshLabBackups'
    $bk = Join-Path $bkRoot ('git-' + $sha.Substring(0,12) + '-' + (Get-Date -Format 'yyyyMMdd-HHmmss-fff'))
    $bpStage = $bpDest + '.stage-' + [guid]::NewGuid().ToString('N')
    $rpStage = $rpDest + '.stage-' + [guid]::NewGuid().ToString('N')
    $bpBackup = Join-Path $bk 'previous_behavior_pack'
    $rpBackup = Join-Path $bk 'previous_resource_pack'
    $oldBpExisted = Test-Path -LiteralPath $bpDest
    $oldRpExisted = Test-Path -LiteralPath $rpDest
    $oldBpReg = Test-Path -LiteralPath $bpReg
    $oldRpReg = Test-Path -LiteralPath $rpReg
    $bpWasMoved = $false; $rpWasMoved = $false
    $bpInstalled = $false; $rpInstalled = $false
    New-Item -ItemType Directory -Path $bk -Force | Out-Null
    try {
        if ($oldBpReg) { Copy-Item -LiteralPath $bpReg -Destination (Join-Path $bk 'world_behavior_packs.json') }
        if ($oldRpReg) { Copy-Item -LiteralPath $rpReg -Destination (Join-Path $bk 'world_resource_packs.json') }
        [System.IO.File]::WriteAllText((Join-Path $bk 'source-sha.txt'), $sha + "`r`n", (New-Object System.Text.UTF8Encoding($false)))
        Copy-Item -LiteralPath $srcBP -Destination $bpStage -Recurse
        Copy-Item -LiteralPath $srcRP -Destination $rpStage -Recurse
        [void](Read-Pack $bpStage $bpId)
        [void](Read-Pack $rpStage $rpId)
        if ($oldBpExisted) { Move-Item -LiteralPath $bpDest -Destination $bpBackup; $bpWasMoved = $true }
        if ($oldRpExisted) { Move-Item -LiteralPath $rpDest -Destination $rpBackup; $rpWasMoved = $true }
        Move-Item -LiteralPath $bpStage -Destination $bpDest; $bpInstalled = $true
        Move-Item -LiteralPath $rpStage -Destination $rpDest; $rpInstalled = $true
        Write-Registry $bpReg $bpId $packVersion
        Write-Registry $rpReg $rpId $packVersion
        Write-Host "PASS: Fresh LAB $($packVersion -join '.') installed from Git SHA $sha" -ForegroundColor Green
        Write-Host "Backup: $bk"
    } catch {
        $originalError = $_
        Write-Warning "Deploy failed. Attempting to restore prior LAB packs/registries: $originalError"
        try {
            if ($bpInstalled -and (Test-Path -LiteralPath $bpDest)) { Remove-Item -LiteralPath $bpDest -Recurse -Force }
            if ($rpInstalled -and (Test-Path -LiteralPath $rpDest)) { Remove-Item -LiteralPath $rpDest -Recurse -Force }
            if ($bpWasMoved -and (Test-Path -LiteralPath $bpBackup)) { Move-Item -LiteralPath $bpBackup -Destination $bpDest }
            if ($rpWasMoved -and (Test-Path -LiteralPath $rpBackup)) { Move-Item -LiteralPath $rpBackup -Destination $rpDest }
            if ($oldBpReg) { Copy-Item -LiteralPath (Join-Path $bk 'world_behavior_packs.json') -Destination $bpReg -Force }
            elseif (Test-Path -LiteralPath $bpReg) { Remove-Item -LiteralPath $bpReg -Force }
            if ($oldRpReg) { Copy-Item -LiteralPath (Join-Path $bk 'world_resource_packs.json') -Destination $rpReg -Force }
            elseif (Test-Path -LiteralPath $rpReg) { Remove-Item -LiteralPath $rpReg -Force }
        } catch { Write-Warning "Automatic rollback also encountered an error: $_; inspect $bk before starting LAB." }
        throw $originalError
    } finally {
        if (Test-Path -LiteralPath $bpStage) { Remove-Item -LiteralPath $bpStage -Recurse -Force }
        if (Test-Path -LiteralPath $rpStage) { Remove-Item -LiteralPath $rpStage -Recurse -Force }
    }
}

if ($Apply -and $Mode -ne 'Install') { throw '-Apply is only valid with -Mode Install.' }
Get-Command git -ErrorAction Stop | Out-Null
Assert-GitIdentity
Assert-CleanSource
$head = Get-GitOne @('rev-parse','--verify','HEAD')
Assert-That ($head -match '^[0-9a-f]{40}$') 'Invalid HEAD SHA.'

if ($Mode -eq 'Update') {
    # Fetch the designated branch; do not merge any unrelated branches or deploy packs.
    [void](Run-Git @('fetch','--no-tags','origin',('refs/heads/' + $branch + ':refs/remotes/origin/' + $branch)))
    [void](Run-Git @('merge','--ff-only',('refs/remotes/origin/' + $branch)))
    $head = Get-GitOne @('rev-parse','--verify','HEAD')
    Write-Host 'SOURCE UPDATED. No Minecraft server or world files were changed.' -ForegroundColor Green
}

Check-SourcePacks
Write-Host "Git-managed HartLogistics Fresh LAB | source $($packVersion -join '.')" -ForegroundColor Cyan
Write-Host "Source: $source"
Write-Host "Branch: $branch"
Write-Host "Source SHA: $head"
Write-Host 'Git update changes SOURCE ONLY. Install -Apply is separate.'

if ($Mode -eq 'Status' -or $Mode -eq 'Update') { return }
Check-WorldTarget
Write-Host "AUTHORIZED LAB ONLY: $serverRoot"
Write-Host "World: $worldDir"
Write-Host "Target BP: $bpDest"
Write-Host "Target RP: $rpDest"
if (-not $Apply) {
    Write-Host 'PREVIEW ONLY. For installation pass -Mode Install -Commit <full-40-character-SHA> -Apply.' -ForegroundColor Yellow
    return
}
Assert-That ($Commit -match '^[0-9a-fA-F]{40}$') '-Commit must be the exact full 40-character Git SHA printed above.'
Assert-That ($head -ieq $Commit) 'REFUSED: Git HEAD differs from pinned commit; source may have been updated.'
Install-Packs $head
