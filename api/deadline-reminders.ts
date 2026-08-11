// Vercel serverless function. Daily-cron handler that fires deadline
// reminders 3 days and 1 day before each task's due_date.
//
// Trigger: Vercel Cron (see vercel.json) at 06:00 UTC = 08:00 Europe/Kyiv.
// Auth:    Vercel Cron injects `Authorization: Bearer ${CRON_SECRET}`.
//
// Reuses the existing send-telegram + send-email Supabase Edge Functions
// (which were extended to accept the service role key as Bearer auth).
// Dedup is enforced by the (task_id, due_date, offset_days) PK on
// task_deadline_reminders — re-running the cron is idempotent.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

type Offset = 1 | 3;

interface TaskRow {
  id: string;
  title: string;
  team_id: string;
  due_date: string; // YYYY-MM-DD
  status_id: string | null;
  priority: string | null;
  task_assignees: { member_id: string }[];
}

interface TeamStatusRow {
  id: string;
  team_id: string;
  name: string;
  category: string; // 'active' | 'completed' | 'ignored'
}

interface ReminderRow {
  task_id: string;
  due_date: string;
  offset_days: Offset;
}

const REMINDER_TYPE = 'task_deadline_reminder';

function offsetForDueDate(dueDate: string): Offset | null {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const due = new Date(dueDate + 'T00:00:00Z');
  const days = Math.round((due.getTime() - today.getTime()) / 86_400_000);
  return days === 1 || days === 3 ? (days as Offset) : null;
}

function buildMessage(title: string, offset: Offset): string {
  const when = offset === 1 ? 'tomorrow' : 'in 3 days';
  return `⏰ Task due ${when}: ${title}`;
}

