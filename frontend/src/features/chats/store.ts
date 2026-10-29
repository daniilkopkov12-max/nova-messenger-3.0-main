import { create } from 'zustand';
import { api } from '../../services/api';
import { getSocket } from '../../services/socket';

interface Message {
  id: string;
  chatId: string;
  content: string | null;
  type: string;
  fileUrl?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  sender: { id: string; username: string; displayName: string; avatarUrl: string | null };
  replyTo?: any;
  reactions: any[];
  statuses: any[];
  createdAt: string;
  editedAt?: string;
  clientId?: string;
}

interface Chat {
  id: string;
  type: string;
  name: string;
  avatarUrl: string | null;
  members: any[];
  lastMessage: any;
  lastMessageAt: string | null;
  unread?: number;
}

interface ChatState {
  chats: Chat[];
  currentChatId: string | null;
  messages: Record<string, Message[]>;
  typing: Record<string, string[]>;
  loading: boolean;
  connected: boolean;
  setConnected: (v: boolean) => void;
  loadChats: () => Promise<void>;
  selectChat: (id: string | null) => void;
  loadMessages: (chatId: string) => Promise<void>;
  sendMessage: (chatId: string, content: string, replyToId?: string, attachment?: { type: 'image' | 'file' | 'voice' | 'video-note'; fileUrl: string; fileName: string; fileSize: number }) => Promise<void>;
  addMessage: (msg: Message) => void;
  updateMessageStatus: (messageId: string, userId: string, status: string) => void;
  setTyping: (chatId: string, userId: string, isTyping: boolean) => void;
  createPrivateChat: (userId: string) => Promise<Chat>;
  createGroup: (name: string, userIds: string[]) => Promise<Chat>;
}

export const useChatStore = create<ChatState>((set, get) => ({
  chats: [],
  currentChatId: null,
  messages: {},
  typing: {},
  loading: false,
  connected: false,

  setConnected: (v) => set({ connected: v }),

  loadChats: async () => {
    set({ loading: true });
    try {
      const { chats } = await api.getChats();
      set({ chats, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  selectChat: (id) => {
    set({ currentChatId: id });
    if (id) get().loadMessages(id);
  },

  loadMessages: async (chatId) => {
    try {
      const { messages } = await api.getMessages(chatId);
      set((s) => ({
        messages: { ...s.messages, [chatId]: messages },
      }));
    } catch (e) {
      console.error(e);
    }
  },

  sendMessage: async (chatId, content, replyToId, attachment) => {
    const clientId = `c_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const socket = getSocket();
    const optimistic: Message = {
      id: clientId,
      chatId,
      content,
      type: attachment?.type || 'text',
      fileUrl: attachment?.fileUrl || null,
      fileName: attachment?.fileName || null,
      fileSize: attachment?.fileSize || null,
      sender: { id: 'me', username: '', displayName: 'Вы', avatarUrl: null },
      reactions: [],
      statuses: [],
      createdAt: new Date().toISOString(),
      clientId,
    };

    set((s) => ({
      messages: {
        ...s.messages,
        [chatId]: [...(s.messages[chatId] || []), optimistic],
      },
    }));

    if (socket?.connected) {
      socket.emit('message:send', { chatId, content, replyToId, clientId, ...(attachment || {}), type: attachment?.type || 'text' }, (res: any) => {
        if (res?.error) {
          console.error(res.error);
        }
      });
    } else {
      try {
        const { message } = await api.sendMessage({ chatId, content, replyToId, clientId, ...(attachment || {}), type: attachment?.type || 'text' });
        set((s) => {
          const list = (s.messages[chatId] || []).map((m) =>
            m.clientId === clientId ? message : m
          );
          return { messages: { ...s.messages, [chatId]: list } };
        });
      } catch (e) {
        console.error(e);
      }
    }
  },

  addMessage: (msg) => {
    set((s) => {
      const list = s.messages[msg.chatId] || [];
      // Dedup by clientId or id
      if (list.some((m) => m.id === msg.id || (msg.clientId && m.clientId === msg.clientId))) {
        return {
          messages: {
            ...s.messages,
            [msg.chatId]: list.map((m) =>
              (msg.clientId && m.clientId === msg.clientId) || m.id === msg.id ? msg : m
            ),
          },
        };
      }
      return {
        messages: {
          ...s.messages,
          [msg.chatId]: [...list, msg],
        },
        chats: s.chats.map((c) =>
          c.id === msg.chatId
            ? { ...c, lastMessage: msg, lastMessageAt: msg.createdAt }
            : c
        ),
      };
    });
  },

  updateMessageStatus: (messageId, userId, status) => {
    set((s) => {
      const next = { ...s.messages };
      for (const chatId of Object.keys(next)) {
        next[chatId] = next[chatId].map((m) => {
          if (m.id !== messageId) return m;
          const statuses = [...(m.statuses || [])];
          const idx = statuses.findIndex((st) => st.userId === userId);
          if (idx >= 0) statuses[idx] = { ...statuses[idx], status };
          else statuses.push({ userId, status });
          return { ...m, statuses };
        });
      }
      return { messages: next };
    });
  },

  setTyping: (chatId, userId, isTyping) => {
    set((s) => {
      const current = s.typing[chatId] || [];
      let next: string[];
      if (isTyping) {
        next = current.includes(userId) ? current : [...current, userId];
      } else {
        next = current.filter((id) => id !== userId);
      }
      return { typing: { ...s.typing, [chatId]: next } };
    });
  },

  createPrivateChat: async (userId) => {
    const { chat } = await api.createChat({ type: 'private', userIds: [userId] });
    set((s) => ({
      chats: [chat, ...s.chats.filter((c) => c.id !== chat.id)],
    }));
    return chat;
  },

  createGroup: async (name, userIds) => {
    const { chat } = await api.createChat({ type: 'group', userIds, name });
    set((s) => ({
      chats: [chat, ...s.chats.filter((c) => c.id !== chat.id)],
    }));
    return chat;
  },
}));

