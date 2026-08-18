import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Member, Team } from '../types';

Object.defineProperty(window, 'matchMedia', {
  configurable: true,
  value: () => ({
    matches: false,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }),
});

const team: Team = { id: 'team-1', name: 'Team One', icon: 'Users', scheduleType: 'shift-based' };

const member: Member = {
  id: 'member-1',
  name: 'Ada Lovelace',
  role: 'admin',
  accessScope: 'full',
  jobTitle: 'Engineer',
  avatar: '',
  teamId: 'team-1',
  teamIds: ['team-1'],
  status: 'active',
};

const noop = () => undefined;

async function renderSchedule() {
  const [{ default: Schedule }, { useDataStore }] = await Promise.all([
    import('../components/Schedule'),
    import('../stores/dataStore'),
  ]);
  useDataStore.setState({ scheduleTeamOrders: {} });

  render(
    <Schedule
      members={[member]}
      absences={[]}
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

/** First day cell of the member row — cells carry data-day, header cells do not. */
function firstDayCell(): HTMLElement {
  const cells = document.querySelectorAll<HTMLElement>('[data-day="1"]');
  return cells[cells.length - 1];
}

const touch = (x: number, y: number) => ({ touches: [{ clientX: x, clientY: y }] });

/** The editor is the dialog holding the Save button. */
const editorIsOpen = () => screen.queryByRole('button', { name: 'Save' }) !== null;

describe('schedule touch gestures', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it('ignores a plain tap', async () => {
    await renderSchedule();
    const cell = firstDayCell();

    fireEvent.touchStart(cell, touch(100, 100));
    fireEvent.touchEnd(cell, touch(100, 100));

    expect(editorIsOpen()).toBe(false);
  });

  it('opens the editor after a press held past the threshold', async () => {
    await renderSchedule();
    const cell = firstDayCell();

    fireEvent.touchStart(cell, touch(100, 100));
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    fireEvent.touchEnd(cell, touch(100, 100));

    expect(editorIsOpen()).toBe(true);
  });

  it('abandons a press that moves before the threshold', async () => {
    await renderSchedule();
    const cell = firstDayCell();

    fireEvent.touchStart(cell, touch(100, 100));
    fireEvent.touchMove(cell, touch(160, 100));
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    fireEvent.touchEnd(cell, touch(160, 100));

    expect(editorIsOpen()).toBe(false);
  });

  it('ignores a press that lands on a still-moving grid', async () => {
    await renderSchedule();
    const cell = firstDayCell();
    const scroller = cell.closest('.overflow-auto') as HTMLElement;

    // The tap that catches a momentum scroll: a scroll event, then a press that
    // never moves — exactly the shape of a deliberate hold.
    fireEvent.scroll(scroller);
    fireEvent.touchStart(cell, touch(100, 100));
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    fireEvent.touchEnd(cell, touch(100, 100));

    expect(editorIsOpen()).toBe(false);
  });

  it('accepts a hold once the grid has settled', async () => {
    await renderSchedule();
    const cell = firstDayCell();
    const scroller = cell.closest('.overflow-auto') as HTMLElement;

    fireEvent.scroll(scroller);
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    fireEvent.touchStart(cell, touch(100, 100));
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    fireEvent.touchEnd(cell, touch(100, 100));

    expect(editorIsOpen()).toBe(true);
  });
});
