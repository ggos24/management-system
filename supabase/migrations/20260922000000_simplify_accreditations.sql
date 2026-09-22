-- Accreditations keep only the fields the newsroom fills in: holder, kind,
-- expiry, notes. The register exists for the expiry date, so the pending /
-- revoked statuses and the issuer / card number / issued-on / document-link
-- inputs are gone from the UI (see components/AccreditationsTool.tsx).
--
-- Nothing is dropped here. Per the two-phase rule in CLAUDE.md the retired
-- columns stay until a later release: a tab still running the previous bundle
-- writes issuer and status, and an UPDATE against a column that no longer
-- exists would fail. This migration only makes the stored data agree with what
-- the app now shows.

BEGIN;

-- The UI derives every state from valid_until now, so a row parked on
-- 'pending' or 'revoked' would read as valid on screen while the partial index
-- idx_accreditations_active_valid_until — and therefore the daily reminder
-- cron in api/renewal-reminders.ts, which filters on status = 'active' — kept
-- skipping it. One status from here on.
UPDATE public.accreditations SET status = 'active' WHERE status <> 'active';

-- New rows no longer name the issuer. The column is NOT NULL until the drop,
-- so give it a default and let inserts stop caring; lib/database.ts still
-- sends an empty string so the app works either side of this migration.
ALTER TABLE public.accreditations ALTER COLUMN issuer SET DEFAULT '';

COMMIT;
