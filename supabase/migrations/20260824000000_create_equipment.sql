-- Equipment checkout & tracking.
-- Physical units (cameras, lenses, mics, tripods, laptops) leave for shoots and
-- come back; this records who holds what, since when, and the full custody history.
--
-- Design notes (see docs/plans/equipment-tracking.md):
--   * The current holder is DERIVED from the open checkout row, never stored on
--     the item. A partial unique index enforces one open checkout per unit.
--   * equipment_items is admin-write-only. An operator reporting damage writes
--     needs_repair on the CHECKOUT row; an admin decides whether to pull the item.
--   * holder_id is ON DELETE SET NULL (profiles are hard-deleted on offboarding,
--     see lib/database.ts deleteMember) and holder_name is a trigger-set snapshot,
--     so the custody ledger survives an employee leaving.

BEGIN;

-- ===================
-- 1. Tables
-- ===================

CREATE TABLE public.equipment_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Printed on the sticker and carried in the QR's ?startapp= payload.
  -- The category prefix is cosmetic: equipment_items.category is the source of
  -- truth, and a prefix that stops matching after reclassification is tolerated.
  asset_code        TEXT NOT NULL UNIQUE CHECK (asset_code ~ '^[A-Z]{2,4}-[0-9]{3}$'),
  name              TEXT NOT NULL,
  category          TEXT NOT NULL CHECK (category IN ('camera', 'lens', 'audio', 'tripod', 'lighting', 'laptop', 'drone', 'other')),
  serial_number     TEXT,
  notes             TEXT,
  status            TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'maintenance', 'retired', 'lost')),
  -- Set only by an explicit "mark as printed" action after a successful physical
  -- print, never by generating or previewing the sheet. Guards asset_code changes
  -- and doubles as rollout tracking ("units still without a label").
  labels_printed_at TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.equipment_checkouts (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id              UUID NOT NULL REFERENCES public.equipment_items(id) ON DELETE CASCADE,
  holder_id            UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  -- Trigger-set snapshot of the holder's name; survives profile deletion.
  holder_name          TEXT NOT NULL,
  -- One scan session = one group. Constrained to a single holder by trigger so
  -- "return everything of mine from this group" is unambiguous.
  checkout_group_id    UUID,
  recorded_by          UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  purpose              TEXT,
  task_id              UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
  checked_out_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Required by the UI (default "today 18:00" local); NULL is stored only via an
  -- explicit long-term-assignment option and is excluded from overdue.
  expected_return_at   TIMESTAMPTZ,
  checked_in_at        TIMESTAMPTZ,
  checked_in_by        UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  checkin_note         TEXT,
  needs_repair         BOOLEAN NOT NULL DEFAULT false,
  last_overdue_ping_at TIMESTAMPTZ
);

-- Append-only audit evidence. "Last verified" = max(verified_at) per item.
CREATE TABLE public.equipment_verifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id     UUID NOT NULL REFERENCES public.equipment_items(id) ON DELETE CASCADE,
  verified_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  verified_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ===================
-- 2. Indexes
-- ===================

-- One open checkout per unit. Two people scanning the same sticker resolve to
-- one winner; the loser gets a clean constraint error.
CREATE UNIQUE INDEX idx_equipment_checkouts_open_item
  ON public.equipment_checkouts(item_id) WHERE checked_in_at IS NULL;
CREATE INDEX idx_equipment_checkouts_item_history
  ON public.equipment_checkouts(item_id, checked_out_at DESC);
CREATE INDEX idx_equipment_checkouts_open_holder
  ON public.equipment_checkouts(holder_id) WHERE checked_in_at IS NULL;
CREATE INDEX idx_equipment_checkouts_open_due
  ON public.equipment_checkouts(expected_return_at) WHERE checked_in_at IS NULL;
CREATE INDEX idx_equipment_checkouts_group
  ON public.equipment_checkouts(checkout_group_id) WHERE checkout_group_id IS NOT NULL;
CREATE INDEX idx_equipment_verifications_item
  ON public.equipment_verifications(item_id, verified_at DESC);

-- ===================
-- 3. Integrity triggers (data rules, not authorization)
-- ===================

