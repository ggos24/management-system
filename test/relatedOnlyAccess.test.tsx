import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryRouter, Outlet, Route, Routes, useLocation, useOutletContext } from 'react-router-dom';
import type { Member, Notification, Team } from '../types';

Object.defineProperty(window, 'matchMedia', {
  configurable: true,
  value: () => ({
    matches: false,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }),
});

const member = (accessScope: Member['accessScope']): Member => ({
  id: 'member-1',
  name: 'Test Member',
  role: 'user',
  accessScope,
  jobTitle: '',
  avatar: '',
  teamId: accessScope === 'full' ? 'team-1' : '',
  teamIds: accessScope === 'full' ? ['team-1'] : [],
  status: 'active',
});

afterEach(() => cleanup());

describe('related-only access UI', () => {
  it('redirects related-only users away from full-access routes', async () => {
    const [{ FullAccessGuard }, { useAuthStore }] = await Promise.all([
      import('../routes'),
      import('../stores/authStore'),
    ]);
    useAuthStore.setState({ currentUser: member('related_only') });

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route element={<FullAccessGuard />}>
            <Route path="/dashboard" element={<p>Dashboard content</p>} />
          </Route>
          <Route path="/workspace" element={<p>Workspace content</p>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('Workspace content')).toBeInTheDocument();
    expect(screen.queryByText('Dashboard content')).not.toBeInTheDocument();
    cleanup();
    useAuthStore.setState({ currentUser: null });
  });

  it('preserves a legacy team task deep link and resolves its workspace context', async () => {
    const [{ FullAccessGuard }, { useAuthStore }, { useDataStore }] = await Promise.all([
      import('../routes'),
      import('../stores/authStore'),
      import('../stores/dataStore'),
    ]);
    useAuthStore.setState({ currentUser: member('related_only') });
    useDataStore.setState({
      teams: [
        {
          id: '00000000-0000-4000-8000-000000000001',
          name: 'Editorial Team',
          icon: 'Users',
          scheduleType: 'absence-only',
        },
      ],
    });
    const LocationProbe = () => {
      const location = useLocation();
      return <p>{`${location.pathname}${location.search}`}</p>;
    };

    render(
      <MemoryRouter initialEntries={['/teams/editorial-team-00000001?task=task%2F1']}>
        <Routes>
          <Route element={<FullAccessGuard />}>
            <Route path="/teams/:teamId" element={<p>Team content</p>} />
          </Route>
          <Route path="/workspace" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(
      screen.getByText('/workspace?task=task%2F1&context=00000000-0000-4000-8000-000000000001'),
    ).toBeInTheDocument();
    cleanup();
    useAuthStore.setState({ currentUser: null });
    useDataStore.setState({ teams: [] });
  });

  it('shows only My Workspace and personal account actions in the related-only sidebar', async () => {
    const [{ default: Sidebar }, { useAuthStore }] = await Promise.all([
      import('../components/Sidebar'),
      import('../stores/authStore'),
    ]);
    useAuthStore.setState({ currentUser: member('related_only') });
    const teams: Team[] = [{ id: 'team-1', name: 'Editorial', icon: 'Users', scheduleType: 'absence-only' }];

    render(
      <Sidebar
        currentView="my-workspace"
        onChangeView={() => undefined}
        onLogout={() => undefined}
        onOpenSettings={() => undefined}
        onManageTeams={() => undefined}
        onReorderTeams={() => undefined}
        teams={teams}
        userRole="user"
        isCollapsed={false}
        setIsCollapsed={() => undefined}
        isMobileOpen={false}
        setIsMobileOpen={() => undefined}
      />,
    );

    expect(screen.getByRole('button', { name: 'My Workspace' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Logout' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Dashboard' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Schedule' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editorial' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Support' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Bin' })).not.toBeInTheDocument();
    cleanup();
    useAuthStore.setState({ currentUser: null });
  });

  it('preserves the full navigation for internal members', async () => {
    const [{ default: Sidebar }, { useAuthStore }] = await Promise.all([
      import('../components/Sidebar'),
      import('../stores/authStore'),
    ]);
    useAuthStore.setState({ currentUser: member('full') });
    const teams: Team[] = [{ id: 'team-1', name: 'Editorial', icon: 'Users', scheduleType: 'absence-only' }];

    render(
      <Sidebar
        currentView="dashboard"
        onChangeView={() => undefined}
        onLogout={() => undefined}
        onOpenSettings={() => undefined}
        onManageTeams={() => undefined}
        onReorderTeams={() => undefined}
        teams={teams}
        userRole="user"
        isCollapsed={false}
        setIsCollapsed={() => undefined}
        isMobileOpen={false}
        setIsMobileOpen={() => undefined}
      />,
    );

    expect(screen.getByRole('button', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Schedule' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Editorial' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Support' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bin' })).toBeInTheDocument();
    cleanup();
    useAuthStore.setState({ currentUser: null });
  });

  it('preserves the AppLayout outlet context through the full-access guard', async () => {
    const [{ FullAccessGuard }, { useAuthStore }] = await Promise.all([
      import('../routes'),
      import('../stores/authStore'),
    ]);
    useAuthStore.setState({ currentUser: member('full') });
    const openTaskModal = () => undefined;
    const ContextProbe = () => {
      const context = useOutletContext<{ openTaskModal: () => void }>();
      return <p>{context.openTaskModal === openTaskModal ? 'Context preserved' : 'Context missing'}</p>;
    };

    render(
      <MemoryRouter initialEntries={['/teams/team-1']}>
        <Routes>
          <Route element={<Outlet context={{ openTaskModal }} />}>
            <Route element={<FullAccessGuard />}>
              <Route path="/teams/:teamId" element={<ContextProbe />} />
            </Route>
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('Context preserved')).toBeInTheDocument();
    cleanup();
    useAuthStore.setState({ currentUser: null });
  });

  it('limits settings tabs and notification categories', async () => {
    const { getNotificationCategoryRows, getSettingsTabs } = await import('../components/SettingsModal');

    expect(getSettingsTabs('related_only', 'user')).toEqual(['My Profile', 'Notifications']);
    expect(getNotificationCategoryRows('related_only', false).map((row) => row.category)).toEqual([
      'tasks',
      'deadlines',
      'mentions',
    ]);
    expect(getSettingsTabs('full', 'admin')).toEqual([
      'My Profile',
      'Notifications',
      'Team Members',
      'Content',
      'Logs History',
    ]);
  });

  it('forces external invitations to user role, no team, and related-only scope', async () => {
    const { buildInvitePayload } = await import('../components/InviteModal');
    const payload = buildInvitePayload(
      {
        email: 'external@example.com',
        name: 'External Person',
        role: 'admin',
        jobTitle: '',
        teamId: 'team-1',
        accessScope: 'related_only',
      },
      [{ id: 'team-1' }],
    );

    expect(payload).toMatchObject({ role: 'user', teamId: '', accessScope: 'related_only' });
  });

  it('uses the canonical My Workspace task notification URL', async () => {
    const { getTaskNotificationPath } = await import('../components/Header');
    const notification: Notification = {
      id: 'notification-1',
      recipientId: 'member-1',
      actorId: null,
      type: 'comment_mention',
      message: 'You were mentioned',
      entityData: { taskId: 'task/1', teamId: 'team 1' },
      read: false,
      createdAt: '2026-08-11T10:00:00.000Z',
    };

    expect(getTaskNotificationPath(notification)).toBe('/workspace?task=task%2F1&context=team%201');
  });
});
