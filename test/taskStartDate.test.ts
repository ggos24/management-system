import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Task } from '../types';
import { isDateOrderValid } from '../lib/utils';

// A chainable stand-in for the supabase-js query builder: every filter/order call returns the
// builder, and awaiting it (or `.range()` / `.single()`) resolves to the response for its table.
const responses: Record<string, { data: unknown; error: unknown }> = {};
const upserts: Record<string, unknown>[] = [];

function builder(table: string) {
  const respond = () => Promise.resolve(responses[table] ?? { data: [], error: null });
  const b: Record<string, unknown> = {};
  for (const m of ['select', 'is', 'order', 'eq', 'limit', 'in']) b[m] = () => b;
  b.range = respond;
  b.single = respond;
  b.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => respond().then(resolve, reject);
  b.upsert = (row: Record<string, unknown>) => {
    upserts.push(row);
    return b;
  };
  return b;
}

vi.mock('../lib/supabase', () => ({ supabase: { from: (table: string) => builder(table) } }));

const db = await import('../lib/database');

const baseTask: Task = {
  id: 'task-1',
  title: 'Shoot promo',
  description: '',
  teamId: 'team-1',
  statusId: null,
  assigneeIds: [],
  priority: 'medium',
  dueDate: '2026-10-20',
  startDate: '2026-10-14',
  placements: [],
};

const taskRow = (extra: Record<string, unknown>) => ({
  id: 'task-1',
  title: 'Shoot promo',
  team_id: 'team-1',
  due_date: '2026-10-20',
  ...extra,
});

describe('task start date', () => {
  beforeEach(() => {
    for (const key of Object.keys(responses)) delete responses[key];
    upserts.length = 0;
  });

  it('keeps start dates on or before the due date', () => {
    expect(isDateOrderValid('2026-10-14', '2026-10-20')).toBe(true);
    expect(isDateOrderValid('2026-10-20', '2026-10-20')).toBe(true);
    expect(isDateOrderValid('2026-10-21', '2026-10-20')).toBe(false);
    expect(isDateOrderValid(null, '2026-10-20')).toBe(true);
    expect(isDateOrderValid('2026-10-21', '')).toBe(true);
  });

  it('leaves start_date out of writes until the column exists, so saves never fail', async () => {
    responses.tasks = { data: [taskRow({})], error: null };
    await db.fetchTasks();
    expect(db.isTaskStartDateEnabled()).toBe(false);

    responses.tasks = { data: taskRow({}), error: null };
    await db.upsertTask(baseTask);
    expect(upserts[0]).not.toHaveProperty('start_date');
  });

  it('reads and writes start_date once the migration has added the column', async () => {
    responses.tasks = { data: [taskRow({ start_date: '2026-10-14' })], error: null };
    const [task] = await db.fetchTasks();
    expect(db.isTaskStartDateEnabled()).toBe(true);
    expect(task.startDate).toBe('2026-10-14');

    responses.tasks = { data: taskRow({ start_date: '2026-10-14' }), error: null };
    await db.upsertTask({ ...baseTask, startDate: null });
    expect(upserts[0]).toHaveProperty('start_date', null);
  });

  it('falls back to a direct column check when no tasks are visible', async () => {
    responses.tasks = { data: [], error: { code: '42703', message: 'column tasks.start_date does not exist' } };
    // fetchAllPaged throws on the error, so give the paged read an empty page and only fail the probe.
    let call = 0;
    const original = responses.tasks;
    Object.defineProperty(responses, 'tasks', {
      configurable: true,
      get: () => (call++ === 0 ? { data: [], error: null } : original),
    });
    await db.fetchTasks();
    expect(db.isTaskStartDateEnabled()).toBe(false);
    delete responses.tasks;
  });
});
