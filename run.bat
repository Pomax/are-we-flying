@echo off
start "API Server" cmd /k "title API-Server && node api-server.js"
start "Web Server" cmd /k "title Web-Server && node web-server.js --owner --browser"
