import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.js';
import { createChatSchema } from '../validation/schemas.js';
import { prisma } from '../utils/prisma.js';
import { requireChatMember } from '../middleware/auth.js';

export async function listChats(req: AuthRequest, res: Response) {
  try {
    const userId = req.user!.id;
    const memberships = await prisma.chatMember.findMany({
      where: { userId },
      include: {
        chat: {
          include: {
            members: {
              include: {
                user: {
                  select: {
                    id: true,
                    username: true,
                    displayName: true,
                    avatarUrl: true,
                    status: true,
                    lastSeen: true,
                  },
                },
              },
            },
            messages: {
              orderBy: { createdAt: 'desc' },
              take: 1,
              include: {
                sender: {
                  select: { id: true, displayName: true, username: true },
                },
              },
            },
          },
        },
      },
      orderBy: { chat: { lastMessageAt: 'desc' } },
    });

    const chats = memberships.map((m) => {
      const chat = m.chat;
      const otherMembers = chat.members.filter((mem) => mem.userId !== userId);
      const lastMsg = chat.messages[0] || null;
      return {
        id: chat.id,
        type: chat.type,
        name:
          chat.type === 'group'
            ? chat.name
            : otherMembers[0]?.user.displayName || otherMembers[0]?.user.username,
        avatarUrl:
          chat.type === 'group'
            ? chat.avatarUrl
            : otherMembers[0]?.user.avatarUrl,
        members: chat.members.map((mem) => ({
          id: mem.user.id,
          username: mem.user.username,
          displayName: mem.user.displayName,
          avatarUrl: mem.user.avatarUrl,
          status: mem.user.status,
          role: mem.role,
        })),
        lastMessage: lastMsg
          ? {
              id: lastMsg.id,
              content: lastMsg.deletedAt ? null : lastMsg.content,
              type: lastMsg.type,
              fileName: lastMsg.fileName,
              createdAt: lastMsg.createdAt,
              sender: lastMsg.sender,
              deleted: !!lastMsg.deletedAt,
            }
          : null,
        lastMessageAt: chat.lastMessageAt,
        unread: 0, // computed later if needed
        muted: m.muted,
      };
    });

    return res.json({ chats });
  } catch (err) {
    console.error('listChats:', err);
    return res.status(500).json({ error: 'Ошибка сервера' });
  }
}

export async function createChat(req: AuthRequest, res: Response) {
  try {
    const parsed = createChatSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Неверные данные', details: parsed.error.flatten() });
    }

    const { type, userIds, name, description } = parsed.data;
    const currentUserId = req.user!.id;

    if (type === 'private') {
      if (userIds.length !== 1) {
        return res.status(400).json({ error: 'Для личного чата укажите одного пользователя' });
      }
      const otherId = userIds[0];
      if (otherId === currentUserId) {
        return res.status(400).json({ error: 'Нельзя создать чат с собой' });
      }

      // Check existing private chat
      const existing = await prisma.chat.findFirst({
        where: {
          type: 'private',
          AND: [
            { members: { some: { userId: currentUserId } } },
            { members: { some: { userId: otherId } } },
          ],
        },
        include: {
          members: {
            include: {
              user: {
                select: {
                  id: true,
                  username: true,
                  displayName: true,
                  avatarUrl: true,
                  status: true,
                },
              },
            },
          },
        },
      });

      if (existing) {
        return res.json({ chat: formatChat(existing, currentUserId) });
      }

      const chat = await prisma.chat.create({
        data: {
          type: 'private',
          members: {
            create: [
              { userId: currentUserId, role: 'member' },
              { userId: otherId, role: 'member' },
            ],
          },
        },
        include: {
          members: {
            include: {
              user: {
                select: {
                  id: true,
                  username: true,
                  displayName: true,
                  avatarUrl: true,
                  status: true,
                },
              },
            },
          },
        },
      });

      return res.status(201).json({ chat: formatChat(chat, currentUserId) });
    }

    // Group
    if (!name) {
      return res.status(400).json({ error: 'Укажите название группы' });
    }
    const uniqueIds = [...new Set([currentUserId, ...userIds])];
    const chat = await prisma.chat.create({
      data: {
        type: 'group',
        name,
        description,
        members: {
          create: uniqueIds.map((uid) => ({
            userId: uid,
            role: uid === currentUserId ? 'owner' : 'member',
          })),
        },
      },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                displayName: true,
                avatarUrl: true,
                status: true,
              },
            },
          },
        },
      },
    });

    return res.status(201).json({ chat: formatChat(chat, currentUserId) });
  } catch (err) {
    console.error('createChat:', err);
    return res.status(500).json({ error: 'Ошибка сервера' });
  }
}

function formatChat(chat: any, currentUserId: string) {
  const otherMembers = chat.members.filter((m: any) => m.userId !== currentUserId);
  return {
    id: chat.id,
    type: chat.type,
    name:
      chat.type === 'group'
        ? chat.name
        : otherMembers[0]?.user.displayName || otherMembers[0]?.user.username,
    avatarUrl:
      chat.type === 'group' ? chat.avatarUrl : otherMembers[0]?.user.avatarUrl,
    members: chat.members.map((m: any) => ({
      id: m.user.id,
      username: m.user.username,
      displayName: m.user.displayName,
      avatarUrl: m.user.avatarUrl,
      status: m.user.status,
      role: m.role,
    })),
    lastMessage: null,
    lastMessageAt: chat.lastMessageAt,
  };
}

export async function getChat(req: AuthRequest, res: Response) {
  try {
    const { chatId } = req.params;
    const userId = req.user!.id;
    if (!(await requireChatMember(chatId, userId))) {
      return res.status(403).json({ error: 'Нет доступа к чату' });
    }

    const chat = await prisma.chat.findUnique({
      where: { id: chatId },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                displayName: true,
                avatarUrl: true,
                status: true,
                lastSeen: true,
              },
            },
          },
        },
      },
    });

    if (!chat) return res.status(404).json({ error: 'Чат не найден' });
    return res.json({ chat: formatChat(chat, userId) });
  } catch (err) {
    console.error('getChat:', err);
    return res.status(500).json({ error: 'Ошибка сервера' });
  }
}

export async function searchUsers(req: AuthRequest, res: Response) {
  try {
    const q = (req.query.q as string || '').trim().toLowerCase();
    if (q.length < 1) return res.json({ users: [] });

    const users = await prisma.user.findMany({
      where: {
        OR: [
          { username: { contains: q } },
          { displayName: { contains: q } },
        ],
        NOT: { id: req.user!.id },
      },
      take: 20,
      select: {
        id: true,
        username: true,
        displayName: true,
        avatarUrl: true,
        status: true,
      },
    });

    return res.json({ users });
  } catch (err) {
    console.error('searchUsers:', err);
    return res.status(500).json({ error: 'Ошибка сервера' });
  }
}
