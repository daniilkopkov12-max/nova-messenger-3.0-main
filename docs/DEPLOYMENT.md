# Развёртывание Nova Messenger

## A. Локальный запуск разработчика

См. `INSTALLATION.md` и `start.bat` / `start.sh`.

## B. Публикация в интернете

### Бюджетный вариант (тестирование)

- **Frontend:** Vercel / Netlify / Cloudflare Pages  
- **Backend:** Railway / Render / Fly.io (поддержка WebSocket)  
- **БД:** Railway PostgreSQL / Supabase / Neon  
- **Файлы:** Cloudflare R2 / S3 / локальный диск с reverse proxy  

### Production-вариант

- VPS (Hetzner, DigitalOcean, Timeweb) + Nginx + HTTPS (Let's Encrypt)  
- PM2 или systemd для Node  
- PostgreSQL  
- coturn для TURN  
- Object storage для вложений  

### Шаги (общий план)

1. Клонировать репозиторий на сервер.
2. Создать `.env` с production-значениями:
   - `NODE_ENV=production`
   - `DATABASE_URL=postgresql://...`
   - `SESSION_SECRET=` (длинная случайная строка)
   - `FRONTEND_URL=https://your-domain.com`
   - TURN-параметры
3. `npm install && cd backend && npx prisma migrate deploy && npm run build`
4. Собрать frontend: `cd frontend && npm run build`
5. Nginx: раздавать `frontend/dist`, проксировать `/api` и `/socket.io` на backend-порт.
6. HTTPS обязателен для WebRTC и secure cookies.

### Пример Nginx

```nginx
server {
  listen 443 ssl http2;
  server_name your-domain.com;
  # ssl_certificate ...;

  location / {
    root /var/www/nova/frontend/dist;
    try_files $uri /index.html;
  }

  location /api {
    proxy_pass http://127.0.0.1:3001;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
  }

  location /socket.io {
    proxy_pass http://127.0.0.1:3001;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
  }
}
```

## C. Использование готового публичного адреса

После развёртывания пользователи открывают `https://your-domain.com`, регистрируются и пользуются мессенджером.  
Отдельный клиент не требуется — это веб-приложение.
