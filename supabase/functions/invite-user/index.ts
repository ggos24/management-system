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
      .select('role')
      .eq('auth_user_id', callerUser.id)
      .single();

    if (!callerProfile || callerProfile.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Only admins can invite users' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parse request body
    const { email, name, role, jobTitle, teamId } = await req.json();

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
    if (role && !['admin', 'user'].includes(role)) {
      return new Response(JSON.stringify({ error: "Role must be 'admin' or 'user'" }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Determine redirect URL from request origin or env
    const origin = req.headers.get('origin') || Deno.env.get('APP_URL') || supabaseUrl;

    // Create auth user via invite (returns error if email already exists)
    const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
      redirectTo: origin,
    });

    if (inviteError) {
      // Supabase returns specific error for duplicate emails
      const isDuplicate =
        inviteError.message?.toLowerCase().includes('already been registered') ||
        inviteError.message?.toLowerCase().includes('already exists');
      return new Response(
        JSON.stringify({ error: isDuplicate ? 'A user with this email already exists' : inviteError.message }),
        { status: isDuplicate ? 409 : 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const newAuthUser = inviteData.user;
    const profileId = crypto.randomUUID();

    // Create profile linked to new auth user
    const { error: profileError } = await adminClient.from('profiles').insert({
      id: profileId,
      auth_user_id: newAuthUser.id,
      name,
      role: role || 'user',
      job_title: jobTitle || 'Team Member',
      avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random`,
      team_id: teamId || null,
      status: 'active',
    });

    if (profileError) {
      return new Response(JSON.stringify({ error: profileError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Insert default permissions
    await adminClient.from('permissions').insert({
      member_id: profileId,
      can_create: true,
      can_edit: false,
      can_delete: false,
    });

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
    });

    // Notify all existing members about the new team member
    const { data: existingProfiles } = await adminClient.from('profiles').select('id').neq('id', profileId);
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
          role: role || 'user',
          jobTitle: jobTitle || 'Team Member',
          avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random`,
          teamId: teamId || '',
          status: 'active',
        },
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
