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
    body: JSON.stringify({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  if (!res.ok) {
    throw new Error(`SendPulse auth failed: ${res.status}`);
  }
  const data = await res.json();
  return data.access_token;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Verify caller is authenticated
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('send-email: missing Authorization header');
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const clientId = Deno.env.get('SENDPULSE_CLIENT_ID');
    const clientSecret = Deno.env.get('SENDPULSE_CLIENT_SECRET');
    const senderEmail = Deno.env.get('SENDPULSE_SENDER_EMAIL');
    const senderName = Deno.env.get('SENDPULSE_SENDER_NAME') || 'U24 Media';

    if (!clientId || !clientSecret || !senderEmail) {
      console.error('send-email: missing env vars', {
        clientId: !!clientId,
        clientSecret: !!clientSecret,
        senderEmail: !!senderEmail,
      });
      return new Response(JSON.stringify({ error: 'Email not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Verify JWT
    const jwt = authHeader.replace('Bearer ', '');
    const {
      data: { user },
      error: authError,
    } = await adminClient.auth.getUser(jwt);
    if (authError || !user) {
      console.error('send-email: JWT verification failed', authError?.message);
      return new Response(JSON.stringify({ error: 'Invalid authentication' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('send-email: authenticated as', user.email);

    const { recipientIds, subject, message, link } = await req.json();
    if (!recipientIds?.length || !message || !subject) {
      return new Response(JSON.stringify({ error: 'recipientIds, subject, and message are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Look up emails for the recipients via profiles → auth.users join
    const { data: profiles } = await adminClient.from('profiles').select('auth_user_id').in('id', recipientIds);

    if (!profiles || profiles.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get auth user emails
    const emails: string[] = [];
    for (const profile of profiles) {
      if (!profile.auth_user_id) continue;
      const {
        data: { user: authUser },
      } = await adminClient.auth.admin.getUserById(profile.auth_user_id);
      if (authUser?.email) {
        emails.push(authUser.email);
      }
    }

    if (emails.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get SendPulse access token
    const spToken = await getSendPulseToken(clientId, clientSecret);

    // Build HTML email body
    const buttonHtml = link
      ? `<p style="margin-top:24px"><a href="${link}" style="display:inline-block;padding:10px 20px;background-color:#3b82f6;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:500">Open in app</a></p>`
      : '';

    const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1f2937;padding:24px;max-width:560px;margin:0 auto">
  <p style="font-size:16px;line-height:1.5;margin:0">${message}</p>
  ${buttonHtml}
  <hr style="border:none;border-top:1px solid #e5e7eb;margin-top:32px">
  <p style="font-size:12px;color:#9ca3af;margin-top:12px">${senderName}</p>
</body>
</html>`;

    // Base64 encode with UTF-8 support
    const htmlBase64 = btoa(String.fromCharCode(...new TextEncoder().encode(html)));
    const textBase64 = btoa(String.fromCharCode(...new TextEncoder().encode(message)));

    // Send via SendPulse SMTP API
    let sent = 0;
    await Promise.allSettled(
      emails.map(async (recipientEmail) => {
        const res = await fetch(`${SENDPULSE_API}/smtp/emails`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${spToken}`,
          },
          body: JSON.stringify({
            email: {
              subject,
              from: { name: senderName, email: senderEmail },
              to: [{ email: recipientEmail }],
              html: htmlBase64,
              text: textBase64,
            },
          }),
        });
        if (res.ok) sent++;
        else console.error(`SendPulse send failed for ${recipientEmail}: ${res.status}`, await res.text());
      }),
    );

    return new Response(JSON.stringify({ sent }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('send-email error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
