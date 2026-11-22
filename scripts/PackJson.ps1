# JSON strings take precedence over comments, including escaped quotes and slashes.
function Get-PackJsonTokens([string]$Text) {
    [regex]::Matches($Text, '"(?:\\.|[^"\\])*"|//[^\r\n]*|[^\s]')
}
function ConvertFrom-PackJson([string]$Text) {
    $clean = [regex]::Replace($Text, '("(?:\\.|[^"\\])*")|//[^\r\n]*', {
        param($match)
        if ($match.Groups[1].Success) { return $match.Value }
        return ' '
    })
    $value = ConvertFrom-Json -InputObject $clean -ErrorAction Stop
    foreach ($entry in $value) { $entry }
}
function Set-PackRegistryVersion([string]$Text,[string]$Uuid,[int[]]$Version) {
    $rows = @(ConvertFrom-PackJson $Text)
    $tokens = @(Get-PackJsonTokens $Text | Where-Object { !$_.Value.StartsWith('//') })
    if ($tokens.Count -lt 2 -or $tokens[0].Value -ne '[' -or $tokens[-1].Value -ne ']') { throw 'Expected pack registry array' }
    $row = -1
    $depth = 0
    $changed = $Text
    $found = 0
    for ($i=0; $i -lt $tokens.Count; $i++) {
        $token = $tokens[$i].Value
        if ($token -eq '{' -and $depth -eq 1) { $row++ }
        if ($depth -eq 2 -and $token -ceq '"version"' -and $tokens[$i+1].Value -eq ':' -and $rows[$row].pack_id -eq $Uuid) {
            $found++
            $j = $i+2
            if ($tokens[$j].Value -ne '[') { throw 'Expected numeric pack version array' }
            # Keep comments and spacing even inside the version array.
            $end = $tokens[$j].Index
            while ($tokens[$j].Value -ne ']') { $j++ }
            $length = $tokens[$j].Index+1-$end
            $original = $Text.Substring($end,$length)
            $numbers = @([regex]::Matches($original,'//[^\r\n]*|\d+') | Where-Object { !$_.Value.StartsWith('//') })
            if ($numbers.Count -ne 3) { throw 'Expected three version components' }
            for ($v=2; $v -ge 0; $v--) {
                $n = $numbers[$v]
                $changed = $changed.Remove($end+$n.Index,$n.Length).Insert($end+$n.Index,[string]$Version[$v])
            }
        }
        if ($token -in '[','{') { $depth++ }
        if ($token -in ']','}') { $depth-- }
    }
    if ($found -gt 1) { throw 'Duplicate target pack registration' }
    if ($found -eq 0) {
        if (@($rows | Where-Object { $_.pack_id -eq $Uuid }).Count) { throw 'Missing target pack version' }
        $separator = if ($row -ge 0) { ',' } else { '' }
        $entry = ConvertTo-Json -Compress -InputObject ([ordered]@{pack_id=$Uuid;version=$Version})
        $changed = $Text.Insert($tokens[-1].Index,$separator+[Environment]::NewLine+$entry+[Environment]::NewLine)
    }
    $check = @(ConvertFrom-PackJson $changed | Where-Object { $_.pack_id -eq $Uuid })
    if ($check.Count -ne 1 -or ($check[0].version -join '.') -ne ($Version -join '.')) { throw 'Registry verification failed' }
    return $changed
}
