// generate-digest-copy — draft a weekly-digest intro paragraph + subject-line options from the
// selected articles, in the UNITED24 Media voice. The admin edits the draft before building the email.
// Admin-only. Calls the Anthropic Messages API (claude-opus-4-8). Requires ANTHROPIC_API_KEY secret.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-opus-4-8';

interface ArticleInput {
  title: string;
  lead: string;
  section?: string;
}

const SYSTEM_PROMPT = `You write the weekly email digest for UNITED24 Media, an English-language Ukrainian news outlet.
Voice: sharp, factual, urgent but not sensational; concrete numbers and specifics over adjectives; present tense.
You will be given this week's article headlines and leads.
Produce:
1. "intro": ONE punchy paragraph (3–5 sentences, ~60–90 words) that weaves the week's biggest stories into a single narrative, the way a newsletter editor teases the issue. Reference specifics from the articles. No greeting, no "in this issue", no bullet list.
2. "subjects": an array of 3 distinct subject-line options (each under ~70 characters), specific and click-worthy, no clickbait punctuation spam.
Return ONLY a JSON object: {"intro": "...", "subjects": ["...", "...", "..."]}. No markdown, no code fences, no commentary.`;

function parseModelJson(text: string): { intro: string; subjects: string[] } | null {
  let t = text.trim();
  // strip ```json ... ``` fences if present
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  // grab the first {...} block
  const brace = t.match(/\{[\s\S]*\}/);
  if (brace) t = brace[0];
  try {
    const obj = JSON.parse(t);
    if (typeof obj.intro === 'string' && Array.isArray(obj.subjects)) {
      return { intro: obj.intro, subjects: obj.subjects.map(String) };
    }
  } catch {
    // fall through
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'AI copy not configured (ANTHROPIC_API_KEY missing)' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

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

    const { data: profile } = await adminClient.from('profiles').select('role').eq('auth_user_id', user.id).single();
    if (profile?.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Admin access required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { articles } = await req.json();
    if (!Array.isArray(articles) || articles.length === 0) {
      return new Response(JSON.stringify({ error: 'articles (array) is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const articleList = (articles as ArticleInput[])
      .map((a, i) => `${i + 1}. [${a.section || 'News'}] ${a.title}\n   ${a.lead || ''}`)
      .join('\n');

    const res = await fetch(ANTHROPIC_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1500,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: `This week's articles:\n\n${articleList}` }],
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      console.error('Anthropic API error', res.status, detail);
      return new Response(JSON.stringify({ error: 'AI request failed', status: res.status }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await res.json();
    const text = (data.content || [])
      .filter((b: { type: string }) => b.type === 'text')
      .map((b: { text: string }) => b.text)
      .join('\n');

    const parsed = parseModelJson(text);
    if (!parsed) {
      // Fallback: hand back the raw text as the intro so the admin can still use it.
      return new Response(JSON.stringify({ intro: text.trim(), subjects: [] }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify(parsed), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('generate-digest-copy error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
