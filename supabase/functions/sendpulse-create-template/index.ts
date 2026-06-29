// sendpulse-create-template — push generated weekly-digest HTML into SendPulse as a reusable template
// (POST /template). This never sends anything — the admin builds a campaign from the template in SendPulse.
// Admin-only. Reuses the SendPulse OAuth pattern + credentials from the send-email function.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SENDPULSE_API = 'https://api.sendpulse.com';

async function getSendPulseToken(clientId: string, clientSecret: string): Promise<string> {
  const res = await fetch(`${SENDPULSE_API}/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret }),
  });
  if (!res.ok) throw new Error(`SendPulse auth failed: ${res.status}`);
  const data = await res.json();
  return data.access_token;
}

function base64Utf8(s: string): string {
  // Base64-encode UTF-8 HTML (handles non-ASCII characters in titles/leads).
  const bytes = new TextEncoder().encode(s);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const clientId = Deno.env.get('SENDPULSE_CLIENT_ID');
    const clientSecret = Deno.env.get('SENDPULSE_CLIENT_SECRET');
    if (!clientId || !clientSecret) {
      return new Response(JSON.stringify({ error: 'SendPulse not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    const jwt = authHeader.replace('Bearer ', '');
    const {
      data: { user },
      error: authError,
    } = await adminClient.auth.getUser(jwt);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid authentication' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: profile } = await adminClient.from('profiles').select('role').eq('auth_user_id', user.id).single();
    if (profile?.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Admin access required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { html, name } = await req.json();
    if (!html || typeof html !== 'string') {
      return new Response(JSON.stringify({ error: 'html is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = await getSendPulseToken(clientId, clientSecret);
    const res = await fetch(`${SENDPULSE_API}/template`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ body: base64Utf8(html), name: name || 'Weekly Digest', lang: 'en' }),
    });

    const payload = await res.json().catch(() => ({}));
    if (!res.ok || payload?.result === false) {
      console.error('SendPulse template create failed', res.status, payload);
      return new Response(JSON.stringify({ error: 'SendPulse rejected the template', detail: payload }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // SendPulse returns the new template id as `real_id` (and/or `id`).
    const templateId = payload?.real_id ?? payload?.id ?? null;
    return new Response(JSON.stringify({ ok: true, templateId, raw: payload }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('sendpulse-create-template error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
