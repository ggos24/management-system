import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Member, Task } from '../types';

vi.mock('../lib/database', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/database')>()),
  fetchTaskComments: vi.fn().mockResolvedValue([]),
  fetchTaskActivity: vi.fn().mockResolvedValue([]),
}));

vi.mock('../lib/supabase', () => {
  const channel = { on: vi.fn(), subscribe: vi.fn() };
  channel.on.mockReturnValue(channel);
  channel.subscribe.mockReturnValue(channel);
  return { supabase: { channel: vi.fn(() => channel), removeChannel: vi.fn() } };
});

Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: () => undefined });

const editor: Member = {
  id: 'member-2',
  name: 'User Two',
  role: 'editor',
  accessScope: 'full',
  jobTitle: '',
  avatar: '',
  teamId: 'team-1',
  teamIds: ['team-1'],
  status: 'active',
};

const task: Task = {
  id: 'task-1',
  title: 'Interview',
  description: '<p>Intro</p>',
  teamId: 'team-1',
  statusId: 'status-1',
  assigneeIds: [],
  priority: 'medium',
  dueDate: '2026-10-10',
  doneDate: null,
  placements: [],
  links: [],
  contentInfo: { type: 'Article', editorIds: [], designerIds: [], notes: '', files: [] },
  customFieldValues: {},
  sortOrder: 2,
};

async function openTask() {
  const [{ TaskModal }, { useAuthStore }, { useDataStore }, { useUiStore }] = await Promise.all([
    import('../components/TaskModal'),
    import('../stores/authStore'),
    import('../stores/dataStore'),
    import('../stores/uiStore'),
  ]);
  const saveTask = vi.fn();
  useAuthStore.setState({ currentUser: editor });
  useDataStore.setState({
    tasks: [task],
    members: [editor],
    teams: [{ id: 'team-1', name: 'Editorial', icon: 'Users', scheduleType: 'absence-only' }],
    teamStatuses: { 'team-1': [{ id: 'status-1', name: 'In progress', category: 'active', sortOrder: 0 }] },
    teamTypes: { 'team-1': ['Article'] },
    teamProperties: {},
    taskTeamLinks: [],
    teamPlacements: {},
    allPlacements: [],
    saveTask,
  });
  useUiStore.setState({ isTaskModalOpen: true, taskModalData: { ...task } });
  await act(async () => {
    render(<TaskModal />);
  });
  return { useDataStore, useUiStore, saveTask };
}

const descriptionEditor = () => document.querySelector<HTMLElement>('[contenteditable="true"]')!;

afterEach(async () => {
  cleanup();
  const [{ useAuthStore }, { useUiStore }, { useDataStore }] = await Promise.all([
    import('../stores/authStore'),
    import('../stores/uiStore'),
    import('../stores/dataStore'),
  ]);
  useAuthStore.setState({ currentUser: null });
  useUiStore.setState({ isTaskModalOpen: false, taskModalData: {}, taskModalConflict: false });
  useDataStore.getState().resetData();
  vi.restoreAllMocks();
});

describe('TaskModal with someone else editing the same task', () => {
  it("shows a colleague's saved description in the open task, keeping my own edits", async () => {
    const { useDataStore, useUiStore } = await openTask();
    fireEvent.change(screen.getByPlaceholderText('Task Title'), { target: { value: 'Interview, final' } });

    // User 1 saved; realtime refreshed the store while user 2 has the task open.
    act(() => {
      useDataStore.setState({ tasks: [{ ...task, description: '<p>Intro</p><p>Written by user 1</p>' }] });
    });

    expect(descriptionEditor().innerHTML).toBe('<p>Intro</p><p>Written by user 1</p>');
    expect(useUiStore.getState().taskModalData).toMatchObject({
      title: 'Interview, final',
      description: '<p>Intro</p><p>Written by user 1</p>',
    });
  });

  it('saves against the copy it last saw from the server, not the one it opened with', async () => {
    const { useDataStore, saveTask } = await openTask();
    saveTask.mockResolvedValue({ status: 'saved', task });
    act(() => {
      useDataStore.setState({ tasks: [{ ...task, description: '<p>Intro</p><p>Written by user 1</p>' }] });
    });
    fireEvent.change(screen.getByPlaceholderText('Task Title'), { target: { value: 'Interview, final' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    });

    expect(saveTask).toHaveBeenCalledTimes(1);
    const [draft, , , options] = saveTask.mock.calls[0];
    expect(draft).toMatchObject({ title: 'Interview, final', description: '<p>Intro</p><p>Written by user 1</p>' });
    expect(options).toMatchObject({
      isNew: false,
      base: { title: 'Interview', description: '<p>Intro</p><p>Written by user 1</p>' },
    });
  });

  it('keeps the task open with both versions when the description conflicts', async () => {
    const { useUiStore, saveTask } = await openTask();
    const theirs = { ...task, description: '<p>Intro by user 1</p>' };
    saveTask.mockResolvedValue({
      status: 'conflict',
      task: { ...task, description: '<p>Intro by user 1</p><p>Intro by user 2</p>' },
      theirs,
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    });

    expect(useUiStore.getState().isTaskModalOpen).toBe(true);
    expect(screen.getByText(/Someone else changed the same part of the description/)).toBeInTheDocument();
    expect(descriptionEditor().innerHTML).toBe('<p>Intro by user 1</p><p>Intro by user 2</p>');
  });

  it('does not start a second save while one is running', async () => {
    const { saveTask } = await openTask();
    let finish!: (value: unknown) => void;
    saveTask.mockImplementation(() => new Promise((resolve) => (finish = resolve)));
    fireEvent.change(screen.getByPlaceholderText('Task Title'), { target: { value: 'Interview, final' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Sav/ }));
    });
    // Escape opens the unsaved-changes dialog, whose Save runs the same handler.
    await act(async () => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });
    const dialogSave = screen.queryAllByRole('button', { name: 'Save' }).at(-1);
    if (dialogSave) {
      await act(async () => {
        fireEvent.click(dialogSave);
      });
    }
    await act(async () => {
      finish({ status: 'saved', task });
    });

    expect(saveTask).toHaveBeenCalledTimes(1);
  });
});
