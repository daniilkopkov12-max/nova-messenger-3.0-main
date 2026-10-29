import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.js';
import { registerSchema, loginSchema } from '../validation/schemas.js';
import { hashPassword, verifyPassword, createSession, destroySession } from '../utils/auth.js';
import { prisma } from '../utils/prisma.js';

export async function register(req: AuthRequest, res: Response) {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Неверные данные', details: parsed.error.flatten() });
    }

    const { username, password, displayName } = parsed.data;
    const existing = await prisma.user.findUnique({ where: { username: username.toLowerCase() } });
    if (existing) {
      return res.status(409).json({ error: 'Имя пользователя уже занято' });
    }

    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: {
        username: username.toLowerCase(),
        passwordHash,
        displayName: displayName || username,
      },
    });

    const { token, expiresAt } = await createSession(
      user.id,
      req.headers['user-agent'],
      req.ip
    );

    res.cookie('session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000,
      path: '/',
    });

    return res.status(201).json({
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        bio: user.bio,
      },
      expiresAt,
    });
  } catch (err) {
    console.error('Register error:', err);
    return res.status(500).json({ error: 'Ошибка сервера' });
  }
}

export async function login(req: AuthRequest, res: Response) {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Неверные данные' });
    }

    const { username, password } = parsed.data;
    const user = await prisma.user.findUnique({
      where: { username: username.toLowerCase() },
    });

    if (user?.status === 'banned') {
      return res.status(403).json({ error: 'Ваш аккаунт заблокирован модерацией' });
    }

    if (!user || !(await verifyPassword(user.passwordHash, password))) {
      return res.status(401).json({ error: 'Неверный логин или пароль' });
    }

    const { token, expiresAt } = await createSession(
      user.id,
      req.headers['user-agent'],
      req.ip
    );

    await prisma.user.update({
      where: { id: user.id },
      data: { status: 'online', lastSeen: new Date() },
    });

    res.cookie('session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000,
      path: '/',
    });

    return res.json({
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        bio: user.bio,
        status: 'online',
      },
      expiresAt,
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Ошибка сервера' });
  }
}

export async function logout(req: AuthRequest, res: Response) {
  try {
    if (req.sessionToken) {
      await destroySession(req.sessionToken);
    }
    if (req.user) {
      await prisma.user.update({
        where: { id: req.user.id },
        data: { status: 'offline', lastSeen: new Date() },
      });
    }
    res.clearCookie('session', { path: '/' });
    return res.json({ ok: true });
  } catch (err) {
    console.error('Logout error:', err);
    return res.status(500).json({ error: 'Ошибка сервера' });
  }
}

export async function me(req: AuthRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: 'Не авторизован' });
  }
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: {
      id: true,
      username: true,
      displayName: true,
      avatarUrl: true,
      bio: true,
      status: true,
      lastSeen: true,
      createdAt: true,
    },
  });
  return res.json({ user });
}


export async function updateProfile(req: AuthRequest, res: Response) {
  try {
    const body = req.body as { displayName?: unknown; bio?: unknown; avatarUrl?: unknown };
    const data: { displayName?: string; bio?: string | null; avatarUrl?: string | null } = {};

    if (body.displayName !== undefined) {
      if (typeof body.displayName !== 'string' || body.displayName.trim().length < 1 || body.displayName.trim().length > 64) {
        return res.status(400).json({ error: 'Имя должно быть от 1 до 64 символов' });
      }
      data.displayName = body.displayName.trim();
    }
    if (body.bio !== undefined) {
      if (typeof body.bio !== 'string' || body.bio.length > 300) {
        return res.status(400).json({ error: 'Описание должно быть не длиннее 300 символов' });
      }
      data.bio = body.bio.trim() || null;
    }
    if (body.avatarUrl !== undefined) {
      if (body.avatarUrl !== null && (typeof body.avatarUrl !== 'string' || body.avatarUrl.length > 500 || !body.avatarUrl.startsWith('/uploads/'))) {
        return res.status(400).json({ error: 'Выберите загруженное изображение для аватарки' });
      }
      data.avatarUrl = body.avatarUrl as string | null;
    }
    if (!Object.keys(data).length) return res.status(400).json({ error: 'Нет изменений для сохранения' });

    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data,
      select: { id: true, username: true, displayName: true, avatarUrl: true, bio: true, status: true, lastSeen: true, createdAt: true },
    });
    return res.json({ user });
  } catch (err) {
    console.error('updateProfile:', err);
    return res.status(500).json({ error: 'Не удалось сохранить профиль' });
  }
}

export async function getProfile(req: AuthRequest, res: Response) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.userId },
      select: { id: true, username: true, displayName: true, avatarUrl: true, bio: true, status: true, lastSeen: true, createdAt: true },
    });
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
    return res.json({ user });
  } catch (err) {
    console.error('getProfile:', err);
    return res.status(500).json({ error: 'Не удалось загрузить профиль' });
  }
}
