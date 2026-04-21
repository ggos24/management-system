import React, { useMemo } from 'react';
import { Outlet, useParams, useNavigate, useLocation } from 'react-router-dom';
import { Toaster } from 'sonner';
import { useShallow } from 'zustand/react/shallow';
import Sidebar from '../components/Sidebar';
import { Header } from '../components/Header';
const TaskModal = React.lazy(() => import('../components/TaskModal').then((m) => ({ default: m.TaskModal })));
const SettingsModal = React.lazy(() =>
  import('../components/SettingsModal').then((m) => ({ default: m.SettingsModal })),
);
const ManageTeamsModal = React.lazy(() =>
  import('../components/ManageTeamsModal').then((m) => ({ default: m.ManageTeamsModal })),
);
const InviteModal = React.lazy(() => import('../components/InviteModal').then((m) => ({ default: m.InviteModal })));
import { Modal } from '../components/Modal';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { OfflineBanner } from '../components/OfflineBanner';
import { PWAUpdater } from '../components/PWAUpdater';
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

  const { tasks, teams, teamStatuses, teamTypes, statusCategories, absences } = useDataStore(
    useShallow((s) => ({
      tasks: s.tasks,
      teams: s.teams,
      teamStatuses: s.teamStatuses,
      teamTypes: s.teamTypes,
      statusCategories: s.statusCategories,
      absences: s.absences,
    })),
  );

  const isDarkMode = useUiStore((s) => s.isDarkMode);
  const sidebarCollapsed = useUiStore((s) => s.sidebarCollapsed);
  const setSidebarCollapsed = useUiStore((s) => s.setSidebarCollapsed);
  const mobileSidebarOpen = useUiStore((s) => s.mobileSidebarOpen);
  const setMobileSidebarOpen = useUiStore((s) => s.setMobileSidebarOpen);
  const isLogoutModalOpen = useUiStore((s) => s.isLogoutModalOpen);
  const setIsLogoutModalOpen = useUiStore((s) => s.setIsLogoutModalOpen);
  const setIsSettingsModalOpen = useUiStore((s) => s.setIsSettingsModalOpen);
  const setIsManageTeamsModalOpen = useUiStore((s) => s.setIsManageTeamsModalOpen);
  const setIsTaskModalOpen = useUiStore((s) => s.setIsTaskModalOpen);
  const setTaskModalData = useUiStore((s) => s.setTaskModalData);

  // Resolve URL param (slug or UUID) to actual team
  const activeTeam = useMemo(() => (teamParam ? findTeamByParam(teams, teamParam) : undefined), [teamParam, teams]);

  // Derive "current view" ID for sidebar active state & task defaults
  const deletedTaskCount = useDataStore((s) => s.deletedTaskCount);

  const currentView = useMemo(() => {
    if (activeTeam) return activeTeam.id;
    if (location.pathname === '/workspace') return 'my-workspace';
    if (location.pathname === '/schedule') return 'schedule';
    if (location.pathname === '/bin') return 'bin';
    if (location.pathname.startsWith('/docs/help')) return 'docs-help';
    if (location.pathname.startsWith('/docs/kb')) return 'docs-kb';
    return 'dashboard';
  }, [activeTeam, location.pathname]);

  // Compute active task counts per team + my-workspace (excluding completed statuses)
  const taskCounts = useMemo(() => {
    const getCategory = (status: string, teamId: string): string => {
      const teamCats = statusCategories[teamId];
      if (teamCats && teamCats[status]) return teamCats[status];
      const s = status.toLowerCase().trim();
      if (['dropped', 'archive'].includes(s)) return 'ignored';
      if (['published', 'done', 'published this week'].includes(s)) return 'completed';
      return 'active';
    };

    const counts: Record<string, number> = {};
    let myCount = 0;

    for (const task of tasks) {
      const cat = getCategory(task.status, task.teamId);
      if (cat === 'completed') continue;
      counts[task.teamId] = (counts[task.teamId] || 0) + 1;
      if (currentUser && task.assigneeIds.includes(currentUser.id)) {
        myCount++;
      }
    }
    counts['my-workspace'] = myCount;
    return counts;
  }, [tasks, statusCategories, currentUser]);

  const pendingAbsenceCount = useMemo(() => absences.filter((a) => a.status === 'pending').length, [absences]);

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
        className={`flex h-dvh overflow-hidden bg-white dark:bg-black text-zinc-900 dark:text-zinc-100 safe-t ${isDarkMode ? 'dark' : ''}`}
      >
        <Sidebar
          currentView={currentView}
          deletedTaskCount={deletedTaskCount}
          taskCounts={taskCounts}
          onChangeView={(view) => {
            setMobileSidebarOpen(false);
            if (view === 'my-workspace') navigate('/workspace');
            else if (view === 'dashboard') navigate('/dashboard');
            else if (view === 'schedule') navigate('/schedule');
            else if (view === 'bin') navigate('/bin');
            else if (view === 'docs-help') navigate('/docs/help');
            else if (view === 'docs-kb') navigate('/docs/kb');
            else {
              const team = teams.find((t) => t.id === view);
              navigate(`/teams/${team ? teamSlug(team) : view}`);
            }
          }}
          onLogout={() => setIsLogoutModalOpen(true)}
          onOpenSettings={() => setIsSettingsModalOpen(true)}
          onManageTeams={() => setIsManageTeamsModalOpen(true)}
          onReorderTeams={useDataStore.getState().reorderSidebarTeams}
          teams={teams}
          userRole={currentUser.role}
          isCollapsed={sidebarCollapsed}
          setIsCollapsed={setSidebarCollapsed}
          isMobileOpen={mobileSidebarOpen}
          setIsMobileOpen={setMobileSidebarOpen}
          pendingAbsenceCount={pendingAbsenceCount}
        />

        <div className="flex-1 flex flex-col min-w-0 transition-all duration-300">
          <OfflineBanner />
          <Header />
          <main className="flex-1 overflow-hidden relative">
            <React.Suspense
              fallback={
                <div className="flex items-center justify-center h-full">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-zinc-400" />
                </div>
              }
            >
              <Outlet context={{ openTaskModal, currentView }} />
            </React.Suspense>
          </main>
        </div>

        {/* Modals */}
        <React.Suspense fallback={null}>
          <TaskModal />
          <SettingsModal />
          <ManageTeamsModal />
          <InviteModal />
        </React.Suspense>

        {/* Logout Confirmation Modal */}
        <Modal
          isOpen={isLogoutModalOpen}
          onClose={() => setIsLogoutModalOpen(false)}
          title="Confirm Logout"
          size="sm"
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

        <Toaster position="bottom-right" richColors closeButton />
        <PWAUpdater />
      </div>
    </ErrorBoundary>
  );
};

export default AppLayout;
