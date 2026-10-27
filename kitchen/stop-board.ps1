# Stops the kitchen board's own processes. start-kitchen.bat runs this before
# it starts new ones.
#
#   -Program  the board program: the "server" loop (start-kitchen.bat server)
#             and the node it runs. The loop goes first, so it can't start
#             node again in the meantime.
#   -Window   the board's Chrome (or Edge) window, by its own profile folder,
#             so no other Chrome window is touched.
#
# Found by what they are, not by window title (client 2026-10-27: windows
# piling up). A title is only visible to taskkill when the old console hosts
# the window; under Windows Terminal it isn't, so the old program was left
# running beside the new one, which then couldn't start.

param([switch]$Program, [switch]$Window)

$stopped = @()
if ($Program) {
    $loops = @(Get-CimInstance Win32_Process -Filter "Name = 'cmd.exe'" |
        Where-Object { $_.CommandLine -like '*start-kitchen.bat*server*' })
    $loopIds = @($loops | ForEach-Object { $_.ProcessId })
    foreach ($p in $loops) { Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue; $stopped += "loop $($p.ProcessId)" }
    if ($loopIds.Count) {
        Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
            Where-Object { $loopIds -contains $_.ParentProcessId } |
            ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue; $stopped += "node $($_.ProcessId)" }
    }
}
if ($Window) {
    $browsers = 0
    Get-CimInstance Win32_Process -Filter "Name = 'chrome.exe' OR Name = 'msedge.exe'" |
        Where-Object { $_.CommandLine -like '*--user-data-dir=*KitchenBoard*' -and $_.CommandLine -notlike '*KitchenBoardDev*' } |
        ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue; $browsers++ }
    if ($browsers) { $stopped += "the board window ($browsers processes)" }
}
# One line for start-kitchen.bat's log: what was stopped, if anything.
if ($stopped.Count) { "stopped " + ($stopped -join ", ") } else { "nothing to stop" }
