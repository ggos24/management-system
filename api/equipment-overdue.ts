// Vercel serverless function. Daily-cron handler that chases equipment which
// was due back and has not been returned.
//
// Trigger: Vercel Cron (see vercel.json) at 06:00 UTC = 08:00 Europe/Kyiv.
// Auth:    Vercel Cron injects `Authorization: Bearer ${CRON_SECRET}`.
//
// Overdue means "not back by morning" — a 40-minute delay mid-shoot is noise,
// so this runs once a day even though expected_return_at has time precision.
// The live "2h overdue" badge in the registry is computed client-side and needs
// no cron at all.
//
// Digest shape is deliberate: each holder gets ONE message listing everything
// they owe, and admins get ONE message listing everyone. Per-item messages would
// get the category muted in Settings within a week.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const OVERDUE_TYPE = 'equipment_overdue';

// Re-ping window. Shorter than 24h so a cron that slips a little still fires,
// longer than the gap between two same-day runs so nobody gets pinged twice.
const REPING_HOURS = 20;

interface CheckoutRow {
  id: string;
  item_id: string;
  holder_id: string | null;
  holder_name: string;
  expected_return_at: string;
  purpose: string | null;
  equipment_items: { asset_code: string; name: string } | null;
}

/**
 * Hours below a day, whole days above it. Rounding everything up to "1d" would
 * report a camera due at 18:00 as a day late at the 06:00 run, which reads as
 * far more alarming than twelve hours.
 */
export function formatLateness(due: string, now: number): string {
  const ms = now - new Date(due).getTime();
  if (ms < 3_600_000) return 'just overdue';
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 24) return `${hours}h overdue`;
  return `${Math.floor(hours / 24)}d overdue`;
}

function describe(row: CheckoutRow, now: number): string {
  const item = row.equipment_items;
  const label = item ? `${item.asset_code} — ${item.name}` : 'Unknown item';
  return `• ${label} (${formatLateness(row.expected_return_at, now)})`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || req.headers.authorization !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const appOrigin = process.env.PUBLIC_APP_ORIGIN;
  if (!supabaseUrl || !serviceKey || !appOrigin) {
    return res.status(500).json({ error: 'Server not configured' });
  }

  const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const repingCutoff = new Date(now - REPING_HOURS * 3_600_000).toISOString();

  // 1. Everything still out and past its due time. A NULL expected_return_at is
  //    a long-term assignment and is never overdue.
  const { data: candidates, error: queryError } = await sb
    .from('equipment_checkouts')
    .select('id, item_id, holder_id, holder_name, expected_return_at, purpose, equipment_items(asset_code, name)')
    .is('checked_in_at', null)
    .not('expected_return_at', 'is', null)
    .lt('expected_return_at', nowIso)
    .returns<CheckoutRow[]>();

  if (queryError) {
    console.error('equipment-overdue: query failed', queryError);
    return res.status(500).json({ error: 'Query failed' });
  }
  if (!candidates || candidates.length === 0) {
    return res.status(200).json({ overdue: 0, holdersNotified: 0, adminsNotified: 0 });
  }

  // 2. Claim before sending. A conditional UPDATE ... RETURNING is atomic, so two
  //    concurrent cron invocations cannot both win the same row.
  const { data: claimed, error: claimError } = await sb
    .from('equipment_checkouts')
    .update({ last_overdue_ping_at: nowIso })
    .in(
      'id',
      candidates.map((row) => row.id),
    )
    .or(`last_overdue_ping_at.is.null,last_overdue_ping_at.lt.${repingCutoff}`)
    .select('id')
    .returns<{ id: string }[]>();

  if (claimError) {
    console.error('equipment-overdue: claim failed', claimError);
    return res.status(500).json({ error: 'Claim failed' });
  }
  const claimedIds = new Set((claimed ?? []).map((row) => row.id));
  const due = candidates.filter((row) => claimedIds.has(row.id));
  if (due.length === 0) {
    return res.status(200).json({ overdue: candidates.length, holdersNotified: 0, adminsNotified: 0 });
  }

  // 3. Recipients: every holder with something outstanding, plus every admin.
  const holderIds = [...new Set(due.map((row) => row.holder_id).filter((id): id is string => Boolean(id)))];
  const { data: admins } = await sb
    .from('profiles')
    .select('id')
    .eq('role', 'admin')
    .eq('access_scope', 'full')
    .returns<{ id: string }[]>();
  const adminIds = (admins ?? []).map((row) => row.id);

  // Opt-out model: absence of a row means enabled.
  const { data: prefRows } = await sb
    .from('notification_preferences')
    .select('user_id, channel, enabled')
    .eq('category', 'equipment')
    .in('user_id', [...new Set([...holderIds, ...adminIds])])
    .returns<{ user_id: string; channel: 'in_app' | 'telegram' | 'email'; enabled: boolean }[]>();
  const optOut = { in_app: new Set<string>(), telegram: new Set<string>() };
  for (const row of prefRows ?? []) {
    if (row.enabled === false && row.channel !== 'email') optOut[row.channel].add(row.user_id);
  }

  const link = `${appOrigin}/equipment`;
  const inAppRows: { recipient_id: string; actor_id: null; type: string; message: string; entity_data: unknown }[] = [];
  const telegramSends: Promise<unknown>[] = [];

  const dispatch = (recipientId: string, message: string, entityData: Record<string, unknown>) => {
    if (!optOut.in_app.has(recipientId)) {
      inAppRows.push({
        recipient_id: recipientId,
        actor_id: null,
        type: OVERDUE_TYPE,
        message,
        entity_data: entityData,
      });
    }
    if (!optOut.telegram.has(recipientId)) {
      telegramSends.push(
        Promise.resolve(
          sb.functions.invoke('send-telegram', {
            body: { recipientIds: [recipientId], type: OVERDUE_TYPE, message, link },
          }),
        ),
      );
    }
  };

  // 4a. One message per holder, listing everything they owe.
  let holdersNotified = 0;
  for (const holderId of holderIds) {
    const mine = due.filter((row) => row.holder_id === holderId);
    const header = mine.length === 1 ? '⏰ Equipment overdue' : `⏰ ${mine.length} items overdue`;
    dispatch(holderId, `${header}\n${mine.map((row) => describe(row, now)).join('\n')}`, {
      itemId: mine[0].item_id,
      overdueCount: mine.length,
    });
    holdersNotified++;
  }

  // 4b. One digest per admin, covering everyone. Admins who are themselves
  //     holders already got their personal list above; the digest is the
  //     manager view, so it still lists every unit including their own.
  const digest = due.map((row) => `${describe(row, now)} — ${row.holder_name}`).join('\n');
  let adminsNotified = 0;
  for (const adminId of adminIds) {
    dispatch(adminId, `⏰ ${due.length} equipment item(s) overdue\n${digest}`, {
      itemId: due[0].item_id,
      overdueCount: due.length,
      digest: true,
    });
    adminsNotified++;
  }

  if (inAppRows.length > 0) {
    const { error: insertError } = await sb.from('notifications').insert(inAppRows);
    if (insertError) console.error('equipment-overdue: notifications insert failed', insertError);
  }
  const results = await Promise.allSettled(telegramSends);
  for (const result of results) {
    if (result.status === 'rejected') console.error('equipment-overdue: telegram send failed', result.reason);
  }

  return res.status(200).json({ overdue: due.length, holdersNotified, adminsNotified });
}
