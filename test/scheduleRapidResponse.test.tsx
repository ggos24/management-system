import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Absence, Member, Team, UserRole } from '../types';

Object.defineProperty(window, 'matchMedia', {
  configurable: true,
  value: () => ({
    matches: false,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }),
});

const homeTeam: Team = { id: 'team-1', name: 'Team One', icon: 'Users', scheduleType: 'shift-based' };
const rapidTeam: Team = {
  id: 'team-rr',
  name: 'Rapid Response',
  icon: 'Rocket',
  scheduleType: 'shift-based',
  rapidResponse: true,
};

// One person in both teams — the case where an absence used to show up twice.
const member: Member = {
  id: 'member-1',
  name: 'Ada Lovelace',
  role: 'admin',
  accessScope: 'full',
  jobTitle: 'Engineer',
  avatar: '',
  teamId: 'team-1',
  teamIds: ['team-1', 'team-rr'],
  status: 'active',
};

const holiday: Absence = {
  id: 'absence-1',
  memberId: 'member-1',
  type: 'holiday',
  startDate: '2026-03-05',
  endDate: '2026-03-05',
  status: 'approved',
};

const noop = () => undefined;

async function renderSchedule({
  absences = [],
  userRole = 'admin',
  onUpdateAbsence = noop,
  onUpdateShift = noop,
}: {
  absences?: Absence[];
  userRole?: UserRole;
  onUpdateAbsence?: (a: Absence) => void;
  onUpdateShift?: (s: unknown) => void;
} = {}) {
  const [{ default: Schedule }, { useDataStore }] = await Promise.all([
    import('../components/Schedule'),
    import('../stores/dataStore'),
  ]);
  useDataStore.setState({ scheduleTeamOrders: {} });

  render(
    <Schedule
      members={[member]}
      absences={absences}
      shifts={[]}
      teams={[homeTeam, rapidTeam]}
      userRole={userRole}
      currentUserId={member.id}
      onUpdateAbsence={onUpdateAbsence}
      onDeleteAbsence={noop}
      onApproveAbsence={noop}
      onDeclineAbsence={noop}
      onCancelAbsence={noop}
      onUpdateShift={onUpdateShift}
      onDeleteShift={noop}
      onReorderTeams={noop}
      onReorderMembers={noop}
    />,
  );
}

/** Rows render in team order, so the first match is the home team row, the second Rapid Response. */
function dayCell(row: 'home' | 'rapid', day: number): HTMLElement {
  const cells = document.querySelectorAll<HTMLElement>(`[data-day="${day}"]`);
  return cells[row === 'home' ? 0 : 1];
}

function openEditor(cell: HTMLElement) {
  fireEvent.mouseDown(cell);
  fireEvent.mouseUp(cell);
}

const editorIsOpen = () => screen.queryByRole('button', { name: 'Save' }) !== null;

// The grid opens on the current month, so pin "now" to a known March.
const MARCH_2026 = new Date(2026, 2, 10, 12, 0, 0);

describe('schedule rapid response rows', () => {
  beforeEach(() => vi.setSystemTime(MARCH_2026));
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it('draws an absence on the home team row only', async () => {
    await renderSchedule({ absences: [holiday] });
    expect(dayCell('home', 5).textContent).toContain('HOLS');
    expect(dayCell('rapid', 5).textContent).not.toContain('HOLS');
  });

  it('offers DUTY/CALL and no absence on a rapid response row', async () => {
    await renderSchedule({ absences: [holiday] });
    openEditor(dayCell('rapid', 5));
    expect(screen.getByRole('button', { name: 'DUTY' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Absence' })).toBeNull();
    expect(screen.queryByText('Approved')).toBeNull();
  });

  it('saves a rapid response day as a shift, never an absence', async () => {
    const onUpdateAbsence = vi.fn();
    const onUpdateShift = vi.fn();
    await renderSchedule({ onUpdateAbsence, onUpdateShift });
    openEditor(dayCell('rapid', 7));
    fireEvent.click(screen.getByRole('button', { name: 'CALL' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onUpdateAbsence).not.toHaveBeenCalled();
    expect(onUpdateShift).toHaveBeenCalledWith(
      expect.objectContaining({ teamId: 'team-rr', date: '2026-03-07', shiftType: 'on_call' }),
    );
  });

  it('keeps non-admins out of their own rapid response row', async () => {
    await renderSchedule({ userRole: 'user' });
    openEditor(dayCell('rapid', 7));
    expect(editorIsOpen()).toBe(false);
    openEditor(dayCell('home', 7));
    expect(editorIsOpen()).toBe(true);
  });
});
