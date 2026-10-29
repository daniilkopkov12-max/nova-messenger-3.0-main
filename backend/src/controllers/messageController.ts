import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.js';
import { messageSchema, editMessageSchema } from '../validation/schemas.js';
import { prisma } from '../utils/prisma.js';
import { requireChatMember } from '../middleware/auth.js';

export async function getMessages(req: AuthRequest, res: Response) {
  try {
    const { chatId } = req.params;
    const userId = req.user!.id;
    const before = req.query.before as string | undefined;
    const limit = Math.min(parseInt(req.query.limit as string || '50', 10), 100);

    if (!(await requireChatMember(chatId, userId))) {
      return res.status(403).json({ error: 'Нет доступа' });
    }

    const messages = await prisma.message.findMany({
      where: {
        chatId,
        ...(before ? { createdAt: { lt: new Date(before) } } : {}),
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        sender: {
          select: { id: true, username: true, displayName: true, avatarUrl: true },
        },
        replyTo: {
          select: {
            id: true,
            content: true,
            sender: { select: { displayName: true } },
          },
        },
        reactions: {
          include: {
            user: { select: { id: true, displayName: true } },
          },
        },
        statuses: true,
      },
    });

    // Mark as delivered/read logic can be in socket
    return res.json({
      messages: messages.reverse().map(formatMessage),
      hasMore: messages.length === limit,
    });
  } catch (err) {
    console.error('getMessages:', err);
    return res.status(500).json({ error: 'Ошибка сервера' });
  }
}

export async function sendMessage(req: AuthRequest, res: Response) {
  try {
    const parsed = messageSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Неверные данные', details: parsed.error.flatten() });
    }

    const { chatId, content, type, replyToId, clientId, fileUrl, fileName, fileSize } = parsed.data;
    const userId = req.user!.id;

    if (!(await requireChatMember(chatId, userId))) {
      return res.status(403).json({ error: 'Нет доступа' });
    }

    if (!content && type === 'text') {
      return res.status(400).json({ error: 'Пустое сообщение' });
    }
    if ((type === 'image' || type === 'file') && (!fileUrl || !fileUrl.startsWith('/uploads/'))) {
      return res.status(400).json({ error: 'Сначала загрузите файл' });
    }

    const message = await prisma.message.create({
      data: {
        chatId,
        senderId: userId,
        content: content || null,
        type: type || 'text',
        fileUrl: fileUrl || null,
        fileName: fileName || null,
        fileSize: fileSize ?? null,
        replyToId: replyToId || null,
      },
      include: {
        sender: {
          select: { id: true, username: true, displayName: true, avatarUrl: true },
        },
        replyTo: {
          select: {
            id: true,
            content: true,
            sender: { select: { displayName: true } },
          },
        },
        reactions: true,
        statuses: true,
      },
    });

    await prisma.chat.update({
      where: { id: chatId },
      data: { lastMessageAt: new Date() },
    });

    // Create initial status for sender
    await prisma.messageStatus.create({
      data: {
        messageId: message.id,
        userId,
        status: 'sent',
      },
    });

    return res.status(201).json({
      message: formatMessage(message),
      clientId,
    });
  } catch (err) {
    console.error('sendMessage:', err);
    return res.status(500).json({ error: 'Ошибка сервера' });
  }
}

export async function editMessage(req: AuthRequest, res: Response) {
  try {
    const { messageId } = req.params;
    const parsed = editMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Неверные данные' });
    }

    const message = await prisma.message.findUnique({ where: { id: messageId } });
    if (!message || message.senderId !== req.user!.id) {
      return res.status(403).json({ error: 'Нет прав на редактирование' });
    }
    if (message.deletedAt) {
      return res.status(400).json({ error: 'Сообщение удалено' });
    }

    const updated = await prisma.message.update({
      where: { id: messageId },
      data: {
        content: parsed.data.content,
        editedAt: new Date(),
      },
      include: {
        sender: {
          select: { id: true, username: true, displayName: true, avatarUrl: true },
        },
        replyTo: {
          select: {
            id: true,
            content: true,
            sender: { select: { displayName: true } },
          },
        },
        reactions: true,
        statuses: true,
      },
    });

    return res.json({ message: formatMessage(updated) });
  } catch (err) {
    console.error('editMessage:', err);
    return res.status(500).json({ error: 'Ошибка сервера' });
  }
}

export async function deleteMessage(req: AuthRequest, res: Response) {
  try {
    const { messageId } = req.params;
    const message = await prisma.message.findUnique({ where: { id: messageId } });
    if (!message || message.senderId !== req.user!.id) {
      return res.status(403).json({ error: 'Нет прав на удаление' });
    }

    await prisma.message.update({
      where: { id: messageId },
      data: { deletedAt: new Date(), content: null },
    });

    return res.json({ ok: true, messageId });
  } catch (err) {
    console.error('deleteMessage:', err);
    return res.status(500).json({ error: 'Ошибка сервера' });
  }
}

function formatMessage(m: any) {
  return {
    id: m.id,
    chatId: m.chatId,
    content: m.content,
    type: m.type,
    fileUrl: m.fileUrl,
    fileName: m.fileName,
    fileSize: m.fileSize,
    replyTo: m.replyTo
      ? {
          id: m.replyTo.id,
          content: m.replyTo.content,
          senderName: m.replyTo.sender?.displayName,
        }
      : null,
    sender: m.sender,
    reactions: (m.reactions || []).map((r: any) => ({
      emoji: r.emoji,
      userId: r.userId,
      userName: r.user?.displayName,
    })),
    statuses: m.statuses || [],
    editedAt: m.editedAt,
    createdAt: m.createdAt,
  };
}
