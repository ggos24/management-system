# Accreditations & Subscriptions Tracking — Design Notes

Status: **implemented** (2026-09-10). Two admin-only registers under Tools: `/tools/accreditations` and `/tools/subscriptions`. Companion to the plan that shipped the feature; the migration header points here.

## Why

Journalist accreditations (military, parliament, government, events) run out on a date and have to be renewed before that; paid services charge on a date and someone has to know it is coming. Neither was recorded anywhere. Both are "a record with a date after which someone must act", so they share one implementation pattern — the same one Equipment uses: derived state from dates, admin-only RLS, a daily digest cron.

## Decisions

| Question          | Decision                                                                                                                                                                                                                                                   |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Who sees it       | Admins only, under `/tools` (`AdminGuard` + RLS `is_admin() AND is_full_access()` on every table). Nobody else issues the requests: bootstrap and realtime are gated on role.                                                                              |
| Reminders         | One daily digest per admin at 30 / 7 / 1 days, in-app + Telegram, no email. Opt-out via the `renewals` notification category.                                                                                                                              |
| Expired / overdue | Derived from `valid_until` / `next_payment_date` in `lib/renewals.ts` and in the cron. Never stored — a stored status needs a job to flip it.                                                                                                              |
| Mark as paid      | `record_subscription_payment()` RPC: inserts the ledger row and rolls `next_payment_date` forward one cycle in one transaction. Cadence is anchored on the existing due date; a very late payment loops until the date is in the future.                   |
| Former members    | `accreditations.holder_id` is `ON DELETE SET NULL`; `holder_name` is a trigger-set snapshot (BEFORE INSERT OR UPDATE, tolerant of the SET NULL path). Edits go through `update`, never `upsert`.                                                           |
| Documents         | `document_url` text in v1. A private Storage bucket + signed URLs (the `ticket-attachments` pattern) is the upgrade path.                                                                                                                                  |
| Reminder claiming | `renewal_reminders (entity_kind, entity_id, due_date, offset_days)`. Offsets are claimed as a window (`dueOffsets`), so a skipped run cannot lose one and a fresh record with 12 days left is reported next morning. Monthly plans skip the 30-day offset. |
| Cron slot         | `api/renewal-reminders.ts` exports `runRenewalReminders()`. On Vercel Pro it is a third `vercel.json` cron; on Hobby (two-cron cap) it is chained from `api/equipment-overdue.ts`.                                                                         |
| Money             | `numeric(12,2)` + a three-value `currency` CHECK. No conversion: the spend strip shows one line per currency.                                                                                                                                              |

## Pieces

- Migration `supabase/migrations/20260911000000_create_renewals.sql` — four tables, indexes, triggers, RPC, RLS, `notification_preferences` category CHECK, realtime publication.
- `lib/renewals.ts` — labels, date maths, derived states, `advanceByPeriod` / `rollForward` (mirror of the SQL), `summarizeSpend`, `formatMoney`, `dueOffsets`. Pure; the cron imports it too. Tests in `test/renewals.test.ts`.
- `lib/database.ts` `// === Renewals` — mappers (`Number(row.amount)`), fetch / upsert / delete, `recordSubscriptionPayment` (rpc), ledger fetch.
- `stores/dataStore.ts` — `accreditations` / `subscriptions` slices, bootstrap indices 25 / 26 (admin-gated), optimistic actions with rollback.
- `hooks/useRealtimeSync.ts` — `debouncedFetchRenewals`, admin-gated.
- `components/AccreditationsTool.tsx`, `components/SubscriptionsTool.tsx`, `components/ConfirmDeleteModal.tsx`; two cards in `components/ToolsView.tsx` with an attention badge.
- Notification type `renewal_reminder` / category `renewals`: `types.ts`, `components/Header.tsx`, `components/SettingsModal.tsx`, `supabase/functions/_shared/notification-auth.ts` (redeploy `send-telegram` and `send-email`).
- `api/renewal-reminders.ts` + `test/renewalReminders.test.ts`.

## Known limits

- An overdue subscription nobody marks paid gets no further digests; the red "Overdue" state and the Tools card badge are the safety net. Offset `0` in `dueOffsets` would add a same-day nag.
- Deleting a ledger entry does not rewind `next_payment_date` (edit the date instead); the UI says so.
- The cron does date maths in UTC, the browser at local midnight — a one-day skew around midnight Kyiv, same as task deadlines.
