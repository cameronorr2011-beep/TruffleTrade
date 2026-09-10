@echo off
title WOLFPIT - AI Stock Trader
cd /d "%~dp0"
echo Starting WOLFPIT engine and website...
start "WOLFPIT engine" cmd /k npm run engine
timeout /t 3 >nul
start "WOLFPIT website" cmd /k npm run dev
timeout /t 6 >nul
start http://localhost:3210/desk
echo WOLFPIT is online: engine (trading) + website (http://localhost:3210).
echo Close the two opened windows to stop the desk.
