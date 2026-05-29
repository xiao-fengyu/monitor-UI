@echo off
echo 启动 monitor-ui 后端服务...
cd /d D:\monitor-UI
start "monitor-ui" /min node server\index.js
echo monitor-ui 已启动 (端口 3100)
