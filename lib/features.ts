/**
 * Features still being tested. They ship in the code but stay hidden in production builds.
 *
 * `__SUBTASKS_ENABLED__` is resolved at build time in `vite.config.ts`: on for `vite` dev, tests and
 * Vercel preview deploys (`VERCEL_ENV=preview`), off for every other build, production included. Set
 * `VITE_FEATURE_SUBTASKS=true|false` in the build environment to override either way.
 */
export const SUBTASKS_ENABLED: boolean = __SUBTASKS_ENABLED__;
