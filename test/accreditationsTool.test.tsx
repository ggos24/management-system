import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { Accreditation, Member } from '../types';

Object.defineProperty(window, 'matchMedia', {
  configurable: true,
  value: () => ({
    matches: false,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }),
});

const holder: Member = {
  id: 'member-1',
  name: 'Olena K.',
  role: 'editor',
  accessScope: 'full',
  jobTitle: '',
  avatar: '',
  teamId: 'home-team',
  teamIds: ['home-team'],
  status: 'active',
};

const inDays = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

const accreditation = (id: string, validUntil: string | null): Accreditation => ({
  id,
  holderId: holder.id,
  holderName: holder.name,
  kind: 'military',
  validUntil,
  notes: '',
  createdBy: null,
  createdAt: '2026-09-01T00:00:00Z',
  updatedAt: '2026-09-01T00:00:00Z',
});

afterEach(cleanup);

async function renderTool(accreditations: Accreditation[]) {
  const [{ AccreditationsTool }, { useDataStore }] = await Promise.all([
    import('../components/AccreditationsTool'),
    import('../stores/dataStore'),
  ]);
  useDataStore.setState({ accreditations, members: [holder] });
  render(
    <MemoryRouter>
      <AccreditationsTool />
    </MemoryRouter>,
  );
}

describe('AccreditationsTool', () => {
  it('asks only for holder, kind, expiry and notes', async () => {
    await renderTool([]);
    fireEvent.click(screen.getByRole('button', { name: /new accreditation/i }));

    // FormField splits a required label into "Holder" + " *", so match loosely.
    const labels = within(screen.getByRole('dialog'))
      .getAllByText(/\S/, { selector: 'label' })
      .map((node) => node.textContent?.replace(' *', '').trim());
    expect(labels).toEqual(['Holder', 'Kind', 'Valid until', 'Notes']);
  });

  it('warns a month before the expiry date and never offers pending or revoked', async () => {
    await renderTool([accreditation('soon', inDays(29)), accreditation('later', inDays(60))]);

    expect(screen.getByText('1 expiring')).toBeTruthy();
    const states = within(screen.getByRole('table'))
      .getAllByRole('row')
      .slice(1)
      .map((row) => within(row).getAllByRole('cell').at(-2)?.textContent);
    expect(states).toEqual(['Expiring', 'Valid']);
    expect(screen.queryByText('Pending')).toBeNull();
    expect(screen.queryByText('Revoked')).toBeNull();
  });
});
