-- SD-FDBK-INFRA-LOOP-REWARDS-CATCHES-001 / FR-1, FR-2, FR-4
-- Recurrence ledger keyed on defect CLASS with a verified-fix date per class, so the weekly
-- number is classes that recurred after a verified fix (not QFs/SDs minted). Additive only --
-- no existing table (feedback, quick_fixes, strategic_directives_v2) is touched; specimens
-- reference those rows by source_type + source_id (text), not FK, to avoid schema coupling.
--
-- Write path: scripts/defect-class-classify.js is the SOLE sanctioned writer (FR-3). This is
-- enforced by convention, not by RLS role separation, because every script in this fleet
-- (workers, coordinator, classifier) authenticates with the same SUPABASE_SERVICE_ROLE_KEY --
-- RLS here only blocks the anon/authenticated public-facing roles, following the
-- commitments_table.sql (20260830) precedent: pg_default_acl in this database grants
-- anon/authenticated full DML on new relations by default, so a bare CREATE TABLE with no
-- RLS/REVOKE would let the public anon key forge or erase ledger rows.
--
-- Rollback (uncomment + execute via database-agent if needed):
--   DROP VIEW IF EXISTS public.v_defect_class_weekly_recurrence;
--   DROP TABLE IF EXISTS public.defect_class_specimens;
--   DROP TABLE IF EXISTS public.defect_classes;

BEGIN;

CREATE TABLE IF NOT EXISTS public.defect_classes (
  class_key TEXT PRIMARY KEY,
  family_description TEXT NOT NULL,
  memory_index_anchor TEXT,
  first_witnessed TIMESTAMPTZ NOT NULL DEFAULT now(),
  verified_fix_date TIMESTAMPTZ,
  fixing_sd_or_qf TEXT,
  classified_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.defect_classes IS 'SD-FDBK-INFRA-LOOP-REWARDS-CATCHES-001 FR-1: Solomon-owned defect-class taxonomy (R1 pattern). Written ONLY via scripts/defect-class-classify.js.';

CREATE TABLE IF NOT EXISTS public.defect_class_specimens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_key TEXT REFERENCES public.defect_classes(class_key),
  source_type TEXT NOT NULL CHECK (source_type IN ('feedback', 'quick_fix', 'sd')),
  source_id TEXT NOT NULL,
  witnessed_at TIMESTAMPTZ NOT NULL,
  classified_by TEXT NOT NULL,
  classified_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.defect_class_specimens IS 'SD-FDBK-INFRA-LOOP-REWARDS-CATCHES-001 FR-2: links a specimen (feedback/quick_fix/sd row) to a defect class. class_key IS NULL = UNCLASSIFIED bucket, never silently dropped from reports.';

CREATE INDEX IF NOT EXISTS idx_defect_class_specimens_class_key ON public.defect_class_specimens (class_key);
CREATE INDEX IF NOT EXISTS idx_defect_class_specimens_unclassified ON public.defect_class_specimens (witnessed_at) WHERE class_key IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_defect_class_specimens_source ON public.defect_class_specimens (source_type, source_id);

-- FR-4: the weekly number = COUNT(DISTINCT class_key) whose verified_fix_date is set AND
-- which has at least one specimen witnessed strictly AFTER that date (recurrence, not the
-- fix's own originating specimen).
CREATE OR REPLACE VIEW public.v_defect_class_weekly_recurrence AS
SELECT
  dc.class_key,
  dc.family_description,
  dc.verified_fix_date,
  dc.fixing_sd_or_qf,
  MIN(s.witnessed_at) FILTER (WHERE s.witnessed_at > dc.verified_fix_date) AS first_recurrence_at,
  COUNT(s.id) FILTER (WHERE s.witnessed_at > dc.verified_fix_date) AS recurrence_specimen_count
FROM public.defect_classes dc
JOIN public.defect_class_specimens s ON s.class_key = dc.class_key
WHERE dc.verified_fix_date IS NOT NULL
GROUP BY dc.class_key, dc.family_description, dc.verified_fix_date, dc.fixing_sd_or_qf
HAVING COUNT(s.id) FILTER (WHERE s.witnessed_at > dc.verified_fix_date) > 0;

COMMENT ON VIEW public.v_defect_class_weekly_recurrence IS 'SD-FDBK-INFRA-LOOP-REWARDS-CATCHES-001 FR-4: one row per class that has recurred after its verified fix. COUNT(*) over this view (optionally filtered by first_recurrence_at within a week window) IS the weekly number. Empty result set = 0 recurrences, never null/error.';

ALTER TABLE public.defect_classes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS defect_classes_service_role ON public.defect_classes;
CREATE POLICY defect_classes_service_role
  ON public.defect_classes
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
REVOKE ALL ON public.defect_classes FROM anon, authenticated, PUBLIC;
GRANT ALL ON public.defect_classes TO service_role;

ALTER TABLE public.defect_class_specimens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS defect_class_specimens_service_role ON public.defect_class_specimens;
CREATE POLICY defect_class_specimens_service_role
  ON public.defect_class_specimens
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
REVOKE ALL ON public.defect_class_specimens FROM anon, authenticated, PUBLIC;
GRANT ALL ON public.defect_class_specimens TO service_role;

REVOKE ALL ON public.v_defect_class_weekly_recurrence FROM anon, authenticated, PUBLIC;
GRANT SELECT ON public.v_defect_class_weekly_recurrence TO service_role;

COMMIT;
