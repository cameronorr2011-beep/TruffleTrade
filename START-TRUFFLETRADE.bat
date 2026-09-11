@echo off
title TruffleTrade - AI Stock Trader
cd /d "%~dp0"
echo Starting TruffleTrade engine and website...
start "TruffleTrade engine" cmd /k npm run engine
timeout /t 3 >nul
start "TruffleTrade website" cmd /k npm run dev
timeout /t 6 >nul
start http://localhost:3210/desk
echo TruffleTrade is online: engine (trading) + website (http://localhost:3210).
echo Close the two opened windows to stop the desk.