CREATE OR REPLACE FUNCTION public.equipment_item_guard_asset_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Printed QR labels encode asset_code. Changing it after printing orphans every
  -- sticker, so this is a deliberate speed bump: an admin must clear
  -- labels_printed_at first, which makes the reprint decision conscious.
  IF NEW.asset_code IS DISTINCT FROM OLD.asset_code AND OLD.labels_printed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Asset code % already has printed labels. Clear labels_printed_at first if you intend to reprint.', OLD.asset_code;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_equipment_items_guard_asset_code
  BEFORE UPDATE ON public.equipment_items
  FOR EACH ROW EXECUTE FUNCTION public.equipment_item_guard_asset_code();

CREATE TRIGGER trg_equipment_items_updated_at
  BEFORE UPDATE ON public.equipment_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE FUNCTION public.equipment_checkout_before_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_holder_name text;
BEGIN
  IF NEW.holder_id IS NULL THEN
    RAISE EXCEPTION 'A checkout requires a holder';
  END IF;

  -- holder_name is always derived here; whatever the client sent is ignored so
  -- the snapshot can never drift from holder_id.
  SELECT name INTO v_holder_name FROM public.profiles WHERE id = NEW.holder_id;
  IF v_holder_name IS NULL THEN
    RAISE EXCEPTION 'Holder profile not found';
  END IF;
  NEW.holder_name := v_holder_name;

  IF NEW.checkout_group_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.equipment_checkouts
    WHERE checkout_group_id = NEW.checkout_group_id
      AND holder_id IS DISTINCT FROM NEW.holder_id
  ) THEN
    RAISE EXCEPTION 'A checkout group belongs to a single holder';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_equipment_checkouts_before_insert
  BEFORE INSERT ON public.equipment_checkouts
  FOR EACH ROW EXECUTE FUNCTION public.equipment_checkout_before_insert();

CREATE OR REPLACE FUNCTION public.equipment_checkout_freeze_ledger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- The UPDATE policy lets any internal member check in or amend an OPEN
  -- checkout. Without this, they could also rewrite who held the item, erasing
  -- custody history in place — a hand-over must create a second row (see
  -- transfer_equipment), never mutate the first. Admins keep an escape hatch.
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;
  IF NEW.item_id IS DISTINCT FROM OLD.item_id
     OR NEW.holder_id IS DISTINCT FROM OLD.holder_id
     OR NEW.holder_name IS DISTINCT FROM OLD.holder_name
     OR NEW.checked_out_at IS DISTINCT FROM OLD.checked_out_at
     OR NEW.checkout_group_id IS DISTINCT FROM OLD.checkout_group_id THEN
    RAISE EXCEPTION 'Custody history is immutable. Use a transfer or a new checkout instead.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_equipment_checkouts_freeze_ledger
  BEFORE UPDATE ON public.equipment_checkouts
  FOR EACH ROW EXECUTE FUNCTION public.equipment_checkout_freeze_ledger();

-- Trigger execution does not depend on API-role EXECUTE grants
-- (mirrors 20260813000000_harden_function_privileges.sql).
REVOKE ALL ON FUNCTION public.equipment_item_guard_asset_code()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.equipment_checkout_before_insert()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.equipment_checkout_freeze_ledger()
  FROM PUBLIC, anon, authenticated;

-- ===================
-- 4. Atomic hand-to-hand transfer
-- ===================

-- Check-in + immediate check-out in ONE transaction. Doing this as two sequential
-- client writes is unsafe: if the second loses a race the gear is physically in
-- someone's hands while the registry says it is on the shelf.
CREATE OR REPLACE FUNCTION public.transfer_equipment(
  p_checkout_id uuid,
  p_new_holder_id uuid
)
RETURNS SETOF public.equipment_checkouts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_id uuid;
  v_open public.equipment_checkouts%ROWTYPE;
