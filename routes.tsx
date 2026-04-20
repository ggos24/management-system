import React from 'react';
import { createBrowserRouter, Navigate, Outlet, useParams, useNavigate, useOutletContext } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import { AuthGuard } from './components/AuthGuard';
import AppLayout from './layouts/AppLayout';
import LoginPage from './components/LoginPage';
import { useAuthStore } from './stores/authStore';
import { useDataStore } from './stores/dataStore';
import { useUiStore } from './stores/uiStore';
import { findTeamByParam } from './lib/utils';

import { DocSection } from './types';
import { isAdmin } from './constants';
import type { TaskModalData } from './stores/uiStore';

const Dashboard = React.lazy(() => import('./components/Dashboard'));
const Workspace = React.lazy(() => import('./components/Workspace'));
const Schedule = React.lazy(() => import('./components/Schedule'));
const Bin = React.lazy(() => import('./components/Bin'));
const DocsView = React.lazy(() => import('./components/DocsView').then((m) => ({ default: m.DocsView })));

// Outlet context type used by route wrappers
interface LayoutContext {
  openTaskModal: (taskOrPreset?: TaskModalData) => void;
  currentView: string;
}

// --- Route wrapper components ---
// These map store data to the existing prop interfaces, keeping page components untouched.

const DashboardRoute: React.FC = () => {
  const { tasks, members, absences, teams, statusCategories } = useDataStore(
    useShallow((s) => ({
      tasks: s.tasks,
      members: s.members,
      absences: s.absences,
      teams: s.teams,
      statusCategories: s.statusCategories,
    })),
  );
  return (
    <Dashboard tasks={tasks} members={members} absences={absences} teams={teams} statusCategories={statusCategories} />
  );
};

const ScheduleRoute: React.FC = () => {
  const currentUser = useAuthStore((s) => s.currentUser)!;
  const {
    members,
    absences,
    shifts,
    teams,
    updateAbsence,
    deleteAbsence,
    approveAbsence,
    declineAbsence,
    cancelAbsence,
    updateShift,
    deleteShift,
    reorderScheduleTeams,
    reorderTeamMembers,
  } = useDataStore(
    useShallow((s) => ({
      members: s.members,
      absences: s.absences,
      shifts: s.shifts,
      teams: s.teams,
      updateAbsence: s.updateAbsence,
      deleteAbsence: s.deleteAbsence,
      approveAbsence: s.approveAbsence,
      declineAbsence: s.declineAbsence,
      cancelAbsence: s.cancelAbsence,
      updateShift: s.updateShift,
      deleteShift: s.deleteShift,
      reorderScheduleTeams: s.reorderScheduleTeams,
      reorderTeamMembers: s.reorderTeamMembers,
    })),
  );
  return (
    <Schedule
      members={members}
      absences={absences}
      shifts={shifts}
      teams={teams}
      userRole={currentUser.role}
      currentUserId={currentUser.id}
      onUpdateAbsence={updateAbsence}
      onDeleteAbsence={deleteAbsence}
      onApproveAbsence={approveAbsence}
      onDeclineAbsence={declineAbsence}
      onCancelAbsence={cancelAbsence}
      onUpdateShift={updateShift}
      onDeleteShift={deleteShift}
      onReorderTeams={reorderScheduleTeams}
      onReorderMembers={reorderTeamMembers}
    />
  );
};

