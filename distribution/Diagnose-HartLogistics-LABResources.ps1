<#
.SYNOPSIS
  HartLogistics 1.5 copied-LAB resource-pack diagnostic (READ ONLY).
.DESCRIPTION
  Checks the exact installed LAB BP/RP, registrations and atlas references.
  Reports server-side resource-pack policy, but cannot see a client's cache.
  NO server settings, pack files or worlds are changed.
#>
[CmdletBinding()]
param([switch]$SourceOnly)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$lab = 'C:\Servers\Thomas_MCBedrock - Copy (2)'
$expectedWorld = 'ThomasServer'
$expectedRp = '91316442-0f26-4fbb-88f3-2e39ea843a1a'
$expectedBp = '4854d263-05dd-4f79-a21c-7ba969295c2d'
$warnings = New-Object 'System.Collections.Generic.List[string]'
$checks=0
function Check([bool]$ok,[string]$message) {
    if(-not $ok){throw ('RESOURCE PREFLIGHT REFUSED: '+$message)}
    $script:checks++
    Write-Host ('PASS: '+$message)
}
function Json([string]$file){
    if(-not (Test-Path -LiteralPath $file -PathType Leaf)){
        throw ('RESOURCE PREFLIGHT REFUSED: Missing '+$file)
    }
    Get-Content -LiteralPath $file -Raw -Encoding UTF8 | ConvertFrom-Json
}
function Refs([object]$obj){
    if($null -eq $obj -or $obj -is [string]){return}
    if($obj -is [System.Collections.IEnumerable] -and
       $obj -isnot [pscustomobject] -and
       $obj -isnot [System.Collections.IDictionary]){
        foreach($item in $obj){Refs $item}
        return
    }
    foreach($p in $obj.PSObject.Properties){
        if($p.Name -eq 'texture' -and $p.Value -is [string]){
            Write-Output $p.Value
        }
        if($p.Value -is [pscustomobject] -or
           ($p.Value -is [System.Collections.IEnumerable] -and $p.Value -isnot [string])){
            Refs $p.Value
        }
    }
}
function AtlasPath([string]$relative){
    $normalized=($relative -replace '/', [IO.Path]::DirectorySeparatorChar)
    Join-Path $rp ($normalized+'.png')
}
if($SourceOnly){
    Write-Host 'SOURCE-ONLY diagnostic: no Minecraft server or world inspected.'
    return
}
try {
    Check (Test-Path -LiteralPath $lab -PathType Container) 'Exact copied LAB exists'
    $bp=Join-Path $lab 'behavior_packs\HartMods_HartLogistics_BP'
    $rp=Join-Path $lab 'resource_packs\HartMods_HartLogistics_RP'
    $b=Json (Join-Path $bp 'manifest.json')
    $r=Json (Join-Path $rp 'manifest.json')
    Check ($b.header.uuid -eq $expectedBp) 'Hart BP UUID'
    Check ($r.header.uuid -eq $expectedRp) 'Hart RP UUID'
    $bv=($b.header.version -join '.')
    $rv=($r.header.version -join '.')
    Check ($bv -eq $rv -and $rv -eq '1.5.0') 'Expected BP/RP 1.5.0 versions'
    $deps=@($b.dependencies | Where-Object {
        $_.uuid -eq $expectedRp -and ($_.version -join '.') -eq $rv
    })
    Check ($deps.Count -eq 1) 'BP links to exactly this RP version'
    $properties=Join-Path $lab 'server.properties'
    Check (Test-Path -LiteralPath $properties -PathType Leaf) 'LAB server.properties exists'
    $props=@{}
    foreach($line in Get-Content -LiteralPath $properties){
        if($line -match '^\s*([A-Za-z0-9-]+)\s*=\s*(.*?)\s*$'){
            $props[$matches[1]]=$matches[2]
        }
    }
    Check ($props['level-name'] -eq $expectedWorld) 'Active LAB world is ThomasServer'
    $registry=Json (Join-Path $lab 'worlds\ThomasServer\world_resource_packs.json')
    $entries=@($registry | Where-Object { $_.pack_id -eq $expectedRp })
    Check ($entries.Count -eq 1 -and ($entries[0].version -join '.') -eq $rv) 'World RP registration matches installed RP'
    $terrain=Json (Join-Path $rp 'textures\terrain_texture.json')
    Check ($terrain.texture_name -eq 'atlas.terrain') 'Correct terrain atlas'
    $keys=@($terrain.texture_data.PSObject.Properties.Name)
    $materials=New-Object 'System.Collections.Generic.HashSet[string]'
    foreach($file in Get-ChildItem -LiteralPath (Join-Path $bp 'blocks') -File -Filter '*.json'){
        foreach($name in @(Refs (Json $file.FullName))){
            if($null -ne $name){[void]$materials.Add($name)}
        }
    }
    Check ($materials.Count -gt 10) 'Existing and new custom block materials inspected'
    foreach($name in $materials){
        Check ($keys -contains $name) ('Atlas contains '+$name)
    }
    foreach($name in $keys){
        $entry=$terrain.texture_data.$name
        $texpaths=@($entry.textures)
        Check ($texpaths.Count -ge 1) ('Atlas has path for '+$name)
        foreach($rel in $texpaths){
            $file=AtlasPath $rel
            Check (Test-Path -LiteralPath $file -PathType Leaf) ('PNG exists '+$rel)
            $bytes=[IO.File]::ReadAllBytes($file)
            Check ($bytes.Length -ge 60 -and [BitConverter]::ToString($bytes,0,8) -eq '89-50-4E-47-0D-0A-1A-0A') ('PNG signature '+$rel)
        }
    }
    $ent=Json (Join-Path $rp 'entity\filter_display.entity.json')
    $enttex=$ent.'minecraft:client_entity'.description.textures.default
    Check (Test-Path -LiteralPath (AtlasPath $enttex) -PathType Leaf) 'Legacy display entity texture file'
    $geos=New-Object 'System.Collections.Generic.HashSet[string]'
    foreach($f in Get-ChildItem -LiteralPath (Join-Path $rp 'models\blocks') -File -Filter '*.json'){
        $geometry=Json $f.FullName
        foreach($v in @($geometry.'minecraft:geometry')){[void]$geos.Add($v.description.identifier)}
    }
    Check ($geos.Contains('geometry.hartlogistics.transporter')) 'Transporter geometry'
    Check ($geos.Contains('geometry.hartlogistics.bulk_storage')) 'Bulk geometry'
    if($props['texturepack-required'] -ne 'true'){
        [void]$warnings.Add('texturepack-required is not true; clients may join without accepting the RP.')
    }
    if($props['content-log-file-enabled'] -ne 'true'){
        [void]$warnings.Add('content-log-file-enabled is not true; consider enabling LAB content logging.')
    }
    Write-Host ('RESOURCE PREFLIGHT PASS: '+$checks+' read-only checks')
    foreach($warn in $warnings){Write-Warning $warn}
    Write-Host 'Server-side files are checked; the client RP/cache cannot be inspected by this script.'
    Write-Host 'If magenta persists: inspect Minecraft client Content Log and server pack download/cache.'
    Write-Host 'No files were modified.'
} catch {
    [Console]::Error.WriteLine($_.Exception.Message)
    exit 2
}