BEGIN
  IF NOT public.is_full_access() THEN
    RAISE EXCEPTION 'Only full-access users can transfer equipment';
  END IF;

  v_actor_id := public.current_profile_id();
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'No profile for the current session';
  END IF;

  -- Lock the open checkout so a concurrent check-in or transfer serialises here.
  SELECT * INTO v_open
  FROM public.equipment_checkouts
  WHERE id = p_checkout_id
  FOR UPDATE;

  IF v_open.id IS NULL THEN
    RAISE EXCEPTION 'Checkout not found';
  END IF;
  IF v_open.checked_in_at IS NOT NULL THEN
    RAISE EXCEPTION 'This item has already been returned';
  END IF;
  IF v_open.holder_id = p_new_holder_id THEN
    RAISE EXCEPTION 'The item is already held by this person';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_new_holder_id AND access_scope = 'full'
  ) THEN
    RAISE EXCEPTION 'The new holder must be a full-access member';
  END IF;

  UPDATE public.equipment_checkouts
  SET checked_in_at = now(),
      checked_in_by = v_actor_id,
      checkin_note  = COALESCE(checkin_note, 'Transferred to another holder')
  WHERE id = p_checkout_id;

  -- The shoot continues: purpose, task and expected return carry over. The new
  -- row starts its own group (groups are per holder, per scan session).
  -- holder_name is a placeholder here; the BEFORE INSERT trigger derives it.
  RETURN QUERY
  INSERT INTO public.equipment_checkouts (
    item_id, holder_id, holder_name, recorded_by, purpose, task_id, expected_return_at
  )
  VALUES (
    v_open.item_id, p_new_holder_id, '', v_actor_id, v_open.purpose, v_open.task_id, v_open.expected_return_at
  )
  RETURNING *;
END;
$$;

-- ===================
-- 5. Row Level Security
-- ===================

ALTER TABLE public.equipment_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipment_checkouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipment_verifications ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.equipment_items REPLICA IDENTITY FULL;
ALTER TABLE public.equipment_checkouts REPLICA IDENTITY FULL;

-- Read: every internal (full-access) member. External collaborators are out of
-- scope for equipment entirely.
CREATE POLICY equipment_items_select ON public.equipment_items
  FOR SELECT TO authenticated USING (public.is_full_access());
CREATE POLICY equipment_checkouts_select ON public.equipment_checkouts
  FOR SELECT TO authenticated USING (public.is_full_access());
CREATE POLICY equipment_verifications_select ON public.equipment_verifications
  FOR SELECT TO authenticated USING (public.is_full_access());

-- The registry itself is admin-write-only: no non-admin write path remains, so
-- no column-level grants or authorization triggers are needed.
CREATE POLICY equipment_items_insert_admin ON public.equipment_items
  FOR INSERT TO authenticated WITH CHECK (public.is_admin() AND public.is_full_access());
CREATE POLICY equipment_items_update_admin ON public.equipment_items
  FOR UPDATE TO authenticated
  USING (public.is_admin() AND public.is_full_access())
  WITH CHECK (public.is_admin() AND public.is_full_access());
CREATE POLICY equipment_items_delete_admin ON public.equipment_items
  FOR DELETE TO authenticated USING (public.is_admin() AND public.is_full_access());

-- Anyone internal takes gear for themselves; only admins issue on someone's behalf.
CREATE POLICY equipment_checkouts_insert ON public.equipment_checkouts
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_full_access()
    AND (holder_id = public.current_profile_id() OR public.is_admin())
  );

-- Any internal member may check in or amend an OPEN checkout (a driver returns
-- the van's gear). Closed history rows are immutable to non-admins.
CREATE POLICY equipment_checkouts_update ON public.equipment_checkouts
  FOR UPDATE TO authenticated
  USING (public.is_full_access() AND (public.is_admin() OR checked_in_at IS NULL))
  WITH CHECK (public.is_full_access());

CREATE POLICY equipment_checkouts_delete_admin ON public.equipment_checkouts
  FOR DELETE TO authenticated USING (public.is_admin() AND public.is_full_access());

-- The shelf walk is done by whoever manages gear, not necessarily an admin.
-- Append-only: no UPDATE or DELETE policy exists at all.
CREATE POLICY equipment_verifications_insert ON public.equipment_verifications
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_full_access()
    AND verified_by = public.current_profile_id()
  );

-- ===================
-- 6. Notification preferences + realtime
-- ===================

ALTER TABLE public.notification_preferences
  DROP CONSTRAINT IF EXISTS notification_preferences_category_check;
ALTER TABLE public.notification_preferences
  ADD CONSTRAINT notification_preferences_category_check
  CHECK (category IN ('tasks', 'deadlines', 'mentions', 'schedule', 'members', 'support', 'equipment'));

-- A subscription only fires if the table is in the publication; see CLAUDE.md.
ALTER PUBLICATION supabase_realtime ADD TABLE public.equipment_items;
ALTER PUBLICATION supabase_realtime ADD TABLE public.equipment_checkouts;

COMMIT;
