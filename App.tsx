import React, { useEffect, useMemo } from 'react';
import { Toaster } from 'sonner';
import { X } from 'lucide-react';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import Workspace from './components/Workspace';
import Schedule from './components/Schedule';
import LoginPage from './components/LoginPage';
import { Header } from './components/Header';
import { TaskModal } from './components/TaskModal';
import { SettingsModal } from './components/SettingsModal';
import { ManageTeamsModal } from './components/ManageTeamsModal';
import { InviteModal } from './components/InviteModal';
import { AiChatWidget } from './components/AiChatWidget';
import { Modal } from './components/Modal';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useAuth } from './hooks/useAuth';
import { useRealtimeSync } from './hooks/useRealtimeSync';
import { useAuthStore } from './stores/authStore';
import { useDataStore } from './stores/dataStore';
import { useUiStore } from './stores/uiStore';
import { Task } from './types';

const App: React.FC = () => {
  const { session, initData } = useAuth();
  useRealtimeSync();
  const {
    currentUser,
    isLoading,
    profileError,
    needsPasswordSetup,
    setSession,
    setIsLoading,
    setNeedsPasswordSetup,
    logout,
  } = useAuthStore();

  const {
    tasks,
    teams,
    members,
    absences,
    shifts,
    teamStatuses,
    teamTypes,
    teamProperties,
    allPlacements,
    archivedStatuses,
    updateTaskStatus,
    updateTask,
    updateAbsence,
    deleteAbsence,
    updateShift,
    deleteShift,
    reorderStatuses,
    archiveStatus,
    duplicateStatus,
    addStatus,
    addType,
    addProperty,
    updateProperty,
    deleteProperty,
    reorderTaskInStatus,
    reorderProperties,
  } = useDataStore();

  const {
    currentView,
    setCurrentView,
    isDarkMode,
    sidebarCollapsed,
    setSidebarCollapsed,
    mobileSidebarOpen,
    setMobileSidebarOpen,
    searchQuery,
    isLogoutModalOpen,
    setIsLogoutModalOpen,
    setIsSettingsModalOpen,
    setIsManageTeamsModalOpen,
    setIsTaskModalOpen,
    setTaskModalData,
    setIsAiChatOpen,
  } = useUiStore();

  const isTeamView = useMemo(() => teams.some((t) => t.id === currentView), [currentView, teams]);

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
    await logout();
    setCurrentView('dashboard');
  };

  // Sync browser back/forward with view state + handle ?task= deep links
  useEffect(() => {
    const handleHash = () => {
      const raw = window.location.hash.replace('#', '');
      const [view, query] = raw.split('?');
      if (view && view !== currentView) {
        setCurrentView(view);
      }
      if (query) {
        const params = new URLSearchParams(query);
        const taskId = params.get('task');
        if (taskId) {
          // Wait a tick so the view renders, then open the task modal
          setTimeout(() => {
            const task = useDataStore.getState().tasks.find((t) => t.id === taskId);
            if (task) {
              setTaskModalData(task);
              setIsTaskModalOpen(true);
            }
            // Clean up the URL to remove ?task=
            window.location.hash = view;
          }, 100);
        }
      }
    };
    handleHash(); // Handle on mount (e.g. opening a shared link)
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, [currentView, setCurrentView, setTaskModalData, setIsTaskModalOpen]);

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-black">
        <div className="text-center">
          <img src="/logo.svg" alt="Logo" className="w-12 h-12 rounded-lg mx-auto mb-4 animate-pulse" />
          <p className="text-sm text-zinc-500">Loading...</p>
        </div>
      </div>
    );
  }

  // Not authenticated
  if (!session) {
    return (
      <LoginPage
        onLogin={(newSession) => {
          setSession(newSession);
          setIsLoading(true);
          initData(newSession.user.id);
        }}
      />
    );
  }

  // Invited user needs to set password
  if (needsPasswordSetup) {
    return (
      <LoginPage
        mode="set-password"
        onLogin={(newSession) => {
          setNeedsPasswordSetup(false);
          window.location.hash = '';
          window.history.replaceState({}, '', window.location.pathname);
          setSession(newSession);
          if (!currentUser) {
            setIsLoading(true);
            initData(newSession.user.id);
          }
        }}
      />
    );
  }

  // Profile error
  if (profileError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-black p-4">
        <div className="text-center max-w-md">
          <div className="w-12 h-12 bg-red-500 rounded-lg mx-auto mb-4 flex items-center justify-center">
            <X size={24} className="text-white" />
          </div>
          <h1 className="text-xl font-bold text-zinc-900 dark:text-white mb-2">Account Error</h1>
          <p className="text-sm text-zinc-500 mb-4">{profileError}</p>
          <button
            onClick={handleLogout}
            className="px-4 py-2 bg-black dark:bg-white text-white dark:text-black rounded-lg text-sm font-bold hover:opacity-90"
          >
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  if (!currentUser) return null;

  const renderContent = () => {
    if (currentView === 'dashboard') {
      return <Dashboard tasks={tasks} members={members} absences={absences} teams={teams} />;
    } else if (currentView === 'schedule') {
      return (
        <Schedule
          members={members}
          absences={absences}
          shifts={shifts}
          teams={teams}
          userRole={currentUser.role}
          onUpdateAbsence={updateAbsence}
          onDeleteAbsence={deleteAbsence}
          onUpdateShift={updateShift}
          onDeleteShift={deleteShift}
        />
      );
    } else if (currentView === 'my-workspace') {
      return (
        <Workspace
          tasks={tasks}
          teamFilter="my-work"
          teamName="My Workspace"
          members={members}
          currentUserId={currentUser.id}
          onUpdateTaskStatus={updateTaskStatus}
          onAddTask={openTaskModal}
          searchQuery={searchQuery}
          onTaskClick={openTaskModal}
          onOpenAiChat={() => setIsAiChatOpen(true)}
          onUpdateTask={updateTask}
          teamStatuses={teamStatuses}
          onUpdateTeamStatuses={reorderStatuses}
          archivedStatuses={archivedStatuses}
          onArchiveStatus={archiveStatus}
          onDuplicateStatus={duplicateStatus}
          customProperties={teamProperties['my-work'] || []}
          onAddProperty={(prop) => addProperty('my-work', prop)}
          onUpdateProperty={(prop) => updateProperty('my-work', prop)}
          onDeleteProperty={(id) => deleteProperty('my-work', id)}
          onReorderProperties={(ids) => reorderProperties('my-work', ids)}
          userRole={currentUser.role}
          onReorderTask={reorderTaskInStatus}
          allPlacements={allPlacements}
        />
      );
    } else {
      const team = teams.find((t) => t.id === currentView);
      if (team && (!team.adminOnly || currentUser.role === 'admin')) {
        return (
          <Workspace
            tasks={tasks}
            teamFilter={team.id}
            teamName={team.name}
            members={members}
            currentUserId={currentUser.id}
            onUpdateTaskStatus={updateTaskStatus}
            onAddTask={openTaskModal}
            searchQuery={searchQuery}
            onTaskClick={openTaskModal}
            onOpenAiChat={() => setIsAiChatOpen(true)}
            onUpdateTask={updateTask}
            teamStatuses={teamStatuses}
            onUpdateTeamStatuses={reorderStatuses}
            archivedStatuses={archivedStatuses}
            onArchiveStatus={archiveStatus}
            onDuplicateStatus={duplicateStatus}
            customProperties={teamProperties[team.id] || []}
            onAddProperty={(prop) => addProperty(team.id, prop)}
            onUpdateProperty={(prop) => updateProperty(team.id, prop)}
            onDeleteProperty={(id) => deleteProperty(team.id, id)}
            onReorderProperties={(ids) => reorderProperties(team.id, ids)}
            userRole={currentUser.role}
            onReorderTask={reorderTaskInStatus}
            allPlacements={allPlacements}
          />
        );
      }
    }
    return <div>View not found</div>;
  };

  return (
    <ErrorBoundary>
      <div
        className={`flex h-screen overflow-hidden bg-white dark:bg-black text-zinc-900 dark:text-zinc-100 ${isDarkMode ? 'dark' : ''}`}
      >
        <Sidebar
          currentView={currentView}
          onChangeView={(view) => {
            setCurrentView(view);
            setMobileSidebarOpen(false);
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
          <main className="flex-1 overflow-hidden relative">{renderContent()}</main>
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

export default App;
