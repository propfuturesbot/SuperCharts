@echo off
setlocal enabledelayedexpansion

REM Trading System Master Startup Script (Windows)
REM This script starts both the React frontend and Node.js backend simultaneously

title Trading System Startup

REM ASCII Art Banner
echo.
echo ╔════════════════════════════════════════════════════════════════════════════════════════════════╗
echo ║                                                                                                ║
echo ║  ████████╗██████╗  █████╗ ██████╗ ██╗███╗   ██╗ ██████╗     ███████╗██╗   ██╗███████╗████████╗║
echo ║  ╚══██╔══╝██╔══██╗██╔══██╗██╔══██╗██║████╗  ██║██╔════╝     ██╔════╝╚██╗ ██╔╝██╔════╝╚══██╔══╝║
echo ║     ██║   ██████╔╝███████║██║  ██║██║██╔██╗ ██║██║  ███╗    ███████╗ ╚████╔╝ ███████╗   ██║   ║
echo ║     ██║   ██╔══██╗██╔══██║██║  ██║██║██║╚██╗██║██║   ██║    ╚════██║  ╚██╔╝  ╚════██║   ██║   ║
echo ║     ██║   ██║  ██║██║  ██║██████╔╝██║██║ ╚████║╚██████╔╝    ███████║   ██║   ███████║   ██║   ║
echo ║     ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝╚═════╝ ╚═╝╚═╝  ╚═══╝ ╚═════╝     ╚══════╝   ╚═╝   ╚══════╝   ╚═╝   ║
echo ║                                                                                                ║
echo ║                              Futuristic Trading Dashboard v2.0                                ║
echo ║                                                                                                ║
echo ╚════════════════════════════════════════════════════════════════════════════════════════════════╝
echo.

echo 🚀 Starting Complete Trading System...
echo ======================================

REM Configuration
set REACT_PORT=3000
set BACKEND_PORT=8000
set SIGNALR_PORT=5000

REM Function to kill process on port
echo 🧹 Cleaning up ports...

REM Kill React port
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :%REACT_PORT%') do (
    if not "%%a"=="0" (
        echo ❌ Killing process on port %REACT_PORT% (PID: %%a)
        taskkill /PID %%a /F >nul 2>&1
    )
)

REM Kill Backend port
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :%BACKEND_PORT%') do (
    if not "%%a"=="0" (
        echo ❌ Killing process on port %BACKEND_PORT% (PID: %%a)
        taskkill /PID %%a /F >nul 2>&1
    )
)

REM Kill SignalR port
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :%SIGNALR_PORT%') do (
    if not "%%a"=="0" (
        echo ❌ Killing process on port %SIGNALR_PORT% (PID: %%a)
        taskkill /PID %%a /F >nul 2>&1
    )
)

echo ✅ Port cleanup completed
timeout /t 2 /nobreak >nul

REM Check system requirements
echo 🔍 Checking system requirements...

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
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('node --version') do set NODE_VERSION=%%i
for /f "tokens=*" %%i in ('npm --version') do set NPM_VERSION=%%i

echo ✅ Node.js %NODE_VERSION% detected
echo ✅ npm %NPM_VERSION% detected

REM Check project directories
set SCRIPT_DIR=%~dp0
set REACT_DIR=%SCRIPT_DIR%react-trading-app
set BACKEND_DIR=%SCRIPT_DIR%trading-backend

echo 🔍 Checking project structure...

if not exist "%REACT_DIR%" (
    echo ❌ React Frontend directory not found: %REACT_DIR%
    echo 💡 Expected React app at: %REACT_DIR%
    pause
    exit /b 1
) else (
    echo ✅ Found React Frontend directory: %REACT_DIR%
)

set BACKEND_AVAILABLE=false
if exist "%BACKEND_DIR%" (
    echo ✅ Found Trading Backend directory: %BACKEND_DIR%
    set BACKEND_AVAILABLE=true
) else (
    echo ⚠️  Trading Backend directory not found: %BACKEND_DIR%
    echo ℹ️  Will start only React frontend
)

