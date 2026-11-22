$ErrorActionPreference = 'Stop'
. (Join-Path (Split-Path $PSScriptRoot) 'scripts/PackJson.ps1')
$text = @'
[
    { //HartBots
        "pack_id":"bots","version":[1,6,34]
    },
    { //HartLogistics
        "url":"https://example.test/a//b","note":"escaped \"//quoted\"",
        "pack_id":"hart","version":[1,4, //stored revision 72
        0]
    },
    {//XpVault
        "pack_id":"xp","version":[2,0,2]
    },
    { //HartWaypoints
        "pack_id":"waypoints","version":[0,1,10]
    }
]
'@
$rows = @(ConvertFrom-PackJson $text)
if ($rows.Count -ne 4 -or $rows[1].url -cne 'https://example.test/a//b' -or $rows[1].note -cne 'escaped "//quoted"') { throw 'Comment or string parsing failed' }
$updated = Set-PackRegistryVersion $text 'hart' @(0,5,13)
$expected = $text.Replace('"version":[1,4,','"version":[0,5,').Replace('        0]','        13]')
if ($updated -cne $expected) { throw 'Version edit changed surrounding content' }
$added = Set-PackRegistryVersion $text 'fresh' @(0,5,13)
if (!$added.StartsWith($text.Substring(0,$text.LastIndexOf(']'))) -or @(ConvertFrom-PackJson $added).Count -ne 5) { throw 'Append lost existing labels' }
Write-Output 'PASS annotated pack registry and quoted slashes'
