import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const TELEGRAM_API = 'https://api.telegram.org/bot';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Verify caller is authenticated
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
    if (!botToken) {
      return new Response(JSON.stringify({ error: 'Telegram not configured' }), {
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
      return new Response(JSON.stringify({ error: 'Invalid authentication' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { recipientIds, message } = await req.json();
    console.log('send-telegram called:', { recipientIds, message });

    if (!recipientIds?.length || !message) {
      console.log('send-telegram: missing recipientIds or message');
      return new Response(JSON.stringify({ error: 'recipientIds and message are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Look up linked chat_ids for the recipients
    const { data: links, error: linksError } = await adminClient
      .from('telegram_links')
      .select('chat_id')
      .in('profile_id', recipientIds)
      .not('chat_id', 'is', null);

    console.log('send-telegram links lookup:', { links, linksError });

    if (!links || links.length === 0) {
      console.log('send-telegram: no linked chats found for recipients');
      return new Response(JSON.stringify({ sent: 0 }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Send to each linked chat (fire-and-forget, best-effort)
    let sent = 0;
    await Promise.allSettled(
      links.map(async (link) => {
        console.log('send-telegram: sending to chat_id', link.chat_id);
        const res = await fetch(`${TELEGRAM_API}${botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: link.chat_id,
            text: message,
            parse_mode: 'HTML',
          }),
        });
        const resBody = await res.text();
        console.log('send-telegram: Telegram API response:', res.status, resBody);
        if (res.ok) sent++;
      }),
    );

    console.log('send-telegram: done, sent', sent);
    return new Response(JSON.stringify({ sent }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('send-telegram error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
