import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Member, Notification } from '../types';
import * as db from '../lib/database';
import { captureAuthSession, isAuthSessionCurrent, useAuthStore } from '../stores/authStore';
import { useUiStore } from '../stores/uiStore';

const externalMember = (id: string): Member => ({
  id,
  name: id,
  role: 'user',
  accessScope: 'related_only',
  jobTitle: '',
  avatar: '',
  teamId: '',
  teamIds: [],
  status: 'active',
});

afterEach(() => {
  vi.restoreAllMocks();
  useAuthStore.getState().clearSessionState();
});

describe('session isolation', () => {
  it('does not commit notifications fetched for a previous account', async () => {
    let resolveNotifications!: (notifications: Notification[]) => void;
    vi.spyOn(db, 'fetchNotifications').mockImplementation(
      () => new Promise<Notification[]>((resolve) => (resolveNotifications = resolve)),
    );
    useAuthStore.setState({
      session: { user: { id: 'auth-a' } } as never,
      currentUser: externalMember('profile-a'),
    });
    const snapshot = captureAuthSession();
    const pending = useUiStore.getState().loadNotifications(() => isAuthSessionCurrent(snapshot));

    useAuthStore.getState().clearSessionState();
    useAuthStore.setState({
      session: { user: { id: 'auth-b' } } as never,
      currentUser: externalMember('profile-b'),
    });
    resolveNotifications([
      {
        id: 'notification-a',
        recipientId: 'profile-a',
        actorId: null,
        type: 'comment_mention',
        message: 'Private task A',
        entityData: { taskId: 'task-a' },
        read: false,
        createdAt: '2026-08-11T10:00:00.000Z',
      },
    ]);
    await pending;

    expect(useUiStore.getState().notifications).toEqual([]);
  });
});
