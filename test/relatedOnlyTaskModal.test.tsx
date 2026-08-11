import React from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Member, Task } from '../types';

vi.mock('../lib/database', () => ({
  fetchTaskComments: vi.fn().mockResolvedValue([]),
  fetchTaskActivity: vi.fn().mockResolvedValue([]),
  insertTaskComment: vi.fn(),
  updateTaskComment: vi.fn(),
  deleteTaskComment: vi.fn(),
}));

vi.mock('../lib/supabase', () => {
  const channel = {
    on: vi.fn(),
    subscribe: vi.fn(),
  };
  channel.on.mockReturnValue(channel);
  channel.subscribe.mockReturnValue(channel);
  return {
    supabase: {
      channel: vi.fn(() => channel),
      removeChannel: vi.fn(),
    },
  };
});

Object.defineProperty(window, 'matchMedia', {
  configurable: true,
  value: () => ({
    matches: false,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }),
});

Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
  configurable: true,
  value: () => undefined,
});

const externalMember: Member = {
  id: 'external-1',
  name: 'External Person',
  role: 'user',
  accessScope: 'related_only',
  jobTitle: '',
  avatar: '',
  teamId: '',
  teamIds: [],
  status: 'active',
};

const assignee: Member = {
  ...externalMember,
  id: 'assignee-1',
  name: 'Task Assignee',
  accessScope: 'full',
  teamId: 'team-1',
  teamIds: ['team-1'],
};

const existingTask: Task = {
  id: 'task-1',
  title: 'Read-only task',
  description: '<p>Safe description</p>',
  teamId: 'team-1',
  statusId: 'status-1',
  assigneeIds: [assignee.id],
  priority: 'high',
  dueDate: '2026-08-20',
  placements: ['Website'],
  contentInfo: { type: 'Article', editorIds: [], designerIds: [] },
  customFieldValues: { brief: 'Existing brief' },
};

let resetStores: (() => void) | undefined;

afterEach(() => {
  cleanup();
  resetStores?.();
  resetStores = undefined;
});

describe('related-only TaskModal', () => {
  it('renders task fields as a static summary while keeping comments available', async () => {
    const [{ TaskModal }, { useAuthStore }, { useDataStore }, { useUiStore }] = await Promise.all([
      import('../components/TaskModal'),
      import('../stores/authStore'),
      import('../stores/dataStore'),
      import('../stores/uiStore'),
    ]);

    useAuthStore.setState({ currentUser: externalMember });
    useDataStore.setState({
      members: [externalMember, assignee],
      teams: [{ id: 'team-1', name: 'Editorial', icon: 'Users', scheduleType: 'absence-only' }],
      teamStatuses: {
        'team-1': [{ id: 'status-1', name: 'In progress', category: 'active', sortOrder: 0 }],
      },
      teamTypes: { 'team-1': ['Article'] },
      teamProperties: { 'team-1': [{ id: 'brief', name: 'Brief', type: 'text' }] },
      taskTeamLinks: [],
      teamPlacements: { 'team-1': ['Website'] },
      allPlacements: ['Website'],
    });
    useUiStore.setState({ isTaskModalOpen: true, taskModalData: existingTask });
    resetStores = () => {
      useAuthStore.setState({ currentUser: null });
      useUiStore.setState({ isTaskModalOpen: false, taskModalData: {} });
    };

    await act(async () => {
      render(<TaskModal />);
    });

    const hasVisibleText = (text: string) =>
      screen.getAllByText(text).some((node) => !node.closest('[aria-hidden="true"]'));
    expect(screen.getByRole('heading', { name: 'Read-only task' })).toBeInTheDocument();
    expect(hasVisibleText('Safe description')).toBe(true);
    expect(hasVisibleText('In progress')).toBe(true);
    expect(hasVisibleText('Existing brief')).toBe(true);
    expect(screen.getByPlaceholderText('Write a comment... Use @ to mention someone')).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Save Changes' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete Task' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Add Property/i })).not.toBeInTheDocument();
  });

  it('preserves sanitized rich-text and checklist state in the read-only description', async () => {
    const [{ TaskModal }, { useAuthStore }, { useDataStore }, { useUiStore }] = await Promise.all([
      import('../components/TaskModal'),
      import('../stores/authStore'),
      import('../stores/dataStore'),
      import('../stores/uiStore'),
    ]);

    const richTextTask: Task = {
      ...existingTask,
      description: [
        '<h2>Formatted heading</h2>',
        '<p><strong>Important text</strong></p>',
        '<ol><li>Numbered item</li></ol>',
        '<div data-checklist data-checked="true" onclick="alert(1)">Completed item</div>',
        '<a href="https://example.com" onclick="alert(2)">Safe link</a>',
        '<script>window.__unsafeDescriptionScript = true</script>',
      ].join(''),
    };

    useAuthStore.setState({ currentUser: externalMember });
    useDataStore.setState({
      members: [externalMember, assignee],
      teams: [{ id: 'team-1', name: 'Editorial', icon: 'Users', scheduleType: 'absence-only' }],
      teamStatuses: {
        'team-1': [{ id: 'status-1', name: 'In progress', category: 'active', sortOrder: 0 }],
      },
      teamTypes: { 'team-1': ['Article'] },
      teamProperties: { 'team-1': [{ id: 'brief', name: 'Brief', type: 'text' }] },
      taskTeamLinks: [],
      teamPlacements: { 'team-1': ['Website'] },
      allPlacements: ['Website'],
    });
    useUiStore.setState({ isTaskModalOpen: true, taskModalData: richTextTask });
    resetStores = () => {
      useAuthStore.setState({ currentUser: null });
      useUiStore.setState({ isTaskModalOpen: false, taskModalData: {} });
    };

    await act(async () => {
      render(<TaskModal />);
    });

    const description = screen.getByRole('heading', { name: 'Formatted heading', level: 2 }).closest('.rte-content');
    expect(description).not.toBeNull();
    expect(description?.querySelector('strong')).toHaveTextContent('Important text');
    expect(description?.querySelector('ol > li')).toHaveTextContent('Numbered item');

    const checklist = description?.querySelector('[data-checklist]');
    expect(checklist).toHaveAttribute('data-checked', 'true');
    expect(checklist).toHaveTextContent('Completed item');
    expect(checklist).not.toHaveAttribute('onclick');

    const link = description?.querySelector('a');
    expect(link).toHaveAttribute('href', 'https://example.com');
    expect(link).not.toHaveAttribute('onclick');
    expect(description?.querySelector('script')).toBeNull();
    expect(description?.querySelector('[onerror]')).toBeNull();
  });
});
