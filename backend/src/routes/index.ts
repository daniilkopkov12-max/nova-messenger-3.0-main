import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../middleware/auth.js';
import * as auth from '../controllers/authController.js';
import * as chat from '../controllers/chatController.js';
import * as message from '../controllers/messageController.js';
import { config } from '../config/index.js';
import multer from 'multer';
import path from 'path';
import { randomUUID } from 'crypto';
import * as upload from '../controllers/uploadController.js';
import { prisma } from '../utils/prisma.js';
import type { AuthRequest } from '../middleware/auth.js';

const router = Router();

const allowedUploadMimes = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif',
  'application/pdf', 'text/plain', 'application/zip', 'application/x-zip-compressed',
]);
const fileUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, config.uploadDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase().slice(0, 12);
      cb(null, `${randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: Math.min(config.maxFileSize, 10 * 1024 * 1024), files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!allowedUploadMimes.has(file.mimetype)) return cb(new Error('Этот тип файла не поддерживается'));
    cb(null, true);
  },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Слишком много попыток. Попробуйте позже.' },
});

router.post('/auth/register', authLimiter, auth.register);
router.post('/auth/login', authLimiter, auth.login);
router.post('/auth/logout', requireAuth, auth.logout);
router.get('/auth/me', requireAuth, auth.me);
router.patch('/auth/profile', requireAuth, auth.updateProfile);
router.post('/uploads', requireAuth, fileUpload.single('file'), upload.uploadResult);

router.get('/chats', requireAuth, chat.listChats);
router.post('/chats', requireAuth, chat.createChat);
router.get('/chats/:chatId', requireAuth, chat.getChat);
router.get('/users/search', requireAuth, chat.searchUsers);
router.get('/users/:userId', requireAuth, auth.getProfile);

// Role permissions are enforced on the server; hiding UI controls is not security.
router.post('/moderation/users/:username', requireAuth, async (req: AuthRequest, res) => {
  try {
    const actor = (req.user?.username || '').toLowerCase();
    const targetUsername = String(req.params.username || '').toLowerCase();
    const action = req.body?.action;
    if (!['okak', 'sladkiy'].includes(actor)) return res.status(403).json({ error: 'Нет прав модерации' });
    if (action !== 'ban' && action !== 'unban') return res.status(400).json({ error: 'Неизвестное действие' });
    if (targetUsername === 'okak') return res.status(403).json({ error: 'Нельзя менять статус владельца' });
    if (actor === 'sladkiy' && targetUsername === 'sladkiy') return res.status(403).json({ error: 'Нельзя менять собственный статус' });
    const target = await prisma.user.findUnique({ where: { username: targetUsername } });
    if (!target) return res.status(404).json({ error: 'Пользователь не найден' });
    if (actor === 'sladkiy' && ['okak', 'sladkiy'].includes(target.username.toLowerCase())) return res.status(403).json({ error: 'Модератор не может банить владельца или модератора' });
    await prisma.user.update({ where: { id: target.id }, data: { status: action === 'ban' ? 'banned' : 'offline' } });
    if (action === 'ban') await prisma.session.deleteMany({ where: { userId: target.id } });
    return res.json({ ok: true });
  } catch (error) {
    console.error('Moderation action failed:', error);
    return res.status(500).json({ error: 'Не удалось выполнить действие модерации' });
  }
});

router.get('/chats/:chatId/messages', requireAuth, message.getMessages);
router.post('/messages', requireAuth, message.sendMessage);
router.patch('/messages/:messageId', requireAuth, message.editMessage);
router.delete('/messages/:messageId', requireAuth, message.deleteMessage);



// Return ICE configuration to signed-in users. Cloudflare's long-lived API token
// stays on the backend; only short-lived generated TURN credentials reach browsers.
const iceServersLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Слишком частые запросы настроек звонка. Попробуйте через минуту.' },
});

router.get('/webrtc/ice-servers', requireAuth, iceServersLimiter, async (_req, res) => {
  const iceServers: Array<{ urls: string | string[]; username?: string; credential?: string }> = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ];

  if (config.turn.cloudflareKeyId && config.turn.cloudflareApiToken) {
    try {
      const response = await fetch(
        `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(config.turn.cloudflareKeyId)}/credentials/generate-ice-servers`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${config.turn.cloudflareApiToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ ttl: 12 * 60 * 60 }),
        },
      );

      if (!response.ok) {
        // Do not forward the upstream body; it may contain implementation details.
        console.error(`Cloudflare TURN credential request failed: HTTP ${response.status}`);
        return res.status(502).json({ error: 'Не удалось получить настройки TURN. Проверьте серверные переменные Cloudflare.' });
      }

      const payload = await response.json() as { iceServers?: Array<{ urls: string | string[]; username?: string; credential?: string }> };
      if (!Array.isArray(payload.iceServers) || payload.iceServers.length === 0) {
        return res.status(502).json({ error: 'Сервис TURN вернул пустую конфигурацию.' });
      }
      return res.json({ iceServers: payload.iceServers, relayConfigured: true, relayProvider: 'Cloudflare' });
    } catch (error) {
      console.error('Cloudflare TURN credential request failed:', error instanceof Error ? error.message : 'unknown error');
      return res.status(502).json({ error: 'Не удалось связаться с сервисом TURN.' });
    }
  }

  // Metered Open Relay TURN: fetch short-lived ICE server credentials on the backend,
  // so the Metered API key is never sent to the browser. The account's app host is
  // expected to look like "myapp.metered.live".
  if (config.turn.meteredAppName && config.turn.meteredApiKey) {
    try {
      const meteredHost = config.turn.meteredAppName
        .trim()
        .replace(/^https?:\/\//i, '')
        .split('/')[0]
        .toLowerCase();
      if (!/^[a-z0-9.-]+$/.test(meteredHost) || !meteredHost.endsWith('.metered.live')) {
        return res.status(500).json({ error: 'METERED_APP_NAME должен быть доменом вида имя-приложения.metered.live.' });
      }
      const credentialsUrl = new URL(`https://${meteredHost}/api/v1/turn/credentials`);
      credentialsUrl.searchParams.set('apiKey', config.turn.meteredApiKey);
      const response = await fetch(credentialsUrl);
      if (!response.ok) {
        console.error(`Metered TURN credential request failed: HTTP ${response.status}`);
        return res.status(502).json({ error: 'Не удалось получить TURN-настройки Metered. Проверьте имя приложения и API key.' });
      }
      const payload = await response.json() as RTCIceServer[] | { iceServers?: RTCIceServer[] };
      const meteredIceServers = Array.isArray(payload) ? payload : payload.iceServers;
      if (!Array.isArray(meteredIceServers) || meteredIceServers.length === 0) {
        console.error('Metered TURN response did not contain an ICE server array.');
        return res.status(502).json({ error: 'Metered вернул пустую конфигурацию TURN.' });
      }
      return res.json({ iceServers: meteredIceServers, relayConfigured: true, relayProvider: 'Metered Open Relay' });
    } catch (error) {
      console.error('Metered TURN credential request failed:', error instanceof Error ? error.message : 'unknown error');
      return res.status(502).json({ error: 'Не удалось связаться с Metered TURN.' });
    }
  }

  // Backwards-compatible static TURN configuration (for coturn or another provider).
  const urls = config.turn.url.split(',').map((url) => url.trim()).filter(Boolean);
  if (urls.length > 0 && config.turn.username && config.turn.credential) {
    iceServers.push({
      urls: urls.length === 1 ? urls[0] : urls,
      username: config.turn.username,
      credential: config.turn.credential,
    });
    return res.json({ iceServers, relayConfigured: true, relayProvider: 'Custom TURN' });
  }

  return res.json({ iceServers, relayConfigured: false, relayProvider: 'STUN only' });
});

router.get('/health', (_req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

export default router;
