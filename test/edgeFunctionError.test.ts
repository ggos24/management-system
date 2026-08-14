import { describe, expect, it } from 'vitest';
import { readEdgeFunctionError } from '../lib/edgeFunctionError';

// Mirrors supabase-js: a non-2xx Edge Function response becomes a FunctionsHttpError
// with a generic message and the original Response attached as `context`.
class FunctionsHttpError extends Error {
  context: Response;
  constructor(context: Response) {
    super('Edge Function returned a non-2xx status code');
    this.name = 'FunctionsHttpError';
    this.context = context;
  }
}

const jsonError = (body: unknown, status: number) =>
  new FunctionsHttpError(
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
  );

describe('readEdgeFunctionError', () => {
  it('returns the error message from the function response body', async () => {
    const error = jsonError({ error: 'A user with this email already exists' }, 409);
    await expect(readEdgeFunctionError(error, 'Failed')).resolves.toBe('A user with this email already exists');
  });

  it('falls back to other common message keys', async () => {
    const error = jsonError({ message: 'Only admins can invite users' }, 403);
    await expect(readEdgeFunctionError(error, 'Failed')).resolves.toBe('Only admins can invite users');
  });

  it('surfaces plain-text platform failures verbatim', async () => {
    const error = new FunctionsHttpError(new Response('WORKER_LIMIT: boot error', { status: 546 }));
    await expect(readEdgeFunctionError(error, 'Failed')).resolves.toBe('WORKER_LIMIT: boot error');
  });

  it('reports the status when the body carries no message', async () => {
    const error = jsonError({}, 500);
    await expect(readEdgeFunctionError(error, 'Failed to send invitation')).resolves.toBe(
      'Failed to send invitation (HTTP 500)',
    );
  });

  it('uses the error message for network failures with no response', async () => {
    const error = new Error('Failed to send a request to the Edge Function');
    await expect(readEdgeFunctionError(error, 'Failed')).resolves.toBe('Failed to send a request to the Edge Function');
  });

  it('falls back when the error is not an Error at all', async () => {
    await expect(readEdgeFunctionError(null, 'Failed to send invitation')).resolves.toBe('Failed to send invitation');
  });
});
