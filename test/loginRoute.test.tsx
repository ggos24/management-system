import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { Member } from '../types';

const member: Member = {
  id: 'profile-1',
  name: 'Editor',
  role: 'editor',
  accessScope: 'full',
  jobTitle: '',
  avatar: '',
  teamId: 'team-1',
  teamIds: ['team-1'],
  status: 'active',
};

async function renderLogin() {
  const [{ LoginRoute }, { useAuthStore }] = await Promise.all([import('../routes'), import('../stores/authStore')]);
  render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route path="/login" element={<LoginRoute />} />
        <Route path="/workspace" element={<p>Workspace</p>} />
      </Routes>
    </MemoryRouter>,
  );
  return useAuthStore;
}

afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  const { useAuthStore } = await import('../stores/authStore');
  useAuthStore.getState().clearSessionState();
});

describe('login route after signing in', () => {
  it('shows the login form when nobody is signed in', async () => {
    const { useAuthStore } = await import('../stores/authStore');
    useAuthStore.setState({ session: null, currentUser: null, isLoading: false });

    await renderLogin();

    expect(screen.getByText('Sign in to your account')).toBeInTheDocument();
  });

  it('keeps the form from signing in while a sign-out is still clearing the old session', async () => {
    const { useAuthStore } = await import('../stores/authStore');
    useAuthStore.setState({ session: null, currentUser: null, isLoading: false, isSigningOut: true });

    await renderLogin();

    expect(screen.getByRole('button', { name: 'Signing out…' })).toBeDisabled();
    useAuthStore.setState({ isSigningOut: false });
  });

  it('shows the loading screen while the profile loads, instead of the finished form', async () => {
    const { useAuthStore } = await import('../stores/authStore');
    useAuthStore.setState({ session: { user: { id: 'auth-1' } } as never, isLoading: true, isReconnecting: true });

    await renderLogin();

    expect(screen.getByText('Reconnecting…')).toBeInTheDocument();
    expect(screen.queryByText('Sign in to your account')).not.toBeInTheDocument();
  });

  it('shows a failed profile load and retries it in place', async () => {
    const { useAuthStore } = await import('../stores/authStore');
    const initData = vi.fn<(authUserId: string) => Promise<void>>().mockResolvedValue(undefined);
    useAuthStore.setState({
      session: { user: { id: 'auth-1' } } as never,
      isLoading: false,
      profileError: 'Failed to load application data. Please try refreshing.',
      initData,
    });

    await renderLogin();
    expect(screen.getByText('Failed to load application data. Please try refreshing.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(initData).toHaveBeenCalledWith('auth-1');
    expect(useAuthStore.getState().isLoading).toBe(true);
    expect(screen.getByRole('button', { name: 'Sign Out' })).toBeInTheDocument();
  });

  it('goes on to the app once the profile is loaded', async () => {
    const { useAuthStore } = await import('../stores/authStore');
    useAuthStore.setState({ session: { user: { id: 'auth-1' } } as never, currentUser: member, isLoading: false });

    await renderLogin();

    expect(screen.getByText('Workspace')).toBeInTheDocument();
  });
});
