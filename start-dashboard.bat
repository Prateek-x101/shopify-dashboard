@echo off
rem Runs the whole dashboard (website + API + WhatsApp + sync) on ONE port: http://localhost:5173
rem   start-dashboard.bat          -> start (builds the website only if it was never built)
rem   start-dashboard.bat build    -> rebuild the website first (after code changes)
cd /d "%~dp0"
set PORT=5173
set BASE_PATH=/
set NODE_ENV=production

if /i "%1"=="build" goto build
if not exist "artifacts\shopify-dashboard\dist\public\index.html" goto build
goto api

:build
echo Building the dashboard website (takes about a minute)...
pushd artifacts\shopify-dashboard
node --max-old-space-size=4096 node_modules\vite\bin\vite.js build --config vite.config.ts
if errorlevel 1 (popd & echo Website build failed & pause & exit /b 1)
popd

:api
echo Building the API server...
pushd artifacts\api-server
node build.mjs
if errorlevel 1 (popd & echo API build failed & pause & exit /b 1)
echo.
echo  Dashboard running at  http://localhost:5173   (keep this window open)
echo.
node --enable-source-maps dist\index.mjs
popd
pause
