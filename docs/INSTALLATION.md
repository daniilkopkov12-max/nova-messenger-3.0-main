# Установка Nova Messenger

## Требования

- Node.js ≥ 18
- npm ≥ 9
- (Опционально) PostgreSQL 14+ для production
- (Опционально) Docker для PostgreSQL / coturn

## Windows

1. Скачайте и установите Node.js LTS: https://nodejs.org
2. Распакуйте ZIP-архив проекта.
3. Запустите `start.bat`.
4. При первом запуске зависимости установятся автоматически, БД инициализируется (SQLite).

## Linux / macOS

```bash
# Node.js через nvm рекомендуется
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash
nvm install 20
chmod +x start.sh
./start.sh
```

## Ручной запуск

```bash
cp .env.example .env
npm install
cd backend && npm install && npx prisma generate && npx prisma db push && cd ..
cd frontend && npm install && cd ..
npx concurrently "npm run dev --workspace=backend" "npm run dev --workspace=frontend"
```

Откройте http://localhost:5173
