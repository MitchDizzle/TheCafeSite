@echo off
rem Kitchen order board: updates itself, starts the board program, then
rem opens Chrome full-screen. Safe to run again at any time (a desktop
rem shortcut is fine): it replaces the board program and the board window,
rem and touches nothing else on the PC.
rem Put a shortcut to this file in shell:startup so it runs at sign-in.
cd /d "%~dp0"
if "%~1"=="server" goto server
if "%~1"=="launch" goto launch

rem The branch the kitchen PC runs. Change to main once kitchen-board is
rem merged (TASKS KB-7).
set BOARD_BRANCH=kitchen-board

rem Step 1: get the latest board code. Fetches the branch, switches to it
rem (so a copy cloned on main, or left on another branch, still ends up on
rem the board's code), then fast-forwards. config.json and state.json are
rem never changed by this, because git ignores them.
rem
rem This is one parenthesised block ON PURPOSE. The update can rewrite this
rem very file, and cmd reads a batch file line by line while it runs, so
rem anything after it would be read from the new file at the old position.
rem cmd parses a whole block before running it, so the block is safe, and it
rem ends by starting the (possibly new) file afresh.
(
  where git >nul 2>&1
  if errorlevel 1 (
    echo git was not found on this PC, so the board cannot update itself.
    echo Install Git for Windows, or check it is on the PATH. Starting the version already here.
  ) else if not exist "..\.git" (
    echo This folder is not a git checkout, so the board cannot update itself.
  ) else (
    echo Updating the board from %BOARD_BRANCH%...
    git -C .. fetch origin %BOARD_BRANCH%
    git -C .. checkout %BOARD_BRANCH%
    git -C .. merge --ff-only origin/%BOARD_BRANCH%
    if errorlevel 1 (
      echo Could not update. Starting the version already on this PC.
      timeout /t 5 >nul
    )
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
