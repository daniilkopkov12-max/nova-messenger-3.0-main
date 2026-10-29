import { create } from 'zustand';
import { api } from '../../services/api';
import { connectSocket, disconnectSocket } from '../../services/socket';

interface User {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  bio?: string;
  status?: string;
}

interface AuthState {
  user: User | null;
  loading: boolean;
  error: string | null;
  initialized: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string, displayName?: string) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  setUser: (user: User | null) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: false,
  error: null,
  initialized: false,

  setUser: (user) => set({ user }),

  checkAuth: async () => {
    try {
      const { user } = await api.me();
      set({ user, initialized: true });
      connectSocket();
    } catch {
      set({ user: null, initialized: true });
    }
  },

  login: async (username, password) => {
    set({ loading: true, error: null });
    try {
      const { user } = await api.login({ username, password });
      set({ user, loading: false });
      connectSocket();
    } catch (e: any) {
      set({ error: e.message || 'Ошибка входа', loading: false });
      throw e;
    }
  },

  register: async (username, password, displayName) => {
    set({ loading: true, error: null });
    try {
      const { user } = await api.register({ username, password, displayName });
      set({ user, loading: false });
      connectSocket();
    } catch (e: any) {
      set({ error: e.message || 'Ошибка регистрации', loading: false });
      throw e;
    }
  },

  logout: async () => {
    try {
      await api.logout();
    } catch {}
    disconnectSocket();
    set({ user: null });
  },
}));
