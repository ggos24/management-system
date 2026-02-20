import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Send, Loader2, CheckCircle2, Unlink } from 'lucide-react';
import { toast } from 'sonner';
import { Modal } from './Modal';
import { Avatar } from './Avatar';
import { AbsenceStatsCard } from './AbsenceStatsCard';
import { calculateAbsenceStats } from '../lib/utils';
import {
  uploadAvatar,
  fetchTelegramLink,
  upsertTelegramLinkCode,
  deleteTelegramLink,
  TelegramLink,
} from '../lib/database';
import { useUiStore } from '../stores/uiStore';
import { useAuthStore } from '../stores/authStore';
import { useDataStore } from '../stores/dataStore';

export const SettingsModal: React.FC = () => {
  const { isSettingsModalOpen, setIsSettingsModalOpen, activeSettingsTab, setActiveSettingsTab, setIsInviteModalOpen } =
    useUiStore();
  const currentUser = useAuthStore((s) => s.currentUser);
  const setCurrentUser = useAuthStore((s) => s.setCurrentUser);
  const { members, absences, logs, removeMember, updateMemberAvatar } = useDataStore();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  // Telegram linking state
  const [telegramLink, setTelegramLink] = useState<TelegramLink | null>(null);
  const [telegramLoading, setTelegramLoading] = useState(false);
  const [telegramCode, setTelegramCode] = useState<string | null>(null);

  const loadTelegramLink = useCallback(async () => {
    if (!currentUser) return;
    try {
      const link = await fetchTelegramLink(currentUser.id);
      setTelegramLink(link);
      setTelegramCode(link?.linkCode || null);
    } catch {
      // Non-critical
    }
  }, [currentUser]);

  useEffect(() => {
    if (isSettingsModalOpen && activeSettingsTab === 'Notifications') {
      loadTelegramLink();
    }
  }, [isSettingsModalOpen, activeSettingsTab, loadTelegramLink]);

  const generateTelegramCode = async () => {
    if (!currentUser) return;
    setTelegramLoading(true);
    try {
      const code = Array.from(crypto.getRandomValues(new Uint8Array(3)))
        .map((b) => b.toString(36).toUpperCase().padStart(2, '0'))
        .join('')
        .slice(0, 6);
      const link = await upsertTelegramLinkCode(currentUser.id, code);
      setTelegramLink(link);
      setTelegramCode(code);
      toast.success('Code generated');
    } catch {
      toast.error('Failed to generate code');
    } finally {
      setTelegramLoading(false);
    }
  };

  const unlinkTelegram = async () => {
    if (!currentUser) return;
    setTelegramLoading(true);
    try {
      await deleteTelegramLink(currentUser.id);
      setTelegramLink(null);
      setTelegramCode(null);
      toast.success('Telegram unlinked');
    } catch {
      toast.error('Failed to unlink');
    } finally {
      setTelegramLoading(false);
    }
  };

  const handleChangeAvatar = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentUser) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Image must be under 2 MB');
      return;
    }

    setUploading(true);
    try {
      const publicUrl = await uploadAvatar(currentUser.id, file);
      updateMemberAvatar(currentUser.id, publicUrl);
      setCurrentUser({ ...currentUser, avatar: publicUrl });
      toast.success('Avatar updated');
    } catch {
      toast.error('Failed to upload avatar');
    } finally {
      setUploading(false);
      // Reset so re-selecting the same file triggers onChange
      e.target.value = '';
    }
  };

  const renderSettingsContent = () => {
    if (!currentUser) return null;
    switch (activeSettingsTab) {
      case 'My Profile': {
        const myAbsenceStats = calculateAbsenceStats(currentUser.id, absences);
        return (
          <div className="space-y-6">
            <div className="flex items-center gap-4 border-b border-zinc-100 dark:border-zinc-800 pb-6">
              <Avatar src={currentUser.avatar} size="lg" className="!w-20 !h-20" />
              <div>
                <div className="flex items-center gap-3">
                  <h3 className="text-lg font-bold">{currentUser.name}</h3>
                  <span className="bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wider text-zinc-500">
                    {currentUser.role}
                  </span>
                </div>
                <p className="text-zinc-500 text-sm">{currentUser.jobTitle}</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileSelected}
                />
                <button
                  onClick={handleChangeAvatar}
                  disabled={uploading}
                  className="text-sm text-blue-600 hover:underline mt-2 flex items-center gap-1.5 disabled:opacity-50"
                >
                  {uploading && <Loader2 size={14} className="animate-spin" />}
                  {uploading ? 'Uploading...' : 'Change Avatar'}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-zinc-500 uppercase">My Absences</h4>
              <AbsenceStatsCard stats={myAbsenceStats} />
            </div>
          </div>
        );
      }
      case 'Notifications': {
        const isLinked = telegramLink?.chatId != null;
        return (
          <div className="space-y-4">
            <div className="p-4 border border-zinc-200 dark:border-zinc-700 rounded-lg space-y-3">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <Send size={16} className="text-[#0088cc]" />
                  <span className="text-sm font-medium">Telegram</span>
                </div>
                {isLinked && (
                  <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 dark:text-emerald-400 px-2 py-1 rounded-full">
                    <CheckCircle2 size={12} /> Connected
                  </span>
                )}
              </div>

              {isLinked ? (
                <div className="flex items-center justify-between pt-1">
                  <p className="text-xs text-zinc-500">Notifications are being sent to your Telegram.</p>
                  <button
                    onClick={unlinkTelegram}
                    disabled={telegramLoading}
                    className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-600 disabled:opacity-50"
                  >
                    {telegramLoading ? <Loader2 size={12} className="animate-spin" /> : <Unlink size={12} />}
                    Unlink
                  </button>
                </div>
              ) : telegramCode ? (
                <div className="space-y-3 pt-1">
                  <a
                    href={`https://t.me/managment_system_bot?start=${telegramCode}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-2 bg-[#0088cc] hover:bg-[#0077b5] text-white text-sm font-medium rounded transition-colors flex items-center justify-center gap-2"
                  >
                    <Send size={14} /> Connect in Telegram
                  </a>
                  <p className="text-xs text-zinc-500 text-center">
                    Click the button above, then press <b>Start</b> in Telegram to link.
                  </p>
                </div>
              ) : (
                <div className="pt-1">
                  <p className="text-xs text-zinc-500 mb-3">
                    Link your Telegram account to receive notifications as messages.
                  </p>
                  <button
                    onClick={generateTelegramCode}
                    disabled={telegramLoading}
                    className="w-full py-2 bg-[#0088cc] hover:bg-[#0077b5] text-white text-sm font-medium rounded transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {telegramLoading && <Loader2 size={14} className="animate-spin" />}
                    Generate Code
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      }
      case 'Team Members':
        return (
          <div className="space-y-2">
            {members.map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between p-2 border border-zinc-100 dark:border-zinc-800 rounded hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Avatar src={m.avatar} size="md" />
                  <div>
                    <p className="text-sm font-medium">{m.name}</p>
                    <p className="text-xs text-zinc-500">
                      {m.jobTitle} &bull; {m.role}
                    </p>
                  </div>
                </div>
                {currentUser.role === 'admin' && (
                  <button
                    onClick={() => {
                      if (confirm('Are you sure you want to remove this member?')) {
                        removeMember(m.id, currentUser.id);
                      }
                    }}
                    className="text-xs text-zinc-400 hover:text-red-500"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
            {currentUser.role === 'admin' && (
              <button
                onClick={() => setIsInviteModalOpen(true)}
                className="w-full py-2 border border-dashed border-zinc-300 dark:border-zinc-700 rounded text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300 mt-2"
              >
                + Invite Member
              </button>
            )}
          </div>
        );
      case 'Logs History':
        return (
          <div className="space-y-4 h-[400px] overflow-hidden flex flex-col">
            <h4 className="text-xs font-bold text-zinc-500 uppercase flex-shrink-0">Activity Logs</h4>
            <div className="flex-1 overflow-y-auto custom-scrollbar border border-zinc-200 dark:border-zinc-700 rounded-lg">
              {logs.map((log) => {
                const user = members.find((m) => m.id === log.userId);
                return (
                  <div
                    key={log.id}
                    className="p-3 border-b border-zinc-100 dark:border-zinc-800 last:border-0 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-bold bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded">
                        {log.action}
                      </span>
                      <span className="text-[10px] text-zinc-400">{new Date(log.timestamp).toLocaleString()}</span>
                    </div>
                    <p className="text-sm text-zinc-800 dark:text-zinc-200">{log.details}</p>
                    <div className="flex items-center gap-1.5 mt-2">
                      <Avatar src={user?.avatar} size="xs" />
                      <span className="text-xs text-zinc-500">{user?.name || 'Unknown User'}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <Modal isOpen={isSettingsModalOpen} onClose={() => setIsSettingsModalOpen(false)} title="Settings">
      <div className="flex gap-6 min-h-[400px]">
        <div className="w-48 border-r border-zinc-100 dark:border-zinc-800 pr-4 space-y-1">
          {['My Profile', 'Notifications', 'Team Members', 'Logs History'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveSettingsTab(tab)}
              className={`w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors ${activeSettingsTab === tab ? 'bg-zinc-100 dark:bg-zinc-800 text-black dark:text-white' : 'text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800/50'}`}
            >
              {tab}
            </button>
          ))}
        </div>
        <div className="flex-1">{renderSettingsContent()}</div>
      </div>
    </Modal>
  );
};
