import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Member, Task } from '../types';

Object.defineProperty(window, 'matchMedia', {
  configurable: true,
  value: () => ({
    matches: false,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }),
});

let resetAuth: (() => void) | undefined;

const workspaceMember = (accessScope: Member['accessScope']): Member => ({
  id: 'member-1',
  name: accessScope === 'related_only' ? 'External Person' : 'Internal Person',
  role: 'user',
  accessScope,
  jobTitle: '',
  avatar: '',
  teamId: accessScope === 'related_only' ? '' : 'home-team',
  teamIds: accessScope === 'related_only' ? [] : ['home-team'],
  status: 'active',
});

const task = (id: string, title: string): Task => ({
  id,
  title,
  description: '',
  teamId: 'home-team',
  statusId: 'home-status',
  assigneeIds: [],
  priority: 'medium',
  dueDate: '',
  placements: [],
  contentInfo: { type: 'Article' },
});

afterEach(() => {
  cleanup();
  resetAuth?.();
  resetAuth = undefined;
});

describe('related-only Workspace', () => {
  it('uses server task contexts as authoritative My Workspace rows for related-only users', async () => {
    const [{ default: Workspace }, { useAuthStore }] = await Promise.all([
      import('../components/Workspace'),
      import('../stores/authStore'),
    ]);
    const currentMember = workspaceMember('related_only');
    useAuthStore.setState({ currentUser: currentMember });
    resetAuth = () => useAuthStore.setState({ currentUser: null });
    const onTaskClick = vi.fn();

    render(
      <Workspace
        tasks={[
          task('visible-task', 'Visible task'),
          task('no-status-task', 'No status task'),
          task('hidden-task', 'Hidden task'),
        ]}
        taskAccessContexts={[
          { taskId: 'visible-task', contextTeamId: 'linked-team' },
          { taskId: 'no-status-task', contextTeamId: 'linked-team' },
        ]}
        taskTeamLinks={[
          {
            id: 'link-1',
            taskId: 'visible-task',
            teamId: 'linked-team',
            statusId: 'linked-status',
            sortOrder: 0,
            customFieldValues: {},
            createdAt: '2026-08-11T10:00:00.000Z',
          },
          {
            id: 'link-2',
            taskId: 'no-status-task',
            teamId: 'linked-team',
            statusId: null,
            sortOrder: 1,
            customFieldValues: {},
            createdAt: '2026-08-11T10:00:00.000Z',
          },
        ]}
        teamFilter="my-work"
        teamName="My Workspace"
        members={[currentMember]}
        currentUserId={currentMember.id}
        onUpdateTaskStatus={vi.fn()}
        onAddTask={vi.fn()}
        searchQuery=""
        onTaskClick={onTaskClick}
        onUpdateTask={vi.fn()}
        teamStatuses={{
          'home-team': [{ id: 'home-status', name: 'Home status', category: 'active', sortOrder: 0 }],
          'linked-team': [{ id: 'linked-status', name: 'Linked status', category: 'active', sortOrder: 0 }],
        }}
        onAddStatus={vi.fn()}
        onRenameStatus={vi.fn()}
        onDeleteStatus={vi.fn()}
        onReorderStatuses={vi.fn()}
        onDuplicateStatus={vi.fn()}
        onSetStatusCategory={vi.fn()}
        allPlacements={[]}
        allTeams={[
          { id: 'home-team', name: 'Home team' },
          { id: 'linked-team', name: 'Linked team' },
        ]}
        allTeamProperties={{}}
      />,
    );

    const visibleTaskRows = screen.getAllByText('Visible task');
    expect(visibleTaskRows).toHaveLength(2);
    expect(screen.getAllByText('No status task')).toHaveLength(2);
    expect(screen.getAllByText('No status').length).toBeGreaterThan(0);
    expect(screen.queryByText('Hidden task')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New' })).not.toBeInTheDocument();

    fireEvent.click(visibleTaskRows[0]);
    expect(onTaskClick).toHaveBeenCalledWith(expect.objectContaining({ viewingTeamId: 'linked-team' }));

    fireEvent.click(screen.getByRole('button', { name: /board/i }));
    expect(screen.getAllByText('No status task').length).toBeGreaterThan(0);
    expect(screen.getAllByText('No status').length).toBeGreaterThan(0);
  });

  it('preserves the internal My Workspace involvement filter and one-row-per-task behavior', async () => {
    const [{ default: Workspace }, { useAuthStore }] = await Promise.all([
      import('../components/Workspace'),
      import('../stores/authStore'),
    ]);
    const currentMember = workspaceMember('full');
    useAuthStore.setState({ currentUser: currentMember });
    resetAuth = () => useAuthStore.setState({ currentUser: null });
    const onTaskClick = vi.fn();
    const involvedTask = { ...task('visible-task', 'Visible task'), assigneeIds: [currentMember.id] };

    render(
      <Workspace
        tasks={[involvedTask, task('mentioned-only', 'Mentioned only')]}
        taskAccessContexts={[
          { taskId: 'visible-task', contextTeamId: 'linked-team' },
          { taskId: 'visible-task', contextTeamId: 'second-linked-team' },
          { taskId: 'mentioned-only', contextTeamId: 'home-team' },
        ]}
        taskTeamLinks={[]}
        teamFilter="my-work"
        teamName="My Workspace"
        members={[currentMember]}
        currentUserId={currentMember.id}
        onUpdateTaskStatus={vi.fn()}
        onAddTask={vi.fn()}
        searchQuery=""
        onTaskClick={onTaskClick}
        onUpdateTask={vi.fn()}
        teamStatuses={{
          'home-team': [{ id: 'home-status', name: 'Home status', category: 'active', sortOrder: 0 }],
        }}
        onAddStatus={vi.fn()}
        onRenameStatus={vi.fn()}
        onDeleteStatus={vi.fn()}
        onReorderStatuses={vi.fn()}
        onDuplicateStatus={vi.fn()}
        onSetStatusCategory={vi.fn()}
        allPlacements={[]}
        allTeams={[{ id: 'home-team', name: 'Home team' }]}
        allTeamProperties={{}}
      />,
    );

    const visibleTaskRows = screen.getAllByText('Visible task');
    expect(visibleTaskRows).toHaveLength(2);
    expect(screen.queryByText('Mentioned only')).not.toBeInTheDocument();
    fireEvent.click(visibleTaskRows[0]);
    expect(onTaskClick).toHaveBeenCalledWith(expect.not.objectContaining({ viewingTeamId: expect.anything() }));
  });
});