const MyWorkspaceRoute: React.FC = () => {
  const currentUser = useAuthStore((s) => s.currentUser)!;
  const {
    tasks,
    members,
    teams,
    updateTaskStatus,
    updateTask,
    teamStatuses,
    reorderStatuses,
    statusCategories,
    duplicateStatus,
    setStatusCategory,
    teamProperties,
    addProperty,
    updateProperty,
    deleteProperty,
    reorderProperties,
    reorderTaskInStatus,
    allPlacements,
    teamPlacements,
    teamTypes,
    taskTeamLinks,
    linkTaskToTeam,
    deleteTask,
    teamHiddenColumns,
    hideTeamColumn,
    showTeamColumn,
  } = useDataStore(
    useShallow((s) => ({
      tasks: s.tasks,
      members: s.members,
      teams: s.teams,
      updateTaskStatus: s.updateTaskStatus,
      updateTask: s.updateTask,
      teamStatuses: s.teamStatuses,
      reorderStatuses: s.reorderStatuses,
      statusCategories: s.statusCategories,
      duplicateStatus: s.duplicateStatus,
      setStatusCategory: s.setStatusCategory,
      teamProperties: s.teamProperties,
      addProperty: s.addProperty,
      updateProperty: s.updateProperty,
      deleteProperty: s.deleteProperty,
      reorderProperties: s.reorderProperties,
      reorderTaskInStatus: s.reorderTaskInStatus,
      allPlacements: s.allPlacements,
      teamPlacements: s.teamPlacements,
      teamTypes: s.teamTypes,
      taskTeamLinks: s.taskTeamLinks,
      linkTaskToTeam: s.linkTaskToTeam,
      deleteTask: s.deleteTask,
      teamHiddenColumns: s.teamHiddenColumns,
      hideTeamColumn: s.hideTeamColumn,
      showTeamColumn: s.showTeamColumn,
    })),
  );
  const searchQuery = useUiStore((s) => s.searchQuery);

  const { openTaskModal } = useOutletContext<LayoutContext>();

  // My Workspace: union of all team placements (fallback to global)
  const myPlacements = React.useMemo(() => {
    const all = Object.values(teamPlacements).flat();
    const unique = [...new Set(all)];
    return unique.length > 0 ? unique : allPlacements;
  }, [teamPlacements, allPlacements]);

  return (
    <Workspace
      tasks={tasks}
      teamFilter="my-work"
      teamName="My Workspace"
      members={members}
      currentUserId={currentUser.id}
      onUpdateTaskStatus={(id, status) => updateTaskStatus(id, status)}
      onAddTask={openTaskModal}
      searchQuery={searchQuery}
      onTaskClick={openTaskModal}
      onUpdateTask={updateTask}
      teamStatuses={teamStatuses}
      onUpdateTeamStatuses={reorderStatuses}
      statusCategories={statusCategories}
      onDuplicateStatus={duplicateStatus}
      onSetStatusCategory={setStatusCategory}
      customProperties={teamProperties['my-work'] || []}
      onAddProperty={(prop) => addProperty('my-work', prop)}
      onUpdateProperty={(prop) => updateProperty('my-work', prop)}
      onDeleteProperty={(id) => deleteProperty('my-work', id)}
      onReorderProperties={(ids) => reorderProperties('my-work', ids)}
      userRole={currentUser.role}
      onReorderTask={reorderTaskInStatus}
      allPlacements={myPlacements}
      teamTypes={teamTypes}
      taskTeamLinks={taskTeamLinks}
      allTeams={teams}
      onLinkTaskToTeam={linkTaskToTeam}
      onDeleteTask={deleteTask}
      allTeamProperties={teamProperties}
      hiddenColumns={teamHiddenColumns['my-work'] || []}
      onHideColumn={(key) => hideTeamColumn('my-work', key)}
      onShowColumn={(key) => showTeamColumn('my-work', key)}
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
    statusCategories,
    duplicateStatus,
    setStatusCategory,
    teamProperties,
    addProperty,
    updateProperty,
    deleteProperty,
    reorderProperties,
    reorderTaskInStatus,
    allPlacements,
    teamPlacements,
    teamTypes,
    taskTeamLinks,
    linkTaskToTeam,
    deleteTask,
    teamHiddenColumns,
    hideTeamColumn,
    showTeamColumn,
  } = useDataStore(
    useShallow((s) => ({
      tasks: s.tasks,
      members: s.members,
      teams: s.teams,
      updateTaskStatus: s.updateTaskStatus,
      updateTask: s.updateTask,
      teamStatuses: s.teamStatuses,
      reorderStatuses: s.reorderStatuses,
      statusCategories: s.statusCategories,
      duplicateStatus: s.duplicateStatus,
      setStatusCategory: s.setStatusCategory,
      teamProperties: s.teamProperties,
      addProperty: s.addProperty,
      updateProperty: s.updateProperty,
      deleteProperty: s.deleteProperty,
      reorderProperties: s.reorderProperties,
      reorderTaskInStatus: s.reorderTaskInStatus,
      allPlacements: s.allPlacements,
      teamPlacements: s.teamPlacements,
      teamTypes: s.teamTypes,
      taskTeamLinks: s.taskTeamLinks,
      linkTaskToTeam: s.linkTaskToTeam,
      deleteTask: s.deleteTask,
      teamHiddenColumns: s.teamHiddenColumns,
      hideTeamColumn: s.hideTeamColumn,
      showTeamColumn: s.showTeamColumn,
    })),
  );
  const searchQuery = useUiStore((s) => s.searchQuery);

  const { openTaskModal } = useOutletContext<LayoutContext>();

  const team = teamParam ? findTeamByParam(teams, teamParam) : undefined;

  if (!team || (team.adminOnly && !isAdmin(currentUser.role))) {
    return <Navigate to="/workspace" replace />;
  }

  // Use per-team placements, fallback to global
  const teamPlacementList = teamPlacements[team.id] || allPlacements;

  return (
    <Workspace
      key={team.id}
      tasks={tasks}
      teamFilter={team.id}
      teamName={team.name}
      members={members}
      currentUserId={currentUser.id}
      onUpdateTaskStatus={(id, status) => updateTaskStatus(id, status, team.id)}
      onAddTask={openTaskModal}
      searchQuery={searchQuery}
      onTaskClick={(task) => openTaskModal({ ...task, viewingTeamId: team.id })}
      onUpdateTask={updateTask}
      teamStatuses={teamStatuses}
      onUpdateTeamStatuses={reorderStatuses}
      statusCategories={statusCategories}
      onDuplicateStatus={duplicateStatus}
      onSetStatusCategory={setStatusCategory}
      customProperties={teamProperties[team.id] || []}
      onAddProperty={(prop) => addProperty(team.id, prop)}
      onUpdateProperty={(prop) => updateProperty(team.id, prop)}
      onDeleteProperty={(id) => deleteProperty(team.id, id)}
      onReorderProperties={(ids) => reorderProperties(team.id, ids)}
      userRole={currentUser.role}
      onReorderTask={reorderTaskInStatus}
      allPlacements={teamPlacementList}
      teamTypes={teamTypes}
      taskTeamLinks={taskTeamLinks}
      allTeams={teams}
      onLinkTaskToTeam={linkTaskToTeam}
      onDeleteTask={deleteTask}
      allTeamProperties={teamProperties}
      hiddenColumns={teamHiddenColumns[team.id] || []}
      onHideColumn={(key) => hideTeamColumn(team.id, key)}
      onShowColumn={(key) => showTeamColumn(team.id, key)}
    />
  );
};

