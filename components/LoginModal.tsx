import React, { useState } from 'react';
import { X, Mail, Loader2 } from 'lucide-react';
import { loginWithGoogle, sendEmailLoginLink } from '../services/firebase';

function authErrorMessage(code: string): string {
  const map: Record<string, string> = {
    'auth/invalid-email': '邮箱格式不正确',
    'auth/too-many-requests': '请求过于频繁，请稍后再试',
    'auth/network-request-failed': '网络错误，请检查网络',
  };
  return map[code] || (code || '操作失败，请重试');
}

interface LoginModalProps {
  open: boolean;
  onClose: () => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({ open, onClose }) => {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [linkSent, setLinkSent] = useState(false);

  const resetForm = () => {
    setEmail('');
    setError('');
    setLinkSent(false);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleGoogleLogin = async () => {
    setError('');
    setLoading(true);
    try {
      const user = await loginWithGoogle();
      if (user) handleClose();
      else setError('Google 登录失败，请重试');
    } catch (e) {
      setError(authErrorMessage((e as { code?: string })?.code));
    } finally {
      setLoading(false);
    }
  };

  const handleSendLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email.trim()) {
      setError('请输入邮箱');
      return;
    }
    setLoading(true);
    try {
      await sendEmailLoginLink(email.trim());
      setLinkSent(true);
    } catch (e: unknown) {
      const code = (e as { code?: string })?.code ?? '';
      setError(authErrorMessage(code));
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[220] bg-black/30 flex items-center justify-center p-4"
      onClick={handleClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl border border-stone-200 max-w-sm w-full p-6 relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={handleClose}
          className="absolute top-4 right-4 p-1 text-stone-400 hover:text-stone-600 rounded-lg"
          aria-label="关闭"
        >
          <X className="w-5 h-5" />
        </button>

        <h3 className="text-lg font-bold text-slate-800 mb-1">登录</h3>
        <p className="text-xs text-slate-500 mb-4">登录后数据将自动同步到云端，无需设置密码</p>

        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={loading}
          className="w-full py-2.5 px-4 rounded-xl border border-stone-200 bg-white text-slate-700 font-medium text-sm hover:bg-stone-50 transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {loading && !linkSent ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <>
              <span className="font-normal">G</span>
              <span>使用 Google 登录</span>
            </>
          )}
        </button>

        <div className="flex items-center gap-3 my-4">
          <div className="flex-1 h-px bg-stone-200" />
          <span className="text-xs text-stone-400">或使用邮箱</span>
          <div className="flex-1 h-px bg-stone-200" />
        </div>

        <form onSubmit={handleSendLink} className="space-y-3">
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="输入邮箱，接收登录链接"
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-stone-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400"
              autoComplete="email"
              disabled={linkSent}
            />
          </div>

          {error && <p className="text-xs text-rose-600 font-medium">{error}</p>}
          {linkSent && (
            <p className="text-xs text-emerald-600 font-medium">
              登录链接已发送至您的邮箱，请查收并点击链接完成登录。
            </p>
          )}

          <button
            type="submit"
            disabled={loading || linkSent}
            className="w-full py-2.5 px-4 rounded-xl bg-indigo-500 text-white font-medium text-sm hover:bg-indigo-600 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {loading && linkSent === false ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              '发送登录链接'
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