function buildSubject(title: string, offset: Offset): string {
  const when = offset === 1 ? 'tomorrow' : 'in 3 days';
  return `Task due ${when} — ${title}`;
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

  // 1. Pull every task whose due_date is exactly today+1 or today+3.
  //    Postgres date math runs in the DB's timezone (UTC on Supabase).
  const { data: tasks, error: tasksErr } = await sb
    .from('tasks')
    .select('id, title, team_id, due_date, status_id, priority, task_assignees(member_id)')
    .is('deleted_at', null)
    .in('due_date', [
      new Date(Date.now() + 1 * 86_400_000).toISOString().slice(0, 10),
      new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10),
    ])
    .returns<TaskRow[]>();

  if (tasksErr) {
    console.error('deadline-reminders: tasks query failed', tasksErr);
    return res.status(500).json({ error: 'Query failed' });
  }
  if (!tasks || tasks.length === 0) {
    return res.status(200).json({ sent: { 1: 0, 3: 0 }, scanned: 0 });
  }

  // 2. Build a Set of completed status IDs to filter out done tasks.
  //    Mirrors stores/dataStore.ts:38 resolveDoneDate semantics.
  const teamIds = [...new Set(tasks.map((t) => t.team_id))];
  const { data: statuses } = await sb
    .from('team_statuses')
    .select('id, team_id, name, category')
    .in('team_id', teamIds)
    .returns<TeamStatusRow[]>();
  const completedStatusIds = new Set((statuses ?? []).filter((s) => s.category === 'completed').map((s) => s.id));

  // 3. Filter out completed tasks and tasks with no assignees.
  const live = tasks.filter(
    (t) => (!t.status_id || !completedStatusIds.has(t.status_id)) && (t.task_assignees?.length ?? 0) > 0,
  );
  if (live.length === 0) {
    return res.status(200).json({ sent: { 1: 0, 3: 0 }, scanned: tasks.length });
  }

  // 4. Filter out (task, offset) combos already sent.
  const candidateKeys = live
    .map((t) => {
      const o = offsetForDueDate(t.due_date);
      return o ? { task_id: t.id, due_date: t.due_date, offset_days: o } : null;
    })
    .filter((x): x is ReminderRow => x !== null);

  const { data: alreadySent } = await sb
    .from('task_deadline_reminders')
    .select('task_id, due_date, offset_days')
    .in(
      'task_id',
      candidateKeys.map((k) => k.task_id),
    )
    .returns<ReminderRow[]>();
  const sentKey = new Set((alreadySent ?? []).map((r) => `${r.task_id}::${r.due_date}::${r.offset_days}`));

  const pending = live
    .map((t) => {
      const offset = offsetForDueDate(t.due_date);
      if (!offset) return null;
      const key = `${t.id}::${t.due_date}::${offset}`;
      if (sentKey.has(key)) return null;
      return { task: t, offset };
    })
    .filter((x): x is { task: TaskRow; offset: Offset } => x !== null);

  if (pending.length === 0) {
    return res.status(200).json({ sent: { 1: 0, 3: 0 }, scanned: tasks.length });
  }

  // 5. Look up per-channel notification preferences for involved members.
  //    Opt-out model: absence of a row = enabled.
  const allMemberIds = [...new Set(pending.flatMap(({ task }) => task.task_assignees.map((a) => a.member_id)))];
  const { data: prefRows } = await sb
    .from('notification_preferences')
    .select('user_id, channel, enabled')
    .eq('category', 'deadlines')
    .in('user_id', allMemberIds)
    .returns<{ user_id: string; channel: 'in_app' | 'telegram' | 'email'; enabled: boolean }[]>();
  const optOut = {
    in_app: new Set<string>(),
    telegram: new Set<string>(),
    email: new Set<string>(),
  };
  for (const r of prefRows ?? []) {
    if (r.enabled === false) optOut[r.channel].add(r.user_id);
  }

  // 6. Atomically claim then dispatch each (task, offset). Claiming before any
  // channel prevents concurrent cron invocations from double-sending.
  const counters: Record<Offset, number> = { 1: 0, 3: 0 };

  for (const { task, offset } of pending) {
    const recipientIds = task.task_assignees.map((a) => a.member_id);
    const message = buildMessage(task.title, offset);
    const subject = buildSubject(task.title, offset);
    const link = `${appOrigin}/workspace?task=${encodeURIComponent(task.id)}&context=${encodeURIComponent(task.team_id)}`;
    const entityData = { taskId: task.id, teamId: task.team_id, priority: task.priority, offsetDays: offset };

    const reminderKey = { task_id: task.id, due_date: task.due_date, offset_days: offset };
    const { error: claimError } = await sb.from('task_deadline_reminders').insert(reminderKey);
    if (claimError) {
      if (claimError.code !== '23505') {
        console.error(`deadline-reminders: claim failed for ${task.id}`, claimError);
      }
      continue;
    }

    // 6a. Bulk in-app notifications (respect in_app opt-out).
    const inAppRecipients = recipientIds.filter((id) => !optOut.in_app.has(id));
    if (inAppRecipients.length > 0) {
      const { error: insertErr } = await sb.from('notifications').insert(
        inAppRecipients.map((rid) => ({
          recipient_id: rid,
          actor_id: null,
          type: REMINDER_TYPE,
          message,
          entity_data: entityData,
        })),
      );
      if (insertErr) {
        console.error(`deadline-reminders: notifications insert failed for ${task.id}`, insertErr);
        await sb
          .from('task_deadline_reminders')
          .delete()
          .eq('task_id', task.id)
          .eq('due_date', task.due_date)
          .eq('offset_days', offset);
        continue;
      }
    }

    const channelDeliveries: Promise<unknown>[] = [];

    // 6b. Telegram (respect opt-out).
    const tgRecipients = recipientIds.filter((id) => !optOut.telegram.has(id));
    if (tgRecipients.length > 0) {
      channelDeliveries.push(
        Promise.resolve(
          sb.functions.invoke('send-telegram', {
            body: {
              recipientIds: tgRecipients,
              type: REMINDER_TYPE,
              message,
              link,
              taskId: task.id,
              contextTeamId: task.team_id,
            },
          }),
        ),
      );
    }

    // 6c. Email (respect opt-out).
    const emailRecipients = recipientIds.filter((id) => !optOut.email.has(id));
    if (emailRecipients.length > 0) {
      channelDeliveries.push(
        Promise.resolve(
          sb.functions.invoke('send-email', {
            body: {
              recipientIds: emailRecipients,
              type: REMINDER_TYPE,
              subject,
              message,
              link,
              taskId: task.id,
              contextTeamId: task.team_id,
              taskDetails: {
                dueDate: task.due_date,
                priority: task.priority,
                status: statuses?.find((status) => status.id === task.status_id)?.name,
              },
            },
          }),
        ),
      );
    }

    const channelResults = await Promise.allSettled(channelDeliveries);
    let delivered = inAppRecipients.length > 0 || channelDeliveries.length === 0;
    for (const result of channelResults) {
      if (result.status === 'rejected') {
        console.error(`deadline-reminders: external delivery failed for ${task.id}`, result.reason);
        continue;
      }
      const response = result.value as { error?: unknown } | null;
      if (response?.error) {
        console.error(`deadline-reminders: external delivery failed for ${task.id}`, response.error);
      } else {
        delivered = true;
      }
    }

    if (!delivered) {
      // No channel accepted the reminder; release the claim for a later cron retry.
      await sb
        .from('task_deadline_reminders')
        .delete()
        .eq('task_id', task.id)
        .eq('due_date', task.due_date)
        .eq('offset_days', offset);
      continue;
    }

    counters[offset]++;
  }

  return res.status(200).json({ sent: counters, scanned: tasks.length });
}