const DocsRoute: React.FC<{ section: DocSection }> = ({ section }) => {
  const { docId } = useParams<{ docId: string }>();
  const navigate = useNavigate();
  const basePath = section === 'help' ? '/docs/help' : '/docs/kb';
  return (
    <DocsView section={section} docId={docId} onNavigate={(id) => navigate(id ? `${basePath}/${id}` : basePath)} />
  );
};

const BinRoute: React.FC = () => {
  const loadDeletedTasks = useDataStore((s) => s.loadDeletedTasks);
  React.useEffect(() => {
    loadDeletedTasks();
  }, [loadDeletedTasks]);
  return <Bin />;
};

const LoginRoute: React.FC = () => {
  const session = useAuthStore((s) => s.session);
  const currentUser = useAuthStore((s) => s.currentUser);

  // Only redirect if fully authenticated (session + profile loaded)
  if (session && currentUser) {
    return <Navigate to="/workspace" replace />;
  }

  return (
    <LoginPage
      onLogin={async (newSession) => {
        const state = useAuthStore.getState();
        state.setIsLoading(true);
        state.setSession(newSession);
        await state.initData(newSession.user.id);
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
          { index: true, element: <Navigate to="/workspace" replace /> },
          { path: 'dashboard', element: <DashboardRoute /> },
          { path: 'workspace', element: <MyWorkspaceRoute /> },
          { path: 'schedule', element: <ScheduleRoute /> },
          { path: 'bin', element: <BinRoute /> },
          {
            path: 'docs',
            element: <Outlet />,
            children: [
              { path: 'help', element: <DocsRoute section="help" /> },
              { path: 'help/:docId', element: <DocsRoute section="help" /> },
              { path: 'kb', element: <DocsRoute section="knowledge-base" /> },
              { path: 'kb/:docId', element: <DocsRoute section="knowledge-base" /> },
            ],
          },
          { path: 'teams/:teamId', element: <TeamWorkspaceRoute /> },
          { path: '*', element: <Navigate to="/workspace" replace /> },
        ],
      },
    ],
  },
]);
