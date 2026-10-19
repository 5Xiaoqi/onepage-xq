@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 一页 · 本地预览

echo.
echo  一页 · 本地预览
echo  ================================
echo.

where py >nul 2>nul
if %errorlevel%==0 (set "PY=py -3" & goto :found)
where python >nul 2>nul
if %errorlevel%==0 (set "PY=python" & goto :found)

echo  没有找到 Python。
echo  可以到 Microsoft Store 搜索 “Python” 安装，或者直接按说明部署到网上。
echo.
pause
exit /b 1

:found
set "IP="
for /f "tokens=2 delims=:" %%A in ('ipconfig ^| findstr /i "IPv4"') do (
  if not defined IP set "IP=%%A"
)
if defined IP set "IP=%IP: =%"

echo  电脑访问:  http://127.0.0.1:8080
if defined IP echo  手机预览:  http://%IP%:8080   ^(需同一 Wi-Fi^)
echo.
echo  注意: 手机用这个地址只能预览，不能“添加到主屏幕”（需要 HTTPS）。
echo  正式安装请看 使用说明.md 第 1 节。
echo.
echo  按 Ctrl+C 停止。
echo.

start "" http://127.0.0.1:8080/
%PY% -m http.server 8080