REM Create logs directories
if not exist "%REACT_DIR%\logs" mkdir "%REACT_DIR%\logs"
if "%BACKEND_AVAILABLE%"=="true" (
    if not exist "%BACKEND_DIR%\logs" mkdir "%BACKEND_DIR%\logs"
)

REM Install dependencies
echo 📦 Checking dependencies...

echo 🔍 Checking React dependencies...
cd /d "%REACT_DIR%"
if not exist "node_modules" (
    echo 📦 Installing React dependencies...
    npm install
    if !errorlevel! neq 0 (
        echo ❌ Failed to install React dependencies
        pause
        exit /b 1
    )
) else (
    echo ✅ React dependencies already installed
)

if "%BACKEND_AVAILABLE%"=="true" (
    echo 🔍 Checking Backend dependencies...
    cd /d "%BACKEND_DIR%"
    if not exist "node_modules" (
        echo 📦 Installing Backend dependencies...
        npm install
        if !errorlevel! neq 0 (
            echo ❌ Failed to install Backend dependencies
            pause
            exit /b 1
        )
    ) else (
        echo ✅ Backend dependencies already installed
    )
)

cd /d "%SCRIPT_DIR%"

REM Start services
echo.
echo 🚀 Starting Trading System Services...
echo ======================================

REM Start Backend first (if available)
if "%BACKEND_AVAILABLE%"=="true" (
    echo 🚀 Starting Backend Service...
    cd /d "%BACKEND_DIR%"
    start "Trading Backend" cmd /c "scripts\start-backend.bat"
    cd /d "%SCRIPT_DIR%"
    echo ✅ Backend service started in new window
    timeout /t 5 /nobreak >nul
)

REM Start React Frontend
echo 🚀 Starting Frontend Service...
cd /d "%REACT_DIR%"
start "Trading Frontend" cmd /c "scripts\start-dev.bat"
cd /d "%SCRIPT_DIR%"
echo ✅ Frontend service started in new window

REM Wait for services to be ready
echo ⏳ Waiting for services to be ready...
timeout /t 10 /nobreak >nul

REM Display service information
echo.
echo ════════════════════════════════════════════════════════════════
echo 🎉 Trading System is now running!
echo ════════════════════════════════════════════════════════════════
echo 🌐 Frontend Dashboard: http://localhost:%REACT_PORT%

if "%BACKEND_AVAILABLE%"=="true" (
    echo ⚡ Backend API: http://localhost:%BACKEND_PORT%
    echo 📡 SignalR Hub: http://localhost:%SIGNALR_PORT%
    echo 📚 API Docs: http://localhost:%BACKEND_PORT%/docs
    echo 💻 Health Check: http://localhost:%BACKEND_PORT%/health
)

echo ════════════════════════════════════════════════════════════════
echo 📋 Service Status:
echo    ✅ React Frontend ^(Port %REACT_PORT%^)
if "%BACKEND_AVAILABLE%"=="true" (
    echo    ✅ Backend API ^(Port %BACKEND_PORT%^)
    echo    ✅ SignalR Hub ^(Port %SIGNALR_PORT%^)
)
echo ════════════════════════════════════════════════════════════════
echo 📝 Services are running in separate windows
echo 🌐 Opening browser to dashboard...
echo 🛑 Close the service windows to stop the system
echo ════════════════════════════════════════════════════════════════

REM Auto-open browser
timeout /t 3 /nobreak >nul
start "" "http://localhost:%REACT_PORT%"

REM Service monitoring menu
:menu
echo.
echo ═══ Trading System Control Panel ═══
echo 1. Open Frontend Dashboard
echo 2. Open Backend API Docs ^(if available^)
echo 3. View System Status
echo 4. Restart Frontend
echo 5. Restart Backend ^(if available^)
echo 6. Stop All Services
echo 7. Exit Control Panel
echo ═══════════════════════════════════
set /p choice="Select an option (1-7): "

