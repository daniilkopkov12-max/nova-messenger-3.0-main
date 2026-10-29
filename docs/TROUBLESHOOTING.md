# Устранение неполадок

## start.bat / npm install падает

- Убедитесь, что Node.js ≥ 18 (`node -v`).
- Запустите терминал **от имени администратора** при проблемах с правами.
- Удалите `node_modules` и `package-lock.json`, повторите `npm install`.

## Порт занят

- Backend 3001 / Frontend 5173: закройте другие процессы или измените PORT в `.env` и vite.config.

## База данных

- SQLite файл создаётся в `backend/prisma/dev.db` (или по DATABASE_URL).
- При ошибках Prisma: `cd backend && npx prisma generate && npx prisma db push`.

## Socket не подключается

- Проверьте, что backend запущен.
- CORS / FRONTEND_URL должен совпадать с адресом фронта.
- В dev Vite proxy проксирует `/socket.io`.

## Звонки не работают

- Нужен HTTPS или localhost.
- Разрешите микрофон/камеру в браузере.
- Для разных сетей — настройте TURN.

## Сообщения не приходят второму пользователю

- Оба должны быть онлайн и в одном чате.
- Проверьте консоль браузера (F12) и логи backend.
