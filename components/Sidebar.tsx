import React from 'react';
import {
  LayoutDashboard,
  Calendar,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  CheckCircle2,
} from 'lucide-react';
import { Team } from '../types';
import { IconComponent } from './IconComponent';

interface SidebarProps {
  currentView: string;
  onChangeView: (view: string) => void;
  onLogout: () => void;
  onOpenSettings: () => void;
  onManageTeams: () => void;
  onReorderTeams: (draggedId: string, targetId: string) => void;
  teams: Team[];
  userRole: 'admin' | 'user';
  isCollapsed: boolean;
  setIsCollapsed: (v: boolean) => void;
  isMobileOpen: boolean;
  setIsMobileOpen: (v: boolean) => void;
}

const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  onChangeView,
  onLogout,
  onOpenSettings,
  onManageTeams,
  onReorderTeams,
  teams,
  userRole,
  isCollapsed,
  setIsCollapsed,
  isMobileOpen,
  setIsMobileOpen,
}) => {
  // Icon rendering uses the shared IconComponent

  const sidebarWidth = isCollapsed ? 'w-16' : 'w-72';
  const mobileClass = isMobileOpen ? 'translate-x-0' : '-translate-x-full';

  const handleDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.setData('text/plain', id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    const draggedId = e.dataTransfer.getData('text/plain');
    if (draggedId && draggedId !== targetId) {
      onReorderTeams(draggedId, targetId);
    }
  };

  return (
    <>
      {/* Mobile Overlay */}
      {isMobileOpen && (
        <div className="fixed inset-0 bg-black/50 z-30 md:hidden" onClick={() => setIsMobileOpen(false)} />
      )}

      <aside
        className={`fixed md:static inset-y-0 left-0 z-40 bg-zinc-50 dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-800 flex flex-col transition-all duration-300 ${sidebarWidth} ${mobileClass} md:translate-x-0`}
      >
        <div
          className={`p-4 flex items-center ${isCollapsed ? 'justify-center flex-col gap-4' : 'justify-between'} h-16`}
        >
          {/* Only show branding when NOT collapsed */}
          {!isCollapsed && (
            <div className="flex items-center gap-3 overflow-hidden animate-in fade-in duration-200">
              <img
                src="/logo.svg"
                alt="Logo"
                className="w-6 h-6 object-contain rounded-sm"
                onError={(e) => {
                  // Fallback if image not found
                  e.currentTarget.style.display = 'none';
                  e.currentTarget.nextElementSibling?.classList.remove('hidden');
                }}
              />
              {/* Fallback div if logo missing */}
              <div className="w-6 h-6 bg-zinc-900 dark:bg-zinc-100 rounded-sm flex-shrink-0 hidden"></div>

              <span className="font-semibold text-sm tracking-tight text-zinc-900 dark:text-white uppercase leading-none whitespace-nowrap">
                MANAGEMENT SYSTEM
              </span>
            </div>
          )}

          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="hidden md:flex p-1.5 rounded-md hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-500 transition-colors flex-shrink-0 absolute right-2 top-5"
          >
            {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-2 space-y-6 custom-scrollbar mt-6">
          {/* Main Navigation */}
          <div className="space-y-0.5">
            <button
              onClick={() => onChangeView('my-workspace')}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-all focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-1 ${
                currentView === 'my-workspace'
                  ? 'bg-white dark:bg-zinc-800 text-black dark:text-white shadow-sm border border-zinc-200 dark:border-zinc-700'
                  : 'text-zinc-500 hover:text-black dark:text-zinc-400 dark:hover:text-white hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50'
              } ${isCollapsed ? 'justify-center px-0' : ''}`}
              title="My Workspace"
            >
              <CheckCircle2 size={18} />
              <span
                className={`truncate transition-all duration-300 ${isCollapsed ? 'w-0 opacity-0 hidden' : 'w-auto opacity-100'}`}
              >
                My Workspace
              </span>
            </button>
            <button
              onClick={() => onChangeView('dashboard')}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-all focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-1 ${
                currentView === 'dashboard'
                  ? 'bg-white dark:bg-zinc-800 text-black dark:text-white shadow-sm border border-zinc-200 dark:border-zinc-700'
                  : 'text-zinc-500 hover:text-black dark:text-zinc-400 dark:hover:text-white hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50'
              } ${isCollapsed ? 'justify-center px-0' : ''}`}
              title="Dashboard"
            >
              <LayoutDashboard size={18} />
              <span
                className={`truncate transition-all duration-300 ${isCollapsed ? 'w-0 opacity-0 hidden' : 'w-auto opacity-100'}`}
              >
                Dashboard
              </span>
            </button>
            <button
              onClick={() => onChangeView('schedule')}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-all focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-1 ${
                currentView === 'schedule'
                  ? 'bg-white dark:bg-zinc-800 text-black dark:text-white shadow-sm border border-zinc-200 dark:border-zinc-700'
                  : 'text-zinc-500 hover:text-black dark:text-zinc-400 dark:hover:text-white hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50'
              } ${isCollapsed ? 'justify-center px-0' : ''}`}
              title="Schedule"
            >
              <Calendar size={18} />
              <span
                className={`truncate transition-all duration-300 ${isCollapsed ? 'w-0 opacity-0 hidden' : 'w-auto opacity-100'}`}
              >
                Schedule
              </span>
            </button>
          </div>

          {/* Teams Section */}
          <div>
            <div className={`px-3 flex items-center justify-between mb-2 ${isCollapsed ? 'justify-center' : ''}`}>
              {!isCollapsed && (
                <h3 className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">Workspaces</h3>
              )}
              {isCollapsed && <div className="h-px w-4 bg-zinc-200 dark:bg-zinc-800"></div>}

              {!isCollapsed && userRole === 'admin' && (
                <button
                  onClick={onManageTeams}
                  className="text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
                  title="Manage Teams"
                >
                  <Settings size={12} />
                </button>
              )}
            </div>

            <nav className="space-y-0.5">
              {teams
                .filter((t) => !t.hidden && !t.archived && (!t.adminOnly || userRole === 'admin'))
                .map((team) => {
                  const isActive = currentView === team.id;
                  return (
                    <button
                      key={team.id}
                      draggable={!isCollapsed}
                      onDragStart={(e) => handleDragStart(e, team.id)}
                      onDragOver={handleDragOver}
                      onDrop={(e) => handleDrop(e, team.id)}
                      onClick={() => onChangeView(team.id)}
                      className={`group w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-1 ${
                        isActive
                          ? 'bg-white dark:bg-zinc-800 text-black dark:text-white shadow-sm border border-zinc-200 dark:border-zinc-700'
                          : 'text-zinc-500 hover:text-black dark:text-zinc-400 dark:hover:text-white hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50'
                      } ${isCollapsed ? 'justify-center px-0' : ''}`}
                      title={team.name}
                    >
                      <IconComponent
                        name={team.icon}
                        size={18}
                        className={`${isActive ? 'text-black dark:text-white' : 'text-zinc-400'} flex-shrink-0`}
                      />
                      <span
                        className={`truncate transition-all duration-300 ${isCollapsed ? 'w-0 opacity-0 hidden' : 'w-auto opacity-100'}`}
                      >
                        {team.name}
                      </span>

                      {!isCollapsed && (
                        <div className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity text-zinc-300 hover:text-zinc-500 dark:hover:text-zinc-200 cursor-grab active:cursor-grabbing">
                          <GripVertical size={14} />
                        </div>
                      )}
                    </button>
                  );
                })}
            </nav>
          </div>
        </div>

        <div className="mt-auto p-2 border-t border-zinc-200 dark:border-zinc-800 space-y-1">
          <button
            onClick={onOpenSettings}
            className={`w-full flex items-center gap-3 text-zinc-500 hover:text-black dark:text-zinc-400 dark:hover:text-white text-sm font-medium transition-colors px-3 py-2 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800/50 focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-1 ${isCollapsed ? 'justify-center px-0' : ''}`}
            title="Settings"
          >
            <Settings size={18} />
            <span
              className={`truncate transition-all duration-300 ${isCollapsed ? 'w-0 opacity-0 hidden' : 'w-auto opacity-100'}`}
            >
              Settings
            </span>
          </button>
          <button
            onClick={onLogout}
            className={`w-full flex items-center gap-3 text-zinc-500 hover:text-red-600 dark:text-zinc-400 dark:hover:text-red-400 text-sm font-medium transition-colors px-3 py-2 rounded-md hover:bg-red-50 dark:hover:bg-red-900/10 focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-1 ${isCollapsed ? 'justify-center px-0' : ''}`}
            title="Logout"
          >
            <LogOut size={18} />
            <span
              className={`truncate transition-all duration-300 ${isCollapsed ? 'w-0 opacity-0 hidden' : 'w-auto opacity-100'}`}
            >
              Logout
            </span>
          </button>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
