-- Accreditations & subscriptions tracking (Tools → Accreditations / Subscriptions).
-- Two "a date after which someone must act" registers, admin-only end to end:
--   * accreditations — a journalist's press / military / parliament / event pass,
--     with an expiry the newsroom has to renew before it lapses.
--   * subscriptions — paid services with a next payment date; "mark as paid"
--     records a payment and rolls the date forward one billing cycle.
--
-- Design notes (see docs/plans/renewals-tracking.md):
--   * expired / overdue are DERIVED from the dates (client + cron), never stored.
--   * holder_id is ON DELETE SET NULL (profiles are hard-deleted on offboarding,
--     see lib/database.ts deleteMember) and holder_name is a trigger-set
--     snapshot, so the record survives the person leaving.
--   * renewal_reminders dedups the daily digest cron by (entity, due date,
--     offset); a changed date gets fresh reminders for free.

BEGIN;

-- ===================
-- 1. Tables
-- ===================

CREATE TABLE public.accreditations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  holder_id     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  -- Trigger-set snapshot of the holder's name; survives profile deletion.
  holder_name   TEXT NOT NULL,
  issuer        TEXT NOT NULL,
  kind          TEXT NOT NULL CHECK (kind IN ('military', 'government', 'parliament', 'event', 'press_card', 'other')),
  card_number   TEXT,
  issued_at     DATE,
  -- NULL = no expiry date.
  valid_until   DATE,
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('pending', 'active', 'revoked')),
  document_url  TEXT,
  notes         TEXT,
  created_by    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.subscriptions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_name      TEXT NOT NULL,
  category          TEXT NOT NULL DEFAULT 'software'
                    CHECK (category IN ('software', 'ai', 'media', 'hosting', 'communication', 'other')),
  plan              TEXT,
  amount            NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
  currency          TEXT NOT NULL DEFAULT 'USD' CHECK (currency IN ('UAH', 'USD', 'EUR')),
  billing_period    TEXT NOT NULL DEFAULT 'monthly'
                    CHECK (billing_period IN ('monthly', 'quarterly', 'yearly', 'one_time')),
  -- NULL = nothing scheduled (a one-time purchase already paid, or not set yet).
  next_payment_date DATE,
  owner_id          UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  account_email     TEXT,
  payment_method    TEXT,
  website_url       TEXT,
  document_url      TEXT,
  status            TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'cancelled')),
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Payment ledger. Written by record_subscription_payment(); deleting a row does
-- NOT rewind next_payment_date — the date is edited in the form instead.
CREATE TABLE public.subscription_payments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  paid_at         DATE NOT NULL,
  amount          NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
  currency        TEXT NOT NULL,
  note            TEXT,
  recorded_by     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Dedup table for the daily renewal-reminder cron (api/renewal-reminders.ts).
-- The key guarantees a given reminder fires at most once per entity / due date /
-- offset. Polymorphic on purpose: one claim path in the cron. Rows whose entity
-- is gone are inert and bounded (at most three per due date).
CREATE TABLE public.renewal_reminders (
  entity_kind TEXT NOT NULL CHECK (entity_kind IN ('accreditation', 'subscription')),
  entity_id   UUID NOT NULL,
  due_date    DATE NOT NULL,
  offset_days SMALLINT NOT NULL CHECK (offset_days IN (1, 7, 30)),
  sent_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (entity_kind, entity_id, due_date, offset_days)
);

-- ===================
-- 2. Indexes
-- ===================

-- The cron and the "expiring soon" views only ever look at active rows.
CREATE INDEX idx_accreditations_active_valid_until
  ON public.accreditations(valid_until) WHERE status = 'active';
-- Makes the ON DELETE SET NULL cascade from profiles cheap.
CREATE INDEX idx_accreditations_holder ON public.accreditations(holder_id);
CREATE INDEX idx_subscriptions_active_next_payment
  ON public.subscriptions(next_payment_date) WHERE status = 'active';
CREATE INDEX idx_subscription_payments_history
  ON public.subscription_payments(subscription_id, paid_at DESC);

-- ===================
-- 3. Integrity triggers (data rules, not authorization)
-- ===================

CREATE TRIGGER trg_accreditations_updated_at
  BEFORE UPDATE ON public.accreditations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER trg_subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE FUNCTION public.accreditation_set_holder_name()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_name text;
BEGIN
  -- holder_name is always derived here; whatever the client sent is ignored so
  -- the snapshot can never drift from holder_id.
  IF NEW.holder_id IS NOT NULL THEN
    SELECT name INTO v_name FROM public.profiles WHERE id = NEW.holder_id;
    IF v_name IS NULL THEN
      RAISE EXCEPTION 'Holder profile not found';
    END IF;
    NEW.holder_name := v_name;
    RETURN NEW;
  END IF;

  -- No holder. On INSERT that is a client error. On UPDATE it is the
  -- ON DELETE SET NULL path of an offboarded profile, so keep the snapshot.
  IF TG_OP = 'INSERT' THEN
    RAISE EXCEPTION 'An accreditation requires a holder';
  END IF;
  NEW.holder_name := OLD.holder_name;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_accreditations_set_holder_name
  BEFORE INSERT OR UPDATE ON public.accreditations
  FOR EACH ROW EXECUTE FUNCTION public.accreditation_set_holder_name();

-- Trigger execution does not depend on API-role EXECUTE grants
-- (mirrors 20260813000000_harden_function_privileges.sql).
REVOKE ALL ON FUNCTION public.accreditation_set_holder_name()
  FROM PUBLIC, anon, authenticated;

-- ===================
-- 4. Record a payment and roll the due date forward, atomically
-- ===================

