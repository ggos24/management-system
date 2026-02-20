import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Sun, Moon, Bell, Search, X, Menu, ClipboardList, Calendar, UserPlus } from 'lucide-react';
import { Avatar } from './Avatar';
import { IconButton, Divider } from './ui';
import { useUiStore } from '../stores/uiStore';
import { useAuthStore } from '../stores/authStore';
import { useDataStore } from '../stores/dataStore';
import { teamSlug } from '../lib/utils';
import type { Notification, NotificationType } from '../types';

function getNotificationIcon(type: NotificationType) {
  switch (type) {
    case 'task_assigned':
    case 'task_status_changed':
      return <ClipboardList size={14} className="shrink-0" />;
    case 'absence_submitted':
    case 'absence_decided':
      return <Calendar size={14} className="shrink-0" />;
    case 'member_invited':
      return <UserPlus size={14} className="shrink-0" />;
    default:
      return <Bell size={14} className="shrink-0" />;
  }
}

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export const Header: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const {
    isDarkMode,
    toggleTheme,
    searchQuery,
    setSearchQuery,
    isNotificationsOpen,
    setIsNotificationsOpen,
    notifications,
    unreadCount,
    markNotificationRead,
    markAllNotificationsRead,
    setMobileSidebarOpen,
    setIsSettingsModalOpen,
    setIsTaskModalOpen,
    setTaskModalData,
  } = useUiStore();

  const currentUser = useAuthStore((s) => s.currentUser);
  const teams = useDataStore((s) => s.teams);
  const tasks = useDataStore((s) => s.tasks);

  const isTeamView = location.pathname.startsWith('/teams/') || location.pathname === '/workspace';

  const handleNotificationClick = (n: Notification) => {
    markNotificationRead(n.id);

    // Navigate based on notification type
    if (n.type === 'task_assigned' || n.type === 'task_status_changed') {
      const taskId = n.entityData?.taskId;
      const teamId = n.entityData?.teamId;
      if (teamId) {
        const team = teams.find((t) => t.id === teamId);
        navigate(`/teams/${team ? teamSlug(team) : teamId}`);
      }
      if (taskId) {
        const task = tasks.find((t) => t.id === taskId);
        if (task) {
          setTaskModalData(task);
          setIsTaskModalOpen(true);
        }
      }
    } else if (n.type === 'absence_submitted' || n.type === 'absence_decided') {
      navigate('/schedule');
    } else if (n.type === 'member_invited') {
      navigate('/dashboard');
    }

    setIsNotificationsOpen(false);
  };

  return (
    <header className="h-16 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between px-4 bg-white dark:bg-zinc-900/50 backdrop-blur-md sticky top-0 z-50">
      <div className="flex items-center gap-3">
        <button
          onClick={() => setMobileSidebarOpen(true)}
          className="md:hidden p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded"
        >
          <Menu size={20} />
        </button>
        {isTeamView && (
          <div className="relative hidden md:block group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={16} />
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-4 py-1.5 bg-zinc-100 dark:bg-zinc-800/50 border-none rounded-md text-sm w-64 focus:ring-1 focus:ring-zinc-300 dark:focus:ring-zinc-600 outline-none transition-all"
            />
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <IconButton onClick={toggleTheme}>{isDarkMode ? <Sun size={18} /> : <Moon size={18} />}</IconButton>
        <div className="relative">
          <IconButton onClick={() => setIsNotificationsOpen(!isNotificationsOpen)} className="relative">
            <Bell size={18} />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center bg-red-500 text-white text-[10px] font-semibold rounded-full px-1">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </IconButton>
          {isNotificationsOpen && (
            <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-xl z-[100] animate-in fade-in zoom-in-95 duration-100">
              <div className="p-3 border-b border-zinc-100 dark:border-zinc-800 flex justify-between items-center">
                <h3 className="text-sm font-semibold">
                  Notifications
                  {unreadCount > 0 && <span className="ml-1 text-zinc-400 font-normal">({unreadCount})</span>}
                </h3>
                <button onClick={() => setIsNotificationsOpen(false)}>
                  <X size={14} />
                </button>
              </div>
              <div className="max-h-80 overflow-y-auto">
                {notifications.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => handleNotificationClick(n)}
                    className={`w-full text-left p-3 border-b border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 text-sm transition-colors ${
                      !n.read ? 'bg-blue-50/50 dark:bg-blue-950/20' : ''
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <div className={`mt-0.5 ${!n.read ? 'text-blue-500' : 'text-zinc-400'}`}>
                        {getNotificationIcon(n.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-zinc-800 dark:text-zinc-200 leading-snug">{n.message}</p>
                        <span className="text-xs text-zinc-400 mt-0.5 block">{formatRelativeTime(n.createdAt)}</span>
                      </div>
                      {!n.read && <span className="w-2 h-2 bg-blue-500 rounded-full shrink-0 mt-1.5" />}
                    </div>
                  </button>
                ))}
                {notifications.length === 0 && (
                  <p className="p-4 text-xs text-zinc-400 text-center">No notifications</p>
                )}
              </div>
              {notifications.length > 0 && (
                <div className="p-2 text-center border-t border-zinc-100 dark:border-zinc-800">
                  <button
                    onClick={markAllNotificationsRead}
                    className="text-xs font-medium hover:underline text-zinc-500"
                  >
                    Mark all as read
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
        <Divider orientation="vertical" className="h-8 mx-2" />
        <button
          onClick={() => setIsSettingsModalOpen(true)}
          className="flex items-center gap-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 pr-3 pl-1 py-1 rounded-full transition-colors"
        >
          <Avatar src={currentUser?.avatar} alt={currentUser?.name} size="md" />
          <div className="text-left hidden md:block">
            <p className="text-xs font-semibold leading-none">{currentUser?.name}</p>
            <p className="text-[10px] text-zinc-500 leading-none mt-0.5 uppercase tracking-wider">
              {currentUser?.role}
            </p>
          </div>
        </button>
      </div>
    </header>
  );
};
