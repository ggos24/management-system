import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Member, Task, Team } from '../types';
import * as db from '../lib/database';
import { useAuthStore } from '../stores/authStore';
import { useDataStore } from '../stores/dataStore';

const profile: Member = {
  id: 'profile-1',
  name: 'Editor',
  role: 'editor',
  accessScope: 'full',
  jobTitle: '',
  avatar: '',
  teamId: 'team-1',
  teamIds: ['team-1'],
  status: 'active',
};

const team: Team = { id: 'team-1', name: 'team-1', icon: 'Users', scheduleType: 'absence-only' };

const stored: Task = {
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

let saved: Task[] = [];

beforeEach(() => {
  saved = [];
  useAuthStore.setState({ currentUser: profile });
  useDataStore.setState({ tasks: [stored], teamStatuses: {}, members: [profile] });
  vi.spyOn(db, 'saveTaskWithRelations').mockImplementation(async (task: Task) => {
    saved.push(task);
    return task.id;
  });
  vi.spyOn(db, 'insertLog').mockResolvedValue(undefined as never);
  vi.spyOn(db, 'insertTaskActivity').mockResolvedValue(undefined as never);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('saveTask start date', () => {
  it('saves a start date set in the task modal', async () => {
    await useDataStore.getState().saveTask({ ...stored, startDate: '2026-10-16' }, [team]);
    expect(saved[0].startDate).toBe('2026-10-16');
    expect(useDataStore.getState().tasks[0].startDate).toBe('2026-10-16');
  });

  it('clears the start date when the modal clears it', async () => {
    await useDataStore.getState().saveTask({ ...stored, startDate: null }, [team]);
    expect(saved[0].startDate).toBeNull();
  });

  it('keeps the stored start date when the caller leaves it out', async () => {
    const { startDate: _omitted, ...withoutStart } = stored;
    await useDataStore.getState().saveTask({ ...withoutStart, title: 'Renamed' }, [team]);
    expect(saved[0].title).toBe('Renamed');
    expect(saved[0].startDate).toBe('2026-10-14');
  });
});
