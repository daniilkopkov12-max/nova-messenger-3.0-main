import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { config } from './config/index.js';
import routes from './routes/index.js';
import { setupSockets } from './sockets/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

// In development, allow the current Cloudflare Quick Tunnel origin so friends
// can use API and Socket.IO from the public HTTPS URL. Production stays strict.
function isAllowedDevOrigin(origin: string | undefined): boolean {
  if (!origin || origin === config.frontendUrl) return true;
  return config.isDev && /^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/i.test(origin);
}

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: (origin, callback) => callback(null, isAllowedDevOrigin(origin)),
    credentials: true,
    methods: ['GET', 'POST'],
  },
  transports: ['websocket', 'polling'],
});

// Ensure upload dir
if (!fs.existsSync(config.uploadDir)) {
  fs.mkdirSync(config.uploadDir, { recursive: true });
}

app.use(helmet({
  contentSecurityPolicy: false, // for dev
  crossOriginEmbedderPolicy: false,
}));
app.use(
  cors({
    origin: (origin, callback) => callback(null, isAllowedDevOrigin(origin)),
    credentials: true,
  })
);
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use('/api', routes);

// Static uploads (with auth check would be better in production)
app.use('/uploads', express.static(config.uploadDir));

// Health
app.get('/', (_req, res) => {
  res.json({ name: 'Nova Messenger API', status: 'running', version: '1.0.0' });
});

setupSockets(io);

httpServer.listen(config.port, () => {
  console.log(`\n🚀 Nova Messenger backend running on http://localhost:${config.port}`);
  console.log(`   Frontend expected at ${config.frontendUrl}`);
  console.log(`   Environment: ${config.nodeEnv}\n`);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down...');
  httpServer.close(() => process.exit(0));
});
