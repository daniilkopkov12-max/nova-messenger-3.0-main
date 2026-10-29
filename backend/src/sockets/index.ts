import { Server, Socket } from 'socket.io';
import { validateSession } from '../utils/auth.js';
import { prisma } from '../utils/prisma.js';
import { requireChatMember } from '../middleware/auth.js';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  username?: string;
}

const onlineUsers = new Map<string, Set<string>>(); // userId -> set of socketIds

export function setupSockets(io: Server) {
  io.use(async (socket: AuthenticatedSocket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.cookie
          ?.split(';')
          .find((c) => c.trim().startsWith('session='))
          ?.split('=')[1];

      if (!token) {
        return next(new Error('Unauthorized'));
      }

      const session = await validateSession(token);
      if (!session) {
        return next(new Error('Unauthorized'));
      }

      socket.userId = session.user.id;
      socket.username = session.user.username;
      next();
    } catch (err) {
      next(new Error('Unauthorized'));
    }
  });

  io.on('connection', async (socket: AuthenticatedSocket) => {
    const userId = socket.userId!;
    console.log(`User connected: ${socket.username} (${userId})`);

    if (!onlineUsers.has(userId)) {
      onlineUsers.set(userId, new Set());
    }
    onlineUsers.get(userId)!.add(socket.id);

    // Update status
    await prisma.user.update({
      where: { id: userId },
      data: { status: 'online', lastSeen: new Date() },
    });

    // Join personal room
    socket.join(`user:${userId}`);

    // Notify contacts about online status
    io.emit('user:status', { userId, status: 'online' });

    // Join all chat rooms of the user
    const memberships = await prisma.chatMember.findMany({
      where: { userId },
      select: { chatId: true },
    });
    for (const m of memberships) {
      socket.join(`chat:${m.chatId}`);
    }

    // Typing
    socket.on('typing:start', async ({ chatId }) => {
      if (!(await requireChatMember(chatId, userId))) return;
      socket.to(`chat:${chatId}`).emit('typing:start', { chatId, userId, username: socket.username });
    });

    socket.on('typing:stop', async ({ chatId }) => {
      if (!(await requireChatMember(chatId, userId))) return;
      socket.to(`chat:${chatId}`).emit('typing:stop', { chatId, userId });
    });

    // New message (also handled via REST, but for real-time broadcast)
    socket.on('message:send', async (data, callback) => {
      try {
        const { chatId, content, type = 'text', replyToId, clientId, fileUrl, fileName, fileSize } = data;
        if (!(await requireChatMember(chatId, userId))) {
          callback?.({ error: 'Нет доступа' });
          return;
        }

        if ((type === 'image' || type === 'file') && (!fileUrl || !String(fileUrl).startsWith('/uploads/'))) {
          callback?.({ error: 'Сначала загрузите файл' });
          return;
        }

        const message = await prisma.message.create({
          data: {
            chatId,
            senderId: userId,
            content: content || null,
            type,
            fileUrl: fileUrl || null,
            fileName: fileName || null,
            fileSize: typeof fileSize === 'number' ? fileSize : null,
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

        await prisma.messageStatus.create({
          data: { messageId: message.id, userId, status: 'sent' },
        });

        const payload = {
          id: message.id,
          chatId: message.chatId,
          content: message.content,
          type: message.type,
          fileUrl: message.fileUrl,
          fileName: message.fileName,
          fileSize: message.fileSize,
          sender: message.sender,
          replyTo: message.replyTo
            ? {
                id: message.replyTo.id,
                content: message.replyTo.content,
                senderName: message.replyTo.sender?.displayName,
              }
            : null,
          reactions: [],
          statuses: [{ userId, status: 'sent' }],
          createdAt: message.createdAt,
          clientId,
        };

        // Broadcast to chat room
        io.to(`chat:${chatId}`).emit('message:new', payload);

        // Delivered status for others
        socket.to(`chat:${chatId}`).emit('message:status', {
          messageId: message.id,
          userId,
          status: 'delivered',
        });

        callback?.({ message: payload });
      } catch (err) {
        console.error('message:send error', err);
        callback?.({ error: 'Ошибка отправки' });
      }
    });

    // Message read
    socket.on('message:read', async ({ chatId, messageIds }) => {
      if (!(await requireChatMember(chatId, userId))) return;
      for (const mid of messageIds || []) {
        await prisma.messageStatus.upsert({
          where: { messageId_userId: { messageId: mid, userId } },
          create: { messageId: mid, userId, status: 'read' },
          update: { status: 'read' },
        });
        io.to(`chat:${chatId}`).emit('message:status', {
          messageId: mid,
          userId,
          status: 'read',
        });
      }
    });

    // Reaction
    socket.on('message:react', async ({ messageId, emoji }) => {
      const message = await prisma.message.findUnique({ where: { id: messageId } });
      if (!message || !(await requireChatMember(message.chatId, userId))) return;

      const existing = await prisma.reaction.findUnique({
        where: {
          messageId_userId_emoji: { messageId, userId, emoji },
        },
      });

      if (existing) {
        await prisma.reaction.delete({ where: { id: existing.id } });
        io.to(`chat:${message.chatId}`).emit('message:reaction', {
          messageId,
          userId,
          emoji,
          action: 'remove',
        });
      } else {
        await prisma.reaction.create({
          data: { messageId, userId, emoji },
        });
        io.to(`chat:${message.chatId}`).emit('message:reaction', {
          messageId,
          userId,
          emoji,
          action: 'add',
          username: socket.username,
        });
      }
    });

    // WebRTC signaling
    socket.on('call:offer', async ({ toUserId, offer, isVideo }) => {
      io.to(`user:${toUserId}`).emit('call:incoming', {
        fromUserId: userId,
        fromUsername: socket.username,
        offer,
        isVideo,
      });
    });

    socket.on('call:answer', ({ toUserId, answer }) => {
      io.to(`user:${toUserId}`).emit('call:answer', {
        fromUserId: userId,
        answer,
      });
    });

    socket.on('call:ice-candidate', ({ toUserId, candidate }) => {
      io.to(`user:${toUserId}`).emit('call:ice-candidate', {
        fromUserId: userId,
        candidate,
      });
    });

    socket.on('call:reject', ({ toUserId }) => {
      io.to(`user:${toUserId}`).emit('call:rejected', { fromUserId: userId });
    });

    socket.on('call:end', ({ toUserId }) => {
      io.to(`user:${toUserId}`).emit('call:ended', { fromUserId: userId });
    });

    socket.on('disconnect', async () => {
      const sockets = onlineUsers.get(userId);
      if (sockets) {
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          onlineUsers.delete(userId);
          await prisma.user.update({
            where: { id: userId },
            data: { status: 'offline', lastSeen: new Date() },
          });
          io.emit('user:status', { userId, status: 'offline' });
        }
      }
      console.log(`User disconnected: ${socket.username}`);
    });
  });
}

export function getOnlineUsers() {
  return onlineUsers;
}
