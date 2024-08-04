@echo off
start "API Server" cmd /k "cd parts/part 6/auto-landing && node api-server.js %1"
start "Web Server" cmd /k "cd parts/part 6/auto-landing && node web-server.js --owner --browser"
