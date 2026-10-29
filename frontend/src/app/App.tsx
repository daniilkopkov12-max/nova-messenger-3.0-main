import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from '../features/auth/store';
import { useChatStore } from '../features/chats/store';
import { getSocket, connectSocket } from '../services/socket';
import LoginPage from '../pages/LoginPage';
import RegisterPage from '../pages/RegisterPage';
import MessengerPage from '../pages/MessengerPage';
import { useTheme } from '../hooks/useTheme';

function Protected({ children }: { children: React.ReactNode }) {
  const { user, initialized } = useAuthStore();
  if (!initialized) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50 dark:bg-surface-dark">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-nova-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-500">Загрузка...</p>
        </div>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  const { checkAuth, user } = useAuthStore();
  const { addMessage, updateMessageStatus, setTyping, setConnected, loadChats } = useChatStore();
  useTheme();

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    if (!user) return;
    const socket = connectSocket(() => setConnected(true));
    loadChats();

    socket?.on('connect', () => setConnected(true));
    socket?.on('disconnect', () => setConnected(false));

    socket?.on('message:new', (msg) => {
      addMessage(msg);
    });
    socket?.on('message:status', ({ messageId, userId, status }) => {
      updateMessageStatus(messageId, userId, status);
    });
    socket?.on('typing:start', ({ chatId, userId }) => {
      setTyping(chatId, userId, true);
    });
    socket?.on('typing:stop', ({ chatId, userId }) => {
      setTyping(chatId, userId, false);
    });
    socket?.on('user:status', () => {
      // could update member status in chats
    });

    return () => {
      socket?.off('message:new');
      socket?.off('message:status');
      socket?.off('typing:start');
      socket?.off('typing:stop');
    };
  }, [user]);

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route
        path="/*"
        element={
          <Protected>
            <MessengerPage />
          </Protected>
        }
      />
    </Routes>
  );
}
