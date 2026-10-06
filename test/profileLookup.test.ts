import { afterEach, describe, expect, it, vi } from 'vitest';
import { findProfileByAuthId } from '../lib/database';

const profileRow = {
  id: 'profile-1',
  auth_user_id: 'auth-1',
  name: 'Editor',
  role: 'editor',
  access_scope: 'full',
  job_title: '',
  avatar: '',
  team_id: 'team-1',
  status: 'active',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** Answers PostgREST requests by table, the way the real API would. */
function stubRest(routes: { profiles: () => Response | Promise<Response>; team_members?: () => Response }) {
  const fetchMock = vi.fn<typeof fetch>((input) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes('/rest/v1/profiles')) return Promise.resolve(routes.profiles());
    if (url.includes('/rest/v1/team_members')) return Promise.resolve((routes.team_members ?? (() => json([])))());
    return Promise.reject(new Error(`unexpected request ${url}`));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('findProfileByAuthId', () => {
  it('returns the profile with its teams, primary team first', async () => {
    stubRest({
      profiles: () => json([profileRow]),
      team_members: () =>
        json([
          { team_id: 'team-2', is_primary: false, sort_order: 3 },
          { team_id: 'team-1', is_primary: true, sort_order: 1 },
        ]),
    });

    const profile = await findProfileByAuthId('auth-1');

    expect(profile).toMatchObject({ id: 'profile-1', teamIds: ['team-1', 'team-2'] });
  });

  it('returns null only when the account really has no profile', async () => {
    stubRest({ profiles: () => json([]) });

    await expect(findProfileByAuthId('auth-1')).resolves.toBeNull();
  });

  it('throws on a network error instead of reporting a missing profile', async () => {
    stubRest({ profiles: () => Promise.reject(new TypeError('Failed to fetch')) });

    await expect(findProfileByAuthId('auth-1')).rejects.toMatchObject({
      message: expect.stringContaining('Failed to fetch'),
    });
  });

  it('throws on a server error', async () => {
    stubRest({ profiles: () => json({ message: 'upstream timeout', code: '57014' }, 500) });

    await expect(findProfileByAuthId('auth-1')).rejects.toMatchObject({ code: '57014' });
  });

  it('throws when the team memberships cannot be read', async () => {
    stubRest({
      profiles: () => json([profileRow]),
      team_members: () => json({ message: 'upstream timeout', code: '57014' }, 503),
    });

    await expect(findProfileByAuthId('auth-1')).rejects.toMatchObject({ code: '57014' });
  });
});
