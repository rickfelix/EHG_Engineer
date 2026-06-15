-- 20260615_vision_ladder_governance_criteria.sql
-- SD-LEO-INFRA-V1-GOV-PROBES-001 (FR-1): seed the 5 chairman-ratified V1 GOVERNANCE-cluster criteria
-- rows (ordinals 12-16) into the EXISTING vision_ladder_criteria table for the active V1 rung.
--
-- DATA-ROWS-ONLY (additive): no new tables, no new columns, no DDL — this only INSERTs 5 governance
-- criteria rows into the table created by 20260615_vision_ladder_active_pointer.sql (which seeded the
-- 11 V1 criteria at ordinals 1-11). Sorts AFTER that migration by filename so the table exists first.
--
-- COHERENCE INVARIANT (assertRegistryCoherence): these 5 capability labels are BYTE-IDENTICAL to the 5
-- VDR_REGISTRY entries added in lib/vision/vdr-registry.js in the SAME PR. The DB rows (denominator) and
-- the code probes (numerator) MUST land together — a label drift drives coherence.ok=false and the WHOLE
-- gauge withholds (available:false). Land FR-1 (this file) and FR-2 (registry code) ATOMICALLY.
--
-- HONEST-GAUGE NOTE: this supplies only the DENOMINATOR (which capabilities count). The NUMERATOR is the
-- live typed probes. today/required below are DESCRIPTIVE chairman-ladder metadata only — they are NOT
-- used to credit 'built' (presence != realized). The 3 kr_status probes read 'built' from live ACHIEVED
-- governance KRs (KR-GOV-3.2/2.2/2.3); the 2 code_grep probes read 'partial' (intent) or 'unknown'.
--
-- IDEMPOTENT: ON CONFLICT (rung_id, capability) DO NOTHING — (rung_id, capability) is the table's ONLY
-- UNIQUE constraint; (rung_id, ordinal) is a plain non-unique index and must NOT be a conflict target.

BEGIN;

INSERT INTO vision_ladder_criteria (rung_id, ordinal, capability, today, required)
SELECT r.id, c.ordinal, c.capability, c.today, c.required
FROM vision_ladder_rungs r
CROSS JOIN (VALUES
  (12, 'Govern-by-exception',                          'doctrine-of-constraint enforced at the DB; not yet surfaced as chairman govern-by-exception', 'chairman governs by exception (defaults enforced, exceptions surfaced)'),
  (13, 'Decision Filter Engine',                       'decision-filter engine exists (lib/eva) but not wired as the canonical governance filter',     'a live decision-filter engine gating chairman decisions'),
  (14, 'Governance cascade enforced',                  'governance cascade layers 2 of 6 operational (KR-GOV-3.1 at_risk)',                            'all 6 governance cascade layers operational end-to-end'),
  (15, 'OKR-driven prioritization + day-28 hard stop', 'OKR priority in ranking done (KR-GOV-2.2); monthly OKR automation + day-28 hard-stop not yet (KR-GOV-3.3, 0/3)', 'OKR-driven prioritization WITH a day-28 hard stop'),
  (16, 'All 7 governance guardrails',                  'all 7 governance guardrails enforced (KR-GOV-3.2, 7/7)',                                       'all 7 governance guardrails enforced')
) AS c(ordinal, capability, today, required)
WHERE r.rung_key = 'V1'
ON CONFLICT (rung_id, capability) DO NOTHING;

-- In-DB self-verification: prove the 5 governance rows landed and V1 now has >=16 criteria.
DO $verify$
DECLARE
  gov_count integer;
  v1_total  integer;
BEGIN
  SELECT count(*) INTO gov_count
    FROM vision_ladder_criteria c JOIN vision_ladder_rungs r ON r.id = c.rung_id
   WHERE r.rung_key = 'V1'
     AND c.capability IN (
       'Govern-by-exception','Decision Filter Engine','Governance cascade enforced',
       'OKR-driven prioritization + day-28 hard stop','All 7 governance guardrails');
  IF gov_count <> 5 THEN
    RAISE EXCEPTION 'vision ladder governance: expected 5 governance criteria, found %', gov_count;
  END IF;
  SELECT count(*) INTO v1_total
    FROM vision_ladder_criteria c JOIN vision_ladder_rungs r ON r.id = c.rung_id
   WHERE r.rung_key = 'V1';
  IF v1_total < 16 THEN
    RAISE EXCEPTION 'vision ladder governance: expected >=16 V1 criteria after seed, found %', v1_total;
  END IF;
END
$verify$;

COMMIT;

-- ROLLBACK (reverse): remove ONLY the 5 governance rows (leaves the original 11 untouched):
--   DELETE FROM vision_ladder_criteria c USING vision_ladder_rungs r
--    WHERE c.rung_id = r.id AND r.rung_key = 'V1'
--      AND c.capability IN (
--        'Govern-by-exception','Decision Filter Engine','Governance cascade enforced',
--        'OKR-driven prioritization + day-28 hard stop','All 7 governance guardrails');
