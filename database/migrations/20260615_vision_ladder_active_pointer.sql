-- 20260615_vision_ladder_active_pointer.sql
-- SD-LEO-INFRA-VISION-LADDER-V1-001 (FR-1c): the machine-readable RE-ANCHORABLE vision ladder
-- pointer that the VDR gauge (FR-4) and the Adam exec-summary (FR-5) read.
--
-- WHY A POINTER (not prose): the ladder must re-anchor without code edits. Exactly ONE rung is
-- 'active' at a time (V1 now); V2/V3 are NAMED placeholders. When the active rung reaches 100% of
-- its criteria AND the chairman confirms, a future migration/script flips is_active to the next
-- rung and the gauge + email re-point automatically (they read whichever rung is active).
--
-- TWO ADDITIVE TABLES (no change to any existing table):
--   vision_ladder_rungs     — the ladder rungs; a partial unique index enforces "exactly one active".
--   vision_ladder_criteria  — per-rung { capability, today, required } rows = the SAME shape the VDR
--                             probes consume (vdr-registry.parseCapabilityGap output). The V1 criteria
--                             labels match the 11 VDR_REGISTRY capability labels EXACTLY so the gauge's
--                             assertRegistryCoherence() stays green on the DB source path.
--
-- HONEST-GAUGE NOTE: this pointer only supplies the DENOMINATOR (which capabilities count). The
-- NUMERATOR is still the live typed probes (kr_status/db_count/code_grep). The today/required text
-- here is descriptive chairman-ladder metadata only — it is NOT used to credit "built" (presence !=
-- realized). A capability whose probe is unmeasurable stays 'unknown' and is excluded, never 0%.
--
-- CHAIRMAN PROD-DEPLOY GATE: this migration is intentionally NOT yet attested. Before applying to
-- production with `node scripts/apply-migration.js <file> --prod-deploy`, the CHAIRMAN must add the
-- line `-- @approved-by: <chairman-email>` (matching git user.email) — deliberately absent because the
-- worker may not self-author the chairman attestation (CONST-002). Ships DORMANT.

BEGIN;

-- ── The ladder rungs (V1 active; V2/V3 named placeholders) ──
CREATE TABLE IF NOT EXISTS vision_ladder_rungs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rung_key    text NOT NULL UNIQUE,              -- 'V1' | 'V2' | 'V3'
  vision_key  text NOT NULL,                     -- eva_vision_documents.vision_key the rung anchors to
  title       text NOT NULL,                     -- human label
  sequence    integer NOT NULL,                  -- ladder order (1=first rung)
  is_active   boolean NOT NULL DEFAULT false,    -- exactly one true at a time (enforced below)
  achieved_at timestamptz,                       -- set when the rung hit 100% + chairman confirm
  metadata    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Exactly ONE active rung (the re-anchor invariant). Partial unique index over the constant `true`.
CREATE UNIQUE INDEX IF NOT EXISTS uq_vision_ladder_one_active
  ON vision_ladder_rungs ((is_active)) WHERE is_active;

-- ── Per-rung criteria = the gauge denominator rows ({ capability, today, required }) ──
CREATE TABLE IF NOT EXISTS vision_ladder_criteria (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rung_id     uuid NOT NULL REFERENCES vision_ladder_rungs(id) ON DELETE CASCADE,
  ordinal     integer NOT NULL,                  -- document order (mirrors the vision table row order)
  capability  text NOT NULL,                     -- MUST match a VDR_REGISTRY label for coherence
  today       text NOT NULL DEFAULT '',          -- chairman ladder "today" assessment (descriptive only)
  required    text NOT NULL DEFAULT '',          -- chairman ladder "required" target (descriptive only)
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rung_id, capability)
);
CREATE INDEX IF NOT EXISTS idx_vision_ladder_criteria_rung ON vision_ladder_criteria (rung_id, ordinal);

-- RLS: authenticated read; service_role full write (governance-table convention — mirrors
-- vision_build_gauge / adam_adherence_ledger).
ALTER TABLE vision_ladder_rungs ENABLE ROW LEVEL SECURITY;
ALTER TABLE vision_ladder_criteria ENABLE ROW LEVEL SECURITY;

CREATE POLICY vision_ladder_rungs_read ON vision_ladder_rungs
  FOR SELECT USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');
