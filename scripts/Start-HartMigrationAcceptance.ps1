#requires -Version 5.1
[CmdletBinding()]
param([switch]$Apply,[switch]$InstallOnly)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'PackJson.ps1')
$root='C:\Servers\Thomas_MCBedrock - Copy (2)'
$world=Join-Path $root 'worlds\ThomasServer'
$repo=Split-Path -Parent $PSScriptRoot
function Assert-Local([string]$Path){
    $item=Get-Item -LiteralPath $Path
    while($item){
        if($item.Attributes -band [IO.FileAttributes]::ReparsePoint){throw "Redirected path $($item.FullName)"}
        $item=$item.Parent
    }
}
Assert-Local $root
Assert-Local (Join-Path $world 'db')
$levels=@(Get-Content (Join-Path $root 'server.properties') | Where-Object {$_ -match '^level-name='})
if ($levels.Count -ne 1 -or $levels[0] -cne 'level-name=ThomasServer'){throw 'Unexpected active LAB world'}
$packs=@()
foreach($spec in @(
    @{kind='behavior';id='4854d263-05dd-4f79-a21c-7ba969295c2d';fresh='f450bff5-6b68-42e5-a07d-616f87c01918'},
    @{kind='resource';id='91316442-0f26-4fbb-88f3-2e39ea843a1a';fresh='39f2d6c6-9b79-4754-a2e2-fd27c1ec1d63'})){
    $kind=$spec.kind
    $registry=Join-Path $world "world_${kind}_packs.json"
    $active=@(ConvertFrom-PackJson ([IO.File]::ReadAllText($registry)))
    if(@($active | Where-Object {$_.pack_id -eq $spec.id}).Count -ne 1 -or @($active | Where-Object {$_.pack_id -eq $spec.fresh}).Count){throw "Unexpected $kind activation"}
    $found=@(foreach($base in @($root,$world)){
        $dir=Join-Path $base "${kind}_packs"
        if(Test-Path -LiteralPath $dir){
            foreach($candidate in Get-ChildItem -LiteralPath $dir -Directory){
                $manifest=Join-Path $candidate.FullName 'manifest.json'
                if(!(Test-Path -LiteralPath $manifest)){continue}
                $m=ConvertFrom-PackJson ([IO.File]::ReadAllText($manifest))
                if($m.header.uuid -eq $spec.id -and ($m.header.version -join '.') -eq '1.4.1'){$candidate.FullName}
            }
        }
    })
    if($found.Count -ne 1){throw "Expected one 1.4.1 $kind pack, found $($found.Count)"}
    Assert-Local $found[0]
    $packs+=@{kind=$kind;path=$found[0]}
    Write-Output "Target $($found[0])"
}
$exe=Join-Path $root 'bedrock_server.exe'
Assert-Local $exe
if(!$Apply){Write-Output 'Preview complete.';return}
foreach($p in @(Get-CimInstance Win32_Process -Filter "Name='bedrock_server.exe'")){
    if(!$p.ExecutablePath -or $p.ExecutablePath -ieq $exe){throw 'Stop copied LAB BDS before applying'}
}
$prompt = if ($InstallOnly) {
    'Install the Hart Logistics packs into the copied ThomasServer LAB? Start BDS from your admin GUI after installation.'
} else {
    'Install the Hart Logistics packs into the copied ThomasServer LAB and start BDS?'
}
Add-Type -AssemblyName System.Windows.Forms
$choice=[Windows.Forms.MessageBox]::Show($prompt, "Hart Logistics LAB update", 'YesNo', 'Question', 'Button2')
if($choice -ne 'Yes'){Write-Output 'Cancelled before installation.';return}
$work=Join-Path $root ('migration-acceptance-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $work | Out-Null
foreach($p in $packs){
    $kind=$p.kind
    $stage=Join-Path $work "${kind}-stage"
    Copy-Item -LiteralPath (Join-Path $repo "${kind}_pack") -Destination $stage -Recurse
    Copy-Item -LiteralPath (Join-Path $p.path 'manifest.json') -Destination (Join-Path $stage 'manifest.json') -Force
    if($kind -eq 'behavior'){
        $manifestPath=Join-Path $stage 'manifest.json'
        $manifest=ConvertFrom-PackJson ([IO.File]::ReadAllText($manifestPath))
        $ui=@($manifest.dependencies | Where-Object {$_.module_name -eq '@minecraft/server-ui'})
        if(!$ui.Count){
            $manifest.dependencies+=@{module_name='@minecraft/server-ui';version='2.0.0'}
            [IO.File]::WriteAllText($manifestPath,($manifest | ConvertTo-Json -Depth 32))
        }elseif($ui.Count -ne 1 -or $ui[0].version -ne '2.0.0'){throw 'Unexpected server-ui dependency'}
        $scripts=Join-Path $stage 'scripts'
        Move-Item (Join-Path $scripts 'main.js') (Join-Path $scripts 'fresh-runtime.js')
        foreach($name in @('trace.js','handoff.js','startup-custody.js')){
            Copy-Item (Join-Path $repo "scripts\legacy-census\$name") $scripts
        }
        Copy-Item (Join-Path $repo 'scripts\acceptance\*.js') $scripts -Force
    }
    $p.stage=$stage
    $p.backup=Join-Path $work "${kind}-original"
}
try{
    foreach($p in $packs){
        Move-Item -LiteralPath $p.path -Destination $p.backup
        Move-Item -LiteralPath $p.stage -Destination $p.path
    }
}catch{
    foreach($p in $packs){
        if(Test-Path -LiteralPath $p.backup){
            if(Test-Path -LiteralPath $p.path){Move-Item -LiteralPath $p.path -Destination $p.stage}
            Move-Item -LiteralPath $p.backup -Destination $p.path
        }
    }
    throw
}
Write-Output "Saved previous packs in $work."
if ($InstallOnly) {
    Write-Output "Installation complete. Start copied LAB BDS from your admin GUI."
    return
}
Write-Output "Starting copied LAB BDS."
Start-Process -FilePath $exe -WorkingDirectory $root
