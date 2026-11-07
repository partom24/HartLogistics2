# TEMP_TEST:PG03-05
# Windows-only synthetic tests: never load the real LAB path; never run Install
# through the public script. All fixtures live under .NET temp and are removed.
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$runner=Join-Path $PSScriptRoot 'Update-HartLogistics-Bundle1Lab.ps1'
. $runner
$script:checks=0
function Assert($ok,[string]$why) {
    if(-not $ok){throw ('TEST FAILED: '+$why)}
    $script:checks++
}
function ExpectDeny([scriptblock]$block,[string]$why) {
    $raised=$false
    try {& $block | Out-Null} catch {$raised=$true}
    Assert $raised $why
}
function NewFixture([string]$json) {
    $root=Join-Path ([IO.Path]::GetTempPath()) ('HL_PG03_05_'+[guid]::NewGuid().ToString('N'))
    [void](New-Item -ItemType Directory -Path $root)
    [void](New-Item -ItemType Directory -Path (Join-Path $root 'behavior_packs'))
    [void](New-Item -ItemType Directory -Path (Join-Path $root 'worlds\Test World') -Force)
    [IO.File]::WriteAllText((Join-Path $root 'bedrock_server.exe'),'SYNTHETIC EXE NEVER EXECUTED')
    [IO.File]::WriteAllText((Join-Path $root 'server.properties'),'level-name=Test World')
    [IO.File]::WriteAllText((Join-Path $root 'worlds\Test World\world_behavior_packs.json'),$json)
    return $root
}
function CleanupFixture([string]$root) {
    if($root -and (Test-Path -LiteralPath $root) -and
       [IO.Path]::GetFullPath($root).StartsWith([IO.Path]::GetTempPath(),
           [StringComparison]::OrdinalIgnoreCase)){
        Remove-Item -LiteralPath $root -Recurse -Force
    }
}
$otherId='00000000-1111-2222-3333-444444444444'
$base='[{"pack_id":"'+$otherId+'","version":[1,4,1]}]'
try {
    # Distinct registry shapes preserve prior registration content.
    $caseNumber=0
    foreach($raw in @(
        '[]',
        $base,
        '[{"pack_id":"'+$otherId+'","version":[1,4,1]},]',
        ('['+[Environment]::NewLine+'// prior user comment'+[Environment]::NewLine+
          '{"pack_id":"'+$otherId+'","version":[1,4,1]}, /*tail */ ]'),
        '[{"pack_id":"'+$otherId+'","version":[1,4,1],"label":"https://example.test/a//b"}]'
    )) {
        $caseNumber++
        Write-Output ('Registry test shape '+$caseNumber)
        $old=Registry $raw
        Write-Output ('  parsed original shape '+$caseNumber)
        $updated=AddRegistration $raw
        Write-Output ('  appended original shape '+$caseNumber)
        $now=Registry $updated
        Assert ($now.Items.Count -eq $old.Items.Count+1) 'Only one entry added'
        Assert ([string]$now.Items[-1].pack_id -eq $script:ProbeId) 'New UUID exact'
        for($i=0;$i -lt $old.Items.Count;$i++){
            Assert ((ConvertTo-Json -InputObject $old.Items[$i] -Depth 40 -Compress) -ceq
                (ConvertTo-Json -InputObject $now.Items[$i] -Depth 40 -Compress)) 'No unrelated edits'
        }
        Assert ($updated.Contains($raw.Substring(0,1))) 'JSONC original not discarded'
    }
    ExpectDeny {AddRegistration ('[{"pack_id":"'+$script:ProbeId+'","version":[0,0,1]}]')} 'duplicate refused'
    ExpectDeny {Registry '{"oops":1}'} 'object-shaped registry refused'
    ExpectDeny {Registry '[{"version":[1,0,0]}]'} 'missing pack ID refused'
    ExpectDeny {Registry '[ /* never closed ]'} 'unclosed comment refused'
    $bytes=[byte[]](239,187,191,91,93)
    $encoded=EncodeUtf8Like $bytes '[]'
    Assert ($encoded.Length -eq 5 -and $encoded[0] -eq 239) 'UTF8 BOM preserved'
    Assert (-not (SameMap @{a='one'} @{a='two'})) 'hash mismatch rejected'
    Assert (SameMap @{a='one'} @{a='one'}) 'matching map recognized'

    # Real source, clean Git, exact file inventory are verified without a server.
    $snapshot=GitSource $false
    Assert ($snapshot.Files.Count -eq 4) 'Only four source files'
    Assert ($snapshot.Commit -match '^[0-9a-f]{40}$') 'Pinned source fingerprint'
    ExpectDeny { NoLinks (Join-Path ([IO.Path]::GetTempPath()) ('missing_'+[guid]::NewGuid().ToString('N'))) } 'missing path rejected'
    $temp=NewFixture $base
    try {
        $lab=LabInfo $temp
        Assert ($lab.World.EndsWith('Test World')) 'Fixture world only'
        $original=[IO.File]::ReadAllBytes($lab.Registry)
        DeployCore $lab $snapshot | Out-Null
        Assert (Test-Path -LiteralPath $lab.Target -PathType Container) 'Installed test pack'
        Assert (Test-Path -LiteralPath $lab.Lease -PathType Container) 'Lease and backup'
        Assert (SameMap $snapshot.Files (FileMap $lab.Target)) 'Installed source SHA exact'
        $registered=Registry ([IO.File]::ReadAllText($lab.Registry))
        Assert ($registered.Items.Count -eq 2) 'Installed entry count'
        Assert ($registered.Items[0].pack_id -eq $otherId) 'Unrelated UUID retained'
        Assert ($registered.Items[-1].pack_id -eq $script:ProbeId) 'Probe UUID added'
        ExpectDeny { DeployCore $lab $snapshot } 'Repeat install refuses overwrite'
        # Modify registry to simulate third-party change; cleanup must fail closed.
        $installedRaw=[IO.File]::ReadAllText($lab.Registry)
        $tampered=$installedRaw.Replace('1,4,1','1,4,2')
        [IO.File]::WriteAllText($lab.Registry,$tampered)
        ExpectDeny { CleanupCore $lab } 'Cleanup refuses unrelated registry changes'
        Assert (Test-Path -LiteralPath $lab.Lease) 'Lease retained after unsafe cleanup'
        [IO.File]::WriteAllText($lab.Registry,$installedRaw)
        CleanupCore $lab | Out-Null
        Assert (-not (Test-Path -LiteralPath $lab.Target)) 'Owned pack removed'
        Assert (-not (Test-Path -LiteralPath $lab.Lease)) 'Lease removed'
        $after=[IO.File]::ReadAllBytes($lab.Registry)
        Assert ((HashBytes $after) -eq (HashBytes $original)) 'Registry bytes exactly restored'
        Assert ($after.Length -eq $original.Length) 'Registry length restored'
    } finally {CleanupFixture $temp}
    # Existing target must never be overwritten.
    $temp=NewFixture $base
    try {
        $lab=LabInfo $temp
        [void](New-Item -ItemType Directory -Path $lab.Target)
        [IO.File]::WriteAllText((Join-Path $lab.Target 'owner.txt'),'DO NOT TOUCH')
        ExpectDeny {DeployCore $lab $snapshot} 'Existing target refused'
        Assert ([IO.File]::ReadAllText((Join-Path $lab.Target 'owner.txt')) -eq 'DO NOT TOUCH') 'Other pack preserved'
    } finally {CleanupFixture $temp}
    # A mismatched world name must be refused before a registry can be written.
    $temp=NewFixture $base
    try {
        [IO.File]::WriteAllText((Join-Path $temp 'server.properties'),'level-name=..\Production')
        ExpectDeny {LabInfo $temp} 'Unsafe world name refused'
    } finally {CleanupFixture $temp}
    Write-Output ('WINDOWS SYNTHETIC PASS: '+$script:checks+' assertions (no LAB/production access)')
} finally {
    # No temporary test folder should survive an exception.
}
