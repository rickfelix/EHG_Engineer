-- @approved-by: codestreetlabs@gmail.com
-- SD-LEO-INFRA-PLAN-OF-RECORD-REMAINDER-VIEW-001 (follow-up to
-- 20260719_plan_of_record_remainder_view.sql)
--
-- Adds rwi.metadata to v_plan_of_record_remainder. Follow-up migration rather
-- than editing the prior file directly -- apply-migration.js's anti-tamper
-- guard rejects a content-hash mismatch against an already-applied migration
-- record, by design (audit integrity).
--
-- Needed by scripts/coordinator-charter-audit.mjs's promotable-candidate
-- verifier (hasRecoveredSubstance reads item.metadata.description) when
-- repointed to this view (FR-3).

BEGIN;

CREATE OR REPLACE VIEW v_plan_of_record_remainder WITH (security_invoker = true) AS
SELECT
  rwi.id, rwi.wave_id, rwi.title, rwi.source_type, rwi.source_id,
  rwi.promoted_to_sd_key, rwi.item_disposition, rwi.lane, rwi.priority_rank,
  rwi.remainder_state, rwi.remainder_state_stamped_at, rwi.remainder_state_stamped_by,
  rwi.created_at, rwi.updated_at,
  rw.status AS wave_status, rw.sequence_rank AS wave_sequence_rank,
  rwi.metadata
FROM roadmap_wave_items rwi
JOIN roadmap_waves rw ON rw.id = rwi.wave_id
WHERE rw.status = 'approved';

-- CREATE OR REPLACE VIEW resets grants to Supabase's default blanket
-- anon/authenticated SELECT -- must re-apply REVOKE/GRANT every time.
REVOKE ALL ON v_plan_of_record_remainder FROM PUBLIC, anon, authenticated;
GRANT SELECT ON v_plan_of_record_remainder TO service_role;

COMMIT;

-- ============================================================
-- ROLLBACK PATH (manual paste): re-run the prior migration's view definition
-- (20260719_plan_of_record_remainder_view.sql section 5) to drop the metadata
-- column back off, or simply leave it -- it is additive and harmless if kept.
