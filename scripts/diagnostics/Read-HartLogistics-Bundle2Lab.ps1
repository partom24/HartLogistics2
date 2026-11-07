# Hart Logistics 2 Bundle 2 | Read-only Windows LAB preflight.
# Fixed authorized LAB only; NO writes, Git activity, LevelDB or PROD access.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$Lab = 'C:\Servers\Thomas_MCBedrock - Copy (2)'
$World = 'ThomasServer'
$BP = '4854d263-05dd-4f79-a21c-7ba969295c2d'
$RP = '91316442-0f26-4fbb-88f3-2e39ea843a1a'
$OldProbe = 'ad7c1f31-7f76-41ab-bd84-94a7b9617124'

function Assert-NoJunction([string]$Path) {
    $where = [IO.Path]::GetFullPath($Path)
    while ($where) {
        if (Test-Path -LiteralPath $where) {
            $attrs = (Get-Item -LiteralPath $where -Force).Attributes
            if (($attrs -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
                throw "Refusing symlink or junction: $where"
            }
        }
        $up = Split-Path -Path $where -Parent
        if (-not $up -or $up -eq $where) { break }
        $where = $up
    }
}
function Read-Jsonc([string]$Path) {
    Assert-NoJunction $Path
    $raw = [IO.File]::ReadAllText($Path)
    $out = New-Object Text.StringBuilder
    $quoted = $false
    $escaped = $false
    for ($i=0; $i -lt $raw.Length; $i++) {
        $c = $raw[$i]
        if ($quoted) {
            [void]$out.Append($c)
            if ($escaped) { $escaped = $false }
            elseif ($c -eq [char]92) { $escaped = $true }
            elseif ($c -eq [char]34) { $quoted = $false }
            continue
        }
        if ($c -eq [char]34) { $quoted = $true; [void]$out.Append($c); continue }
        if ($c -eq [char]47 -and ($i+1) -lt $raw.Length) {
            if ($raw[$i+1] -eq [char]47) {
                $i+=2
                while ($i -lt $raw.Length -and $raw[$i] -ne [char]10 -and $raw[$i] -ne [char]13) { $i++ }
                if ($i -lt $raw.Length) { [void]$out.Append($raw[$i]) }
                continue
            }
            if ($raw[$i+1] -eq [char]42) {
                $end = $raw.IndexOf('*/', $i+2, [StringComparison]::Ordinal)
                if ($end -lt 0) { throw "Unterminated JSONC comment: $Path" }
                $i=$end+1
                [void]$out.Append(' ')
                continue
            }
        }
        [void]$out.Append($c)
    }
    if ($quoted) { throw "Unterminated JSON string in $Path" }
    $clean = $out.ToString()
    $noTrailing = New-Object Text.StringBuilder
    $quoted = $false
    $escaped = $false
    for ($i=0; $i -lt $clean.Length; $i++) {
        $c=$clean[$i]
        if ($quoted) {
            [void]$noTrailing.Append($c)
            if ($escaped) { $escaped=$false }
            elseif ($c -eq [char]92) { $escaped=$true }
            elseif ($c -eq [char]34) { $quoted=$false }
            continue
        }
        if ($c -eq [char]34) { $quoted=$true; [void]$noTrailing.Append($c); continue }
        if ($c -eq [char]44) {
            $j=$i+1
            while ($j -lt $clean.Length -and [char]::IsWhiteSpace($clean[$j])) { $j++ }
            if ($j -lt $clean.Length -and ($clean[$j] -eq [char]93 -or $clean[$j] -eq [char]125)) { continue }
        }
        [void]$noTrailing.Append($c)
    }
    return ConvertFrom-Json -InputObject $noTrailing.ToString() -ErrorAction Stop
}
function Get-Registry([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        return @{ exists=$false; entries=@() }
    }
    Assert-NoJunction $Path
    $raw = [IO.File]::ReadAllText($Path)
    if (-not $raw.TrimStart().StartsWith('[')) {
        throw "Registry must start with JSON array: $Path"
    }
    # Windows PowerShell may unwrap single-element arrays across function
    # boundaries, so explicitly collect values in an array here.
    $entries = @(Read-Jsonc $Path)
    return @{ exists=$true; entries=$entries }
}
function Get-Installed([string]$Folder, [string]$Uuid) {
    $found=@()
    if (-not (Test-Path -LiteralPath $Folder -PathType Container)) { return $found }
    Assert-NoJunction $Folder
    foreach ($dir in @(Get-ChildItem -LiteralPath $Folder -Directory -Force)) {
        if (($dir.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
            throw "Refusing linked pack folder: $($dir.FullName)"
        }
        $manifest=Join-Path $dir.FullName 'manifest.json'
        if (-not (Test-Path -LiteralPath $manifest -PathType Leaf)) { continue }
        try { $m=Read-Jsonc $manifest } catch { continue }
        if ($null -ne $m -and $null -ne $m.header -and [string]$m.header.uuid -eq $Uuid) {
            $version=@($m.header.version) -join '.'
            $found+=("$($dir.Name) [version $version]")
        }
    }
    return $found
}
function Show-Pack([string]$Name, [string]$Uuid, [string]$Folder, [string]$Registry) {
    $reg=Get-Registry $Registry
    $linked=@($reg.entries | Where-Object {
        $null -ne $_ -and [string]$_.pack_id -eq $Uuid
    })
    $installed=@(Get-Installed $Folder $Uuid)
    $versions=@($linked | ForEach-Object { @($_.version) -join '.' })
    if (-not $reg.exists) { Write-Output "$Name registry: missing" }
    elseif ($linked.Count -eq 0) { Write-Output "$Name registry: not registered" }
    else { Write-Output "$Name registry: $($linked.Count) match(es), versions $($versions -join ', ')" }
    if ($installed.Count) { Write-Output "$Name installed: $($installed -join '; ')" }
    else { Write-Output "$Name installed: not found under LAB root" }
    if ($linked.Count -gt 1 -or $installed.Count -gt 1) {
        Write-Output "WARNING: duplicate $Name identities; do not deploy."
    }
}

if ($env:OS -ne 'Windows_NT') { throw 'Windows LAB host required.' }
Assert-NoJunction $Lab
if (-not (Test-Path -LiteralPath $Lab -PathType Container)) { throw "LAB absent: $Lab" }
$props=Join-Path $Lab 'server.properties'
Assert-NoJunction $props
if (-not (Test-Path -LiteralPath $props -PathType Leaf)) { throw 'LAB server.properties missing' }
$name=$null
foreach ($line in [IO.File]::ReadAllLines($props)) {
    if ($line -match '^\s*level-name\s*=(.*)$') { $name=$Matches[1].Trim() }
}
if ($name -cne $World) { throw "Active world '$name' is not the authorized '$World'." }
$worldDir=Join-Path (Join-Path $Lab 'worlds') $World
Assert-NoJunction $worldDir
if (-not (Test-Path -LiteralPath $worldDir -PathType Container)) { throw 'LAB world missing' }
$bpRoot=Join-Path $Lab 'behavior_packs'
$rpRoot=Join-Path $Lab 'resource_packs'
$bpFile=Join-Path $worldDir 'world_behavior_packs.json'
$rpFile=Join-Path $worldDir 'world_resource_packs.json'
Write-Output 'BUNDLE 2 | READ-ONLY LAB PACK PREFLIGHT'
Write-Output "LAB: $Lab"
Write-Output "World: $World"
$exe=Join-Path $Lab 'bedrock_server.exe'
if (Test-Path -LiteralPath $exe -PathType Leaf) {
    Assert-NoJunction $exe
    Write-Output "Executable file version: $((Get-Item -LiteralPath $exe).VersionInfo.FileVersion) (not proof of running build)"
} else { Write-Output 'Executable: not found at root' }
Show-Pack 'Hart BP' $BP $bpRoot $bpFile
Show-Pack 'Hart RP' $RP $rpRoot $rpFile
$reg=Get-Registry $bpFile
$probe=@($reg.entries | Where-Object {
    $null -ne $_ -and [string]$_.pack_id -eq $OldProbe
}).Count -gt 0
Write-Output "Retired PG03 probe registered: $probe"
Write-Output "Retired PG03 probe folder exists: $(Test-Path -LiteralPath (Join-Path $bpRoot '_HartLogistics_PG03-05_TEMP_ONLY'))"
Write-Output "Retired PG03 lease exists: $(Test-Path -LiteralPath (Join-Path $Lab '_HartLogistics_PG03-05_TEMP_LEASE'))"
Write-Output 'No files modified. This does not inspect saved links, queue items, LevelDB or experiment flags.'
Write-Output 'Paste this output into our Bundle 2 conversation.'