CREATE POLICY vision_ladder_rungs_service_write ON vision_ladder_rungs
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY vision_ladder_criteria_read ON vision_ladder_criteria
  FOR SELECT USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');
CREATE POLICY vision_ladder_criteria_service_write ON vision_ladder_criteria
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- ── Seed the ladder: V1 active (anchored to the canonical L1 doc); V2/V3 named placeholders ──
-- Idempotent: ON CONFLICT (rung_key) keeps the existing row (no clobber of chairman edits/achievement).
INSERT INTO vision_ladder_rungs (rung_key, vision_key, title, sequence, is_active)
VALUES
  ('V1', 'VISION-EHG-L1-001', 'V1 — Capability-saturated, solo-operable EHG (income-replacement precursor)', 1, true),
  ('V2', 'VISION-EHG-L1-001', 'V2 — First revenue venture(s): distance-to-quit instrumented (named placeholder)', 2, false),
  ('V3', 'VISION-EHG-L1-001', 'V3 — Portfolio scaled to the chairman quit-threshold (named placeholder)', 3, false)
ON CONFLICT (rung_key) DO NOTHING;

-- Seed V1 criteria = the 11 REQUIRED capabilities the VDR_REGISTRY probes. Labels MUST match
-- VDR_REGISTRY exactly (assertRegistryCoherence). today/required are descriptive ladder metadata.
-- Idempotent: ON CONFLICT (rung_id, capability) DO NOTHING.
INSERT INTO vision_ladder_criteria (rung_id, ordinal, capability, today, required)
SELECT r.id, c.ordinal, c.capability, c.today, c.required
FROM vision_ladder_rungs r
CROSS JOIN (VALUES
  (1,  'Take a real dollar',                  'no venture can accept a real payment yet',          'at least one venture can accept real payment'),
  (2,  'See distance-to-quit',                'income gauge not rendered',                          'the income/distance-to-quit gauge rendered'),
  (3,  'See distance-to-broke',               'no runway gauge in the cockpit',                     'runway/distance-to-broke visible in the cockpit'),
  (4,  'Venture-performance read',            'no venture-performance gauge',                       'venture-performance read in the chairman cockpit'),
  (5,  'Run a self-operating venture',        'no sustained self-operating venture org',            'a self-operating venture org producing sustained activity'),
  (6,  'Compound venture-level learning',     'venture-learning engine not firing',                 'a compounding venture-level learning engine'),
  (7,  'Solo-operator survivability',         'breakage not reliably caught before customers',      '>=90% breakage caught before customers (solo-operator safe)'),
  (8,  'Calibrate the gates',                 'gate calibration not data-driven',                   'gates calibrated against a cohort with data'),
  (9,  'The cockpit',                         'canonical surfaces not consolidated',                'the canonical chairman cockpit surfaces'),
  (10, 'Turn the fleet dial with data',       'fleet effort/spend not data-tunable',                'fleet dial tuned with token/effort data'),
  (11, 'A queryable, structured north star',  'north star tracked but not realized',                'a queryable, structured north star')
) AS c(ordinal, capability, today, required)
WHERE r.rung_key = 'V1'
ON CONFLICT (rung_id, capability) DO NOTHING;

-- In-DB self-verification (proves the invariants at apply time).
DO $verify$
DECLARE
  active_count integer;
  v1_crit_count integer;
BEGIN
  SELECT count(*) INTO active_count FROM vision_ladder_rungs WHERE is_active;
  IF active_count <> 1 THEN
    RAISE EXCEPTION 'vision ladder: expected exactly 1 active rung, found %', active_count;
  END IF;
  SELECT count(*) INTO v1_crit_count
    FROM vision_ladder_criteria c JOIN vision_ladder_rungs r ON r.id = c.rung_id
   WHERE r.rung_key = 'V1';
  IF v1_crit_count <> 11 THEN
    RAISE EXCEPTION 'vision ladder: expected 11 V1 criteria, found %', v1_crit_count;
  END IF;
END
$verify$;

COMMIT;

-- ROLLBACK (reverse):
--   DROP TABLE IF EXISTS vision_ladder_criteria;
--   DROP TABLE IF EXISTS vision_ladder_rungs;
