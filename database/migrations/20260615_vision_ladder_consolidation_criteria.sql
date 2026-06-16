-- 20260615_vision_ladder_consolidation_criteria.sql
-- SD-LEO-INFRA-V1-CONSOLIDATION-PROBES-001 (FR-1 + FR-4): seed the 3 chairman-ratified V1
-- CONSOLIDATION-cluster criteria rows (ordinals 23-25) into the EXISTING vision_ladder_criteria table
-- for the active V1 rung, and record the 2 always-on operating invariants as text-only rung metadata.
--
-- DATA-ROWS-ONLY (additive): no new tables, no new columns, no DDL — this only INSERTs 3 consolidation
-- criteria rows + writes a jsonb key into the EXISTING vision_ladder_rungs.metadata. Sorts AFTER
-- 20260615_vision_ladder_active_pointer.sql (which created the table + seeded ordinals 1-11) by filename.
--
-- COHERENCE INVARIANT (assertRegistryCoherence): these 3 capability labels are BYTE-IDENTICAL to the 3
-- VDR_REGISTRY entries added in lib/vision/vdr-registry.js in the SAME PR. The DB rows (denominator) and
-- the code probes (numerator) MUST land together — a label drift drives coherence.ok=false and the WHOLE
-- gauge withholds (available:false). Land FR-1 (this file) and FR-3 (registry code) ATOMICALLY.
--
-- HONEST-GAUGE NOTE: this supplies only the DENOMINATOR (which capabilities count). The NUMERATOR is the
-- live typed probes (FR-3): count_ratio on sd_backlog_map (~13/145 ≈ 9% → partial), db_count on
-- ehg_page_routes (>=6 → built), db_count on competitive_baselines (>=1 → built). today/required below are
-- DESCRIPTIVE chairman-ladder metadata only — NOT used to credit 'built' (presence != realized).
--
-- FR-4: the 2 always-on operating PROPERTIES are recorded as text in metadata->'operating_invariants' —
-- they are NOT criteria rows and have NO probe (adding a probe would make coherence demand a criteria/
-- registry pair and withhold). They do not affect the gauge denominator or coherence.
--
-- IDEMPOTENT: ON CONFLICT (rung_id, capability) DO NOTHING for the rows; jsonb_set for the invariants is
-- naturally idempotent (same value each apply). (rung_id, capability) is the table's ONLY UNIQUE
-- constraint; (rung_id, ordinal) is a plain non-unique index and must NOT be a conflict target.
--
-- CHAIRMAN-GATED: NO -- @approved-by line. Ships dormant; until the chairman applies it the gauge
-- WITHHOLDS the 3 new capabilities (registry present, criteria absent → staleProbes) — by design.

BEGIN;

INSERT INTO vision_ladder_criteria (rung_id, ordinal, capability, today, required)
SELECT r.id, c.ordinal, c.capability, c.today, c.required
FROM vision_ladder_rungs r
CROSS JOIN (VALUES
  (23, 'Backlog distilled and dispositioned',              'backlog distillation begun (~13/145 items COMPLETED — a strict lower-bound proxy for dispositioned; no separate disposition column yet); conversion-ledger integration not yet started', 'the backlog is fully distilled and each item dispositioned (build/research/reference/cancel) or integrated'),
  (24, 'Application presentation-surface consolidation',   'all 8 presentation routes are mapped to canonical feature areas (orphan-free); surface-count reduction not separately measured',                                          'all application presentation surfaces consolidated into the canonical surface set'),
  (25, 'Competitive vigilance process established',        'only placeholder STATUS_QUO/ASSUMPTION baselines exist (stale); no OBSERVED competitor baselines yet — process not yet established',                                      'a recurring competitive-vigilance process is established (and exercised) producing OBSERVED baselines')
) AS c(ordinal, capability, today, required)
WHERE r.rung_key = 'V1'
ON CONFLICT (rung_id, capability) DO NOTHING;

-- FR-4: 2 text-only operating invariants on the V1 rung metadata (no probe, no criteria row).
UPDATE vision_ladder_rungs
SET metadata = jsonb_set(
      COALESCE(metadata, '{}'::jsonb),
      '{operating_invariants}',
      '["Compute is not a constraint", "Governance-only app / no data-entry GUI"]'::jsonb,
      true)
WHERE rung_key = 'V1';

-- In-DB self-verification: prove the 3 consolidation rows landed, V1 has >=14 criteria, and the 2
-- operating invariants are recorded.
DO $verify$
DECLARE
  cons_count integer;
  inv_count  integer;
BEGIN
  SELECT count(*) INTO cons_count
    FROM vision_ladder_criteria c JOIN vision_ladder_rungs r ON r.id = c.rung_id
   WHERE r.rung_key = 'V1'
     AND c.capability IN (
       'Backlog distilled and dispositioned',
       'Application presentation-surface consolidation',
       'Competitive vigilance process established');
  IF cons_count <> 3 THEN
    RAISE EXCEPTION 'vision ladder consolidation: expected 3 consolidation criteria, found %', cons_count;
  END IF;

  SELECT jsonb_array_length(metadata->'operating_invariants') INTO inv_count
    FROM vision_ladder_rungs WHERE rung_key = 'V1';
  IF inv_count IS NULL OR inv_count <> 2 THEN
    RAISE EXCEPTION 'vision ladder consolidation: expected 2 operating_invariants, found %', inv_count;
  END IF;
END
$verify$;

COMMIT;

-- ROLLBACK (reverse): remove ONLY the 3 consolidation rows + the operating_invariants key:
--   DELETE FROM vision_ladder_criteria c USING vision_ladder_rungs r
--    WHERE c.rung_id = r.id AND r.rung_key = 'V1'
--      AND c.capability IN (
--        'Backlog distilled and dispositioned',
--        'Application presentation-surface consolidation',
--        'Competitive vigilance process established');
--   UPDATE vision_ladder_rungs SET metadata = metadata - 'operating_invariants' WHERE rung_key = 'V1';
