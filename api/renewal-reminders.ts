// Vercel serverless function. Daily-cron handler that reminds admins about
// accreditations about to expire and subscription payments coming due.
//
// Trigger: Vercel Cron (see vercel.json) at 06:00 UTC = 08:00 Europe/Kyiv — or,
//          on a plan capped at two cron jobs, chained from
//          api/equipment-overdue.ts through runRenewalReminders().
// Auth:    Vercel Cron injects `Authorization: Bearer ${CRON_SECRET}`.
//
// Dedup lives in renewal_reminders, keyed (entity_kind, entity_id, due_date,
// offset_days). Offsets are claimed as a window — everything at or above the
// days remaining — rather than on the exact day, so a skipped run cannot lose
// a reminder and a record added with 12 days left is reported on the next run.
// A changed due date gets fresh reminders for free.
//
// Digest shape is deliberate: every admin gets ONE message listing everything
// that is due, never one message per record.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  ACCREDITATION_KIND_LABEL,
  REMINDER_OFFSETS,
  addDays,
  daysUntil,
  describeCountdown,
  dueOffsets,
  formatMoney,
  todayDateOnly,
  type ReminderOffset,
} from '../lib/renewals';
import { formatDateEU } from '../lib/utils';
import type { AccreditationKind, BillingPeriod, Currency } from '../types';

const REMINDER_TYPE = 'renewal_reminder';
const WINDOW_DAYS = Math.max(...REMINDER_OFFSETS);
/** Claim rows this old refer to due dates long gone; keep the table small. */
const CLAIM_RETENTION_DAYS = 180;

export type RenewalKind = 'accreditation' | 'subscription';

export interface AccreditationRow {
  id: string;
  holder_name: string;
  issuer: string;
  kind: AccreditationKind;
  valid_until: string;
}

export interface SubscriptionRow {
  id: string;
  service_name: string;
  amount: number | string;
  currency: Currency;
  billing_period: BillingPeriod;
  next_payment_date: string;
}

export interface DueEntry {
  kind: RenewalKind;
  id: string;
  dueDate: string;
  days: number;
  offsets: ReminderOffset[];
  line: string;
}

interface ClaimKey {
  entity_kind: RenewalKind;
  entity_id: string;
  due_date: string;
  offset_days: ReminderOffset;
}

export interface RenewalRunSummary {
  scanned: number;
  claimed: number;
  adminsNotified: number;
}

/** Everything inside the reminder window, with the offsets it is due for. Soonest first. */
export function collectDue(
  accreditations: AccreditationRow[],
  subscriptions: SubscriptionRow[],
  now: number,
): DueEntry[] {
  const entries: DueEntry[] = [];

  for (const row of accreditations) {
    const days = daysUntil(row.valid_until, now);
    if (days === null) continue;
    const offsets = dueOffsets(days);
    if (offsets.length === 0) continue;
    const kind = ACCREDITATION_KIND_LABEL[row.kind] ?? 'Other';
    entries.push({
      kind: 'accreditation',
      id: row.id,
      dueDate: row.valid_until,
      days,
      offsets,
      line: `• ${kind} accreditation — ${row.holder_name}, ${row.issuer} (expires ${describeCountdown(days)}, ${formatDateEU(row.valid_until)})`,
    });
  }

  for (const row of subscriptions) {
    const days = daysUntil(row.next_payment_date, now);
    if (days === null) continue;
    // A monthly plan is always within 30 days of its next charge, so the
    // 30-day reminder would fire the morning after every "mark as paid".
    const offsets = dueOffsets(days, { skip30: row.billing_period === 'monthly' });
    if (offsets.length === 0) continue;
    entries.push({
      kind: 'subscription',
      id: row.id,
      dueDate: row.next_payment_date,
      days,
      offsets,
      line: `• ${row.service_name} — ${formatMoney(Number(row.amount), row.currency)} due ${describeCountdown(days)} (${formatDateEU(row.next_payment_date)})`,
    });
  }

  return entries.sort((a, b) => a.days - b.days || a.line.localeCompare(b.line));
}

export function buildDigest(entries: DueEntry[]): string {
  const accreditations = entries.filter((entry) => entry.kind === 'accreditation');
  const subscriptions = entries.filter((entry) => entry.kind === 'subscription');
  const sections: string[] = [];
  if (accreditations.length > 0) {
    const header =
      accreditations.length === 1 ? 'Accreditation expiring' : `${accreditations.length} accreditations expiring`;
    sections.push(`🪪 ${header}\n${accreditations.map((entry) => entry.line).join('\n')}`);
  }
  if (subscriptions.length > 0) {
    const header =
      subscriptions.length === 1 ? 'Subscription payment due' : `${subscriptions.length} subscription payments due`;
    sections.push(`💳 ${header}\n${subscriptions.map((entry) => entry.line).join('\n')}`);
  }
  return sections.join('\n\n');
}

/** Which register the digest should deep-link to. */
export function digestKind(entries: DueEntry[]): RenewalKind | 'mixed' {
  const kinds = new Set(entries.map((entry) => entry.kind));
  if (kinds.size === 1) return entries[0].kind;
  return 'mixed';
}

