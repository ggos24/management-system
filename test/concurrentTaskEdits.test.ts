import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Task } from '../types';
import * as db from '../lib/database';
import { useDataStore } from '../stores/dataStore';

const original: Task = {
  id: 'task-1',
  title: 'Interview',
  description: '<p>Intro</p>',
  teamId: 'team-1',
  statusId: 'status-1',
  assigneeIds: ['a'],
  priority: 'medium',
  dueDate: '2026-10-10',
  doneDate: null,
  placements: ['Site'],
  links: [],
  contentInfo: { type: 'Editorial', editorIds: [], designerIds: [], notes: '', files: [] },
  customFieldValues: {},
  sortOrder: 5,
  deletedAt: null,
  deletedBy: null,
};

const other: Task = { ...original, id: 'task-2', title: 'Other task' };

/** The database: fresh reads see the last write, as the real one would. */
let server: Task;
let saveWithRelations: ReturnType<typeof vi.fn>;

const clone = <T>(value: T): T => structuredClone(value);

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  server = clone(original);
  vi.spyOn(db, 'fetchTaskById').mockImplementation(async () => clone(server));
  saveWithRelations = vi.fn(async (task: Task) => {
    server = clone(task);
    return null;
  });
  vi.spyOn(db, 'saveTaskWithRelations').mockImplementation(saveWithRelations as never);
  useDataStore.setState({ tasks: [clone(original), clone(other)], members: [], teamStatuses: {} });
});

afterEach(() => {
  vi.restoreAllMocks();
  useDataStore.getState().resetData();
});

/** User 1 saved from another browser: the server changed, this tab has not refetched yet. */
const someoneElseSaves = (changes: Partial<Task>) => {
  server = { ...server, ...changes };
};

describe('saving a task someone else changed while it was open', () => {
  it("keeps user 1's description when user 2 changes another field (the reported bug)", async () => {
    // User 2 opened the task: the modal's base and draft are this copy.
    const base = clone(original);
    someoneElseSaves({ description: '<p>Intro</p><p>A long text user 1 wrote and saved.</p>' });

    const result = await useDataStore
      .getState()
      .saveTask({ ...base, title: 'Interview — final' }, [], [], { isNew: false, base });

    expect(result.status).toBe('saved');
    expect(server.description).toBe('<p>Intro</p><p>A long text user 1 wrote and saved.</p>');
    expect(server.title).toBe('Interview — final');
    // Card order is the server's, not reset to 0 as every modal save used to do.
    expect(server.sortOrder).toBe(5);
  });

  it('keeps both when user 2 also added a line to the description', async () => {
    const base = clone(original);
    someoneElseSaves({ description: '<p>Intro</p><p>A long text user 1 wrote.</p>' });

    const result = await useDataStore
      .getState()
      .saveTask({ ...base, description: '<p>Intro</p><p>A small note from user 2.</p>' }, [], [], {
        isNew: false,
        base,
      });

    expect(result.status).toBe('saved');
    expect(server.description).toBe('<p>Intro</p><p>A long text user 1 wrote.</p><p>A small note from user 2.</p>');
  });

  it('writes nothing and hands back both versions when both rewrote the same paragraph', async () => {
    const base = clone(original);
    someoneElseSaves({ description: '<p>Intro, as user 1 rewrote it</p>' });

    const result = await useDataStore
      .getState()
      .saveTask({ ...base, description: '<p>Intro, as user 2 rewrote it</p>' }, [], [], { isNew: false, base });

    expect(saveWithRelations).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      status: 'conflict',
      task: { description: '<p>Intro, as user 1 rewrote it</p><p>Intro, as user 2 rewrote it</p>' },
      theirs: { description: '<p>Intro, as user 1 rewrote it</p>' },
    });
  });

  it('does not bring back a task someone moved to the bin', async () => {
    const base = clone(original);
    someoneElseSaves({ deletedAt: '2026-10-06T10:00:00Z' });

    const result = await useDataStore.getState().saveTask({ ...base, title: 'x' }, [], [], { isNew: false, base });

    expect(result.status).toBe('failed');
    expect(saveWithRelations).not.toHaveBeenCalled();
  });

  it('does not save over the server when it cannot read the current copy', async () => {
    vi.mocked(db.fetchTaskById).mockRejectedValueOnce(new TypeError('Failed to fetch'));

    const result = await useDataStore
      .getState()
      .saveTask({ ...original, title: 'x' }, [], [], { isNew: false, base: original });

    expect(result.status).toBe('failed');
    expect(saveWithRelations).not.toHaveBeenCalled();
  });

  it('on a failed write restores only this task, not a snapshot of every task', async () => {
    saveWithRelations.mockRejectedValueOnce(new Error('boom'));
    const pending = useDataStore
      .getState()
      .saveTask({ ...original, title: 'x' }, [], [], { isNew: false, base: original });
    // Realtime brought in a change to another task while the save ran.
    useDataStore.setState({
      tasks: useDataStore.getState().tasks.map((t) => (t.id === 'task-2' ? { ...t, title: 'Renamed meanwhile' } : t)),
    });

    await pending;

    const tasks = useDataStore.getState().tasks;
    expect(tasks.find((t) => t.id === 'task-2')?.title).toBe('Renamed meanwhile');
    expect(tasks.find((t) => t.id === 'task-1')?.title).toBe('Interview');
  });
});

describe('inline edits', () => {
  const settle = async () => {
    for (let i = 0; i < 20; i++) await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
  };

  it('do not revert a description saved elsewhere that this tab has not seen yet', async () => {
    someoneElseSaves({ description: '<p>Intro</p><p>New text from user 1.</p>' });
    const stale = useDataStore.getState().tasks.find((t) => t.id === 'task-1')!;

    useDataStore.getState().updateTask({ ...stale, priority: 'high' });
    await settle();

    expect(server.priority).toBe('high');
    expect(server.description).toBe('<p>Intro</p><p>New text from user 1.</p>');
    expect(useDataStore.getState().tasks.find((t) => t.id === 'task-1')?.description).toBe(server.description);
  });

  it('keep both of two quick edits to the same task', async () => {
    const task = () => useDataStore.getState().tasks.find((t) => t.id === 'task-1')!;

    useDataStore.getState().updateTask({ ...task(), priority: 'high' });
    useDataStore.getState().updateTask({ ...task(), dueDate: '2026-11-01' });
    await settle();
    await settle();

    expect(server).toMatchObject({ priority: 'high', dueDate: '2026-11-01' });
  });
});

describe('linked-team custom fields', () => {
  it('apply only the changed key onto the values the link has now', async () => {
    useDataStore.setState({
      taskTeamLinks: [
        { taskId: 'task-1', teamId: 'team-2', statusId: null, sortOrder: 0, customFieldValues: { tone: 'news' } },
      ] as never,
    });
    // Someone else set another field on the link meanwhile.
    vi.spyOn(db, 'fetchTaskTeamLinkFields').mockResolvedValue({ tone: 'news', region: 'Kyiv' });
    const write = vi.spyOn(db, 'updateTaskTeamLinkFields').mockResolvedValue(undefined);

    useDataStore.getState().updateLinkedTaskFields('task-1', 'team-2', { tone: 'feature' });
    await vi.waitFor(() => expect(write).toHaveBeenCalled());

    expect(write).toHaveBeenCalledWith('task-1', 'team-2', { tone: 'feature', region: 'Kyiv' });
  });
});
