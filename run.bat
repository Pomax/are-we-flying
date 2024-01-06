@echo off
start "API Server" cmd /k "node api-server.js %1"
start "Web Server" cmd /k "node web-server.js --browser"