export async function runRenewalReminders(
  sb: SupabaseClient,
  appOrigin: string,
  now: number,
): Promise<RenewalRunSummary> {
  const today = todayDateOnly(now);
  const horizon = addDays(today, WINDOW_DAYS);

  // 1. Everything active inside the window. The partial indexes serve exactly this.
  const [accreditationsResult, subscriptionsResult] = await Promise.all([
    sb
      .from('accreditations')
      .select('id, holder_name, issuer, kind, valid_until')
      .eq('status', 'active')
      .gte('valid_until', today)
      .lte('valid_until', horizon)
      .returns<AccreditationRow[]>(),
    sb
      .from('subscriptions')
      .select('id, service_name, amount, currency, billing_period, next_payment_date')
      .eq('status', 'active')
      .gte('next_payment_date', today)
      .lte('next_payment_date', horizon)
      .returns<SubscriptionRow[]>(),
  ]);
  if (accreditationsResult.error) {
    throw new Error(`accreditations query failed: ${accreditationsResult.error.message}`);
  }
  if (subscriptionsResult.error) {
    throw new Error(`subscriptions query failed: ${subscriptionsResult.error.message}`);
  }

  const candidates = collectDue(accreditationsResult.data ?? [], subscriptionsResult.data ?? [], now);
  const summary: RenewalRunSummary = { scanned: candidates.length, claimed: 0, adminsNotified: 0 };
  if (candidates.length === 0) return summary;

  // 2. Claim before sending. The primary key makes a second concurrent run lose
  //    with 23505 instead of double-sending. An entry is reported once per run
  //    however many of its offsets are newly claimed.
  const claimed: DueEntry[] = [];
  const claimedKeys: ClaimKey[] = [];
  for (const entry of candidates) {
    let won = false;
    for (const offset of entry.offsets) {
      const key: ClaimKey = {
        entity_kind: entry.kind,
        entity_id: entry.id,
        due_date: entry.dueDate,
        offset_days: offset,
      };
      const { error } = await sb.from('renewal_reminders').insert(key);
      if (!error) {
        won = true;
        claimedKeys.push(key);
      } else if (error.code !== '23505') {
        console.error('renewal-reminders: claim failed', error);
      }
    }
    if (won) claimed.push(entry);
  }
  summary.claimed = claimed.length;
  if (claimed.length === 0) return summary;

  // 3. Recipients: every full-access admin, minus per-channel opt-outs.
  //    Opt-out model: absence of a row means enabled.
  const { data: admins } = await sb
    .from('profiles')
    .select('id')
    .eq('role', 'admin')
    .eq('access_scope', 'full')
    .returns<{ id: string }[]>();
  const adminIds = (admins ?? []).map((row) => row.id);

  const { data: prefRows } = await sb
    .from('notification_preferences')
    .select('user_id, channel, enabled')
    .eq('category', 'renewals')
    .in('user_id', adminIds)
    .returns<{ user_id: string; channel: 'in_app' | 'telegram' | 'email'; enabled: boolean }[]>();
  const optOut = { in_app: new Set<string>(), telegram: new Set<string>() };
  for (const row of prefRows ?? []) {
    if (row.enabled === false && row.channel !== 'email') optOut[row.channel].add(row.user_id);
  }

  // 4. One digest per admin.
  const message = buildDigest(claimed);
  const kind = digestKind(claimed);
  const link = `${appOrigin}/tools${kind === 'mixed' ? '' : kind === 'accreditation' ? '/accreditations' : '/subscriptions'}`;
  const entityData = {
    renewalKind: kind,
    accreditationCount: claimed.filter((entry) => entry.kind === 'accreditation').length,
    subscriptionCount: claimed.filter((entry) => entry.kind === 'subscription').length,
    digest: true,
  };

  const inAppRows = adminIds
    .filter((id) => !optOut.in_app.has(id))
    .map((id) => ({ recipient_id: id, actor_id: null, type: REMINDER_TYPE, message, entity_data: entityData }));
  const telegramRecipients = adminIds.filter((id) => !optOut.telegram.has(id));

  let delivered = false;
  if (inAppRows.length > 0) {
    const { error: insertError } = await sb.from('notifications').insert(inAppRows);
    if (insertError) console.error('renewal-reminders: notifications insert failed', insertError);
    else delivered = true;
  }
  if (telegramRecipients.length > 0) {
    try {
      const response = await sb.functions.invoke('send-telegram', {
        body: { recipientIds: telegramRecipients, type: REMINDER_TYPE, message, link },
      });
      if (response.error) console.error('renewal-reminders: telegram send failed', response.error);
      else delivered = true;
    } catch (error) {
      console.error('renewal-reminders: telegram send failed', error);
    }
  }

  if (!delivered) {
    // No channel accepted the digest; release the claims so the next run retries.
    for (const key of claimedKeys) {
      await sb.from('renewal_reminders').delete().match(key);
    }
    return { ...summary, claimed: 0 };
  }
  summary.adminsNotified = new Set([...inAppRows.map((row) => row.recipient_id), ...telegramRecipients]).size;

  // 5. Housekeeping, best effort.
  const cutoff = new Date(now - CLAIM_RETENTION_DAYS * 86_400_000).toISOString();
  await sb.from('renewal_reminders').delete().lt('sent_at', cutoff);

  return summary;
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
  try {
    const result = await runRenewalReminders(sb, appOrigin, Date.now());
    return res.status(200).json(result);
  } catch (error) {
    console.error('renewal-reminders: run failed', error);
    return res.status(500).json({ error: 'Renewal reminders failed' });
  }
}
