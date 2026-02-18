import React from 'react';
import { Sun, Moon, Bell, Search, X, Menu } from 'lucide-react';
import { Avatar } from './Avatar';
import { useUiStore } from '../stores/uiStore';
import { useAuthStore } from '../stores/authStore';
import { useDataStore } from '../stores/dataStore';

export const Header: React.FC = () => {
  const {
    isDarkMode,
    toggleTheme,
    searchQuery,
    setSearchQuery,
    isNotificationsOpen,
    setIsNotificationsOpen,
    notifications,
    markNotificationsRead,
    setMobileSidebarOpen,
    setIsSettingsModalOpen,
    currentView,
  } = useUiStore();

  const currentUser = useAuthStore((s) => s.currentUser);
  const teams = useDataStore((s) => s.teams);

  const isTeamView = teams.some((t) => t.id === currentView) || currentView === 'my-workspace';

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
        <button
          onClick={toggleTheme}
          className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full text-zinc-500 dark:text-zinc-400 transition-colors"
        >
          {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
        </button>
        <div className="relative">
          <button
            onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
            className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full text-zinc-500 dark:text-zinc-400 transition-colors relative"
          >
            <Bell size={18} />
            {notifications.length > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full"></span>
            )}
          </button>
          {isNotificationsOpen && (
            <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-xl z-[100] animate-in fade-in zoom-in-95 duration-100">
              <div className="p-3 border-b border-zinc-100 dark:border-zinc-800 flex justify-between items-center">
                <h3 className="text-sm font-bold">Notifications</h3>
                <button onClick={() => setIsNotificationsOpen(false)}>
                  <X size={14} />
                </button>
              </div>
              <div className="max-h-80 overflow-y-auto">
                {notifications.map((n) => (
                  <div
                    key={n.id}
                    className="p-3 border-b border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 text-sm"
                  >
                    <p className="font-medium text-zinc-800 dark:text-zinc-200">
                      <span className="font-bold">System:</span> {n.text}
                    </p>
                    <span className="text-xs text-zinc-400">{n.time}</span>
                  </div>
                ))}
                {notifications.length === 0 && (
                  <p className="p-4 text-xs text-zinc-400 text-center">No new notifications</p>
                )}
              </div>
              <div className="p-2 text-center border-t border-zinc-100 dark:border-zinc-800">
                <button onClick={markNotificationsRead} className="text-xs font-medium hover:underline text-zinc-500">
                  Mark all as read
                </button>
              </div>
            </div>
          )}
        </div>
        <div className="h-8 w-px bg-zinc-200 dark:bg-zinc-800 mx-2"></div>
        <button
          onClick={() => setIsSettingsModalOpen(true)}
          className="flex items-center gap-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 pr-3 pl-1 py-1 rounded-full transition-colors"
        >
          <Avatar src={currentUser?.avatar} alt={currentUser?.name} size="md" className="grayscale-0" />
          <div className="text-left hidden md:block">
            <p className="text-xs font-bold leading-none">{currentUser?.name}</p>
            <p className="text-[10px] text-zinc-500 leading-none mt-0.5 uppercase tracking-wide">{currentUser?.role}</p>
          </div>
        </button>
      </div>
    </header>
  );
};
