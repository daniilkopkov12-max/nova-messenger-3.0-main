const API_BASE = '/api';

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return data as T;
}

export const api = {
  getIceServers: () => request<{ iceServers: RTCIceServer[]; relayConfigured: boolean; relayProvider: string }>('/webrtc/ice-servers'),
  register: (body: { username: string; password: string; displayName?: string }) =>
    request<{ user: any }>('/auth/register', { method: 'POST', body: JSON.stringify(body) }),

  login: (body: { username: string; password: string }) =>
    request<{ user: any }>('/auth/login', { method: 'POST', body: JSON.stringify(body) }),

  logout: () => request('/auth/logout', { method: 'POST' }),

  me: () => request<{ user: any }>('/auth/me'),

  updateProfile: (body: { displayName?: string; bio?: string; avatarUrl?: string | null }) =>
    request<{ user: any }>('/auth/profile', { method: 'PATCH', body: JSON.stringify(body) }),

  getProfile: (userId: string) => request<{ user: any }>(`/users/${encodeURIComponent(userId)}`),

  uploadFile: async (file: File, kind: 'avatar' | 'attachment' = 'attachment') => {
    const form = new FormData();
    form.append('file', file);
    form.append('kind', kind);
    const res = await fetch(`${API_BASE}/uploads`, { method: 'POST', credentials: 'include', body: form });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data as { file: { url: string; name: string; size: number; mimeType: string; type: 'image' | 'file' } };
  },

  getChats: () => request<{ chats: any[] }>('/chats'),

  createChat: (body: { type: string; userIds: string[]; name?: string }) =>
    request<{ chat: any }>('/chats', { method: 'POST', body: JSON.stringify(body) }),

  getMessages: (chatId: string, before?: string) =>
    request<{ messages: any[]; hasMore: boolean }>(
      `/chats/${chatId}/messages${before ? `?before=${before}` : ''}`
    ),

  sendMessage: (body: { chatId: string; content: string; type?: string; replyToId?: string; clientId?: string; fileUrl?: string; fileName?: string; fileSize?: number }) =>
    request<{ message: any }>('/messages', { method: 'POST', body: JSON.stringify(body) }),

  editMessage: (id: string, content: string) =>
    request<{ message: any }>(`/messages/${id}`, { method: 'PATCH', body: JSON.stringify({ content }) }),

  deleteMessage: (id: string) =>
    request(`/messages/${id}`, { method: 'DELETE' }),

  searchUsers: (q: string) =>
    request<{ users: any[] }>(`/users/search?q=${encodeURIComponent(q)}`),

  moderateUser: (username: string, action: 'ban' | 'unban') =>
    request<{ ok: boolean }>(`/moderation/users/${encodeURIComponent(username)}`, { method: 'POST', body: JSON.stringify({ action }) }),
};
