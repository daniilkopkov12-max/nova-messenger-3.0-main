import { Request, Response, NextFunction } from 'express';
import { validateSession } from '../utils/auth.js';
import { prisma } from '../utils/prisma.js';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
  };
  sessionToken?: string;
}

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const token =
    req.cookies?.session ||
    (req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.slice(7)
      : null);

  if (!token) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }

  const session = await validateSession(token);
  if (!session) {
    return res.status(401).json({ error: 'Сессия недействительна или истекла' });
  }
  if (session.user.status === 'banned') {
    return res.status(403).json({ error: 'Ваш аккаунт заблокирован модерацией' });
  }

  req.user = {
    id: session.user.id,
    username: session.user.username,
    displayName: session.user.displayName,
    avatarUrl: session.user.avatarUrl,
  };
  req.sessionToken = token;
  next();
}

export async function optionalAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const token =
    req.cookies?.session ||
    (req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.slice(7)
      : null);

  if (token) {
    const session = await validateSession(token);
    if (session) {
      req.user = {
        id: session.user.id,
        username: session.user.username,
        displayName: session.user.displayName,
        avatarUrl: session.user.avatarUrl,
      };
      req.sessionToken = token;
    }
  }
  next();
}

export async function requireChatMember(chatId: string, userId: string): Promise<boolean> {
  const member = await prisma.chatMember.findUnique({
    where: { chatId_userId: { chatId, userId } },
  });
  return !!member;
}
