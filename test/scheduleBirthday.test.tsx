import React from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Absence, Member, Team } from '../types';

Object.defineProperty(window, 'matchMedia', {
  configurable: true,
  value: () => ({
    matches: false,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }),
});

const team: Team = { id: 'team-1', name: 'Team One', icon: 'Users', scheduleType: 'shift-based' };

function makeMember(overrides: Partial<Member> = {}): Member {
  return {
    id: 'member-1',
    name: 'Ada Lovelace',
    role: 'admin',
    accessScope: 'full',
    jobTitle: 'Engineer',
    avatar: '',
    teamId: 'team-1',
    teamIds: ['team-1'],
    status: 'active',
    ...overrides,
  };
}

const noop = () => undefined;

async function renderSchedule(member: Member, absences: Absence[] = []) {
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
      teams={[team]}
      userRole="admin"
      currentUserId={member.id}
      onUpdateAbsence={noop}
      onDeleteAbsence={noop}
      onApproveAbsence={noop}
      onDeclineAbsence={noop}
      onCancelAbsence={noop}
      onUpdateShift={noop}
      onDeleteShift={noop}
      onReorderTeams={noop}
      onReorderMembers={noop}
    />,
  );
}

/** Day cells carry data-day; the last match is the member row, not the header. */
function dayCell(day: number): HTMLElement {
  const cells = document.querySelectorAll<HTMLElement>(`[data-day="${day}"]`);
  return cells[cells.length - 1];
}

/**
 * The outline is an overlay element, not a ring class on the cell: an inset ring
 * paints underneath the absence and shift blocks, which fill the cell edge to edge.
 */
function outline(cell: HTMLElement): Element | null {
  return cell.querySelector('.border-fuchsia-400');
}

// The grid opens on the current month, so pin "now" to a known March.
const MARCH_2026 = new Date(2026, 2, 10, 12, 0, 0);

describe('schedule birthday highlight', () => {
  beforeEach(() => vi.setSystemTime(MARCH_2026));
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it('outlines the birthday cell and names whose it is', async () => {
    await renderSchedule(makeMember({ birthday: '1993-03-14' }));
    const cell = dayCell(14);
    expect(outline(cell)).not.toBeNull();
    expect(cell.getAttribute('title')).toBe("Ada Lovelace's birthday");
    // Nothing else is on that day, so the cake has room.
    expect(outline(cell)?.querySelector('svg')).not.toBeNull();
  });

  it('leaves every other day alone', async () => {
    await renderSchedule(makeMember({ birthday: '1993-03-14' }));
    expect(outline(dayCell(13))).toBeNull();
    expect(dayCell(13).getAttribute('title')).toBeNull();
  });

  it('marks nothing when no birthday is on file', async () => {
    await renderSchedule(makeMember({ birthday: null }));
    expect(document.querySelectorAll('.border-fuchsia-400').length).toBe(0);
  });

  it('outlines a birthday whose year was never shared', async () => {
    await renderSchedule(makeMember({ birthday: '1904-03-14' }));
    expect(outline(dayCell(14))).not.toBeNull();
  });

  it('keeps the day itself readable — the outline never replaces the schedule', async () => {
    const member = makeMember({ birthday: '1993-03-14' });
    const absence: Absence = {
      id: 'absence-1',
      memberId: member.id,
      type: 'holiday',
      startDate: '2026-03-14',
      endDate: '2026-03-14',
      status: 'approved',
    };
    await renderSchedule(member, [absence]);

    const cell = dayCell(14);
    expect(outline(cell)).not.toBeNull();
    // The holiday label survives, and its tooltip picks up the birthday too.
    expect(cell.textContent).toContain('HOLS');
    expect(cell.querySelector('[title]')?.getAttribute('title')).toBe("HOLS · Ada Lovelace's birthday");
    // No room for the cake on top of the label — the outline carries it alone.
    expect(outline(cell)?.querySelector('svg')).toBeNull();
  });

  it('shows the birthday in the member card', async () => {
    await renderSchedule(makeMember({ birthday: '1993-03-14' }));
    act(() => screen.getByText('Ada Lovelace').click());
    expect(screen.getByText('14 March 1993')).toBeTruthy();
  });
});
