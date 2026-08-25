// Exchanges a Telegram Mini App `initData` payload for a real Supabase session.
//
// Why a session rather than a bespoke API: every equipment query then runs
// through the same lib/database.ts + RLS path the web app uses, with no forked
// code and no authorization logic re-implemented in Deno. The minted session is
// simply the user's own session.
//
// This function is deliberately deployed with verify_jwt = false — the caller
// has no Supabase JWT yet, which is the entire point. The initData HMAC *is* the
// credential, so the bot token is what this rests on.
//
// SECURITY NOTE, accepted deliberately: a linked Telegram account becomes an
// authentication factor for the whole tool, not just equipment. Anyone who
// controls a linked Telegram account can obtain a session as that user. See
// docs/plans/equipment-tracking.md §8.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// initData is regenerated at every webview open and the exchange runs
// immediately after, so a tight window costs nothing and caps replay.
const MAX_AUTH_AGE_SECONDS = 900;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function hmacSha256(key: ArrayBuffer | Uint8Array, message: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message));
}

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Length-independent constant-time comparison. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Per core.telegram.org/bots/webapps: the data-check-string is every received
 * field EXCEPT `hash`, sorted alphabetically, joined by \n. `signature` stays in
 * — it is only excluded in the third-party Ed25519 validation path.
 */
async function validateInitData(initData: string, botToken: string): Promise<Record<string, string> | null> {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;

  const pairs: string[] = [];
  const fields: Record<string, string> = {};
  for (const [key, value] of params.entries()) {
    fields[key] = value;
    if (key !== 'hash') pairs.push(`${key}=${value}`);
  }
  pairs.sort();

  const secretKey = await hmacSha256(new TextEncoder().encode('WebAppData'), botToken);
  const expected = toHex(await hmacSha256(secretKey, pairs.join('\n')));
  if (!timingSafeEqual(expected, hash.toLowerCase())) return null;

  const authDate = Number(fields.auth_date);
  if (!Number.isFinite(authDate)) return null;
  if (Math.floor(Date.now() / 1000) - authDate > MAX_AUTH_AGE_SECONDS) return null;

  return fields;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    if (!botToken) return json({ error: 'Telegram not configured' }, 500);

    const { initData } = await req.json().catch(() => ({ initData: null }));
    if (typeof initData !== 'string' || initData.length === 0 || initData.length > 8192) {
      return json({ error: 'initData is required' }, 400);
    }

    // Never trust initDataUnsafe: only the raw string, validated here.
    const fields = await validateInitData(initData, botToken);
    if (!fields) return json({ error: 'Invalid or expired initData' }, 401);

    let telegramUserId: number | null = null;
    let telegramName = '';
    try {
      const user = JSON.parse(fields.user ?? '{}');
      telegramUserId = typeof user.id === 'number' ? user.id : null;
      telegramName = [user.first_name, user.last_name].filter(Boolean).join(' ') || user.username || '';
    } catch {
      telegramUserId = null;
    }
    if (!telegramUserId) return json({ error: 'initData carries no user' }, 401);

    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    // In private chats the chat id equals the user id — that is what the
    // /start CODE webhook stored.
    const { data: link } = await admin
      .from('telegram_links')
      .select('profile_id')
      .eq('chat_id', telegramUserId)
      .maybeSingle();

    if (!link?.profile_id) {
      return json({ status: 'not_linked', telegramName });
    }

    // Offboarding needs no special case: telegram_links.profile_id cascades on
    // profile delete, so resolution above simply fails. access_scope is the real
    // gate — profiles.status is a presence field (sick/vacation/remote), not an
    // account state, and blocking on it would lock out exactly the people taking
    // gear on a business trip.
    const { data: profile } = await admin
      .from('profiles')
      .select('id, name, access_scope, auth_user_id')
      .eq('id', link.profile_id)
      .maybeSingle();

    if (!profile || profile.access_scope !== 'full') {
      return json({ status: 'no_access' });
    }

    const { data: authUser } = await admin.auth.admin.getUserById(profile.auth_user_id);
    const email = authUser?.user?.email;
    if (!email) return json({ status: 'no_access' });

    // Mint the user's own session. generateLink issues a one-time token and
    // verifyOtp redeems it here, so the token never leaves the server — the
    // client receives a session and nothing more.
    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email,
    });
    const tokenHash = linkData?.properties?.hashed_token;
    if (linkError || !tokenHash) {
      console.error('equipment-auth: generateLink failed', linkError);
      return json({ error: 'Could not start a session' }, 500);
    }

    const anon = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      auth: { persistSession: false },
    });
    const { data: verified, error: verifyError } = await anon.auth.verifyOtp({
      type: 'magiclink',
      token_hash: tokenHash,
    });
    if (verifyError || !verified.session) {
      console.error('equipment-auth: verifyOtp failed', verifyError);
      return json({ error: 'Could not start a session' }, 500);
    }

    return json({
      status: 'ok',
      profileName: profile.name,
      session: {
        access_token: verified.session.access_token,
        refresh_token: verified.session.refresh_token,
      },
    });
  } catch (error) {
    console.error('equipment-auth error:', error);
    return json({ error: 'Internal server error' }, 500);
  }
});
