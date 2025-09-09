@echo off
setlocal enabledelayedexpansion

REM React Trading Dashboard - Development Startup Script (Windows)
REM This script cleans up ports and starts the React development server

echo.
echo 🚀 Starting React Trading Dashboard...
echo ======================================

REM Configuration
set REACT_PORT=3000
set BACKEND_PORT=8000

REM Function to kill process on port
echo 🧹 Cleaning up ports...

REM Kill React port
echo 🔍 Checking for processes on port %REACT_PORT%...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :%REACT_PORT%') do (
    if not "%%a"=="0" (
        echo ❌ Found React Dev Server running on port %REACT_PORT% (PID: %%a)
        taskkill /PID %%a /F >nul 2>&1
        echo ✅ Killed process %%a
    )
)

REM Kill Backend port
echo 🔍 Checking for processes on port %BACKEND_PORT%...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :%BACKEND_PORT%') do (
    if not "%%a"=="0" (
        echo ❌ Found Backend API Server running on port %BACKEND_PORT% (PID: %%a)
        taskkill /PID %%a /F >nul 2>&1
        echo ✅ Killed process %%a
    )
)

echo ✅ Port cleanup completed

REM Wait for cleanup
timeout /t 2 /nobreak >nul

REM Check Node.js and npm
echo 🔍 Checking dependencies...
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Node.js is not installed
    echo 💡 Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

where npm >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ npm is not installed
    echo 💡 npm should come with Node.js installation
    pause
    exit /b 1
)

REM Get versions
for /f "tokens=*" %%i in ('node --version') do set NODE_VERSION=%%i
for /f "tokens=*" %%i in ('npm --version') do set NPM_VERSION=%%i

echo ✅ Node.js %NODE_VERSION% detected
echo ✅ npm %NPM_VERSION% detected

REM Check if we're in the right directory
if not exist "package.json" (
    echo ❌ package.json not found
    echo 💡 Make sure you're in the react-trading-app directory
    pause
    exit /b 1
)

REM Install dependencies if node_modules doesn't exist
if not exist "node_modules" (
    echo 📦 node_modules not found, installing dependencies...
    npm install
    if !errorlevel! equ 0 (
        echo ✅ Dependencies installed successfully
    ) else (
        echo ❌ Failed to install dependencies
        pause
        exit /b 1
    )
) else (
    echo ✅ Dependencies already installed
)

REM Set environment variables
set PORT=%REACT_PORT%
set BROWSER=none
set GENERATE_SOURCEMAP=true

echo.
echo 🌐 Environment Configuration:
echo    Port: %REACT_PORT%
echo    Auto-browser: disabled
echo    Source maps: enabled

REM Start the development server
echo.
echo 🚀 Starting React development server...
echo ======================================
echo 🌐 Dashboard will be available at: http://localhost:%REACT_PORT%
echo 📱 Mobile access: http://[your-ip]:%REACT_PORT%
echo ⚡ Hot reload is enabled - changes will auto-refresh
echo 🛑 Press Ctrl+C to stop the server
echo ======================================
echo.

REM Start the server
npm start

REM If we get here, the server has stopped
echo.
echo 🛑 React development server stopped
echo 👋 Thanks for using the Trading Dashboard!
pause