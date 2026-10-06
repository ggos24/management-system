import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthLoadingScreen, SIGN_OUT_OFFER_AFTER_MS } from '../components/AuthScreens';
import { useAuthStore } from '../stores/authStore';

const originalLogout = useAuthStore.getState().logout;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  useAuthStore.setState({ logout: originalLogout, isReconnecting: false });
});

describe('loading screen while reconnecting', () => {
  it('offers a way out only once reconnecting has gone on for a while', () => {
    const logout = vi.fn<() => Promise<void>>(() => new Promise(() => undefined));
    useAuthStore.setState({ isReconnecting: true, logout });

    render(<AuthLoadingScreen />);
    expect(screen.getByText('Reconnecting…')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(SIGN_OUT_OFFER_AFTER_MS - 1));
    expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument();

    act(() => vi.advanceTimersByTime(1));
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    expect(logout).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Signing out…' })).toBeDisabled();
  });

  it('never offers it on a plain load', () => {
    useAuthStore.setState({ isReconnecting: false });

    render(<AuthLoadingScreen />);
    act(() => vi.advanceTimersByTime(SIGN_OUT_OFFER_AFTER_MS * 2));

    expect(screen.getByText('Loading...')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
