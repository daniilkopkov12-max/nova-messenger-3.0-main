import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

export const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3001', 10),
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  databaseUrl: process.env.DATABASE_URL || 'file:./dev.db',
  sessionSecret: process.env.SESSION_SECRET || 'dev-secret-change-me-in-production-32chars',
  jwtSecret: process.env.JWT_SECRET || 'dev-jwt-secret-change-me-too',
  uploadDir: process.env.UPLOAD_DIR || path.resolve(__dirname, '../../../uploads'),
  maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760', 10),
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
  rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
  turn: {
    // Optional static TURN server (use short-lived credentials where possible).
    url: process.env.TURN_URL || '',
    username: process.env.TURN_USERNAME || '',
    credential: process.env.TURN_CREDENTIAL || '',
    // Cloudflare Realtime TURN: keep these secrets on the backend only.
    cloudflareKeyId: process.env.CLOUDFLARE_TURN_KEY_ID || '',
    cloudflareApiToken: process.env.CLOUDFLARE_TURN_API_TOKEN || '',
    // Metered Open Relay TURN (free trial tier; keep the API key server-side).
    meteredAppName: process.env.METERED_APP_NAME || '',
    meteredApiKey: process.env.METERED_API_KEY || '',
  },
  isDev: process.env.NODE_ENV !== 'production',
};
