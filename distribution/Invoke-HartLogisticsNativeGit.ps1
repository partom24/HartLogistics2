<#
.SYNOPSIS
  Git for Windows invocation that remains safe under Windows PowerShell 5.1
  and PowerShell 7 with ErrorActionPreference=Stop.
.DESCRIPTION
  Git writes ordinary progress messages (for example, "Cloning into ...")
  to stderr. Windows PowerShell 5.1 can surface such text as a terminating
  NativeCommandError under Stop even when Git succeeds. Only this function's
  local preference is relaxed for Git's native stream. The exact native
  process exit code is checked immediately after invocation. A nonzero code
  always fails closed with a useful diagnostic; it never grants install
  permission or changes an existing repository.
#>
function Invoke-HartLogisticsNativeGit {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory=$true)]
        [ValidateNotNullOrEmpty()]
        [string[]]$GitArguments
    )
    # Function-scoped preferences: no change to the caller's strict mode.
    # The native-command preference is recognized by newer PowerShell and
    # harmless as a local variable in Windows PowerShell 5.1.
    $ErrorActionPreference = 'Continue'
    $PSNativeCommandUseErrorActionPreference = $false
    $output = & git.exe @GitArguments 2>&1
    $exitCode = $LASTEXITCODE
    $details = (($output | Out-String).Trim())
    if ($exitCode -ne 0) {
        $reason = if ($details) { $details } else { 'Git provided no diagnostic output' }
        throw ('REFUSED HartLogistics Git command failed (exit ' + $exitCode +
               '): git ' + ($GitArguments -join ' ') + ' | ' + $reason)
    }
    return $details
}
