// optimize-images — download article/author images, optimize them (resize + JPEG recompress + strip),
// and upload to the Supabase Storage `email-assets` bucket. Returns the public URLs to embed in the email.
//
// NOTE: SendPulse has no public API that returns a usable image URL (its File Manager `POST /file`
// returns only {success,message}), so we self-host the optimized assets on Supabase Storage instead.
// In a sent email this is functionally identical to SendPulse-hosted images.
//
// Uses magick-wasm (imagemagick_deno) — Supabase's recommended edge image library; Sharp is unsupported.
// Admin-only. Mirrors the CORS + auth pattern of the send-email function.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { ImageMagick, initializeImageMagick, MagickFormat } from 'npm:@imagemagick/magick-wasm@0.0.35';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const BUCKET = 'email-assets';
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';

// Target sizes: cover renders full-width (600px, ×2 for retina = 1200×630); author renders 40×40 (×4 = 160).
const TARGETS: Record<string, { w: number; h: number; q: number }> = {
  cover: { w: 1200, h: 630, q: 80 },
  author: { w: 160, h: 160, q: 82 },
};

// magick-wasm needs the wasm bytes passed explicitly. Load once per isolate from a CDN
// (portable — the deno.land/x imagemagick_deno wrapper crashed with "require is not defined").
const MAGICK_WASM_URL = 'https://cdn.jsdelivr.net/npm/@imagemagick/magick-wasm@0.0.35/dist/magick.wasm';
let magickReady: Promise<void> | null = null;
function ensureMagick(): Promise<void> {
  if (!magickReady) {
    magickReady = (async () => {
      const res = await fetch(MAGICK_WASM_URL);
      if (!res.ok) throw new Error(`magick wasm load failed: ${res.status}`);
      await initializeImageMagick(new Uint8Array(await res.arrayBuffer()));
    })();
  }
  return magickReady;
}

function safeSegment(s: string): string {
  return (
    String(s)
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'item'
  );
}

async function optimize(url: string, kind: string): Promise<Uint8Array> {
  const target = TARGETS[kind] || TARGETS.cover;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  let input: Uint8Array;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: controller.signal, redirect: 'follow' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    input = new Uint8Array(await res.arrayBuffer());
  } finally {
    clearTimeout(timer);
  }

  await ensureMagick();
  return await new Promise<Uint8Array>((resolve, reject) => {
    try {
      ImageMagick.read(input, (img) => {
        img.resize(target.w, target.h);
        img.quality = target.q;
        try {
          img.strip();
        } catch {
          // strip not critical
        }
        img.write(MagickFormat.Jpeg, (data) => resolve(new Uint8Array(data)));
      });
    } catch (e) {
      reject(e);
    }
  });
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

    const { data: profile } = await adminClient.from('profiles').select('role').eq('auth_user_id', user.id).single();
    if (profile?.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Admin access required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { images, campaignTag } = await req.json();
    if (!Array.isArray(images) || images.length === 0) {
      return new Response(JSON.stringify({ error: 'images (array) is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const folder = safeSegment(campaignTag || 'weekly');

    const settled = await Promise.allSettled(
      images.map(async (im: { url: string; kind: string; key: string }) => {
        const optimized = await optimize(im.url, im.kind);
        const path = `${folder}/${safeSegment(im.key)}.jpg`;
        const { error: upErr } = await adminClient.storage
          .from(BUCKET)
          .upload(path, optimized, { contentType: 'image/jpeg', upsert: true });
        if (upErr) throw upErr;
        const { data } = adminClient.storage.from(BUCKET).getPublicUrl(path);
        return { key: im.key, url: data.publicUrl };
      }),
    );

    const results: Record<string, string> = {};
    const errors: Record<string, string> = {};
    settled.forEach((r, i) => {
      const key = images[i].key;
      if (r.status === 'fulfilled') {
        results[r.value.key] = r.value.url;
      } else {
        const msg = String((r as PromiseRejectedResult).reason?.message || 'Failed');
        errors[key] = msg;
        console.error('optimize-images: failed', key, images[i]?.url, msg);
      }
    });

    return new Response(JSON.stringify({ results, errors }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('optimize-images error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
