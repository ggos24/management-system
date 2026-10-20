import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountErrorScreen, AuthLoadingScreen, SIGN_OUT_OFFER_AFTER_MS } from '../components/AuthScreens';
import { useAuthStore } from '../stores/authStore';
import { useUiStore } from '../stores/uiStore';

const telegram = vi.hoisted(() => ({ webview: false }));
vi.mock('../lib/telegram', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/telegram')>()),
  isTelegramWebview: () => telegram.webview,
}));

const originalLogout = useAuthStore.getState().logout;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  telegram.webview = false;
  useAuthStore.setState({ logout: originalLogout, isReconnecting: false });
  useUiStore.getState().setClockSkew(null);
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

  it('offers Try again instead of Sign out in the Telegram Mini App, which has no sign-in form', () => {
    telegram.webview = true;
    const logout = vi.fn<() => Promise<void>>();
    useAuthStore.setState({ isReconnecting: true, logout });

    render(<AuthLoadingScreen />);
    act(() => vi.advanceTimersByTime(SIGN_OUT_OFFER_AFTER_MS));

    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument();
  });

  it('keeps the clock-skew warning visible while loading', () => {
    useUiStore.getState().setClockSkew(2 * 60 * 60);

    render(<AuthLoadingScreen />);

    expect(screen.getByText(/clock is about 120 min ahead/)).toBeInTheDocument();
  });
});

describe('account error screen', () => {
  it('offers Sign Out on the web', () => {
    render(<AccountErrorScreen message="Failed to load" onRetry={() => undefined} />);

    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign Out' })).toBeInTheDocument();
  });

  it('offers only Try again in the Telegram Mini App', () => {
    telegram.webview = true;

    render(<AccountErrorScreen message="Failed to load" onRetry={() => undefined} />);

    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sign Out' })).not.toBeInTheDocument();
  });
});
