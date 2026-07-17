-- SD-LEO-INFRA-EVA-CONSULTANT-GENERATOR-001 (FR-5)
-- ADDITIVE, nullable, REVERSIBLE, idempotent. No drops/renames. No FK/REFERENCES clause
-- (deliberately, to stay in the tier-1/delegatable classification path -- verified against
-- scripts/lib/migration-tier-classifier.mjs, which excludes FK-bearing ADD COLUMN from the
-- automated path by design; see 20260623_eva_consultant_recommendations_distillation_queue.sql
-- for the sibling migration that intentionally opted OUT of delegation for that reason).
--
-- Adds the write-time dedup contract to eva_consultant_recommendations, extending the pattern
-- from the completed SD-LEO-INFRA-GAUGE-FINDING-KNOWN-STATE-ACK-001 (whose own migration is
-- chairman-gated and not yet applied live -- this SD does not depend on that migration):
--   * fingerprint   -> stable per-finding identity (domain + sources[0] or a volatile-number-
--                      normalized title), computed by consultant-analysis-round.mjs at
--                      generation time. Indexed for the write-time dedup lookup.
--   * re_review_at  -> when set, a finding sharing this fingerprint is suppressed from
--                      re-insertion until this timestamp passes (time-bounded, not permanent).
--   * disposition   -> reserved, unused by this SD's own generator logic. Forward-compatible
--                      column for the descoped follow-up SD (review-SLA/disposition-echo).
--
-- Idempotent (IF NOT EXISTS) so a re-run is a no-op.

ALTER TABLE eva_consultant_recommendations
  ADD COLUMN IF NOT EXISTS fingerprint text;

ALTER TABLE eva_consultant_recommendations
  ADD COLUMN IF NOT EXISTS re_review_at timestamptz;

ALTER TABLE eva_consultant_recommendations
  ADD COLUMN IF NOT EXISTS disposition text;

CREATE INDEX IF NOT EXISTS idx_eva_consultant_recommendations_fingerprint
  ON eva_consultant_recommendations(fingerprint);

COMMENT ON COLUMN eva_consultant_recommendations.fingerprint IS
  'SD-LEO-INFRA-EVA-CONSULTANT-GENERATOR-001: stable per-finding identity used for write-time dedup, independent of volatile runtime-computed numbers in the rendered title.';
COMMENT ON COLUMN eva_consultant_recommendations.re_review_at IS
  'SD-LEO-INFRA-EVA-CONSULTANT-GENERATOR-001: a finding sharing this row''s fingerprint is suppressed from re-insertion until this timestamp passes.';
COMMENT ON COLUMN eva_consultant_recommendations.disposition IS
  'Reserved for a follow-up SD (review-SLA/disposition-echo); unused by SD-LEO-INFRA-EVA-CONSULTANT-GENERATOR-001''s own generator logic.';

-- ROLLBACK (reversible):
--   DROP INDEX IF EXISTS idx_eva_consultant_recommendations_fingerprint;
--   ALTER TABLE eva_consultant_recommendations DROP COLUMN IF EXISTS disposition;
--   ALTER TABLE eva_consultant_recommendations DROP COLUMN IF EXISTS re_review_at;
--   ALTER TABLE eva_consultant_recommendations DROP COLUMN IF EXISTS fingerprint;
