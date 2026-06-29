// fetch-article-meta — given a list of united24media.com article URLs, fetch each page server-side
// (browser CORS blocks this client-side) and extract the fields needed for a weekly-digest card:
// cover image, title, lead, author name/role/photo/profile link, and section label.
// Admin-only. Mirrors the CORS + auth pattern of the send-email function.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';

interface Card {
  url: string;
  title: string;
  lead: string;
  cover: string;
  authorName: string;
  authorRole: string;
  authorPhoto: string;
  authorUrl: string;
  section: string;
}

function jsonLdBlocks(html: string): any[] {
  const out: any[] = [];
  const re = /<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    try {
      out.push(JSON.parse(m[1].trim()));
    } catch {
      // ignore malformed blocks
    }
  }
  return out;
}

function findNewsArticle(blocks: any[]): any | null {
  for (const b of blocks) {
    const items = Array.isArray(b) ? b : b['@graph'] ? b['@graph'] : [b];
    for (const it of items) {
      const t = it && it['@type'];
      if (t === 'NewsArticle' || t === 'Article' || (Array.isArray(t) && t.includes('NewsArticle'))) return it;
    }
  }
  return null;
}

function findBreadcrumb(blocks: any[]): any | null {
  for (const b of blocks) {
    const items = Array.isArray(b) ? b : b['@graph'] ? b['@graph'] : [b];
    for (const it of items) {
      if (it && it['@type'] === 'BreadcrumbList') return it;
    }
  }
  return null;
}

function metaContent(html: string, key: string): string {
  // matches <meta property="og:x" content="..."> or <meta name="x" content="..."> in either attr order
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]*content=["']([^"']*)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${key}["']`, 'i'),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m) return decodeEntities(m[1].trim());
  }
  return '';
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&rsquo;/g, '’')
    .replace(/&nbsp;/g, ' ');
}

function imageUrlFromLd(image: any): string {
  if (!image) return '';
  if (typeof image === 'string') return image;
  if (Array.isArray(image)) return imageUrlFromLd(image[0]);
  if (typeof image === 'object') return image.url || '';
  return '';
}

function extractAuthorBlock(html: string): { role: string; photo: string } {
  const role = (html.match(/class="c-author__position"[^>]*>\s*([^<]+?)\s*</i)?.[1] || '').trim();
  // First author image inside the c-author block. Prefer a 2x (sharper) source from data-srcset.
  const authorImgArea = html.match(/class="c-author__img[^"]*"[\s\S]{0,600}?<\/picture>/i)?.[0] || '';
  let photo = '';
  const srcset2x = authorImgArea.match(/data-srcset=["']([^"'\s]+)\s+2x/i)?.[1];
  const dataSrc = authorImgArea.match(/data-src=["']([^"']+)["']/i)?.[1];
  const plainSrc = authorImgArea.match(/\ssrc=["']([^"']+)["']/i)?.[1];
  photo = srcset2x || dataSrc || plainSrc || '';
  return { role: decodeEntities(role), photo };
}

function sectionFromBreadcrumb(blocks: any[], url: string): string {
  const bc = findBreadcrumb(blocks);
  const list = bc?.itemListElement;
  if (Array.isArray(list) && list.length >= 2) {
    // second-to-last entry is the section (last is the article itself)
    const sec = list[list.length - 2];
    if (sec?.name) return decodeEntities(String(sec.name));
  }
  // fallback: first path segment, title-cased
  try {
    const seg = new URL(url).pathname.split('/').filter(Boolean)[0] || 'News';
    return seg
      .split('-')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  } catch {
    return 'News';
  }
}

async function scrape(url: string): Promise<Card> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  let html = '';
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: controller.signal, redirect: 'follow' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    html = await res.text();
  } finally {
    clearTimeout(timer);
  }

  const blocks = jsonLdBlocks(html);
  const article = findNewsArticle(blocks);

  const title = metaContent(html, 'og:title') || decodeEntities(article?.headline || article?.name || '');
  const lead = metaContent(html, 'og:description') || decodeEntities(article?.description || '');
  const cover = imageUrlFromLd(article?.image) || metaContent(html, 'og:image');

  const author = article?.author;
  const authorObj = Array.isArray(author) ? author[0] : author;
  const authorName = decodeEntities(authorObj?.name || '');
  const authorUrl = authorObj?.url || '';

  const { role, photo } = extractAuthorBlock(html);
  const section = sectionFromBreadcrumb(blocks, url);

  return {
    url,
    title,
    lead,
    cover,
    authorName,
    authorRole: role,
    authorPhoto: photo,
    authorUrl,
    section,
  };
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

    // Admin-only tool
    const { data: profile } = await adminClient.from('profiles').select('role').eq('auth_user_id', user.id).single();
    if (profile?.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Admin access required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { urls } = await req.json();
    if (!Array.isArray(urls) || urls.length === 0) {
      return new Response(JSON.stringify({ error: 'urls (array) is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const results = await Promise.allSettled(urls.map((u: string) => scrape(String(u).trim())));
    const cards = results.map((r, i) =>
      r.status === 'fulfilled'
        ? { ok: true, ...r.value }
        : { ok: false, url: urls[i], error: String((r as PromiseRejectedResult).reason?.message || 'Failed to fetch') },
    );

    return new Response(JSON.stringify({ cards }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('fetch-article-meta error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
