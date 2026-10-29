#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

echo "============================================"
echo "  Nova Messenger - Local Start"
echo "============================================"
echo

if ! command -v node &>/dev/null; then
  echo "[ERROR] Node.js не найден. Установите Node.js 18+"
  exit 1
fi
echo "[OK] Node.js $(node -v)"

if ! command -v npm &>/dev/null; then
  echo "[ERROR] npm не найден"
  exit 1
fi
echo "[OK] npm"

if [ ! -f .env ]; then
  echo "Создаю .env из шаблона..."
  cp .env.example .env
  echo "[OK] .env создан"
fi

if [ ! -d node_modules ]; then
  echo "Установка корневых зависимостей..."
  npm install
fi

if [ ! -d backend/node_modules ]; then
  echo "Установка зависимостей backend..."
  (cd backend && npm install)
fi

if [ ! -d frontend/node_modules ]; then
  echo "Установка зависимостей frontend..."
  (cd frontend && npm install)
fi

echo "Настройка базы данных (SQLite)..."
(cd backend && npx prisma generate && npx prisma db push)

echo
echo "============================================"
echo "  Backend:  http://localhost:3001"
echo "  Frontend: http://localhost:5173"
echo "  Ctrl+C для остановки"
echo "============================================"
echo

(sleep 4 && (command -v xdg-open >/dev/null && xdg-open http://localhost:5173 || command -v open >/dev/null && open http://localhost:5173 || true)) &
npx concurrently -n backend,frontend -c blue,green "npm run dev --workspace=backend" "npm run dev --workspace=frontend"
