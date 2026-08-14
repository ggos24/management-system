// supabase-js turns any non-2xx Edge Function response into a FunctionsHttpError whose
// message is always "Edge Function returned a non-2xx status code", and sets `data` to
// null — so the JSON body our functions return ({ error: '...' }) never reaches the UI.
// The original Response is attached as `error.context`; read the body from there.

const pickMessage = (parsed: unknown): string => {
  if (!parsed || typeof parsed !== 'object') return '';
  const body = parsed as Record<string, unknown>;
  for (const key of ['error', 'message', 'msg', 'error_description'] as const) {
    const value = body[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    // GoTrue nests its payload under `error` on some failures
    if (value && typeof value === 'object') {
      const nested = pickMessage(value);
      if (nested) return nested;
    }
  }
  return '';
};

export const readEdgeFunctionError = async (error: unknown, fallback: string): Promise<string> => {
  const response = (error as { context?: unknown } | null | undefined)?.context;

  if (typeof Response === 'undefined' || !(response instanceof Response)) {
    return error instanceof Error && error.message ? error.message : fallback;
  }

  // The body is a one-shot stream; a failed read leaves us with the status only.
  const raw = await response.text().catch(() => '');
  if (raw.trim()) {
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // Platform-level failures (boot errors, timeouts) answer with plain text.
      return raw.trim().slice(0, 300);
    }
    const message = pickMessage(parsed);
    if (message) return message;
  }

  return `${fallback} (HTTP ${response.status})`;
};
