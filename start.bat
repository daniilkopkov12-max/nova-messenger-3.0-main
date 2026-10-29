@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion
cd /d "%~dp0"

echo ============================================
echo   Nova Messenger - Local Start
echo ============================================
echo.

:: Check Node.js
where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
  echo [ERROR] Node.js не найден. Установите Node.js 18+ с https://nodejs.org
  pause
  exit /b 1
)
for /f "tokens=*" %%i in ('node -v') do set NODE_VER=%%i
echo [OK] Node.js %NODE_VER%

where npm >nul 2>&1
if %ERRORLEVEL% neq 0 (
  echo [ERROR] npm не найден.
  pause
  exit /b 1
)
echo [OK] npm

:: Create .env if missing
if not exist ".env" (
  echo.
  echo Создаю .env из шаблона...
  copy ".env.example" ".env" >nul
  echo [OK] .env создан. При необходимости отредактируйте SESSION_SECRET.
)

:: Install root deps
if not exist "node_modules" (
  echo.
  echo Установка корневых зависимостей...
  call npm install
  if %ERRORLEVEL% neq 0 (
    echo [ERROR] Не удалось установить зависимости.
    pause
    exit /b 1
  )
)

:: Backend deps
if not exist "backend\node_modules" (
  echo.
  echo Установка зависимостей backend...
  cd backend
  call npm install
  if %ERRORLEVEL% neq 0 (
    echo [ERROR] backend npm install failed
    cd ..
    pause
    exit /b 1
  )
  cd ..
)

:: Frontend deps
if not exist "frontend\node_modules" (
  echo.
  echo Установка зависимостей frontend...
  cd frontend
  call npm install
  if %ERRORLEVEL% neq 0 (
    echo [ERROR] frontend npm install failed
    cd ..
    pause
    exit /b 1
  )
  cd ..
)

:: Prisma generate + push
echo.
echo Настройка базы данных (SQLite)...
cd backend
call npx prisma generate
if %ERRORLEVEL% neq 0 (
  echo [ERROR] prisma generate failed
  cd ..
  pause
  exit /b 1
)
call npx prisma db push
if %ERRORLEVEL% neq 0 (
  echo [ERROR] prisma db push failed
  cd ..
  pause
  exit /b 1
)
cd ..

echo.
echo ============================================
echo   Запуск серверов...
echo   Backend:  http://localhost:3001
echo   Frontend: http://localhost:5173
echo   Браузер откроется через несколько секунд.
echo   Для остановки нажмите Ctrl+C
echo ============================================
echo.

:: Start both
start "" cmd /c "timeout /t 5 /nobreak >nul && start http://localhost:5173"
call npx concurrently -n backend,frontend -c blue,green "npm run dev --workspace=backend" "npm run dev --workspace=frontend"

pause
