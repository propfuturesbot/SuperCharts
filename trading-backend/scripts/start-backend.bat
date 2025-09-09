@echo off
setlocal enabledelayedexpansion

REM Trading Backend - Development Startup Script (Windows)
REM This script cleans up ports and starts the Node.js backend server

echo.
echo ⚡ Starting Trading Backend System...
echo =====================================

REM Configuration
set BACKEND_PORT=8000
set REDIS_PORT=6379
set POSTGRES_PORT=5432
set SIGNALR_PORT=5000

REM Function to kill process on port
echo 🧹 Cleaning up backend ports...

REM Kill Backend port
echo 🔍 Checking for processes on port %BACKEND_PORT%...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :%BACKEND_PORT%') do (
    if not "%%a"=="0" (
        echo ❌ Found Backend API Server running on port %BACKEND_PORT% (PID: %%a)
        taskkill /PID %%a /F >nul 2>&1
        echo ✅ Killed process %%a
    )
)

REM Kill SignalR port
echo 🔍 Checking for processes on port %SIGNALR_PORT%...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :%SIGNALR_PORT%') do (
    if not "%%a"=="0" (
        echo ❌ Found SignalR Hub Server running on port %SIGNALR_PORT% (PID: %%a)
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
    echo 💡 Make sure you're in the trading-backend directory
    pause
    exit /b 1
)

REM Check TypeScript
where tsc >nul 2>&1
if %errorlevel% neq 0 (
    npx tsc --version >nul 2>&1
    if !errorlevel! neq 0 (
        echo ⚠️  TypeScript not found, will install with dependencies
    ) else (
        echo ✅ TypeScript available via npx
    )
) else (
    echo ✅ TypeScript globally installed
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

REM Check for environment file
if not exist ".env" (
    if not exist ".env.local" (
        echo ⚠️  No .env file found, creating default...
        (
            echo # Backend Configuration
            echo NODE_ENV=development
            echo PORT=%BACKEND_PORT%
            echo SIGNALR_PORT=%SIGNALR_PORT%
            echo.
            echo # Database Configuration
            echo REDIS_URL=redis://localhost:%REDIS_PORT%
            echo POSTGRES_URL=postgresql://localhost:%POSTGRES_PORT%/trading
            echo.
            echo # Provider Configuration
            echo DEFAULT_PROVIDER=topstepx
            echo.
            echo # Security
            echo JWT_SECRET=your-super-secret-jwt-key-change-in-production
            echo JWT_EXPIRES_IN=24h
            echo.
            echo # Logging
            echo LOG_LEVEL=debug
            echo LOG_FILE=logs/backend.log
            echo.
            echo # Rate Limiting
            echo RATE_LIMIT_WINDOW_MS=900000
            echo RATE_LIMIT_MAX_REQUESTS=100
            echo.
            echo # Performance
            echo WORKER_THREADS=4
            echo BUFFER_SIZE=1000
            echo CACHE_TTL=300
            echo.
            echo # Development
            echo DEBUG=trading:*
            echo ENABLE_CORS=true
        ) > .env
        echo ✅ Created default .env file
        echo 💡 Please review and customize the .env file for your setup
    )
)

REM Check for required directories
if not exist "logs" (
    mkdir logs
    echo ✅ Created logs directory
)

if not exist "src" (
    echo ❌ src directory not found
    echo 💡 This doesn't appear to be a valid backend project
    pause
    exit /b 1
)

REM Build TypeScript if needed
set BUILD_NEEDED=0
if not exist "dist" set BUILD_NEEDED=1

REM Simple check if src is newer than dist (basic implementation)
if exist "dist" (
    REM This is a simplified check - in production you might want more sophisticated checking
    if exist "src\app.ts" (
        for %%i in ("src\app.ts") do set SRC_DATE=%%~ti
        for %%i in ("dist\app.js") do set DIST_DATE=%%~ti
        REM Basic comparison - if files have different times, rebuild
        if not "!SRC_DATE!"=="!DIST_DATE!" set BUILD_NEEDED=1
    )
)

if %BUILD_NEEDED%==1 (
    echo 🔨 Building TypeScript project...
    where tsc >nul 2>&1
    if %errorlevel% equ 0 (
        tsc
    ) else (
        npx tsc
    )
    
    if !errorlevel! equ 0 (
        echo ✅ TypeScript build successful
    ) else (
        echo ❌ TypeScript build failed
        echo 💡 Check your TypeScript configuration and syntax
        pause
        exit /b 1
    )
) else (
    echo ✅ TypeScript build is up to date
)

REM Check external dependencies
echo 🔍 Checking external services...

REM Check Redis (optional)
redis-cli ping >nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ Redis is running
) else (
    echo ⚠️  Redis is not running ^(optional for caching^)
)

REM Set environment variables
set NODE_ENV=development
set PORT=%BACKEND_PORT%
set DEBUG=trading:*

echo.
echo 🌐 Environment Configuration:
echo    Node Environment: development
echo    Backend Port: %BACKEND_PORT%
echo    SignalR Port: %SIGNALR_PORT%
echo    Debug Mode: enabled

REM Start the backend server
echo.
echo ⚡ Starting Trading Backend Server...
echo =====================================
echo 🌐 Backend API will be available at: http://localhost:%BACKEND_PORT%
echo 📡 SignalR Hub will be available at: http://localhost:%SIGNALR_PORT%
echo 📊 API Documentation: http://localhost:%BACKEND_PORT%/docs
echo 💻 Health Check: http://localhost:%BACKEND_PORT%/health
echo ⚡ Hot reload is enabled - changes will restart the server
echo 🛑 Press Ctrl+C to stop the server
echo =====================================
echo.

REM Choose the appropriate start command
if exist "dist\app.js" (
    REM Production-like start with built files
    where nodemon >nul 2>&1
    if %errorlevel% equ 0 (
        echo 🔄 Starting with nodemon ^(auto-restart enabled^)...
        nodemon dist\app.js
    ) else (
        echo 🚀 Starting with Node.js...
        node dist\app.js
    )
) else if exist "src\app.ts" (
    REM Development start with ts-node
    where ts-node >nul 2>&1
    if %errorlevel% equ 0 (
        echo 🔄 Starting with ts-node...
        where nodemon >nul 2>&1
        if %errorlevel% equ 0 (
            nodemon --exec ts-node src\app.ts
        ) else (
            ts-node src\app.ts
        )
    ) else (
        echo ❌ ts-node not found
        echo 💡 Install ts-node: npm install -g ts-node
        pause
        exit /b 1
    )
) else (
    REM Fallback to npm scripts
    echo 🚀 Starting with npm script...
    npm run dev
    if %errorlevel% neq 0 npm start
)

REM If we get here, the server has stopped
echo.
echo 🛑 Trading Backend server stopped
echo 👋 Thanks for using the Trading Backend System!
pause