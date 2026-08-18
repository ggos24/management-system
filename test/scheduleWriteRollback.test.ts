import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Absence, Shift } from '../types';
import * as db from '../lib/database';
import { useDataStore } from '../stores/dataStore';

// The schedule renders an absence in place of any shift it overlaps, so an
// optimistic write the database silently refused (an RLS-filtered UPDATE or
// DELETE reports success with zero rows) left the acting client showing shift
// hours while every other client showed the absence — until that tab reloaded.
const absence: Absence = {
  id: 'absence-1',
  memberId: 'member-1',
  type: 'free',
  startDate: '2026-08-19',
  endDate: '2026-08-21',
  status: 'approved',
};

const shift: Shift = {
  id: 'shift-1',
  memberId: 'member-1',
  teamId: 'team-1',
  date: '2026-08-19',
  startTime: '16:00',
  endTime: '00:00',
};

afterEach(() => {
  vi.restoreAllMocks();
  useDataStore.setState({ absences: [], shifts: [] });
});

describe('schedule writes the database refuses', () => {
  it('restores the absence when the delete lands on no rows', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(db, 'deleteAbsence').mockRejectedValue(new Error('blocked by RLS'));
    useDataStore.setState({ absences: [absence] });

    useDataStore.getState().deleteAbsence(absence.id);
    expect(useDataStore.getState().absences).toEqual([]);

    await vi.waitFor(() => expect(useDataStore.getState().absences).toEqual([absence]));
  });

  it('drops the optimistic shift when the upsert fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(db, 'upsertShift').mockRejectedValue(new Error('blocked by RLS'));

    useDataStore.getState().updateShift(shift);
    expect(useDataStore.getState().shifts).toEqual([shift]);

    await vi.waitFor(() => expect(useDataStore.getState().shifts).toEqual([]));
  });
});
