import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Member } from '../types';

Object.defineProperty(window, 'matchMedia', {
  configurable: true,
  value: () => ({
    matches: false,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }),
});

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

async function renderBanner(members: Member[], currentUser: Member | null = null) {
  const [{ BirthdayBanner }, { useDataStore }, { useAuthStore }] = await Promise.all([
    import('../components/BirthdayBanner'),
    import('../stores/dataStore'),
    import('../stores/authStore'),
  ]);
  useDataStore.setState({ members });
  useAuthStore.setState({ currentUser });
  return render(<BirthdayBanner />);
}

const MARCH_14_2026 = new Date(2026, 2, 14, 12, 0, 0);

describe('birthday banner', () => {
  beforeEach(() => {
    vi.setSystemTime(MARCH_14_2026);
    localStorage.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it('takes no space on a day nobody is celebrating', async () => {
    const { container } = await renderBanner([makeMember({ birthday: '1993-06-02' })]);
    expect(container.firstChild).toBeNull();
  });

  it('takes no space when no birthday is on file', async () => {
    const { container } = await renderBanner([makeMember({ birthday: null })]);
    expect(container.firstChild).toBeNull();
  });

  it('names the one person whose birthday it is', async () => {
    await renderBanner([makeMember({ birthday: '1993-03-14' })], makeMember({ id: 'someone-else' }));
    expect(screen.getByText("Today is Ada Lovelace's birthday")).toBeTruthy();
  });

  it('greets you by first name on your own birthday', async () => {
    const me = makeMember({ birthday: '1993-03-14' });
    await renderBanner([me], me);
    expect(screen.getByText('Happy birthday, Ada!')).toBeTruthy();
  });

  it('lists everyone when several share the day, year shared or not', async () => {
    await renderBanner(
      [
        makeMember({ id: 'a', name: 'Ada Lovelace', birthday: '1993-03-14' }),
        makeMember({ id: 'b', name: 'Grace Hopper', birthday: '1904-03-14' }),
        makeMember({ id: 'c', name: 'Alan Turing', birthday: '1912-03-14' }),
        makeMember({ id: 'd', name: 'Nobody Today', birthday: '1990-07-01' }),
      ],
      makeMember({ id: 'z', name: 'Onlooker' }),
    );
    expect(screen.getByText('Birthdays today: Ada, Grace and Alan')).toBeTruthy();
  });

  it('stays hidden for the rest of the day once dismissed', async () => {
    const me = makeMember({ id: 'me', name: 'Onlooker' });
    const celebrant = makeMember({ birthday: '1993-03-14' });

    const first = await renderBanner([celebrant], me);
    fireEvent.click(screen.getByLabelText('Dismiss birthday banner'));
    expect(first.container.firstChild).toBeNull();

    cleanup();
    const second = await renderBanner([celebrant], me);
    expect(second.container.firstChild).toBeNull();
  });

  it('comes back for the next birthday — the dismissal expires with the day', async () => {
    const me = makeMember({ id: 'me', name: 'Onlooker' });
    const celebrant = makeMember({ birthday: '1993-03-14' });

    await renderBanner([celebrant], me);
    fireEvent.click(screen.getByLabelText('Dismiss birthday banner'));
    cleanup();

    vi.setSystemTime(new Date(2027, 2, 14, 12, 0, 0));
    await renderBanner([celebrant], me);
    expect(screen.getByText("Today is Ada Lovelace's birthday")).toBeTruthy();
  });
});