if "%choice%"=="1" (
    start "" "http://localhost:%REACT_PORT%"
    goto menu
)

if "%choice%"=="2" (
    if "%BACKEND_AVAILABLE%"=="true" (
        start "" "http://localhost:%BACKEND_PORT%/docs"
    ) else (
        echo ❌ Backend is not available
    )
    goto menu
)

if "%choice%"=="3" (
    echo.
    echo 📊 System Status Check:
    
    REM Check React port
    netstat -an | findstr ":%REACT_PORT%" >nul
    if !errorlevel! equ 0 (
        echo ✅ Frontend is running on port %REACT_PORT%
    ) else (
        echo ❌ Frontend is not responding on port %REACT_PORT%
    )
    
    REM Check Backend port
    if "%BACKEND_AVAILABLE%"=="true" (
        netstat -an | findstr ":%BACKEND_PORT%" >nul
        if !errorlevel! equ 0 (
            echo ✅ Backend is running on port %BACKEND_PORT%
        ) else (
            echo ❌ Backend is not responding on port %BACKEND_PORT%
        )
    )
    
    pause
    goto menu
)

if "%choice%"=="4" (
    echo 🔄 Restarting Frontend...
    tasklist /FI "WINDOWTITLE eq Trading Frontend*" | findstr cmd >nul
    if !errorlevel! equ 0 (
        taskkill /FI "WINDOWTITLE eq Trading Frontend*" /F >nul 2>&1
    )
    timeout /t 2 /nobreak >nul
    cd /d "%REACT_DIR%"
    start "Trading Frontend" cmd /c "scripts\start-dev.bat"
    cd /d "%SCRIPT_DIR%"
    echo ✅ Frontend restarted
    goto menu
)

if "%choice%"=="5" (
    if "%BACKEND_AVAILABLE%"=="true" (
        echo 🔄 Restarting Backend...
        tasklist /FI "WINDOWTITLE eq Trading Backend*" | findstr cmd >nul
        if !errorlevel! equ 0 (
            taskkill /FI "WINDOWTITLE eq Trading Backend*" /F >nul 2>&1
        )
        timeout /t 2 /nobreak >nul
        cd /d "%BACKEND_DIR%"
        start "Trading Backend" cmd /c "scripts\start-backend.bat"
        cd /d "%SCRIPT_DIR%"
        echo ✅ Backend restarted
    ) else (
        echo ❌ Backend is not available
    )
    goto menu
)

if "%choice%"=="6" (
    echo 🛑 Stopping all services...
    
    REM Kill service windows
    tasklist /FI "WINDOWTITLE eq Trading Frontend*" | findstr cmd >nul
    if !errorlevel! equ 0 (
        taskkill /FI "WINDOWTITLE eq Trading Frontend*" /F >nul 2>&1
        echo ✅ Frontend window closed
    )
    
    tasklist /FI "WINDOWTITLE eq Trading Backend*" | findstr cmd >nul
    if !errorlevel! equ 0 (
        taskkill /FI "WINDOWTITLE eq Trading Backend*" /F >nul 2>&1
        echo ✅ Backend window closed
    )
    
    REM Kill processes on ports
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr :%REACT_PORT%') do (
        if not "%%a"=="0" taskkill /PID %%a /F >nul 2>&1
    )
    
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr :%BACKEND_PORT%') do (
        if not "%%a"=="0" taskkill /PID %%a /F >nul 2>&1
    )
    
    echo ✅ All services stopped
    timeout /t 2 /nobreak >nul
    goto menu
)

if "%choice%"=="7" (
    echo 👋 Exiting Control Panel...
    echo ℹ️  Services will continue running in their windows
    timeout /t 2 /nobreak >nul
    exit /b 0
)

echo ❌ Invalid choice. Please select 1-7.
goto menu