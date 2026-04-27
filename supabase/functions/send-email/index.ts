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

    // Allow trusted server-to-server callers (e.g. Vercel cron) to authenticate
    // with the service role key directly. Otherwise verify a user JWT.
    const jwt = authHeader.replace('Bearer ', '');
    if (jwt !== supabaseServiceKey) {
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
    } else {
      console.log('send-email: authenticated via service role');
    }

    const { recipientIds, subject, message, link, taskDetails } = await req.json();
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

    // Format date helper (European DD/MM/YYYY)
    const fmtDate = (iso: string) => {
      try {
        const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(iso + 'T00:00:00') : new Date(iso);
        if (isNaN(d.getTime())) return iso;
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        return `${dd}/${mm}/${d.getFullYear()}`;
      } catch {
        return iso;
      }
    };

    // Priority colors matching app design system (zinc-based)
    const priorityColors: Record<string, { bg: string; text: string; dot: string }> = {
      high: { bg: '#fef2f2', text: '#dc2626', dot: '#ef4444' },
      medium: { bg: '#fefce8', text: '#ca8a04', dot: '#eab308' },
      low: { bg: '#fafafa', text: '#71717a', dot: '#a1a1aa' },
    };

    // Build task details block
    let detailsHtml = '';
    if (taskDetails && (taskDetails.teamName || taskDetails.dueDate || taskDetails.priority || taskDetails.status)) {
      const pColor = taskDetails.priority ? priorityColors[taskDetails.priority] || priorityColors.low : null;
      const rows: string[] = [];
      if (taskDetails.teamName) {
        rows.push(`<tr>
          <td style="padding:8px 12px;color:#71717a;font-size:12px;white-space:nowrap">Team</td>
          <td style="padding:8px 12px;font-size:13px;color:#18181b;font-weight:500">${taskDetails.teamName}</td>
        </tr>`);
      }
      if (taskDetails.dueDate) {
        rows.push(`<tr>
          <td style="padding:8px 12px;color:#71717a;font-size:12px;white-space:nowrap">Due date</td>
          <td style="padding:8px 12px;font-size:13px;color:#18181b">${fmtDate(taskDetails.dueDate)}</td>
        </tr>`);
      }
      if (taskDetails.priority && pColor) {
        rows.push(`<tr>
          <td style="padding:8px 12px;color:#71717a;font-size:12px;white-space:nowrap">Priority</td>
          <td style="padding:8px 12px">
            <span style="display:inline-flex;align-items:center;gap:6px;font-size:13px;color:${pColor.text}">
              <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${pColor.dot}"></span>
              ${taskDetails.priority.charAt(0).toUpperCase() + taskDetails.priority.slice(1)}
            </span>
          </td>
        </tr>`);
      }
      if (taskDetails.status) {
        rows.push(`<tr>
          <td style="padding:8px 12px;color:#71717a;font-size:12px;white-space:nowrap">Status</td>
          <td style="padding:8px 12px;font-size:13px;color:#18181b">${taskDetails.status}</td>
        </tr>`);
      }
      detailsHtml = `<table style="width:100%;border-collapse:collapse;margin-top:16px;border:1px solid #e4e4e7;border-radius:8px;overflow:hidden">
        <tbody>${rows.join('<tr><td colspan="2" style="border-top:1px solid #f4f4f5"></td></tr>')}</tbody>
      </table>`;
    }

    // Build button
    const buttonHtml = link
      ? `<div style="margin-top:24px"><a href="${link}" style="display:inline-block;padding:10px 24px;background-color:#18181b;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:500;font-size:13px">Open in app</a></div>`
      : '';

    const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#fafafa;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <div style="max-width:560px;margin:32px auto;background:#ffffff;border:1px solid #e4e4e7;border-radius:12px;overflow:hidden">
    <div style="padding:32px 32px 24px">
      <p style="font-size:15px;line-height:1.6;color:#27272a;margin:0">${message}</p>
      ${detailsHtml}
      ${buttonHtml}
    </div>
    <div style="padding:16px 32px;border-top:1px solid #f4f4f5;background:#fafafa">
      <p style="font-size:11px;color:#a1a1aa;margin:0">${senderName}</p>
    </div>
  </div>
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
