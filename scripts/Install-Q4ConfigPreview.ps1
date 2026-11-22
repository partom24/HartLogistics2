[CmdletBinding()]
param([switch]$Apply)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'PackJson.ps1')
$root = 'C:\Servers\Thomas_MCBedrock - Copy (2)'
$world = Join-Path $root 'worlds\ThomasServer'
$source = Split-Path $PSScriptRoot
$id = '4854d263-05dd-4f79-a21c-7ba969295c2d'
function Assert-PhysicalPath([string]$Path) {
    for ($item = Get-Item -LiteralPath $Path; $null -ne $item; $item = Get-Item -LiteralPath $parent) {
        if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Redirected path: $($item.FullName)" }
        $parent = Split-Path -Parent $item.FullName
        if (-not $parent) { break }
    }
}
function Normalized([string]$Path) {
    return [IO.File]::ReadAllText($Path).Replace("`r`n","`n").TrimEnd()
}
Assert-PhysicalPath $world
$settings = Get-Content -LiteralPath (Join-Path $root 'server.properties')
$levels = @($settings | Where-Object { $_ -match '^level-name=' })
if ($levels.Count -ne 1 -or $levels[0] -cne 'level-name=ThomasServer') { throw 'Unexpected active world' }
$active = @(ConvertFrom-PackJson ([IO.File]::ReadAllText((Join-Path $world 'world_behavior_packs.json'))))
if (@($active | Where-Object { $_.pack_id -eq $id }).Count -ne 1 -or
    @($active | Where-Object { $_.pack_id -eq 'f450bff5-6b68-42e5-a07d-616f87c01918' }).Count) { throw 'Unexpected activated routing packs' }
$registeredVersion = (($active | Where-Object { $_.pack_id -eq $id }).version -join '.')
$packs = @(foreach ($base in @((Join-Path $root 'behavior_packs'),(Join-Path $world 'behavior_packs'))) {
    if (!(Test-Path -LiteralPath $base)) { continue }
    foreach ($dir in Get-ChildItem -LiteralPath $base -Directory) {
        $manifest = Join-Path $dir.FullName 'manifest.json'
        if (!(Test-Path -LiteralPath $manifest -PathType Leaf)) { continue }
        $m = ConvertFrom-PackJson ([IO.File]::ReadAllText($manifest))
        if ($m.header.uuid -ne $id) { continue }
        $modules = @($m.modules | Where-Object { $_.type -eq 'script' })
        [pscustomobject]@{ Path=$dir.FullName; Version=($m.header.version -join '.'); Entries=@($modules | ForEach-Object { $_.entry }) }
    }
})
Write-Output "World registration: $id version=$registeredVersion"
foreach ($pack in $packs) {
    Write-Output "Manifest: $($pack.Path) version=$($pack.Version) script entries=[$($pack.Entries -join ', ')]"
}
if ($packs.Count -gt 1) { $packs = @($packs | Where-Object { $_.Version -eq $registeredVersion }) }
if ($packs.Count -ne 1) { throw "Could not uniquely resolve the registered pack in the copied LAB. See manifest inventory above." }
$pack = $packs[0]
if ($pack.Entries.Count -ne 1 -or ([string]$pack.Entries[0]).Replace('\','/') -notmatch '^(?:\./)?scripts/main\.js$') {
    throw "Unsupported installed script entry at $($pack.Path); expected a single scripts/main.js. See manifest inventory above."
}
$dest = Join-Path $pack.Path 'scripts'
$main = Join-Path $dest 'main.js'
Assert-PhysicalPath $main
$files = [ordered]@{
    'dispatch-main.js' = 'scripts/legacy-census/dispatch-main.js'
    'topology.js' = 'behavior_pack/scripts/topology.js'
    'config-preview.js' = 'behavior_pack/scripts/config-preview.js'
    'main.js' = 'scripts/legacy-census/config-main.js'
}
$current = Normalized $main
if ($current -cne (Normalized (Join-Path $source $files['dispatch-main.js'])) -and
    $current -cne (Normalized (Join-Path $source $files['main.js']))) { throw 'Expected isolated dispatch entry point' }
foreach ($module in @('q4Lab.js','committedDispatch.js')) {
    Assert-PhysicalPath (Join-Path $dest $module)
}
foreach ($name in $files.Keys) {
    $path = Join-Path $dest $name
    $expected = Join-Path $source $files[$name]
    if (!(Test-Path -LiteralPath $expected -PathType Leaf)) { throw "Missing source $expected" }
    if (Test-Path -LiteralPath $path) {
        Assert-PhysicalPath $path
        if ($name -ne 'main.js' -and (Normalized $path) -cne (Normalized $expected)) { throw "Conflicting module $path" }
    }
}
Write-Output "Target $dest ; verified copied ThomasServer and isolated dispatch entry."
if (!$Apply) { Write-Output 'Preview only.'; return }
foreach ($process in @(Get-CimInstance Win32_Process -Filter "Name='bedrock_server.exe'")) {
    if (!$process.ExecutablePath -or [IO.Path]::GetDirectoryName($process.ExecutablePath) -eq $root) { throw 'Stop copied LAB BDS before applying' }
}
foreach ($name in $files.Keys) {
    $path = Join-Path $dest $name
    $expected = Join-Path $source $files[$name]
    if ((Test-Path -LiteralPath $path) -and (Normalized $path) -ceq (Normalized $expected)) { continue }
    $temp = Join-Path $dest ([guid]::NewGuid().ToString('N')+'.tmp')
    try {
        [IO.File]::Copy($expected,$temp)
        if ($name -eq 'main.js') { [IO.File]::Replace($temp,$path,(Join-Path $dest ('main.pre-config-'+[guid]::NewGuid().ToString('N')+'.bak'))) }
        else { [IO.File]::Move($temp,$path) }
    } finally { if (Test-Path -LiteralPath $temp) { Remove-Item -LiteralPath $temp } }
}
Write-Output 'Config preview installed.'
