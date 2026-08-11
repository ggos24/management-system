import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export type NotificationChannel = 'email' | 'telegram';

const CATEGORY_BY_TYPE: Record<string, string> = {
  task_assigned: 'tasks',
  task_status_changed: 'tasks',
  task_updated: 'tasks',
  task_unassigned: 'tasks',
  task_deleted: 'tasks',
  task_deadline_reminder: 'deadlines',
  comment_mention: 'mentions',
  absence_submitted: 'schedule',
  absence_decided: 'schedule',
  absence_cancelled: 'schedule',
  schedule_updated: 'schedule',
  member_invited: 'members',
  ticket_submitted: 'support',
  ticket_status_changed: 'support',
  ticket_assigned: 'support',
  ticket_mention: 'support',
  ticket_reply: 'support',
};

const RELATED_ACTIONABLE_TASK_TYPES = new Set([
  'task_assigned',
  'task_status_changed',
  'task_updated',
  'task_deadline_reminder',
  'comment_mention',
]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface AuthorizeNotificationInput {
  adminClient: SupabaseClient;
  serviceCaller: boolean;
  callerAuthUserId: string | null;
  recipientIds: unknown;
  type: unknown;
  taskId: unknown;
  contextTeamId: unknown;
  commentId: unknown;
  channel: NotificationChannel;
}

export interface AuthorizedRecipients {
  recipientIds: string[];
  error?: string;
  status?: number;
  externalPayload?: { message: string; subject: string; link?: string };
  mentionClaimRecipientIds?: string[];
  restrictedTaskClaimRecipientIds?: string[];
}

export async function claimExternalNotificationDeliveries(
  adminClient: SupabaseClient,
  recipientIds: string[],
  commentId: string,
  channel: NotificationChannel,
): Promise<string[]> {
  const claims = await Promise.all(
    recipientIds.map(async (recipientId) => {
      const { data, error } = await adminClient.rpc('claim_external_notification_delivery', {
        p_comment_id: commentId,
        p_recipient_id: recipientId,
        p_channel: channel,
      });
      if (error) {
        console.error(`Unable to claim ${channel} mention delivery for ${recipientId}:`, error.message);
        return null;
      }
      return data === true ? recipientId : null;
    }),
  );
  return claims.filter((recipientId): recipientId is string => recipientId !== null);
}

export async function markExternalNotificationDeliverySent(
  adminClient: SupabaseClient,
  recipientId: string,
  commentId: string,
  channel: NotificationChannel,
): Promise<void> {
  const { error } = await adminClient.rpc('mark_external_notification_delivery_sent', {
    p_comment_id: commentId,
    p_recipient_id: recipientId,
    p_channel: channel,
  });
  if (error) console.error(`Unable to mark ${channel} mention delivery for ${recipientId}:`, error.message);
}

export async function claimRestrictedTaskNotificationDeliveries(
  adminClient: SupabaseClient,
  recipientIds: string[],
  taskId: string,
  contextTeamId: string,
  notificationType: string,
  channel: NotificationChannel,
): Promise<Map<string, string>> {
  const claims = await Promise.all(
    recipientIds.map(async (recipientId) => {
      const { data, error } = await adminClient.rpc('claim_restricted_task_notification_delivery', {
        p_recipient_id: recipientId,
        p_task_id: taskId,
        p_context_team_id: contextTeamId,
        p_notification_type: notificationType,
        p_channel: channel,
      });
      if (error) {
        console.error(`Unable to claim ${channel} task delivery for ${recipientId}:`, error.message);
        return null;
      }
      return typeof data === 'string' && UUID_RE.test(data) ? ([recipientId, data] as const) : null;
    }),
  );
  return new Map(claims.filter((claim): claim is readonly [string, string] => claim !== null));
}

export async function markRestrictedTaskNotificationDeliverySent(
  adminClient: SupabaseClient,
  claimId: string,
): Promise<void> {
  const { error } = await adminClient.rpc('mark_restricted_task_notification_delivery_sent', {
    p_claim_id: claimId,
  });
  if (error) console.error(`Unable to mark restricted task delivery ${claimId}:`, error.message);
}

/**
 * Edge Functions use a service client to resolve delivery addresses, so their
 * own authorization must mirror the task ACL instead of relying on table RLS.
 */
export async function authorizeNotificationRecipients({
  adminClient,
  serviceCaller,
  callerAuthUserId,
  recipientIds,
  type,
  taskId,
  contextTeamId,
  commentId,
  channel,
}: AuthorizeNotificationInput): Promise<AuthorizedRecipients> {
  if (!Array.isArray(recipientIds)) return { recipientIds: [], error: 'recipientIds must be an array', status: 400 };
  const recipients = [
    ...new Set(recipientIds.filter((id): id is string => typeof id === 'string' && UUID_RE.test(id))),
  ];
  if (recipients.length !== recipientIds.length || recipients.length > 100) {
    return { recipientIds: [], error: 'Invalid recipientIds', status: 400 };
  }

  const notificationType = typeof type === 'string' ? type : '';
  const category = CATEGORY_BY_TYPE[notificationType];
  if (!serviceCaller && !category) {
    return { recipientIds: [], error: 'A valid notification type is required', status: 400 };
  }

  let externalPayload: AuthorizedRecipients['externalPayload'];
  let callerProfile: { id: string; name: string | null; access_scope: string } | null = null;
  if (!serviceCaller) {
    const { data: caller, error: callerError } = await adminClient
      .from('profiles')
      .select('id, name, access_scope')
      .eq('auth_user_id', callerAuthUserId)
      .maybeSingle();
    if (callerError || !caller) return { recipientIds: [], error: 'Caller profile not found', status: 403 };
    callerProfile = caller;

    // A client-triggered mention delivery must always be tied to the caller's
    // committed comment and its structured recipients. This applies to full
    // users too: otherwise one teammate could replay another author's comment
    // first and consume the delivery claim for the real author.
    if (notificationType === 'comment_mention') {
      if (
        typeof taskId !== 'string' ||
        !UUID_RE.test(taskId) ||
        typeof contextTeamId !== 'string' ||
        !UUID_RE.test(contextTeamId) ||
        typeof commentId !== 'string' ||
        !UUID_RE.test(commentId)
      ) {
        return { recipientIds: [], error: 'A persisted comment mention is required', status: 400 };
      }
      const { data: comment, error: commentError } = await adminClient
        .from('task_comments')
        .select('user_id, task_id, context_team_id')
        .eq('id', commentId)
        .maybeSingle();
      if (
        commentError ||
        !comment ||
        comment.user_id !== caller.id ||
        comment.task_id !== taskId ||
        comment.context_team_id !== contextTeamId
      ) {
        return { recipientIds: [], error: 'Notification does not match the caller comment', status: 403 };
      }
      const { data: mentions, error: mentionError } = await adminClient
        .from('task_comment_mentions')
        .select('profile_id')
        .eq('comment_id', commentId)
        .eq('task_id', taskId)
        .eq('context_team_id', contextTeamId)
        .in('profile_id', recipients);
      if (mentionError) return { recipientIds: [], error: 'Unable to verify comment mentions', status: 403 };
      const mentionedIds = new Set((mentions ?? []).map((mention: { profile_id: string }) => mention.profile_id));
      if (recipients.some((recipientId) => !mentionedIds.has(recipientId))) {
        return { recipientIds: [], error: 'Recipient was not mentioned in this comment', status: 403 };
      }
    }

    if (caller.access_scope === 'related_only') {
      if (
        notificationType !== 'comment_mention' ||
        typeof taskId !== 'string' ||
        !UUID_RE.test(taskId) ||
        typeof contextTeamId !== 'string' ||
        !UUID_RE.test(contextTeamId) ||
        typeof commentId !== 'string' ||
        !UUID_RE.test(commentId)
      ) {
        return {
          recipientIds: [],
          error: 'External collaborators may notify existing task participants only',
          status: 403,
        };
      }

      const { data: grants, error: grantError } = await adminClient
        .from('task_access_grants')
        .select('profile_id')
        .eq('task_id', taskId)
        .eq('context_team_id', contextTeamId)
        .in('profile_id', [caller.id, ...recipients]);
      if (grantError) return { recipientIds: [], error: 'Unable to verify task access', status: 403 };
      const grantedIds = new Set((grants ?? []).map((grant: { profile_id: string }) => grant.profile_id));
      if (!grantedIds.has(caller.id) || recipients.some((recipientId) => !grantedIds.has(recipientId))) {
        return { recipientIds: [], error: 'Recipient is not an existing task participant', status: 403 };
      }

      const { data: comment, error: commentError } = await adminClient
        .from('task_comments')
        .select('user_id, task_id, context_team_id')
        .eq('id', commentId)
        .maybeSingle();
      if (
        commentError ||
        !comment ||
        comment.user_id !== caller.id ||
        comment.task_id !== taskId ||
        comment.context_team_id !== contextTeamId
      ) {
        return { recipientIds: [], error: 'Notification does not match the persisted comment', status: 403 };
      }
      const { data: mentions, error: mentionError } = await adminClient
        .from('task_comment_mentions')
        .select('profile_id')
        .eq('comment_id', commentId)
        .eq('task_id', taskId)
        .eq('context_team_id', contextTeamId)
        .in('profile_id', recipients);
      if (mentionError) return { recipientIds: [], error: 'Unable to verify comment mentions', status: 403 };
      const mentionedIds = new Set((mentions ?? []).map((mention: { profile_id: string }) => mention.profile_id));
      if (recipients.some((recipientId) => !mentionedIds.has(recipientId))) {
        return { recipientIds: [], error: 'Recipient was not mentioned in this comment', status: 403 };
      }

      const { data: task, error: taskError } = await adminClient
        .from('tasks')
        .select('title')
        .eq('id', taskId)
        .is('deleted_at', null)
        .maybeSingle();
      if (taskError || !task) return { recipientIds: [], error: 'Task unavailable', status: 403 };
      const configuredOrigin =
        Deno.env.get('PUBLIC_APP_ORIGIN') || Deno.env.get('APP_ORIGIN') || Deno.env.get('SITE_URL');
      let canonicalLink: string | undefined;
      if (configuredOrigin) {
        try {
          const origin = new URL(configuredOrigin).origin;
          canonicalLink = `${origin}/workspace?task=${encodeURIComponent(taskId)}&context=${encodeURIComponent(contextTeamId)}`;
        } catch {
          // A malformed deployment setting must not fall back to a caller URL.
        }
      }
      const actorName = caller.name || 'Someone';
      const taskTitle = task.title || 'Untitled';
      externalPayload = {
        message: `${actorName} mentioned you in a comment on "${taskTitle}"`,
        subject: `You were mentioned in a comment — ${taskTitle}`,
        link: canonicalLink,
      };
    }
  }

  let deliverableRecipients = recipients;
  let deliverableRelatedRecipientIds: string[] = [];
  if (category && recipients.length > 0) {
    const { data: recipientProfiles, error: recipientProfileError } = await adminClient
      .from('profiles')
      .select('id, access_scope')
      .in('id', recipients);
    if (recipientProfileError) return { recipientIds: [], error: 'Unable to verify recipients', status: 500 };
    const profileScopes = new Map(
      (recipientProfiles ?? []).map((profile: { id: string; access_scope: string }) => [
        profile.id,
        profile.access_scope,
      ]),
    );
    deliverableRecipients = recipients.filter((recipientId) => profileScopes.has(recipientId));
    const relatedRecipientIds = deliverableRecipients.filter(
      (recipientId) => profileScopes.get(recipientId) === 'related_only',
    );
    if (relatedRecipientIds.length > 0) {
      let authorizedRelatedIds = new Set<string>();
      if (
        RELATED_ACTIONABLE_TASK_TYPES.has(notificationType) &&
        typeof taskId === 'string' &&
        UUID_RE.test(taskId) &&
        typeof contextTeamId === 'string' &&
        UUID_RE.test(contextTeamId)
      ) {
        const { data: grants, error: grantError } = await adminClient
          .from('task_access_grants')
          .select('profile_id')
          .eq('task_id', taskId)
          .eq('context_team_id', contextTeamId)
          .in('profile_id', relatedRecipientIds);
        if (grantError) return { recipientIds: [], error: 'Unable to verify recipient task access', status: 500 };
        authorizedRelatedIds = new Set((grants ?? []).map((grant: { profile_id: string }) => grant.profile_id));

        if (notificationType === 'comment_mention') {
          if (typeof commentId !== 'string' || !UUID_RE.test(commentId)) {
            authorizedRelatedIds.clear();
          } else {
            const { data: mentions, error: mentionError } = await adminClient
              .from('task_comment_mentions')
              .select('profile_id')
              .eq('comment_id', commentId)
              .eq('task_id', taskId)
              .eq('context_team_id', contextTeamId)
              .in('profile_id', [...authorizedRelatedIds]);
            if (mentionError) {
              return { recipientIds: [], error: 'Unable to verify recipient mentions', status: 500 };
            }
            authorizedRelatedIds = new Set(
              (mentions ?? []).map((mention: { profile_id: string }) => mention.profile_id),
            );
          }
        }
      }
      deliverableRecipients = deliverableRecipients.filter(
        (recipientId) => profileScopes.get(recipientId) === 'full' || authorizedRelatedIds.has(recipientId),
      );
    }
    deliverableRelatedRecipientIds = deliverableRecipients.filter(
      (recipientId) => profileScopes.get(recipientId) === 'related_only',
    );
  }

  // A normal full-access user must not be able to use the service transport as
  // a phishing proxy to External recipients. Derive copy and the canonical URL
  // from persisted task data whenever any restricted recipient is present.
  if (
    !serviceCaller &&
    callerProfile &&
    deliverableRelatedRecipientIds.length > 0 &&
    RELATED_ACTIONABLE_TASK_TYPES.has(notificationType) &&
    typeof taskId === 'string' &&
    UUID_RE.test(taskId) &&
    typeof contextTeamId === 'string' &&
    UUID_RE.test(contextTeamId)
  ) {
    const { data: task, error: taskError } = await adminClient
      .from('tasks')
      .select('title')
      .eq('id', taskId)
      .is('deleted_at', null)
      .maybeSingle();
    if (taskError || !task) {
      deliverableRecipients = deliverableRecipients.filter(
        (recipientId) => !deliverableRelatedRecipientIds.includes(recipientId),
      );
      deliverableRelatedRecipientIds = [];
    } else {
      const actorName = callerProfile.name || 'Someone';
      const taskTitle = task.title || 'Untitled';
      const copyByType: Record<string, { message: string; subject: string }> = {
        task_assigned: {
          message: `${actorName} assigned you to "${taskTitle}"`,
          subject: `Task assigned to you — ${taskTitle}`,
        },
        task_status_changed: {
          message: `${actorName} changed the status of "${taskTitle}"`,
          subject: `Task status updated — ${taskTitle}`,
        },
        task_updated: {
          message: `${actorName} updated "${taskTitle}"`,
          subject: `Task updated — ${taskTitle}`,
        },
        task_deadline_reminder: {
          message: `The deadline is approaching for "${taskTitle}"`,
          subject: `Task deadline approaching — ${taskTitle}`,
        },
        comment_mention: {
          message: `${actorName} mentioned you in a comment on "${taskTitle}"`,
          subject: `You were mentioned in a comment — ${taskTitle}`,
        },
      };
      const configuredOrigin =
        Deno.env.get('PUBLIC_APP_ORIGIN') || Deno.env.get('APP_ORIGIN') || Deno.env.get('SITE_URL');
      let canonicalLink: string | undefined;
      if (configuredOrigin) {
        try {
          canonicalLink = `${new URL(configuredOrigin).origin}/workspace?task=${encodeURIComponent(taskId)}&context=${encodeURIComponent(contextTeamId)}`;
        } catch {
          // Do not fall back to caller-controlled links.
        }
      }
      externalPayload = { ...copyByType[notificationType], link: canonicalLink };
    }
  }

  // Absence of a preference row means enabled; only explicit opt-outs filter.
  if (!category || deliverableRecipients.length === 0) {
    return {
      recipientIds: deliverableRecipients,
      externalPayload,
      mentionClaimRecipientIds:
        notificationType === 'comment_mention'
          ? callerProfile?.access_scope === 'related_only'
            ? deliverableRecipients
            : deliverableRelatedRecipientIds
          : [],
      restrictedTaskClaimRecipientIds:
        !serviceCaller && notificationType !== 'comment_mention' ? deliverableRelatedRecipientIds : [],
    };
  }
  const { data: preferences, error: preferenceError } = await adminClient
    .from('notification_preferences')
    .select('user_id, enabled')
    .eq('category', category)
    .eq('channel', channel)
    .in('user_id', deliverableRecipients);
  if (preferenceError) return { recipientIds: [], error: 'Unable to verify notification preferences', status: 500 };
  const optedOut = new Set(
    (preferences ?? [])
      .filter((preference: { enabled: boolean }) => preference.enabled === false)
      .map((preference: { user_id: string }) => preference.user_id),
  );
  const preferredRecipients = deliverableRecipients.filter((recipientId) => !optedOut.has(recipientId));
  const preferredRecipientSet = new Set(preferredRecipients);
  return {
    recipientIds: preferredRecipients,
    externalPayload,
    mentionClaimRecipientIds:
      notificationType === 'comment_mention'
        ? callerProfile?.access_scope === 'related_only'
          ? preferredRecipients
          : deliverableRelatedRecipientIds.filter((recipientId) => preferredRecipientSet.has(recipientId))
        : [],
    restrictedTaskClaimRecipientIds:
      !serviceCaller && notificationType !== 'comment_mention'
        ? deliverableRelatedRecipientIds.filter((recipientId) => preferredRecipientSet.has(recipientId))
        : [],
  };
}
