# TEMP_TEST:PG03-05-PS
<#
.SYNOPSIS
    Git-source updater for the standalone disposable PG-03/04/05 LAB probe.
.DESCRIPTION
    Default Plan is source-only, non-mutating. Sync fast-forwards only the
    authorized Git branch. CheckLab is read-only. Install and Cleanup require
    an exact pinned Git HEAD, -Apply, and a stopped LAB BDS. The fixed LAB
    root cannot be overridden. No original Hart Logistics BP/RP is touched.
    Delete this temporary tool promptly when PG-03 through PG-05 close.
.EXAMPLE
    .\Update-HartLogistics-Bundle1Lab.ps1 -Mode Sync
.EXAMPLE
    .\Update-HartLogistics-Bundle1Lab.ps1 -Mode CheckLab
.EXAMPLE
    .\Update-HartLogistics-Bundle1Lab.ps1 -Mode Install -Apply -Commit (git rev-parse HEAD)
.EXAMPLE
    .\Update-HartLogistics-Bundle1Lab.ps1 -Mode Cleanup -Apply -ConfirmProbeCleared -Commit (git rev-parse HEAD)
#>
[CmdletBinding()]
param(
    [ValidateSet('Plan','Sync','CheckLab','Install','Cleanup')][string]$Mode = 'Plan',
    [string]$Commit = '',
    [switch]$Apply,
    [switch]$ConfirmProbeCleared
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$script:AllowedLab = 'C:\Servers\Thomas_MCBedrock - Copy (2)'
$script:Repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$script:Source = Join-Path $PSScriptRoot 'behavior_pack'
$script:Branch = 'docs/hart-logistics-planning'
$script:ProbeId = 'ad7c1f31-7f76-41ab-bd84-94a7b9617124'
$script:PackDir = '_HartLogistics_PG03-05_TEMP_ONLY'
$script:LeaseDir = '_HartLogistics_PG03-05_TEMP_LEASE'
$script:StageDir = '_HartLogistics_PG03-05_TEMP_STAGE'
$script:Expected = @('manifest.json','blocks\mr_container.json',
                     'recipes\probe_recipe.json','scripts\main.js')

function Deny([string]$Message) { throw ('REFUSED PG03-05: ' + $Message) }
function Invoke-CheckedGit([string[]]$Words) {
    $output = & git.exe -C $script:Repo @Words 2>&1
    if ($LASTEXITCODE -ne 0) { Deny ('Git failure: ' + ($Words -join ' ')) }
    return (($output | Out-String).Trim())
}
function HashFile([string]$Path) {
    return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}
function HashBytes([byte[]]$Bytes) {
    $sha = [Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($sha.ComputeHash($Bytes))).Replace('-','').ToLowerInvariant() }
    finally { $sha.Dispose() }
}
function NoLinks([string]$Path) {
    $current=[IO.Path]::GetFullPath($Path)
    while ($true) {
        if (-not (Test-Path -LiteralPath $current)) { Deny ('Missing path: ' + $current) }
        $file=Get-Item -LiteralPath $current -Force
        if (($file.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
            Deny ('Unapproved junction/symlink: ' + $current)
        }
        $parent=[IO.Directory]::GetParent($current)
        if ($null -eq $parent) { break }
        $current=$parent.FullName
    }
}
function FileMap([string]$Folder) {
    NoLinks $Folder
    $result=@{}
    foreach($f in @(Get-ChildItem -LiteralPath $Folder -File -Recurse -Force)) {
        NoLinks $f.FullName
        $name=$f.FullName.Substring($Folder.Length).TrimStart([char]'\')
        if ($result.ContainsKey($name)) { Deny ('Duplicate pack name: ' + $name) }
        $result[$name]=HashFile $f.FullName
    }
    return $result
}
function SameMap($A,$B) {
    if ($A.Count -ne $B.Count) {return $false}
    foreach($k in $A.Keys) {
        if (-not $B.ContainsKey($k) -or $A[$k] -cne $B[$k]) {return $false}
    }
    return $true
}
function GitSource([bool]$RequirePin) {
    NoLinks $script:Repo
    NoLinks $script:Source
    $origin=Invoke-CheckedGit -Words @('remote','get-url','origin')
    if ($origin -notmatch '^(?:https://github\.com/|git@github\.com:|ssh://git@github\.com/)partom24/HartLogistics2(?:\.git)?/?$') {
        Deny 'Git remote must be the authorized partom24/HartLogistics2 only'
    }
    $head=Invoke-CheckedGit -Words @('rev-parse','HEAD')
    if ($head -notmatch '^[a-f0-9]{40}$') { Deny 'Git HEAD is not a full SHA' }
    if ((Invoke-CheckedGit -Words @('status','--porcelain','--untracked-files=all'))) {
        Deny 'Git worktree must be clean and free of untracked files'
    }
    if ($Commit -and $Commit -cne $head) { Deny 'Pinned -Commit mismatches Git HEAD' }
    if ($RequirePin -and $Commit -notmatch '^[a-f0-9]{40}$') {
        Deny 'Install/Cleanup require -Commit with exact full Git HEAD'
    }
    $files=FileMap $script:Source
    if ($files.Count -ne $script:Expected.Count) {Deny 'Unknown/missing probe source files'}
    foreach($p in $script:Expected) {
        if (-not $files.ContainsKey($p)) {Deny ('Missing Git probe file '+$p)}
    }
    $manifest=Get-Content -LiteralPath (Join-Path $script:Source 'manifest.json') -Raw | ConvertFrom-Json
    if ($manifest.header.uuid -cne $script:ProbeId -or
        ($manifest.header.version -join '.') -cne '0.0.1') {
        Deny 'Unexpected disposable manifest identity'
    }
    $block=Get-Content -LiteralPath (Join-Path $script:Source 'blocks\mr_container.json') -Raw | ConvertFrom-Json
    if ($block.'minecraft:block'.description.identifier -cne 'hlprobe:mr_container') {
        Deny 'Unexpected disposable test block'
    }
    return @{Commit=$head;Files=$files}
}
function CheckAllowedLab {
    if ($env:OS -cne 'Windows_NT') {Deny 'Only Windows LAB host is supported'}
    if (-not [string]::Equals([IO.Path]::GetFullPath($script:AllowedLab).TrimEnd('\'),
          $script:AllowedLab,[StringComparison]::OrdinalIgnoreCase)) {
        Deny 'Hard-coded LAB path is not canonical'
    }
    NoLinks $script:AllowedLab
    if (-not [string]::Equals((Get-Item -LiteralPath $script:AllowedLab).FullName,
         $script:AllowedLab,[StringComparison]::OrdinalIgnoreCase)) {
        Deny 'LAB path unexpectedly resolves elsewhere'
    }
}
function CheckLabStopped {
    $expected=Join-Path $script:AllowedLab 'bedrock_server.exe'
    foreach($p in @(Get-Process -Name bedrock_server -ErrorAction SilentlyContinue)) {
        $exe=$null
        try {$exe=$p.Path} catch {}
        if (-not $exe) {Deny 'Cannot identify running BDS process; inspect before proceeding'}
        if ([string]::Equals($exe,$expected,[StringComparison]::OrdinalIgnoreCase)) {
            Deny 'LAB BDS must be stopped before file/registry changes'
        }
    }
}
function LabInfo([string]$Root) {
    NoLinks $Root
    $exe=Join-Path $Root 'bedrock_server.exe'
    $props=Join-Path $Root 'server.properties'
    NoLinks $exe; NoLinks $props
    $names=@(Get-Content -LiteralPath $props |
        Where-Object {$_ -match '^\s*level-name\s*='} |
        ForEach-Object {($_ -split '=',2)[1].Trim()})
    if ($names.Count -ne 1 -or $names[0] -notmatch '^[A-Za-z0-9 _().-]+$' -or
        $names[0] -in @('.','..')) {Deny 'Missing/unsafe/ambiguous level-name'}
    $worlds=Join-Path $Root 'worlds'
    NoLinks $worlds
    $world=Join-Path $worlds $names[0]
    NoLinks $world
    $registry=Join-Path $world 'world_behavior_packs.json'
    NoLinks $registry
    $packs=Join-Path $Root 'behavior_packs'
    NoLinks $packs
    return @{
        Registry=$registry; World=$world
        Target=(Join-Path $packs $script:PackDir)
        Lease=(Join-Path $Root $script:LeaseDir)
        Stage=(Join-Path $Root $script:StageDir)
    }
}
function CleanJsonc([string]$Raw) {
    # Preserve positions; ignore // and /* */ comments and trailing commas.
    $chars=$Raw.ToCharArray();$n=$chars.Length
    $quoted=$false;$escaped=$false;$i=0
    while($i -lt $n) {
        $c=$chars[$i]
        if($quoted) {
            if($escaped){$escaped=$false}
            elseif($c -eq [char]'\'){$escaped=$true}
            elseif($c -eq [char]'"'){$quoted=$false}
        } elseif($c -eq [char]'"') {$quoted=$true}
        elseif($c -eq [char]'/' -and $i+1 -lt $n -and
            ($chars[$i+1] -eq [char]'/' -or $chars[$i+1] -eq [char]'*')) {
            $line=($chars[$i+1] -eq [char]'/');$j=$i+2
            if($line) {
                while($j -lt $n -and $chars[$j] -ne [char]10 -and $chars[$j] -ne [char]13){$j++}
            } else {
                while($j+1 -lt $n -and -not
                    ($chars[$j] -eq [char]'*' -and $chars[$j+1] -eq [char]'/')){$j++}
                if($j+1 -ge $n){Deny 'Unclosed JSONC comment'}
                $j+=2
            }
            for($k=$i;$k -lt $j;$k++) {
                if($chars[$k] -ne [char]10 -and $chars[$k] -ne [char]13){$chars[$k]=[char]' '}
            }
            $i=$j;continue
        }
        $i++
    }
    if($quoted){Deny 'Unclosed registry string'}
    $quoted=$false;$escaped=$false
    for($i=0;$i -lt $n;$i++){
        $c=$chars[$i]
        if($quoted) {
            if($escaped){$escaped=$false}
            elseif($c -eq [char]'\'){$escaped=$true}
            elseif($c -eq [char]'"'){$quoted=$false}
        } elseif($c -eq [char]'"'){$quoted=$true}
        elseif($c -eq [char]','){
            $j=$i+1
            while($j -lt $n -and [char]::IsWhiteSpace($chars[$j])){$j++}
            if($j -lt $n -and $chars[$j] -in @([char]']',[char]'}')){$chars[$i]=[char]' '}
        }
    }
    return (-join $chars)
}
function Registry([string]$Raw) {
    $clean=CleanJsonc $Raw
    $s=$clean.Trim()
    if(-not ($s.StartsWith('[') -and $s.EndsWith(']'))){Deny 'World registry must be a JSON array'}
    try {
        $parsed=ConvertFrom-Json -InputObject $clean -ErrorAction Stop
        if ($null -eq $parsed) {$items=@()} else {$items=@($parsed)}
    } catch {Deny 'World registry JSONC is not parseable'}
    foreach($item in $items) {
        if($null -eq $item -or $null -eq $item.PSObject.Properties['pack_id'] -or
           $null -eq $item.PSObject.Properties['version']) {
            Deny 'Invalid existing world pack registration'
        }
    }
    return @{Clean=$clean;Items=$items}
}
function AddRegistration([string]$Raw) {
    $old=Registry $Raw
    foreach($item in $old.Items) {
        if([string]::Equals([string]$item.pack_id,$script:ProbeId,
            [StringComparison]::OrdinalIgnoreCase)){Deny 'Probe already registered'}
    }
    $end=$old.Clean.LastIndexOf(']')
    if($end -lt 0){Deny 'Registry terminator not found'}
    # The sanitized JSONC parser blanks trailing commas. Inspect the original
    # source suffix after the final item, removing suffix-only comments, so a
    # trailing comma before a comment cannot accidentally become two commas.
    $index=$end-1
    while($index -ge 0 -and [char]::IsWhiteSpace($old.Clean[$index])){$index--}
    $suffix=$Raw.Substring($index+1,$end-$index-1)
    $suffixWithoutComments=[regex]::Replace($suffix,'(?s)/\*.*?\*/|//[^\r\n]*','')
    $hasTrailingComma=$suffixWithoutComments.Contains(',')
    $sep=if($old.Items.Count -gt 0 -and -not $hasTrailingComma){','}else{''}
    $element='{"pack_id":"'+$script:ProbeId+'","version":[0,0,1]}'
    $insert=$sep+[Environment]::NewLine+'  '+$element+[Environment]::NewLine
    $result=$Raw.Substring(0,$end)+$insert+$Raw.Substring($end)
    $new=Registry $result
    if($new.Items.Count -ne $old.Items.Count+1){Deny 'Unexpected registry count'}
    for($i=0;$i -lt $old.Items.Count;$i++){
        $lhs=ConvertTo-Json -InputObject $old.Items[$i] -Depth 40 -Compress
        $rhs=ConvertTo-Json -InputObject $new.Items[$i] -Depth 40 -Compress
        if($lhs -cne $rhs){Deny 'Existing registration was modified'}
    }
    return $result
}
function EncodeUtf8Like([byte[]]$Original,[string]$Text) {
    $bytes=([System.Text.UTF8Encoding]::new($false)).GetBytes($Text)
    if($Original.Length -ge 3 -and $Original[0] -eq 239 -and
       $Original[1] -eq 187 -and $Original[2] -eq 191) {
        $joined=New-Object byte[] ($bytes.Length+3)
        $joined[0]=239;$joined[1]=187;$joined[2]=191
        [Array]::Copy($bytes,0,$joined,3,$bytes.Length)
        return ,$joined
    }
    return ,$bytes
}
function AtomicWrite([string]$Path,[byte[]]$Bytes) {
    $tmp=$Path+'.PG03-05.pending'
    $replaceBackup=$Path+'.PG03-05.atomic-backup'
    if((Test-Path -LiteralPath $tmp) -or (Test-Path -LiteralPath $replaceBackup)){
        Deny 'Conflicting pending registry replacement or backup'
    }
    try {
        [IO.File]::WriteAllBytes($tmp,$Bytes)
        # Windows PowerShell 5.1/.NET Framework rejects a null backup path.
        # The persistent original registry copy lives separately in our lease.
        [IO.File]::Replace($tmp,$Path,$replaceBackup)
    } finally {
        if(Test-Path -LiteralPath $tmp){Remove-Item -LiteralPath $tmp -Force}
        if(Test-Path -LiteralPath $replaceBackup){Remove-Item -LiteralPath $replaceBackup -Force}
    }
}
function CopyStage([string]$SourceDir,[string]$Destination) {
    if(Test-Path -LiteralPath $Destination){Deny 'Existing staging directory'}
    [void](New-Item -ItemType Directory -Path $Destination)
    foreach($name in $script:Expected){
        $dest=Join-Path $Destination $name
        [void](New-Item -ItemType Directory -Path (Split-Path $dest -Parent) -Force)
        Copy-Item -LiteralPath (Join-Path $SourceDir $name) -Destination $dest
    }
}
function DeployCore($Lab,$Snapshot) {
    if((Test-Path -LiteralPath $Lab.Target) -or
       (Test-Path -LiteralPath $Lab.Lease) -or
       (Test-Path -LiteralPath $Lab.Stage)){
        Deny 'Existing probe install, lease or stage: refuse overwrite'
    }
    $original=[IO.File]::ReadAllBytes($Lab.Registry)
    $newText=AddRegistration ([IO.File]::ReadAllText($Lab.Registry))
    $updated=EncodeUtf8Like $original $newText
    $oldHash=HashBytes $original;$newHash=HashBytes $updated
    try {
        CopyStage $script:Source $Lab.Stage
        if(-not (SameMap $Snapshot.Files (FileMap $Lab.Stage))){Deny 'Stage hash mismatch'}
        [void](New-Item -ItemType Directory -Path $Lab.Lease)
        [IO.File]::WriteAllBytes((Join-Path $Lab.Lease 'registry.original.bin'),$original)
        $meta=@{
            source_commit=$Snapshot.Commit;world=$Lab.World;probe_uuid=$script:ProbeId
            original_registry_sha256=$oldHash;installed_registry_sha256=$newHash
            installed_files=$Snapshot.Files
        } | ConvertTo-Json -Depth 6
        [IO.File]::WriteAllText((Join-Path $Lab.Lease 'lease.json'),$meta)
        Move-Item -LiteralPath $Lab.Stage -Destination $Lab.Target
        if(-not (SameMap $Snapshot.Files (FileMap $Lab.Target))){Deny 'Installed SHA mismatch'}
        AtomicWrite $Lab.Registry $updated
        if((HashFile $Lab.Registry) -cne $newHash){Deny 'Registry installation SHA mismatch'}
        Write-Output ('INSTALLED LAB PROBE: '+$Lab.Target)
        Write-Output ('Lease/backup: '+$Lab.Lease)
        Write-Output 'Temporary probe: cleanup is mandatory once PG03-05 finish.'
    } catch {
        $cause=$_
        $now=HashFile $Lab.Registry
        if($now -ceq $newHash){AtomicWrite $Lab.Registry $original}
        elseif($now -cne $oldHash){Deny ('Unexpected registry mutation; retain recovery files: '+$cause)}
        if(Test-Path -LiteralPath $Lab.Target){
            if(-not (SameMap $Snapshot.Files (FileMap $Lab.Target))){
                Deny ('Unexpected installed probe contents; retain recovery files: '+$cause)
            }
            Remove-Item -LiteralPath $Lab.Target -Recurse -Force
        }
        if(Test-Path -LiteralPath $Lab.Stage){
            if(-not (SameMap $Snapshot.Files (FileMap $Lab.Stage))){
                Deny ('Unexpected staging contents; retain recovery files: '+$cause)
            }
            Remove-Item -LiteralPath $Lab.Stage -Recurse -Force
        }
        if(Test-Path -LiteralPath $Lab.Lease){Remove-Item -LiteralPath $Lab.Lease -Recurse -Force}
        throw $cause
    }
}
function CleanupCore($Lab) {
    if(-not (Test-Path -LiteralPath $Lab.Lease -PathType Container)){
        Deny 'No owned deployment lease; no blind cleanup'
    }
    $leaseFile=Join-Path $Lab.Lease 'lease.json'
    $backup=Join-Path $Lab.Lease 'registry.original.bin'
    NoLinks $leaseFile;NoLinks $backup
    $lease=Get-Content -LiteralPath $leaseFile -Raw | ConvertFrom-Json
    if($lease.probe_uuid -cne $script:ProbeId -or $lease.world -cne $Lab.World){
        Deny 'Lease world or probe UUID mismatch'
    }
    $old=[IO.File]::ReadAllBytes($backup)
    if((HashBytes $old) -cne $lease.original_registry_sha256){Deny 'Registry backup SHA mismatch'}
    $now=HashFile $Lab.Registry
    if($now -cne $lease.installed_registry_sha256 -and
       $now -cne $lease.original_registry_sha256){
        Deny 'Registry modified since installation; preserve unrelated world edits'
    }
    if(Test-Path -LiteralPath $Lab.Target){
        $saved=@{}
        foreach($property in $lease.installed_files.PSObject.Properties){
            $saved[$property.Name]=[string]$property.Value
        }
        if(-not (SameMap $saved (FileMap $Lab.Target))){
            Deny 'Probe source changed on disk; refuse unsafe deletion'
        }
    }
    if(Test-Path -LiteralPath $Lab.Stage){Deny 'Unexpected staging directory; manual review required'}
    if($now -cne $lease.original_registry_sha256){
        AtomicWrite $Lab.Registry $old
        if((HashFile $Lab.Registry) -cne $lease.original_registry_sha256){
            Deny 'Registry restore verification failed'
        }
    }
    if(Test-Path -LiteralPath $Lab.Target){Remove-Item -LiteralPath $Lab.Target -Recurse -Force}
    Remove-Item -LiteralPath $Lab.Lease -Recurse -Force
    Write-Output 'CLEANED: original world registration restored; only owned temporary probe removed.'
}

# When dot-sourced by tests, functions are defined but no server is inspected.
if($MyInvocation.InvocationName -eq '.'){return}
if($Apply -and $Mode -notin @('Install','Cleanup')){Deny '-Apply permitted only with Install or Cleanup'}
$snapshot=GitSource ($Mode -in @('Install','Cleanup'))
if($Mode -eq 'Sync'){
    $current=Invoke-CheckedGit -Words @('branch','--show-current')
    if($current -cne $script:Branch){Deny 'Sync requires docs/hart-logistics-planning branch'}
    [void](Invoke-CheckedGit -Words @('fetch','--no-tags','origin',$script:Branch))
    [void](Invoke-CheckedGit -Words @('merge','--ff-only','FETCH_HEAD'))
    Write-Output 'Fast-forward source sync complete. Re-run Plan/Install with new HEAD.'
    return
}
if($Mode -eq 'Plan'){
    Write-Output ('SOURCE PLAN: '+$snapshot.Commit)
    Write-Output ('Git test-pack source: '+$script:Source)
    Write-Output ('Only approved LAB: '+$script:AllowedLab)
    Write-Output 'No Minecraft server accessed. No world settings will be changed.'
    return
}
CheckAllowedLab
$lab=LabInfo $script:AllowedLab
if($Mode -eq 'CheckLab'){
    $entries=Registry ([IO.File]::ReadAllText($lab.Registry))
    $registered=@($entries.Items | Where-Object { $_.pack_id -eq $script:ProbeId })
    Write-Output ('READ-ONLY LAB PREFLIGHT: '+$lab.World)
    Write-Output ('Probe registered: '+($registered.Count -ne 0))
    Write-Output ('Install location: '+$lab.Target)
    Write-Output ('Owned lease: '+$lab.Lease)
    return
}
if(-not $Apply){Deny 'Install/Cleanup require explicit -Apply'}
CheckLabStopped
if($Mode -eq 'Install'){DeployCore $lab $snapshot}
elseif($Mode -eq 'Cleanup'){
    if(-not $ConfirmProbeCleared){
        Deny 'Cleanup requires -ConfirmProbeCleared after any important test inventory is saved/discarded'
    }
    CleanupCore $lab
}
