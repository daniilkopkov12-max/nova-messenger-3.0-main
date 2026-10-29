import argon2 from 'argon2';
import { randomBytes } from 'crypto';
import { prisma } from './prisma.js';
import { config } from '../config/index.js';

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

export function generateToken(): string {
  return randomBytes(32).toString('hex');
}

export async function createSession(userId: string, userAgent?: string, ip?: string) {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

  const session = await prisma.session.create({
    data: {
      userId,
      token,
      expiresAt,
      userAgent,
      ip,
    },
  });

  return { token, expiresAt, sessionId: session.id };
}

export async function validateSession(token: string) {
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { token },
    include: { user: true },
  });

  if (!session || session.expiresAt < new Date()) {
    if (session) {
      await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    }
    return null;
  }

  return session;
}

export async function destroySession(token: string) {
  await prisma.session.deleteMany({ where: { token } });
}

export async function destroyAllUserSessions(userId: string) {
  await prisma.session.deleteMany({ where: { userId } });
}
