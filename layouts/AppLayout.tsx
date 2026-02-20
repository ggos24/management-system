import React, { useMemo } from 'react';
import { Outlet, useParams, useNavigate, useLocation } from 'react-router-dom';
import { Toaster } from 'sonner';
import Sidebar from '../components/Sidebar';
import { Header } from '../components/Header';
import { TaskModal } from '../components/TaskModal';
import { SettingsModal } from '../components/SettingsModal';
import { ManageTeamsModal } from '../components/ManageTeamsModal';
import { InviteModal } from '../components/InviteModal';
import { AiChatWidget } from '../components/AiChatWidget';
import { Modal } from '../components/Modal';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { useTaskDeepLink } from '../hooks/useTaskDeepLink';
import { useHashRedirect } from '../hooks/useHashRedirect';
import { useAuthStore } from '../stores/authStore';
import { useDataStore } from '../stores/dataStore';
import { useUiStore } from '../stores/uiStore';
import { Task } from '../types';
import { teamSlug, findTeamByParam } from '../lib/utils';

const AppLayout: React.FC = () => {
  useTaskDeepLink();
  useHashRedirect();

  const { teamId: teamParam } = useParams<{ teamId: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  const currentUser = useAuthStore((s) => s.currentUser)!;

  const { teams, teamStatuses, teamTypes } = useDataStore();

  const {
    isDarkMode,
    sidebarCollapsed,
    setSidebarCollapsed,
    mobileSidebarOpen,
    setMobileSidebarOpen,
    isLogoutModalOpen,
    setIsLogoutModalOpen,
    setIsSettingsModalOpen,
    setIsManageTeamsModalOpen,
    setIsTaskModalOpen,
    setTaskModalData,
  } = useUiStore();

  // Resolve URL param (slug or UUID) to actual team
  const activeTeam = useMemo(() => (teamParam ? findTeamByParam(teams, teamParam) : undefined), [teamParam, teams]);

  // Derive "current view" ID for sidebar active state & task defaults
  const currentView = useMemo(() => {
    if (activeTeam) return activeTeam.id;
    if (location.pathname === '/workspace') return 'my-workspace';
    if (location.pathname === '/schedule') return 'schedule';
    return 'dashboard';
  }, [activeTeam, location.pathname]);

  const openTaskModal = (taskOrPreset?: Partial<Task>) => {
    const defaultTeamId =
      currentView !== 'dashboard' && currentView !== 'schedule' && currentView !== 'my-workspace'
        ? currentView
        : teams[0]?.id || '';

    const statusList = teamStatuses[defaultTeamId] || teamStatuses['default'] || ['To Do'];
    const defaultStatus = statusList.includes('Pitch') ? 'Pitch' : statusList[0] || 'To Do';

    const typeList = teamTypes[defaultTeamId] || teamTypes['default'] || ['General'];
    const defaultContentType = typeList[0];

    const initialData: Partial<Task> = {
      title: '',
      description: '',
      teamId: defaultTeamId,
      status: defaultStatus,
      priority: 'medium',
      placements: [],
      links: [],
      assigneeIds: currentUser ? [currentUser.id] : [],
      contentInfo: { type: defaultContentType, editorIds: [], designerIds: [], notes: '', files: [] },
      customFieldValues: {},
      ...taskOrPreset,
    };
    setTaskModalData(initialData);
    setIsTaskModalOpen(true);
  };

  const handleLogout = async () => {
    setIsLogoutModalOpen(false);
    await useAuthStore.getState().logout();
    navigate('/login', { replace: true });
  };

  return (
    <ErrorBoundary>
      <div
        className={`flex h-screen overflow-hidden bg-white dark:bg-black text-zinc-900 dark:text-zinc-100 ${isDarkMode ? 'dark' : ''}`}
      >
        <Sidebar
          currentView={currentView}
          onChangeView={(view) => {
            setMobileSidebarOpen(false);
            if (view === 'my-workspace') navigate('/workspace');
            else if (view === 'dashboard') navigate('/dashboard');
            else if (view === 'schedule') navigate('/schedule');
            else {
              const team = teams.find((t) => t.id === view);
              navigate(`/teams/${team ? teamSlug(team) : view}`);
            }
          }}
          onLogout={() => setIsLogoutModalOpen(true)}
          onOpenSettings={() => setIsSettingsModalOpen(true)}
          onManageTeams={() => setIsManageTeamsModalOpen(true)}
          onReorderTeams={useDataStore.getState().reorderTeams}
          teams={teams}
          userRole={currentUser.role}
          isCollapsed={sidebarCollapsed}
          setIsCollapsed={setSidebarCollapsed}
          isMobileOpen={mobileSidebarOpen}
          setIsMobileOpen={setMobileSidebarOpen}
        />

        <div className="flex-1 flex flex-col min-w-0 transition-all duration-300">
          <Header />
          <main className="flex-1 overflow-hidden relative">
            <Outlet context={{ openTaskModal, currentView }} />
          </main>
        </div>

        {/* Modals */}
        <TaskModal />
        <SettingsModal />
        <ManageTeamsModal />
        <InviteModal />

        {/* Logout Confirmation Modal */}
        <Modal
          isOpen={isLogoutModalOpen}
          onClose={() => setIsLogoutModalOpen(false)}
          title="Confirm Logout"
          actions={
            <>
              <button
                onClick={() => setIsLogoutModalOpen(false)}
                className="px-4 py-2 text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300"
              >
                Cancel
              </button>
              <button
                onClick={handleLogout}
                className="px-6 py-2 bg-red-600 text-white text-sm font-bold rounded-md hover:bg-red-700 transition-colors"
              >
                Logout
              </button>
            </>
          }
        >
          <p className="text-sm text-zinc-600 dark:text-zinc-400">Are you sure you want to log out of your account?</p>
        </Modal>

        {/* AI Chat Widget */}
        <AiChatWidget />

        <Toaster position="bottom-right" richColors closeButton />
      </div>
    </ErrorBoundary>
  );
};

export default AppLayout;
