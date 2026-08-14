import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Verify caller is admin
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Service-role client for all operations (bypasses RLS)
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Verify caller's JWT using service-role client
    const jwt = authHeader.replace('Bearer ', '');
    const {
      data: { user: callerUser },
      error: callerError,
    } = await adminClient.auth.getUser(jwt);

    if (callerError || !callerUser) {
      return new Response(JSON.stringify({ error: 'Invalid authentication' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check caller's profile role
    const { data: callerProfile } = await adminClient
      .from('profiles')
      .select('role, access_scope')
      .eq('auth_user_id', callerUser.id)
      .single();

    if (!callerProfile || callerProfile.role !== 'admin' || callerProfile.access_scope !== 'full') {
      return new Response(JSON.stringify({ error: 'Only admins can invite users' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parse request body
    const { email, name, role, jobTitle, teamId, accessScope } = await req.json();
    const requestedAccessScope = accessScope || 'full';
    const requestedRole = role || 'user';

    if (!email || !name) {
      return new Response(JSON.stringify({ error: 'Email and name are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email) || email.length > 254) {
      return new Response(JSON.stringify({ error: 'Invalid email format' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate field lengths
    if (name.length > 100) {
      return new Response(JSON.stringify({ error: 'Name must be 100 characters or fewer' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (jobTitle && jobTitle.length > 100) {
      return new Response(JSON.stringify({ error: 'Job title must be 100 characters or fewer' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!['admin', 'editor', 'user'].includes(requestedRole)) {
      return new Response(JSON.stringify({ error: "Role must be 'admin', 'editor', or 'user'" }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!['full', 'related_only'].includes(requestedAccessScope)) {
      return new Response(JSON.stringify({ error: "Access scope must be 'full' or 'related_only'" }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (requestedAccessScope === 'related_only' && (requestedRole !== 'user' || teamId)) {
      return new Response(
        JSON.stringify({ error: 'External collaborators must use the User role and cannot belong to a team' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
    if (requestedAccessScope === 'full' && !teamId) {
      return new Response(JSON.stringify({ error: 'A team is required for internal members' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (teamId && !uuidRegex.test(teamId)) {
      return new Response(JSON.stringify({ error: 'Invalid team ID' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Determine redirect URL from request origin or env
    const origin = req.headers.get('origin') || Deno.env.get('APP_URL') || supabaseUrl;

    // Create auth user via invite (returns error if email already exists)
    const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
      redirectTo: origin,
      data: { name },
    });

    if (inviteError) {
      const rawMessage = inviteError.message || 'Failed to send the invitation';
      const lowerMessage = rawMessage.toLowerCase();
      const authCode = (inviteError as { code?: string }).code || '';
      const authStatus = (inviteError as { status?: number }).status || 0;

      // Logged so the failure is diagnosable from the function logs. Deliberately
      // without the invitee's email — the caller already sees it in the response.
      console.error('invite-user: inviteUserByEmail failed', {
        status: authStatus,
        code: authCode,
        message: rawMessage,
      });

      if (
        authCode === 'email_exists' ||
        lowerMessage.includes('already been registered') ||
        lowerMessage.includes('already registered') ||
        lowerMessage.includes('already exists')
      ) {
        return new Response(JSON.stringify({ error: 'A user with this email already exists' }), {
          status: 409,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // The built-in Supabase mailer allows only a couple of emails per hour, so a
      // second invitation in quick succession fails here rather than in validation.
      if (authStatus === 429 || authCode === 'over_email_send_rate_limit' || lowerMessage.includes('rate limit')) {
        return new Response(
          JSON.stringify({
            error: `Email rate limit reached, so the invitation was not sent. Wait an hour and retry, or configure custom SMTP in Supabase. (${rawMessage})`,
          }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      if (lowerMessage.includes('sending') || lowerMessage.includes('smtp') || lowerMessage.includes('email')) {
        return new Response(JSON.stringify({ error: `The invitation email could not be sent: ${rawMessage}` }), {
          status: 502,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ error: rawMessage }), {
        status: authStatus >= 500 ? 502 : 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const newAuthUser = inviteData.user;
    const avatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random`;

    // The auth.users trigger creates a profile synchronously. Finalize it through
    // one service-role-only transaction so we update/upsert instead of inserting a
    // duplicate, and team membership + default permissions cannot drift apart.
    const { data: finalizedRows, error: profileError } = await adminClient.rpc('finalize_invited_profile', {
      p_auth_user_id: newAuthUser.id,
      p_name: name,
      p_role: requestedRole,
      p_job_title: jobTitle || 'Team Member',
      p_avatar: avatar,
      p_team_id: requestedAccessScope === 'full' ? teamId : null,
      p_access_scope: requestedAccessScope,
    });

    if (profileError) {
      // Avoid leaving an unusable auth user that blocks a retry with the same email.
      await adminClient.auth.admin.deleteUser(newAuthUser.id).catch(() => undefined);
      return new Response(JSON.stringify({ error: profileError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const finalizedProfile = Array.isArray(finalizedRows) ? finalizedRows[0] : finalizedRows;
    if (!finalizedProfile?.id) {
      await adminClient.auth.admin.deleteUser(newAuthUser.id).catch(() => undefined);
      return new Response(JSON.stringify({ error: 'Profile finalization returned no profile' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const profileId = finalizedProfile.id as string;

    // Get caller profile for activity log
    const { data: callerFullProfile } = await adminClient
      .from('profiles')
      .select('id')
      .eq('auth_user_id', callerUser.id)
      .single();

    // Insert activity log
    await adminClient.from('activity_log').insert({
      user_id: callerFullProfile?.id || '',
      action: 'Member Invited',
      details: `Invited ${name} (${email}) to the workspace`,
      timestamp: new Date().toISOString(),
      entity_type: 'member',
    });

    // Notify admins about the new team member (exclude inviter and new user)
    const { data: existingProfiles } = await adminClient
      .from('profiles')
      .select('id')
      .neq('id', profileId)
      .neq('id', callerFullProfile?.id || '')
      .in('role', ['admin']);
    if (existingProfiles && existingProfiles.length > 0) {
      const callerName = callerFullProfile?.id
        ? (await adminClient.from('profiles').select('name').eq('id', callerFullProfile.id).single()).data?.name ||
          'An admin'
        : 'An admin';
      const notifMessage = `${callerName} invited ${name} to the workspace`;
      await adminClient.from('notifications').insert(
        existingProfiles.map((p: { id: string }) => ({
          recipient_id: p.id,
          actor_id: callerFullProfile?.id || null,
          type: 'member_invited',
          message: notifMessage,
          entity_data: { memberId: profileId },
        })),
      );

      // Send Telegram notifications to linked members
      const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
      if (botToken) {
        const recipientIds = existingProfiles.map((p: { id: string }) => p.id);
        const { data: telegramLinks } = await adminClient
          .from('telegram_links')
          .select('chat_id')
          .in('profile_id', recipientIds)
          .not('chat_id', 'is', null);
        if (telegramLinks && telegramLinks.length > 0) {
          await Promise.allSettled(
            telegramLinks.map((link: { chat_id: number }) =>
              fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: link.chat_id, text: notifMessage }),
              }),
            ),
          );
        }
      }
    }

    // Return the created profile in frontend shape
    return new Response(
      JSON.stringify({
        profile: {
          id: profileId,
          name,
          role: requestedRole,
          accessScope: requestedAccessScope,
          jobTitle: jobTitle || 'Team Member',
          avatar,
          teamId: requestedAccessScope === 'full' ? teamId : '',
          teamIds: requestedAccessScope === 'full' ? [teamId] : [],
          status: 'active',
        },
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
