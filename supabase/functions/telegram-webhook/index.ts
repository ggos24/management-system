import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const TELEGRAM_API = 'https://api.telegram.org/bot';

async function sendTelegramMessage(botToken: string, chatId: number, text: string, replyMarkup?: unknown) {
  await fetch(`${TELEGRAM_API}${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    }),
  });
}

/**
 * A one-tap launcher for the equipment Mini App.
 *
 * Without this the only route in is the bot's profile page, which is three
 * taps and not somewhere anyone thinks to look while standing at a shelf.
 * web_app buttons open the Mini App in place, inside the chat.
 */
function equipmentLauncher(appOrigin: string) {
  return {
    inline_keyboard: [[{ text: '📦 Open equipment', web_app: { url: `${appOrigin}/equipment/scan` } }]],
  };
}

Deno.serve(async (req) => {
  // Only accept POST from Telegram servers
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  // Verify Telegram webhook secret (backwards-compatible: skipped if env var not set)
  const secretToken = Deno.env.get('TELEGRAM_WEBHOOK_SECRET');
  if (secretToken) {
    const provided = req.headers.get('X-Telegram-Bot-Api-Secret-Token');
    if (provided !== secretToken) {
      return new Response('Forbidden', { status: 403 });
    }
  }

  try {
    const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
    if (!botToken) {
      return new Response('Bot token not configured', { status: 500 });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    const update = await req.json();
    const message = update?.message;
    if (!message?.text || !message?.chat?.id) {
      return new Response('OK', { status: 200 });
    }

    const chatId = message.chat.id;
    const text = message.text.trim();
    const appOrigin = Deno.env.get('PUBLIC_APP_ORIGIN') ?? 'https://unities.pro';

    // Launch shortcuts. Only useful once linked — an unlinked chat opening the
    // Mini App would just meet the "not linked" wall, so say so here instead.
    if (text === '/gear' || text === '/equipment') {
      const { data: linked } = await adminClient
        .from('telegram_links')
        .select('id')
        .eq('chat_id', chatId)
        .maybeSingle();
      if (!linked) {
        await sendTelegramMessage(
          botToken,
          chatId,
          '🔗 This chat is not linked to a UNITIES profile yet. Ask an admin for a link code, then send <code>/start YOUR_CODE</code>.',
        );
        return new Response('OK', { status: 200 });
      }
      await sendTelegramMessage(
        botToken,
        chatId,
        '📦 <b>Equipment</b>\n\nScan a sticker, take or return gear.',
        equipmentLauncher(appOrigin),
      );
      return new Response('OK', { status: 200 });
    }

    // Handle /start CODE
    if (text.startsWith('/start ')) {
      const code = text.replace('/start ', '').trim().toUpperCase();
      if (!code || code.length !== 6) {
        await sendTelegramMessage(botToken, chatId, '❌ Invalid code. Please use the 6-character code from Settings.');
        return new Response('OK', { status: 200 });
      }

      // Look up the link code
      const { data: linkRow, error: lookupError } = await adminClient
        .from('telegram_links')
        .select('id, profile_id, chat_id')
        .eq('link_code', code)
        .single();

      if (lookupError || !linkRow) {
        await sendTelegramMessage(
          botToken,
          chatId,
          '❌ Code not found or expired. Please generate a new code in Settings.',
        );
        return new Response('OK', { status: 200 });
      }

      if (linkRow.chat_id) {
        await sendTelegramMessage(
          botToken,
          chatId,
          '⚠️ This account is already linked. Use /unlink first if you want to re-link.',
        );
        return new Response('OK', { status: 200 });
      }

      // Store the chat_id and mark as linked
      const { error: updateError } = await adminClient
        .from('telegram_links')
        .update({
          chat_id: chatId,
          linked_at: new Date().toISOString(),
          link_code: null, // Clear the code after use
        })
        .eq('id', linkRow.id);

      if (updateError) {
        await sendTelegramMessage(botToken, chatId, '❌ Something went wrong. Please try again.');
        return new Response('OK', { status: 200 });
      }

      await sendTelegramMessage(
        botToken,
        chatId,
        '✅ <b>Linked!</b> You will now receive notifications here.\n\nUse /gear to open equipment, /unlink to disconnect.',
        equipmentLauncher(appOrigin),
      );
      return new Response('OK', { status: 200 });
    }

    // Handle /unlink
    if (text === '/unlink') {
      const { data: linkRow } = await adminClient.from('telegram_links').select('id').eq('chat_id', chatId).single();

      if (!linkRow) {
        await sendTelegramMessage(botToken, chatId, 'ℹ️ No account is linked to this chat.');
        return new Response('OK', { status: 200 });
      }

      await adminClient
        .from('telegram_links')
        .update({ chat_id: null, linked_at: null, link_code: null })
        .eq('id', linkRow.id);

      await sendTelegramMessage(botToken, chatId, '✅ Unlinked. You will no longer receive notifications here.');
      return new Response('OK', { status: 200 });
    }

    // Handle /start without code
    if (text === '/start') {
      const { data: linked } = await adminClient
        .from('telegram_links')
        .select('id')
        .eq('chat_id', chatId)
        .maybeSingle();
      if (linked) {
        // Already linked: the useful thing is a way in, not setup instructions.
        await sendTelegramMessage(
          botToken,
          chatId,
          '👋 <b>You are linked.</b>\n\nUse /gear any time to open equipment.',
          equipmentLauncher(appOrigin),
        );
        return new Response('OK', { status: 200 });
      }
      await sendTelegramMessage(
        botToken,
        chatId,
        '👋 <b>Welcome!</b>\n\nTo link your account, ask an admin for a link code (or generate one in Settings → Notifications), then send:\n\n<code>/start YOUR_CODE</code>',
      );
      return new Response('OK', { status: 200 });
    }

    // Unknown command
    await sendTelegramMessage(
      botToken,
      chatId,
      'Available commands:\n/gear — Open equipment\n/start CODE — Link your account\n/unlink — Disconnect notifications',
    );
    return new Response('OK', { status: 200 });
  } catch (err) {
    console.error('Webhook error:', err);
    return new Response('OK', { status: 200 }); // Always return 200 to Telegram
  }
});
