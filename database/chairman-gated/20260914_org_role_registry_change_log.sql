-- @chairman-gated
-- SD-LEO-INFRA-VERSIONED-ROLE-REGISTRY-001 (FR-4) -- org_role_change_log: append-only audit
-- trail for all three registry layers (base, overlay, pin).
--
-- @approved-by: <PENDING -- chairman must add this line + a token before apply>
--   Chairman verification NOT yet obtained. Staged only, per R1 (ratification bb2175d2). Not
--   applied to any environment by this SD. See the companion base migration
--   (20260914_org_role_registry_base.sql) for the full provenance and design citation.
--   WHY chairman-gated: REVOKE/GRANT DDL is unconditionally FORBIDDEN_TOPLEVEL content in
--   scripts/lib/migration-tier-classifier.mjs -- TIER-2, same as the two companion migrations and
--   this repo's leo_protocol_sections_history precedent, which this table's trigger design
--   mirrors directly. (classifyMigration() actually reports the leading BEGIN; as its first hit
--   before reaching that line -- see the base migration's header for the full note.)
--
-- ============================================================================
-- WHY THIS TABLE EXISTS.
--
-- Chairman directive cba1573f: "we need to do the same thing with those 28 roles ... maintain
-- some history of the different versions we made." Design section 3.9: "a promotion candidate
-- must carry evidence provenance." This table is the durable, trigger-populated change trail
-- across all three layers -- base, overlay, pin -- so a later reader (chairman, Solomon, an
-- audit) can see exactly what changed, when, by whom, and (for base/overlay layer changes) with
-- what supporting evidence, without trusting any application-layer log that could be silently
-- skipped.
--
-- MODELLED ON: database/chairman-gated/20260824_leo_protocol_sections_history.sql -- AFTER
-- INSERT/UPDATE/DELETE triggers on the source tables write here (the precedent's own AFTER
-- DELETE trigger, present from its first version, is why a DELETE-blind first draft of THIS
-- migration was a genuine regression from the pattern being copied, not merely an omission --
-- fixed, deep-tier /ship adversarial review); a separate set of BEFORE UPDATE/DELETE/TRUNCATE
-- guard triggers on THIS table make it append-only. ALL trigger sets here -- the three writer
-- triggers on the source tables AND the three guard triggers on this table -- use
-- ENABLE ALWAYS TRIGGER so they survive `SET LOCAL session_replication_role = 'replica'`
-- (chairman_ratifications' own SECURITY finding M1 covered only its OWN guard triggers; the same
-- bypass applies equally to a writer trigger on a SOURCE table, closed here on both sides).
-- DIFFERS from the precedent in scope: ONE change_log table serves THREE source tables
-- (base/overlay/pin), distinguished by the `layer` column, rather than one history table per
-- source table -- the three layers are logically one registry and a reader wants one
-- chronological trail across all of them for a given role_key.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.org_role_change_log (
  id            BIGSERIAL PRIMARY KEY,

  role_key      TEXT NOT NULL,
  layer         TEXT NOT NULL CHECK (layer IN ('base', 'overlay', 'pin')),
  -- Adversarial review finding (deep-tier /ship review, CRITICAL): the original version omitted
  -- DELETE -- a service_role session (the same actor that legitimately writes everything) could
  -- hard-delete a base/overlay/pin row with ZERO audit trace, directly contradicting this table's
  -- own stated purpose ("a reader can see exactly what changed... without trusting any
  -- application-layer log that could be silently skipped").
  operation     TEXT NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),

  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- NULL for base-layer changes (base has no venture dimension); set for overlay/pin changes.
  venture_id    UUID,

  old_value     JSONB,
  new_value     JSONB,

  changed_by    TEXT NOT NULL,

  -- Evidence provenance for the change (design section 3.9). Nullable -- not every base/pin
  -- change originates from a self-change proposal; a first adoption or an administrative pin
  -- carries no "evidence" in that sense.
  evidence_ref  JSONB,

  CONSTRAINT org_role_change_log_role_key_nonempty CHECK (btrim(role_key) <> ''),
  CONSTRAINT org_role_change_log_changed_by_nonempty CHECK (btrim(changed_by) <> ''),
  CONSTRAINT org_role_change_log_insert_has_new CHECK (operation <> 'INSERT' OR new_value IS NOT NULL),
  CONSTRAINT org_role_change_log_update_has_both CHECK (operation <> 'UPDATE' OR (old_value IS NOT NULL AND new_value IS NOT NULL)),
  CONSTRAINT org_role_change_log_delete_has_old CHECK (operation <> 'DELETE' OR (old_value IS NOT NULL AND new_value IS NULL))
);

CREATE INDEX IF NOT EXISTS org_role_change_log_role_key_idx
  ON public.org_role_change_log (role_key, occurred_at);

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- WRITER: one shared function, called from AFTER INSERT/UPDATE/DELETE triggers on each of the
-- three layer tables. Branches on TG_TABLE_NAME to set `layer` and pick the right venture_id
-- source; branches on TG_OP because DELETE has no NEW row (OLD only).
--
-- Adversarial review finding (deep-tier /ship review, CRITICAL): the original version only
-- handled INSERT/UPDATE, so a DELETE on any of the three source tables left NO trace here at
-- all -- the exact silent-log-skip failure mode this table's own header claims to prevent. Fixed
-- by adding DELETE handling below AND making these writer triggers ENABLE ALWAYS (see below) --
-- the SAME M1 vulnerability class (SET LOCAL session_replication_role='replica' suppressing a
-- plain-mode trigger) that chairman_ratifications was fixed for applies equally to a writer
-- trigger on a SOURCE table, not only to a guard trigger on the log table itself.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.log_org_role_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $logfn$
DECLARE
  v_layer TEXT;
  v_venture_id UUID;
  v_role_key TEXT;
  v_changed_by TEXT;
BEGIN
  IF TG_TABLE_NAME = 'org_role_base_versions' THEN
    v_layer := 'base';
    v_venture_id := NULL;
    v_role_key := COALESCE(NEW.role_key, OLD.role_key);
    v_changed_by := COALESCE(NEW.created_by, OLD.created_by);
  ELSIF TG_TABLE_NAME = 'org_role_venture_overlays' THEN
    v_layer := 'overlay';
    v_venture_id := COALESCE(NEW.venture_id, OLD.venture_id);
    v_role_key := COALESCE(NEW.role_key, OLD.role_key);
    v_changed_by := COALESCE(NEW.created_by, OLD.created_by);
  ELSIF TG_TABLE_NAME = 'org_role_venture_pins' THEN
    v_layer := 'pin';
    v_venture_id := COALESCE(NEW.venture_id, OLD.venture_id);
    v_role_key := COALESCE(NEW.role_key, OLD.role_key);
    v_changed_by := COALESCE(NEW.pinned_by, OLD.pinned_by);
  ELSE
    RAISE EXCEPTION 'log_org_role_change: unexpected source table %', TG_TABLE_NAME;
  END IF;

  INSERT INTO public.org_role_change_log (role_key, layer, operation, venture_id, old_value, new_value, changed_by)
  VALUES (
    v_role_key,
    v_layer,
    TG_OP,
    v_venture_id,
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END,
    v_changed_by
  );

  RETURN COALESCE(NEW, OLD);
END
$logfn$;

DROP TRIGGER IF EXISTS trg_org_role_base_versions_log ON public.org_role_base_versions;
CREATE TRIGGER trg_org_role_base_versions_log
  AFTER INSERT OR UPDATE OR DELETE ON public.org_role_base_versions
  FOR EACH ROW EXECUTE FUNCTION public.log_org_role_change();
ALTER TABLE public.org_role_base_versions ENABLE ALWAYS TRIGGER trg_org_role_base_versions_log;

DROP TRIGGER IF EXISTS trg_org_role_venture_overlays_log ON public.org_role_venture_overlays;
CREATE TRIGGER trg_org_role_venture_overlays_log
  AFTER INSERT OR UPDATE OR DELETE ON public.org_role_venture_overlays
  FOR EACH ROW EXECUTE FUNCTION public.log_org_role_change();
ALTER TABLE public.org_role_venture_overlays ENABLE ALWAYS TRIGGER trg_org_role_venture_overlays_log;

DROP TRIGGER IF EXISTS trg_org_role_venture_pins_log ON public.org_role_venture_pins;
CREATE TRIGGER trg_org_role_venture_pins_log
  AFTER INSERT OR UPDATE OR DELETE ON public.org_role_venture_pins
  FOR EACH ROW EXECUTE FUNCTION public.log_org_role_change();
ALTER TABLE public.org_role_venture_pins ENABLE ALWAYS TRIGGER trg_org_role_venture_pins_log;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- APPEND-ONLY GUARDS on org_role_change_log itself (TS-4). No sanctioned mutation exists here at
-- all -- unlike chairman_ratifications' one-time encode transition, a change-log row is complete
-- the instant it is written.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.org_role_change_log_no_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $noupdate$
BEGIN
  RAISE EXCEPTION 'org_role_change_log is append-only: row % cannot be updated.', OLD.id;
END
$noupdate$;

DROP TRIGGER IF EXISTS org_role_change_log_no_update_trg ON public.org_role_change_log;
CREATE TRIGGER org_role_change_log_no_update_trg
  BEFORE UPDATE ON public.org_role_change_log
  FOR EACH ROW EXECUTE FUNCTION public.org_role_change_log_no_update();

CREATE OR REPLACE FUNCTION public.org_role_change_log_no_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $nodelete$
BEGIN
  RAISE EXCEPTION 'org_role_change_log is append-only: row % cannot be deleted.', OLD.id;
END
$nodelete$;

DROP TRIGGER IF EXISTS org_role_change_log_no_delete_trg ON public.org_role_change_log;
CREATE TRIGGER org_role_change_log_no_delete_trg
  BEFORE DELETE ON public.org_role_change_log
  FOR EACH ROW EXECUTE FUNCTION public.org_role_change_log_no_delete();

-- Row-level triggers do NOT fire for TRUNCATE -- only a statement-level trigger can intercept it.
CREATE OR REPLACE FUNCTION public.org_role_change_log_no_truncate()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $notrunc$
BEGIN
  RAISE EXCEPTION 'org_role_change_log is append-only: TRUNCATE is not permitted.';
END
$notrunc$;

DROP TRIGGER IF EXISTS org_role_change_log_no_truncate_trg ON public.org_role_change_log;
CREATE TRIGGER org_role_change_log_no_truncate_trg
  BEFORE TRUNCATE ON public.org_role_change_log
  FOR EACH STATEMENT EXECUTE FUNCTION public.org_role_change_log_no_truncate();

-- ALWAYS-mode so the guards survive SET LOCAL session_replication_role = 'replica' -- see
-- chairman_ratifications' SECURITY finding M1; fixed here from the start.
ALTER TABLE public.org_role_change_log ENABLE ALWAYS TRIGGER org_role_change_log_no_update_trg;
ALTER TABLE public.org_role_change_log ENABLE ALWAYS TRIGGER org_role_change_log_no_delete_trg;
ALTER TABLE public.org_role_change_log ENABLE ALWAYS TRIGGER org_role_change_log_no_truncate_trg;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- POSTURE.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.org_role_change_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_role_change_log_service_role ON public.org_role_change_log;
CREATE POLICY org_role_change_log_service_role
  ON public.org_role_change_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);

REVOKE ALL ON public.org_role_change_log FROM anon, authenticated, PUBLIC;
GRANT ALL ON public.org_role_change_log TO service_role;

COMMENT ON TABLE public.org_role_change_log IS
  'SD-LEO-INFRA-VERSIONED-ROLE-REGISTRY-001 (FR-4). Append-only, trigger-populated change trail '
  'across all three registry layers (base/overlay/pin), distinguished by the layer column. No '
  'sanctioned mutation exists -- unlike chairman_ratifications, rows are complete on write.';

COMMIT;
