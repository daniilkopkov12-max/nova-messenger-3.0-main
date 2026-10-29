import { z } from 'zod';

export const registerSchema = z.object({
  username: z
    .string()
    .min(3, 'Минимум 3 символа')
    .max(32, 'Максимум 32 символа')
    .regex(/^[a-zA-Z0-9_]+$/, 'Только латиница, цифры и _'),
  password: z
    .string()
    .min(8, 'Минимум 8 символов')
    .max(128),
  displayName: z.string().min(1).max(64).optional(),
});

export const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export const messageSchema = z.object({
  chatId: z.string().uuid(),
  content: z.string().max(4000).optional(),
  type: z.enum(['text', 'image', 'file', 'voice', 'video-note']).default('text'),
  replyToId: z.string().uuid().optional().nullable(),
  clientId: z.string().optional(), // for deduplication
  fileUrl: z.string().max(500).optional(),
  fileName: z.string().max(255).optional(),
  fileSize: z.number().int().nonnegative().max(50 * 1024 * 1024).optional(),
});

export const createChatSchema = z.object({
  type: z.enum(['private', 'group']),
  userIds: z.array(z.string().uuid()).min(1),
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
});

export const editMessageSchema = z.object({
  content: z.string().min(1).max(4000),
});

export const reactionSchema = z.object({
  emoji: z.string().min(1).max(16),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type MessageInput = z.infer<typeof messageSchema>;
export type CreateChatInput = z.infer<typeof createChatSchema>;
