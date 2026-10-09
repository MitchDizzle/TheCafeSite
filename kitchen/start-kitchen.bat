@echo off
rem Kitchen order board: updates itself, starts the board program, then
rem opens Chrome full-screen. Safe to run again at any time (a desktop
rem shortcut is fine): it replaces the board program and the board window,
rem and touches nothing else on the PC.
rem Put a shortcut to this file in shell:startup so it runs at sign-in.
rem
rem ON A DEVELOPMENT COMPUTER, run start-dev.bat instead. It sets
rem KITCHEN_DEV=1, and then this file never touches git and opens the board
rem in an ordinary window rather than locked full screen.
cd /d "%~dp0"
if "%~1"=="server" goto server
if "%~1"=="launch" goto launch
if "%~1"=="window" goto window

if "%KITCHEN_DEV%"=="1" (
  echo Development copy: not updating from git, opening the board in a normal window.
  goto launch
)

rem The branch the kitchen PC runs: main, the deployed branch. Work happens
rem on dev and is merged into main to ship it (CLAUDE.md, "Branches").
set BOARD_BRANCH=main

rem Which branch this copy is on now, and whether to update it. Worked out
rem BEFORE the update block, because cmd expands %VARS% when it reads the
rem block, not as it runs.
set HERE=
for /f "delims=" %%B in ('git -C .. rev-parse --abbrev-ref HEAD 2^>nul') do set HERE=%%B
set UPDATE=no
if "%HERE%"=="%BOARD_BRANCH%" set UPDATE=yes
if "%HERE%"=="kitchen-board" set UPDATE=yes

rem Step 1: get the latest board code, then start it.
rem
rem It only updates a copy that is on main already, or on kitchen-board,
rem the branch the kitchen PC ran before 2026-10-08 (that one is moved to
rem main, once). A copy on any other branch is somebody's work in progress:
rem it is left exactly as it is and started as it stands.
rem config.json and state.json are never changed by this: git ignores them.
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
  ) else if "%UPDATE%"=="no" (
    echo This copy is on the branch "%HERE%", not %BOARD_BRANCH%: not updating it.
    echo On a development computer, use start-dev.bat.
    timeout /t 5 >nul
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
rem Close a board program that is already running, so a restart always runs
rem the current code and never stacks two. The window is replaced below.
taskkill /FI "WINDOWTITLE eq Kitchen board program*" /T /F >nul 2>&1

start "Kitchen board program" /min "%~f0" server
timeout /t 4 /nobreak >nul
call :window
exit /b

:window
rem Open (or reopen) the board window. Also run on its own by the board
rem program's watchdog when the board stops checking in: somebody's Home
rem key took Chrome to another page, say.
set BROWSER=
for %%P in ("%ProgramFiles%\Google\Chrome\Application\chrome.exe" "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe") do (
  if not defined BROWSER if exist %%P set BROWSER=%%P
)
if not defined BROWSER (
  echo No Chrome or Edge found. Install Chrome and run this again.
  pause
  exit /b 1
)

rem Development: an ordinary window on its own profile. Close it by hand.
if "%KITCHEN_DEV%"=="1" (
  start "" %BROWSER% --no-first-run --no-default-browser-check --autoplay-policy=no-user-gesture-required --user-data-dir="%LOCALAPPDATA%\KitchenBoardDev" --new-window http://localhost:8090
  exit /b
)

rem Close a board window already open. It is found by its own Chrome
rem profile folder, so no other Chrome window is affected.
powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*--user-data-dir=*KitchenBoard*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"

rem A separate profile so kiosk mode applies even if Chrome is already open.
rem No first-run screens on it: no "make Chrome the default", no sign-in.
start "" %BROWSER% --kiosk --no-first-run --no-default-browser-check --autoplay-policy=no-user-gesture-required --noerrdialogs --disable-session-crashed-bubble --disable-features=Translate --user-data-dir="%LOCALAPPDATA%\KitchenBoard" http://localhost:8090

rem Bring the board to the front once Chrome has opened it, so the number
rem pad types into the board and not into this window. Waits up to 20 s.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0focus-board.ps1"
exit /b

:server
rem If the program ever stops, start it again.
node server.js
echo Board program stopped. Restarting in 5 seconds...
timeout /t 5 /nobreak >nul
goto server
