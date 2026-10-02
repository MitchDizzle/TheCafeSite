@echo off
rem Kitchen order board: updates itself, starts the board program, then
rem opens Chrome full-screen. Safe to run again at any time (a desktop
rem shortcut is fine): it replaces the board program and the board window,
rem and touches nothing else on the PC.
rem Put a shortcut to this file in shell:startup so it runs at sign-in.
cd /d "%~dp0"
if "%~1"=="server" goto server
if "%~1"=="launch" goto launch

rem Step 1: get the latest board code. config.json is never changed by this,
rem because git ignores it.
rem
rem This is one parenthesised block ON PURPOSE. git pull can rewrite this very
rem file, and cmd reads a batch file line by line while it runs, so anything
rem after the pull would be read from the new file at the old position. cmd
rem parses a whole block before running it, so the block is safe, and it ends
rem by starting the (possibly new) file afresh.
(
  where git >nul 2>&1
  if not errorlevel 1 if exist "..\.git" (
    echo Checking for board updates...
    git -C .. pull --ff-only
    if errorlevel 1 echo Could not update. Starting the version already on this PC.
  )
  "%~f0" launch
)
exit /b

:launch
rem Close a board program and a board window that are already running, so a
rem restart always runs the current code and never stacks two windows. The
rem window is found by its own Chrome profile folder, so no other Chrome
rem window is affected.
taskkill /FI "WINDOWTITLE eq Kitchen board program*" /T /F >nul 2>&1
powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*--user-data-dir=*KitchenBoard*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"

start "Kitchen board program" /min "%~f0" server
timeout /t 4 /nobreak >nul

set BROWSER=
for %%P in ("%ProgramFiles%\Google\Chrome\Application\chrome.exe" "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe") do (
  if not defined BROWSER if exist %%P set BROWSER=%%P
)
if not defined BROWSER (
  echo No Chrome or Edge found. Install Chrome and run this again.
  pause
  exit /b 1
)

rem A separate profile so kiosk mode applies even if Chrome is already open.
start "" %BROWSER% --kiosk --autoplay-policy=no-user-gesture-required --noerrdialogs --disable-session-crashed-bubble --disable-features=Translate --user-data-dir="%LOCALAPPDATA%\KitchenBoard" http://localhost:8090
exit /b

:server
rem If the program ever stops, start it again.
node server.js
echo Board program stopped. Restarting in 5 seconds...
timeout /t 5 /nobreak >nul
goto server
