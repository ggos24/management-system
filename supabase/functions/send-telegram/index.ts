import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  authorizeNotificationRecipients,
  claimExternalNotificationDeliveries,
  claimRestrictedTaskNotificationDeliveries,
  markExternalNotificationDeliverySent,
  markRestrictedTaskNotificationDeliverySent,
} from '../_shared/notification-auth.ts';

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

    // Only the exact configured service key is trusted server-to-server. Merely
    // decoding an unverified JWT `role` claim would allow a forged bypass.
    const jwt = authHeader.replace('Bearer ', '');
    const serviceCaller = jwt === supabaseServiceKey;
    let callerAuthUserId: string | null = null;
    if (!serviceCaller) {
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
      callerAuthUserId = user.id;
    }

    const {
      recipientIds: requestedRecipientIds,
      message,
      link,
      type,
      taskId,
      contextTeamId,
      commentId,
    } = await req.json();
    if (!requestedRecipientIds?.length || !message) {
      return new Response(JSON.stringify({ error: 'recipientIds and message are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const authorization = await authorizeNotificationRecipients({
      adminClient,
      serviceCaller,
      callerAuthUserId,
      recipientIds: requestedRecipientIds,
      type,
      taskId,
      contextTeamId,
      commentId,
      channel: 'telegram',
    });
    if (authorization.error) {
      return new Response(JSON.stringify({ error: authorization.error }), {
        status: authorization.status ?? 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const recipientIds = authorization.recipientIds;
    if (recipientIds.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const outboundMessage = authorization.externalPayload?.message ?? message;
    const outboundLink = authorization.externalPayload ? authorization.externalPayload.link : link;

    // Look up linked chat_ids for the recipients
    const { data: links } = await adminClient
      .from('telegram_links')
      .select('profile_id, chat_id')
      .in('profile_id', recipientIds)
      .not('chat_id', 'is', null);

    if (!links || links.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    let deliverableLinks = links;
    const claimTargetIds = new Set(authorization.mentionClaimRecipientIds ?? []);
    const linkedClaimTargetIds = links
      .map((telegramLink) => telegramLink.profile_id)
      .filter((profileId) => claimTargetIds.has(profileId));
    if (linkedClaimTargetIds.length > 0) {
      const claimedIds = new Set(
        await claimExternalNotificationDeliveries(adminClient, linkedClaimTargetIds, commentId, 'telegram'),
      );
      deliverableLinks = links.filter(
        (telegramLink) => !claimTargetIds.has(telegramLink.profile_id) || claimedIds.has(telegramLink.profile_id),
      );
      if (deliverableLinks.length === 0) {
        return new Response(JSON.stringify({ sent: 0 }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }
    const restrictedTaskClaimTargetIds = new Set(authorization.restrictedTaskClaimRecipientIds ?? []);
    const linkedRestrictedTaskClaimIds = links
      .map((telegramLink) => telegramLink.profile_id)
      .filter((profileId) => restrictedTaskClaimTargetIds.has(profileId));
    const restrictedTaskClaims =
      linkedRestrictedTaskClaimIds.length > 0
        ? await claimRestrictedTaskNotificationDeliveries(
            adminClient,
            linkedRestrictedTaskClaimIds,
            taskId,
            contextTeamId,
            type,
            'telegram',
          )
        : new Map<string, string>();
    if (linkedRestrictedTaskClaimIds.length > 0) {
      deliverableLinks = deliverableLinks.filter(
        (telegramLink) =>
          !restrictedTaskClaimTargetIds.has(telegramLink.profile_id) ||
          restrictedTaskClaims.has(telegramLink.profile_id),
      );
      if (deliverableLinks.length === 0) {
        return new Response(JSON.stringify({ sent: 0 }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Build payload with optional inline keyboard button
    const payload: Record<string, unknown> = {
      text: outboundMessage,
    };
    if (outboundLink) {
      payload.reply_markup = {
        inline_keyboard: [[{ text: '📋 Open in app', url: outboundLink }]],
      };
    }

    // Send to each linked chat in parallel; only successful claims are marked sent.
    let sent = 0;
    await Promise.allSettled(
      deliverableLinks.map(async (tgLink) => {
        const res = await fetch(`${TELEGRAM_API}${botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payload, chat_id: tgLink.chat_id }),
        });
        if (res.ok) {
          sent++;
          if (claimTargetIds.has(tgLink.profile_id)) {
            await markExternalNotificationDeliverySent(adminClient, tgLink.profile_id, commentId, 'telegram');
          }
          const restrictedTaskClaimId = restrictedTaskClaims.get(tgLink.profile_id);
          if (restrictedTaskClaimId) {
            await markRestrictedTaskNotificationDeliverySent(adminClient, restrictedTaskClaimId);
          }
        }
      }),
    );

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
