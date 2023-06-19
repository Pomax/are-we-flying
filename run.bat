@echo off
start "" cmd /k "cd src\api & title API-Server & node api-server.js"
start "" cmd /k "cd src\ & title Web-Server & node web-server.js --browser"
start "" cmd /k "cd src\elevation & title ALOS-Server & node alos-server.js"
