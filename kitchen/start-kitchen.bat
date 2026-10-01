@echo off
rem Kitchen order board: starts the board program, then Chrome full-screen.
rem Put a shortcut to this file in shell:startup so it runs at sign-in.
cd /d "%~dp0"
if "%~1"=="server" goto server

rem Close a board program that is already running, so a restart (say,
rem after a git pull) always runs the current code.
taskkill /FI "WINDOWTITLE eq Kitchen board program*" /T /F >nul 2>&1
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
