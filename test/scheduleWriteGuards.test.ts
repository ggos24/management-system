import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// PostgREST answers a write its RLS policy filtered out with success and zero
// rows. Without an explicit affected-row check the caller cannot tell a refused
// delete from a completed one, keeps its optimistic state, and diverges from
// every other client until the tab reloads.
const mocks = vi.hoisted(() => ({
  state: {
    writeResult: { data: [] as { id: string }[] | null, error: null as { message: string } | null },
    lookupResult: { data: null as { id: string } | null, error: null as { message: string } | null },
  },
}));

vi.mock('../lib/supabase', () => {
  const chain = (result: () => unknown) => {
    const link: Record<string, unknown> = {
      eq: () => link,
      select: () => link,
      single: () => Promise.resolve(result()),
      maybeSingle: () => Promise.resolve(mocks.state.lookupResult),
      then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
        Promise.resolve(result()).then(resolve, reject),
    };
    return link;
  };
  return {
    supabase: {
      from: () => ({
        delete: () => chain(() => mocks.state.writeResult),
        update: () => chain(() => mocks.state.writeResult),
        upsert: () => chain(() => mocks.state.writeResult),
        select: () => chain(() => mocks.state.lookupResult),
      }),
    },
  };
});

const db = await import('../lib/database');

beforeEach(() => {
  mocks.state.writeResult = { data: [{ id: 'absence-1' }], error: null };
  mocks.state.lookupResult = { data: null, error: null };
});

afterEach(() => vi.restoreAllMocks());

describe('deleteAbsence', () => {
  it('rejects when the row survived the delete', async () => {
    mocks.state.writeResult = { data: [], error: null };
    mocks.state.lookupResult = { data: { id: 'absence-1' }, error: null };

    await expect(db.deleteAbsence('absence-1')).rejects.toThrow(/blocked by RLS/);
  });

  it('resolves when the row was already gone', async () => {
    mocks.state.writeResult = { data: [], error: null };
    mocks.state.lookupResult = { data: null, error: null };

    await expect(db.deleteAbsence('absence-1')).resolves.toBeUndefined();
  });

  it('resolves when the delete removed the row', async () => {
    await expect(db.deleteAbsence('absence-1')).resolves.toBeUndefined();
  });
});

describe('updateAbsenceDecision', () => {
  it('rejects when the decision updated no rows', async () => {
    mocks.state.writeResult = { data: [], error: null };

    await expect(db.updateAbsenceDecision('absence-1', 'approved', 'profile-1')).rejects.toThrow(/no rows/);
  });

  it('resolves when the decision was recorded', async () => {
    await expect(db.updateAbsenceDecision('absence-1', 'approved', 'profile-1')).resolves.toBeUndefined();
  });
});

describe('upsertShift', () => {
  it('rejects instead of returning the error to a caller that ignores it', async () => {
    mocks.state.writeResult = { data: null, error: { message: 'permission denied' } };

    await expect(
      db.upsertShift({
        id: 'shift-1',
        memberId: 'member-1',
        teamId: 'team-1',
        date: '2026-08-19',
        startTime: '16:00',
        endTime: '00:00',
      }),
    ).rejects.toMatchObject({ message: 'permission denied' });
  });
});
