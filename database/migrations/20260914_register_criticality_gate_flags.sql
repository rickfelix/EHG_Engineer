-- 20260914_register_criticality_gate_flags.sql
-- SD-LEO-INFRA-FILING-TOOLS-ENFORCE-001 (TR-2)
--
-- Registers the two leo_feature_flags rows FR-1 and FR-2 read: warn-first
-- rollout gates for the criticality-verdict check on QF and SD filing tools
-- (chairman ratification e38df53f, 2026-09-14).
--
-- QF_CRITICALITY_GATE_ENFORCE (FR-1): gates whether scripts/create-quick-fix.js
-- BLOCKS on a missing --criticality verdict, vs. only logging a
-- would-have-REFUSED warning (observe-only). Default OFF -- flipping this on
-- day one would refuse every QF filed by a caller that has not yet adopted
-- the --criticality flag, including automated generators not touched by
-- this SD (FR-2's own scope names only 2 of 8 createSD() CLI lanes as
-- wired). Enable only after filers have had one release cycle to adopt
-- --criticality.
--
-- SD_CRITICALITY_GATE_ENFORCE (FR-2): same shape, for createSD() in
-- lib/sd-creation/pipeline.js. Independently promotable from the QF flag --
-- SD and QF filer populations and volumes differ (measured 2026-09-14:
-- 113 SD vs 256 QF created/7d).
--
-- Explicitly set lifecycle_state='disabled' on both rows rather than
-- relying on the column default -- leo_feature_flags has a live CHECK
-- constraint chk_flag_lifecycle_enabled_consistency
-- (CHECK (is_enabled = (lifecycle_state = 'enabled'))) that a naive
-- {is_enabled:false} INSERT without an explicit lifecycle_state would
-- violate. Pattern follows 20260823_register_path_integrity_flags.sql.
--
-- Idempotent: ON CONFLICT (flag_key) DO NOTHING -- this migration only ever
-- establishes the initial safe-default rows; a later operator flip must
-- never be silently reverted by a re-run.

INSERT INTO leo_feature_flags (
  flag_key, display_name, description, is_enabled, lifecycle_state,
  risk_tier, is_temporary, gates_what, enablement_criteria
) VALUES
(
  'QF_CRITICALITY_GATE_ENFORCE',
  'Quick-Fix Filing: Criticality Verdict Enforcement (harness backlog baseline, ratification e38df53f)',
  'Gates whether scripts/create-quick-fix.js (SD-LEO-INFRA-FILING-TOOLS-ENFORCE-001, FR-1) BLOCKS filing when no --criticality verdict is supplied, vs. only logging a would-have-REFUSED warning and filing anyway. Default OFF -- flipping on day one would refuse every QF from a filer that has not yet adopted --criticality. Enable only after filers have had one release cycle to adopt the flag.',
  false,
  'disabled',
  'medium',
  false,
  'scripts/create-quick-fix.js filing for any caller that omits --criticality.',
  'Enable only after the would-have-REFUSED warning has been observed for an acceptable window and filer adoption of --criticality is confirmed.'
),
(
  'SD_CRITICALITY_GATE_ENFORCE',
  'SD Filing: Criticality Verdict Enforcement (harness backlog baseline, ratification e38df53f)',
  'Gates whether createSD() (lib/sd-creation/pipeline.js, SD-LEO-INFRA-FILING-TOOLS-ENFORCE-001, FR-2) BLOCKS creation when no criticality option is supplied, vs. only logging a would-have-REFUSED warning and creating anyway. Default OFF -- only 2 of 8 leo-create-sd.js CLI lanes are wired with --criticality by this SD; the other 6 lanes and any caller that has not adopted the option would be refused if flipped early. Independently promotable from QF_CRITICALITY_GATE_ENFORCE (different filer population/volume).',
  false,
  'disabled',
  'medium',
  false,
  'createSD() (lib/sd-creation/pipeline.js) for any caller that supplies no criticality option, including the 6 not-yet-wired CLI lanes and any programmatic caller not yet stamped by FR-2/FR-4.',
  'Enable only after the would-have-REFUSED warning has been observed for an acceptable window, the remaining 6 CLI lanes and any other live callers are confirmed to supply criticality, and filer adoption is confirmed.'
)
ON CONFLICT (flag_key) DO NOTHING;
