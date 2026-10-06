/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />
/// <reference types="vite-plugin-pwa/react" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
}

/** Build-time feature flag, defined in vite.config.ts. Read it via lib/features.ts. */
declare const __SUBTASKS_ENABLED__: boolean;

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
