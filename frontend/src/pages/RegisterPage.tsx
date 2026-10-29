import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuthStore } from '../features/auth/store';
import { MessageCircle } from 'lucide-react';

export default function RegisterPage() {
  const { user, register, loading, error } = useAuthStore();
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');

  if (user) return <Navigate to="/" replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await register(username.trim(), password, displayName.trim() || undefined);
    } catch {}
  };

  return (
    <div className="h-full flex items-center justify-center bg-gradient-to-br from-nova-50 to-nova-100 dark:from-gray-900 dark:to-surface-dark p-4">
      <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl shadow-soft-lg p-8 animate-slide-up">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-nova-500 flex items-center justify-center mb-4 shadow-lg">
            <MessageCircle className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Nova Messenger</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Создайте аккаунт</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm">
              {error}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Имя пользователя
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 focus:ring-2 focus:ring-nova-500 focus:border-transparent outline-none transition"
              placeholder="username"
              pattern="[a-zA-Z0-9_]{3,32}"
              required
            />
            <p className="mt-1 text-xs text-gray-400">Латиница, цифры и _ , 3–32 символа</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Отображаемое имя
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 focus:ring-2 focus:ring-nova-500 focus:border-transparent outline-none transition"
              placeholder="Как вас отображать"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Пароль
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 focus:ring-2 focus:ring-nova-500 focus:border-transparent outline-none transition"
              placeholder="Минимум 8 символов"
              minLength={8}
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl bg-nova-500 hover:bg-nova-600 text-white font-medium transition disabled:opacity-60 focus-ring"
          >
            {loading ? 'Регистрация...' : 'Создать аккаунт'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-500">
          Уже есть аккаунт?{' '}
          <Link to="/login" className="text-nova-500 hover:text-nova-600 font-medium">
            Войти
          </Link>
        </p>
      </div>
    </div>
  );
}