-- Two sequential client writes (insert payment, update date) could leave a
-- payment recorded with the date unchanged, or the reverse, if one of them
-- loses a race or fails. One function, one transaction.
CREATE OR REPLACE FUNCTION public.record_subscription_payment(
  p_subscription_id uuid,
  p_paid_at date DEFAULT current_date,
  p_amount numeric DEFAULT NULL,
  p_note text DEFAULT NULL
)
RETURNS SETOF public.subscriptions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sub  public.subscriptions%ROWTYPE;
  v_next date;
  v_step interval;
BEGIN
  IF NOT (public.is_admin() AND public.is_full_access()) THEN
    RAISE EXCEPTION 'Only full-access admins can record subscription payments';
  END IF;
  IF p_amount IS NOT NULL AND p_amount < 0 THEN
    RAISE EXCEPTION 'Amount cannot be negative';
  END IF;

  -- Lock the row so two admins marking the same payment serialise here.
  SELECT * INTO v_sub
  FROM public.subscriptions
  WHERE id = p_subscription_id
  FOR UPDATE;

  IF v_sub.id IS NULL THEN
    RAISE EXCEPTION 'Subscription not found';
  END IF;

  INSERT INTO public.subscription_payments (subscription_id, paid_at, amount, currency, note, recorded_by)
  VALUES (
    v_sub.id,
    p_paid_at,
    COALESCE(p_amount, v_sub.amount),
    v_sub.currency,
    NULLIF(btrim(p_note), ''),
    public.current_profile_id()
  );

  IF v_sub.billing_period = 'one_time' THEN
    v_next := NULL;
  ELSE
    v_step := CASE v_sub.billing_period
      WHEN 'monthly'   THEN interval '1 month'
      WHEN 'quarterly' THEN interval '3 months'
      WHEN 'yearly'    THEN interval '1 year'
    END;
    -- The cadence stays anchored on the existing due date, not on the day the
    -- payment was recorded. A payment marked months late still lands the next
    -- date in the future. Postgres clamps month-end (31 Jan + 1 month = 28 Feb);
    -- lib/renewals.ts rollForward() mirrors this for the optimistic UI.
    v_next := COALESCE(v_sub.next_payment_date, p_paid_at);
    LOOP
      v_next := (v_next + v_step)::date;
      EXIT WHEN v_next > p_paid_at;
    END LOOP;
  END IF;

  RETURN QUERY
  UPDATE public.subscriptions
  SET next_payment_date = v_next
  WHERE id = v_sub.id
  RETURNING *;
END;
$$;

REVOKE ALL ON FUNCTION public.record_subscription_payment(uuid, date, numeric, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_subscription_payment(uuid, date, numeric, text)
  TO authenticated;

-- ===================
-- 5. Row Level Security — admin-only registers
-- ===================

ALTER TABLE public.accreditations        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.renewal_reminders     ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.accreditations REPLICA IDENTITY FULL;
ALTER TABLE public.subscriptions  REPLICA IDENTITY FULL;

-- Both registers live under /tools, which is admin-only in the UI; the policies
-- make that true at the data layer as well.
CREATE POLICY accreditations_select_admin ON public.accreditations
  FOR SELECT TO authenticated USING (public.is_admin() AND public.is_full_access());
CREATE POLICY accreditations_insert_admin ON public.accreditations
  FOR INSERT TO authenticated WITH CHECK (public.is_admin() AND public.is_full_access());
CREATE POLICY accreditations_update_admin ON public.accreditations
  FOR UPDATE TO authenticated
  USING (public.is_admin() AND public.is_full_access())
  WITH CHECK (public.is_admin() AND public.is_full_access());
CREATE POLICY accreditations_delete_admin ON public.accreditations
  FOR DELETE TO authenticated USING (public.is_admin() AND public.is_full_access());

CREATE POLICY subscriptions_select_admin ON public.subscriptions
  FOR SELECT TO authenticated USING (public.is_admin() AND public.is_full_access());
CREATE POLICY subscriptions_insert_admin ON public.subscriptions
  FOR INSERT TO authenticated WITH CHECK (public.is_admin() AND public.is_full_access());
CREATE POLICY subscriptions_update_admin ON public.subscriptions
  FOR UPDATE TO authenticated
  USING (public.is_admin() AND public.is_full_access())
  WITH CHECK (public.is_admin() AND public.is_full_access());
CREATE POLICY subscriptions_delete_admin ON public.subscriptions
  FOR DELETE TO authenticated USING (public.is_admin() AND public.is_full_access());

-- Payments are written by the SECURITY DEFINER function above; admins may read
-- the ledger and remove a mistaken entry. No UPDATE policy: entries are not
-- edited in place.
CREATE POLICY subscription_payments_select_admin ON public.subscription_payments
  FOR SELECT TO authenticated USING (public.is_admin() AND public.is_full_access());
CREATE POLICY subscription_payments_delete_admin ON public.subscription_payments
  FOR DELETE TO authenticated USING (public.is_admin() AND public.is_full_access());

-- Writes happen only via the service role from the Vercel cron function.
CREATE POLICY renewal_reminders_select_admin ON public.renewal_reminders
  FOR SELECT TO authenticated USING (public.is_admin());

-- ===================
-- 6. Notification preferences + realtime
-- ===================

ALTER TABLE public.notification_preferences
  DROP CONSTRAINT IF EXISTS notification_preferences_category_check;
ALTER TABLE public.notification_preferences
  ADD CONSTRAINT notification_preferences_category_check
  CHECK (category IN ('tasks', 'deadlines', 'mentions', 'schedule', 'members', 'support', 'equipment', 'renewals'));

-- A subscription only fires if the table is in the publication; see CLAUDE.md.
-- subscription_payments is fetched on demand, so it is not published.
ALTER PUBLICATION supabase_realtime ADD TABLE public.accreditations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.subscriptions;

COMMIT;
