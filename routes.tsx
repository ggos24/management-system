import React from 'react';
import { createBrowserRouter, Navigate, useParams, useOutletContext } from 'react-router-dom';
import { AuthGuard } from './components/AuthGuard';
import AppLayout from './layouts/AppLayout';
import LoginPage from './components/LoginPage';
import Dashboard from './components/Dashboard';
import Workspace from './components/Workspace';
import Schedule from './components/Schedule';
import { useAuthStore } from './stores/authStore';
import { useDataStore } from './stores/dataStore';
import { useUiStore } from './stores/uiStore';
import { findTeamByParam } from './lib/utils';
import { Task } from './types';

// Outlet context type used by route wrappers
interface LayoutContext {
  openTaskModal: (taskOrPreset?: Partial<Task>) => void;
  currentView: string;
}

// --- Route wrapper components ---
// These map store data to the existing prop interfaces, keeping page components untouched.

const DashboardRoute: React.FC = () => {
  const { tasks, members, absences, teams } = useDataStore();
  return <Dashboard tasks={tasks} members={members} absences={absences} teams={teams} />;
};

const ScheduleRoute: React.FC = () => {
  const currentUser = useAuthStore((s) => s.currentUser)!;
  const { members, absences, shifts, teams, updateAbsence, deleteAbsence, updateShift, deleteShift } = useDataStore();
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
};

const MyWorkspaceRoute: React.FC = () => {
  const currentUser = useAuthStore((s) => s.currentUser)!;
  const {
    tasks,
    members,
    updateTaskStatus,
    updateTask,
    teamStatuses,
    reorderStatuses,
    archivedStatuses,
    archiveStatus,
    duplicateStatus,
    teamProperties,
    addProperty,
    updateProperty,
    deleteProperty,
    reorderProperties,
    reorderTaskInStatus,
    allPlacements,
  } = useDataStore();
  const searchQuery = useUiStore((s) => s.searchQuery);
  const setIsAiChatOpen = useUiStore((s) => s.setIsAiChatOpen);
  const { openTaskModal } = useOutletContext<LayoutContext>();

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
};

const TeamWorkspaceRoute: React.FC = () => {
  const { teamId: teamParam } = useParams<{ teamId: string }>();
  const currentUser = useAuthStore((s) => s.currentUser)!;
  const {
    tasks,
    members,
    teams,
    updateTaskStatus,
    updateTask,
    teamStatuses,
    reorderStatuses,
    archivedStatuses,
    archiveStatus,
    duplicateStatus,
    teamProperties,
    addProperty,
    updateProperty,
    deleteProperty,
    reorderProperties,
    reorderTaskInStatus,
    allPlacements,
  } = useDataStore();
  const searchQuery = useUiStore((s) => s.searchQuery);
  const setIsAiChatOpen = useUiStore((s) => s.setIsAiChatOpen);
  const { openTaskModal } = useOutletContext<LayoutContext>();

  const team = teamParam ? findTeamByParam(teams, teamParam) : undefined;

  if (!team || (team.adminOnly && currentUser.role !== 'admin')) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <Workspace
      key={team.id}
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
};

const LoginRoute: React.FC = () => {
  const session = useAuthStore((s) => s.session);
  const setSession = useAuthStore((s) => s.setSession);
  const setIsLoading = useAuthStore((s) => s.setIsLoading);
  const loadAllData = useDataStore((s) => s.loadAllData);
  const setCurrentUser = useAuthStore((s) => s.setCurrentUser);
  const setProfileError = useAuthStore((s) => s.setProfileError);
  const loadNotifications = useUiStore((s) => s.loadNotifications);

  // If already authenticated, redirect to dashboard
  if (session) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <LoginPage
      onLogin={async (newSession) => {
        setSession(newSession);
        setIsLoading(true);
        try {
          const profile = await loadAllData(newSession.user.id);
          if (!profile) {
            setProfileError('No profile found for this account. Please contact an administrator.');
            setIsLoading(false);
            return;
          }
          setCurrentUser(profile);
          loadNotifications();
        } catch {
          setProfileError('Failed to load application data. Please try refreshing.');
        } finally {
          setIsLoading(false);
        }
      }}
    />
  );
};

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginRoute />,
  },
  {
    element: <AuthGuard />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <Navigate to="/dashboard" replace /> },
          { path: 'dashboard', element: <DashboardRoute /> },
          { path: 'workspace', element: <MyWorkspaceRoute /> },
          { path: 'schedule', element: <ScheduleRoute /> },
          { path: 'teams/:teamId', element: <TeamWorkspaceRoute /> },
          { path: '*', element: <Navigate to="/dashboard" replace /> },
        ],
      },
    ],
  },
]);
