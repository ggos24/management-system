import React, { useState } from 'react';
import { toast } from 'sonner';
import { Eye, EyeOff, Check, ArrowRight, ArrowLeft } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { AlertBanner } from './AlertBanner';
import type { Session } from '@supabase/supabase-js';

interface LoginPageProps {
  onLogin: (session: Session) => void;
  mode?: 'login' | 'set-password';
}

const LoginPage: React.FC<LoginPageProps> = ({ onLogin, mode: initialMode = 'login' }) => {
  const [currentMode, setCurrentMode] = useState<'login' | 'set-password' | 'reset-password'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    if (currentMode === 'reset-password') {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}`,
      });
      setIsLoading(false);
      if (resetError) {
        setError(resetError.message);
        return;
      }
      toast.success('Password reset email sent. Check your inbox.');
      setCurrentMode('login');
      return;
    }

    if (currentMode === 'set-password') {
      if (password.length < 6) {
        setError('Password must be at least 6 characters');
        setIsLoading(false);
        return;
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match');
        setIsLoading(false);
        return;
      }

      const { error: updateError } = await supabase.auth.updateUser({ password });
      setIsLoading(false);

      if (updateError) {
        setError(updateError.message);
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session) {
        onLogin(session);
      }
      return;
    }

    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setIsLoading(false);

    if (authError) {
      setError(authError.message);
      return;
    }

    if (data.session) {
      onLogin(data.session);
    }
  };

  return (
    <div className="min-h-screen w-full bg-zinc-50 dark:bg-black flex items-center justify-center p-4 transition-colors duration-300">
      <div className="w-full max-w-md bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-xl p-8 animate-in fade-in zoom-in-95 duration-500">
        <div className="text-center mb-8">
          <img src="/logo.svg" alt="Logo" className="w-12 h-12 rounded-lg mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white tracking-tight">
            {currentMode === 'set-password'
              ? 'Set Your Password'
              : currentMode === 'reset-password'
                ? 'Reset Password'
                : 'Welcome back'}
          </h1>
          <p className="text-sm text-zinc-500 mt-2">
            {currentMode === 'set-password'
              ? 'Create a password to complete your account setup'
              : currentMode === 'reset-password'
                ? "Enter your email and we'll send you a reset link"
                : 'Enter your credentials to access the workspace'}
          </p>
        </div>

        {error && (
          <div className="mb-4">
            <AlertBanner message={error} />
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {(currentMode === 'login' || currentMode === 'reset-password') && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium uppercase text-zinc-500 tracking-wider">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg outline-none focus:ring-1 focus:ring-zinc-400 transition-all text-sm text-zinc-900 dark:text-white"
                placeholder="name@company.com"
              />
            </div>
          )}

          {currentMode !== 'reset-password' && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium uppercase text-zinc-500 tracking-wider">
                {currentMode === 'set-password' ? 'New Password' : 'Password'}
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-3 pr-10 py-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg outline-none focus:ring-1 focus:ring-zinc-400 transition-all text-sm text-zinc-900 dark:text-white"
                  placeholder={currentMode === 'set-password' ? 'Choose a strong password' : '••••••••'}
                  minLength={6}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
          )}

          {currentMode === 'set-password' && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium uppercase text-zinc-500 tracking-wider">Confirm Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full pl-3 pr-10 py-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg outline-none focus:ring-1 focus:ring-zinc-400 transition-all text-sm text-zinc-900 dark:text-white"
                  placeholder="Re-enter your password"
                  minLength={6}
                />
              </div>
            </div>
          )}

          {currentMode === 'login' && (
            <div className="flex items-center justify-between py-2">
              <label className="flex items-center gap-2 cursor-pointer group">
                <div
                  className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${rememberMe ? 'bg-black dark:bg-white border-black dark:border-white' : 'border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800'}`}
                  onClick={(e) => {
                    e.preventDefault();
                    setRememberMe(!rememberMe);
                  }}
                >
                  {rememberMe && <Check size={10} className="text-white dark:text-black" />}
                </div>
                <span
                  className="text-xs text-zinc-500 group-hover:text-zinc-700 dark:group-hover:text-zinc-300 select-none"
                  onClick={(e) => {
                    e.preventDefault();
                    setRememberMe(!rememberMe);
                  }}
                >
                  Remember me
                </span>
              </label>
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setCurrentMode('reset-password');
                }}
                className="text-xs font-medium text-zinc-900 dark:text-white hover:underline"
              >
                Forgot password?
              </button>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-black dark:bg-white text-white dark:text-black text-sm font-semibold py-2.5 rounded-lg hover:opacity-90 transition-opacity flex items-center justify-center gap-2 disabled:opacity-70"
          >
            {isLoading
              ? currentMode === 'set-password'
                ? 'Setting password...'
                : currentMode === 'reset-password'
                  ? 'Sending...'
                  : 'Logging in...'
              : currentMode === 'set-password'
                ? 'Set Password & Continue'
                : currentMode === 'reset-password'
                  ? 'Send Reset Link'
                  : 'Sign In'}
            {!isLoading && <ArrowRight size={16} />}
          </button>

          {currentMode === 'reset-password' && (
            <button
              type="button"
              onClick={() => {
                setError(null);
                setCurrentMode('login');
              }}
              className="w-full flex items-center justify-center gap-1 text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300 transition-colors"
            >
              <ArrowLeft size={14} /> Back to sign in
            </button>
          )}
        </form>
      </div>
    </div>
  );
};

export default LoginPage;
