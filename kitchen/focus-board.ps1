# Brings the board's Chrome window to the front once it opens, so the
# number pad types into the board and not into the update window or the
# board program's console. start-kitchen.bat runs this right after it
# starts Chrome.
#
# Retries for a while because Chrome takes a few seconds to open its window,
# and stops once the board has stayed in front for two checks in a row.
# The window is found by its own Chrome profile folder, the same match
# start-kitchen.bat uses to close it, so no other Chrome window is touched.

param(
    [int]$Seconds = 20,
    [string]$ProfileName = "KitchenBoard"
)

Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class KitchenWin {
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
}
"@

function Find-BoardWindow {
    $ids = Get-CimInstance Win32_Process -Filter "Name = 'chrome.exe' OR Name = 'msedge.exe'" |
        Where-Object { $_.CommandLine -like "*--user-data-dir=*$ProfileName*" } |
        Select-Object -ExpandProperty ProcessId
    if (-not $ids) { return $null }
    Get-Process -Id $ids -ErrorAction SilentlyContinue |
        Where-Object { $_.MainWindowHandle -ne [IntPtr]::Zero } |
        Select-Object -First 1
}

$deadline = (Get-Date).AddSeconds($Seconds)
$inFront = 0
while ((Get-Date) -lt $deadline) {
    $win = Find-BoardWindow
    if ($win) {
        $hWnd = $win.MainWindowHandle
        if ([KitchenWin]::GetForegroundWindow() -eq $hWnd) {
            $inFront++
            if ($inFront -ge 2) { exit 0 }
        } else {
            $inFront = 0
            # Windows only lets the app that's already in front hand focus
            # over. A tap of Alt counts as input and lifts that lock; on its
            # own it does nothing to the board or to a console window.
            [KitchenWin]::keybd_event(0x12, 0, 0, [UIntPtr]::Zero)
            [KitchenWin]::keybd_event(0x12, 0, 2, [UIntPtr]::Zero)
            # SW_SHOW, not SW_RESTORE: restore would knock the kiosk window
            # out of full screen.
            [KitchenWin]::ShowWindow($hWnd, 5) | Out-Null
            [KitchenWin]::SetForegroundWindow($hWnd) | Out-Null
        }
    }
    Start-Sleep -Milliseconds 700
}
Write-Host "Couldn't bring the board to the front. Click on it once so the number pad works."
exit 1
