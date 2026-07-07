# Export social templates to PNG via headless Chrome/Edge.
# Usage:  .\export.ps1            -> exports all templates
#         .\export.ps1 fb-post    -> exports one template
# Output: social\exports\<name>_<yyyyMMdd>.png  (exact pixel size)
param([string]$Template = "all")

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$out  = Join-Path $here "exports"
if (-not (Test-Path $out)) { New-Item -ItemType Directory $out | Out-Null }

$candidates = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
)
$browser = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $browser) { throw "No Chrome or Edge found - install one or add its path to candidates." }

# template name -> canvas size (must match the .canvas size in each file)
$sizes = [ordered]@{
    "fb-post"     = "1080,1350"
    "weekly-menu" = "1080,1350"
    "cover"       = "820,462"
    "profile-pic" = "720,720"
}

$date = Get-Date -Format "yyyyMMdd"
foreach ($name in $sizes.Keys) {
    if ($Template -ne "all" -and $Template -ne $name) { continue }
    $html = Join-Path $here "$name.html"
    if (-not (Test-Path $html)) { Write-Warning "skipping $name - $html missing"; continue }
    $png  = Join-Path $out ("{0}_{1}.png" -f $name, $date)
    # virtual-time-budget gives the Google Fonts time to load before the shot
    & $browser --headless=new --screenshot="$png" --window-size=$($sizes[$name]) `
        --hide-scrollbars --virtual-time-budget=8000 --disable-gpu "file:///$html" | Out-Null
    if (Test-Path $png) { Write-Host "exported $png" } else { Write-Warning "FAILED: $name" }
}
