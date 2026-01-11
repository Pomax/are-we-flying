@echo off
start "API Server" cmd /k "cd current && node --env-file=../.env api-server.js %1"
start "Web Server" cmd /k "cd current && node --env-file=../.env web-server.js --owner --browser"
