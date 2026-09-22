import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Subscription } from '../types';

Object.defineProperty(window, 'matchMedia', {
  configurable: true,
  value: () => ({
    matches: false,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }),
});

const now = new Date(2026, 8, 10).getTime(); // 10 Sep 2026

const subscription = (overrides: Partial<Subscription> = {}): Subscription => ({
  id: 'sub-1',
  serviceName: 'Adobe CC',
  amount: 60,
  currency: 'USD',
  billingPeriod: 'monthly',
  nextPaymentDate: '2026-09-15',
  ownerId: null,
  status: 'active',
  notes: '',
  createdAt: '2026-09-01T00:00:00Z',
  updatedAt: '2026-09-01T00:00:00Z',
  ...overrides,
});

afterEach(cleanup);

describe('SubscriptionsTool', () => {
  it('asks only for what is paid, how often and by whom', async () => {
    const [{ SubscriptionsTool }, { useDataStore }] = await Promise.all([
      import('../components/SubscriptionsTool'),
      import('../stores/dataStore'),
    ]);
    useDataStore.setState({ subscriptions: [], members: [] });
    render(
      <MemoryRouter>
        <SubscriptionsTool />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: /new subscription/i }));

    // FormField splits a required label into "Service" + " *", so match loosely.
    const labels = within(screen.getByRole('dialog'))
      .getAllByText(/\S/, { selector: 'label' })
      .map((node) => node.textContent?.replace(' *', '').trim());
    expect(labels).toEqual(['Service', 'Status', 'Amount', 'Currency', 'Billing', 'Next payment', 'Owner', 'Notes']);
  });
});

describe('SubscriptionsCalendar', () => {
  const renderCalendar = async (subscriptions: Subscription[], onOpen = vi.fn()) => {
    const { SubscriptionsCalendar } = await import('../components/SubscriptionsCalendar');
    render(<SubscriptionsCalendar subscriptions={subscriptions} now={now} onOpen={onOpen} />);
    return onOpen;
  };

  it('opens on the current month and totals what it charges', async () => {
    await renderCalendar([subscription(), subscription({ id: 'sub-2', serviceName: 'Figma', amount: 45 })]);

    expect(screen.getByText('September 2026')).toBeTruthy();
    expect(screen.getByText('$105.00')).toBeTruthy();
  });

  it('carries a monthly plan into the months after its stored due date', async () => {
    await renderCalendar([subscription()]);
    // Both the desktop grid and the phone agenda render, so the chip is found twice.
    expect(screen.getAllByTitle('Adobe CC — $60.00 · due soon').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByLabelText('Next month'));
    expect(screen.getByText('October 2026')).toBeTruthy();
    // A month out it is no longer imminent, so the same charge reads as scheduled.
    expect(screen.getAllByTitle('Adobe CC — $60.00 · scheduled').length).toBeGreaterThan(0);
  });

  it('leaves out a yearly plan whose charge is in another month', async () => {
    await renderCalendar([subscription({ billingPeriod: 'yearly' })]);
    expect(screen.getAllByTitle(/^Adobe CC/).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByLabelText('Next month'));
    expect(screen.queryByTitle(/^Adobe CC/)).toBeNull();
    expect(screen.getByText('Nothing is charged this month.')).toBeTruthy();
  });

  it('opens the subscription behind a charge', async () => {
    const onOpen = await renderCalendar([subscription()]);
    fireEvent.click(screen.getAllByTitle(/^Adobe CC/)[0]);
    expect(onOpen).toHaveBeenCalledWith('sub-1');
  });
});
