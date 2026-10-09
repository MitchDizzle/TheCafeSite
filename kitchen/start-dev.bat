@echo off
rem The kitchen board on a DEVELOPMENT computer. Same as start-kitchen.bat,
rem except that it:
rem   - never runs git: the checkout and its branch are left as they are
rem   - opens the board in an ordinary window, not locked full screen
rem   - runs on demo orders (KITCHEN_MOCK=1), never the real Square account,
rem     unless KITCHEN_MOCK is already set (set KITCHEN_MOCK=0 first to try it
rem     against the account in config.json; Specials WRITES to Square)
rem   - never powers the computer off, updates itself, or runs the watchdog
rem Close the board program's minimised window to stop it.
set KITCHEN_DEV=1
if not defined KITCHEN_MOCK set KITCHEN_MOCK=1
call "%~dp0start-kitchen.bat"
