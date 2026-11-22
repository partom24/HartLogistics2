[CmdletBinding()]
param([switch]$Apply)
$ErrorActionPreference = 'Stop'
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
$active = (Get-Content -Raw -LiteralPath (Join-Path $world 'world_behavior_packs.json') | ConvertFrom-Json)
if (@($active | Where-Object { $_.pack_id -eq $id }).Count -ne 1 -or
    @($active | Where-Object { $_.pack_id -eq 'f450bff5-6b68-42e5-a07d-616f87c01918' }).Count) { throw 'Unexpected activated routing packs' }
$packs = @(foreach ($base in @((Join-Path $root 'behavior_packs'),(Join-Path $world 'behavior_packs'))) {
    if (Test-Path -LiteralPath $base) {
        foreach ($dir in Get-ChildItem -LiteralPath $base -Directory) {
            $manifest = Join-Path $dir.FullName 'manifest.json'
            if (!(Test-Path -LiteralPath $manifest)) { continue }
            $m = Get-Content -LiteralPath $manifest -Raw | ConvertFrom-Json
            if ($m.header.uuid -eq $id) {
                if (($m.header.version -join '.') -ne '1.4.1' -or @($m.modules | Where-Object { $_.type -eq 'script' -and $_.entry -eq 'scripts/main.js' }).Count -ne 1) { throw 'Unexpected legacy manifest' }
                $dir.FullName
            }
        }
    }
})
if ($packs.Count -ne 1) { throw "Expected exactly one original-identity pack, found $($packs.Count)" }
$dest = Join-Path $packs[0] 'scripts'
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
