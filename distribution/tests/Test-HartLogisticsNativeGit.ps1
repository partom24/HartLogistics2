<# Offline regression for Windows PowerShell 5.1 and PowerShell 7.
   Demonstrates that Git's normal clone progress on stderr is not a failure
   under ErrorActionPreference=Stop, while real Git failures remain fatal.
   Creates only disposable Git repositories; never accesses a Bedrock LAB. #>
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path (Split-Path $PSScriptRoot -Parent) 'Invoke-HartLogisticsNativeGit.ps1')
$root = Join-Path ([IO.Path]::GetTempPath()) ('hart159-nativegit-' + [Guid]::NewGuid().ToString('N'))
$seed = Join-Path $root 'source'
$copy = Join-Path $root 'clone'
try {
    [void](New-Item -ItemType Directory -Path $seed -Force)
    Invoke-HartLogisticsNativeGit -GitArguments @('init','--quiet','--initial-branch=main',$seed) | Out-Null
    Invoke-HartLogisticsNativeGit -GitArguments @('-C',$seed,'config','user.email','test@example.invalid') | Out-Null
    Invoke-HartLogisticsNativeGit -GitArguments @('-C',$seed,'config','user.name','NativeGitTest') | Out-Null
    [IO.File]::WriteAllText((Join-Path $seed 'keep.txt'),'source-only')
    Invoke-HartLogisticsNativeGit -GitArguments @('-C',$seed,'add','--','keep.txt') | Out-Null
    Invoke-HartLogisticsNativeGit -GitArguments @('-C',$seed,'commit','--quiet','-m','seed') | Out-Null

    # Deliberately omit --quiet: Git emits "Cloning into ..." to stderr.
    # This previously caused a NativeCommandError in Windows PowerShell 5.1.
    Invoke-HartLogisticsNativeGit -GitArguments @('clone','--single-branch','--branch','main',$seed,$copy) | Out-Null
    if ((Invoke-HartLogisticsNativeGit -GitArguments @('-C',$copy,'rev-parse','--is-inside-work-tree')) -ne 'true') {
        throw 'Clone was not completed'
    }
    if ([IO.File]::ReadAllText((Join-Path $copy 'keep.txt')) -ne 'source-only') {
        throw 'Cloned content differs'
    }
    # Idempotent source update should remain supported with no forced reset.
    Invoke-HartLogisticsNativeGit -GitArguments @('-C',$copy,'pull','--quiet','--ff-only','origin','main') | Out-Null

    $failedClosed = $false
    try {
        Invoke-HartLogisticsNativeGit -GitArguments @('-C',$copy,'rev-parse','--verify','refs/heads/missing-branch') | Out-Null
    } catch {
        if ($_.Exception.Message -notmatch 'REFUSED HartLogistics Git command failed \(exit') { throw }
        $failedClosed = $true
    }
    if (-not $failedClosed) { throw 'Nonzero Git exit was incorrectly accepted' }
    if ($ErrorActionPreference -ne 'Stop') { throw 'Git helper modified caller error preference' }
    # PowerShell's -Command host returns the last native process exit status,
    # even when that deliberately failing command was successfully caught.
    # Clear this *test-only* expected-failure status after the assertion.
    $global:LASTEXITCODE = 0
    Write-Output ('PASS: Native Git stderr, source clone/pull, nonzero exit refusal, and strict preference on PS ' + $PSVersionTable.PSVersion)
} finally {
    if (Test-Path -LiteralPath $root) {
        Remove-Item -LiteralPath $root -Recurse -Force
    }
}
