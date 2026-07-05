-- SD-LEO-INFRA-POST-BUILD-ARTIFACT-001-B
-- Creates post_build_verdicts: one row per (venture, artifact, claim), the durable
-- output of the artifact-walk/evidence-linking engine that Child C's scoring +
-- convergence loop consumes.
--
-- ARCHITECTURE NOTE: blueprint_quality_assessments was evaluated and rejected —
-- its gate_decision CHECK constraint is restricted to {pass,fail,retry} (3 values,
-- incompatible with this SD's 5-way disposition taxonomy) and its grain is one row
-- per venture ASSESSMENT, not one row per enumerated item. A new table is required.
--
-- GRAIN DECISION (directly applying Child A's retrospective lesson — that SD's
-- recordDeviation() collided with a live unique index because grain wasn't proven
-- before EXEC): this table is UPSERT-based, not append-only. The S19->S20 gate
-- re-fires the artifact walk on every remediation-convergence cycle; only the
-- CURRENT verdict per (venture_id, artifact_type, claim_ref) matters for scoring,
-- so a genuine ON CONFLICT ... DO UPDATE is used everywhere this table is written
-- (see lib/eva/post-build-verdict-engine.js) — re-running the walk for the same
-- key is safe BY CONSTRUCTION, not merely by avoiding an unrelated index.
--
-- ADDITIVE ONLY: new table, no existing objects touched.
CREATE TABLE IF NOT EXISTS post_build_verdicts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id uuid NOT NULL REFERENCES ventures(id) ON DELETE CASCADE,
  artifact_type text NOT NULL,
  claim_ref text NOT NULL,
  disposition text NOT NULL CHECK (disposition IN (
    'BUILT', 'PARTIAL', 'MISSING', 'DEVIATED_WITH_DOCUMENTED_REASON', 'DEVIATED_UNDOCUMENTED'
  )),
  evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  deviation_artifact_id uuid,
  claim_description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_post_build_verdicts_item UNIQUE (venture_id, artifact_type, claim_ref)
);

COMMENT ON TABLE post_build_verdicts IS
  'One row per enumerated (venture, artifact_type, claim). UPSERT target — re-running '
  'the artifact walk for the same key UPDATEs in place (ON CONFLICT DO UPDATE), never '
  'collides. Read by Child C''s scoring + convergence loop.';
COMMENT ON COLUMN post_build_verdicts.claim_ref IS
  'Stable identifier for the specific claim within the artifact (e.g. a user-story key). '
  'For artifact-level dispositions with no sub-claim breakdown, use the artifact_type value itself.';
COMMENT ON COLUMN post_build_verdicts.evidence_refs IS
  'Array of {path, line} references into the target venture''s OWN repo. Never raw file content.';
COMMENT ON COLUMN post_build_verdicts.deviation_artifact_id IS
  'venture_artifacts.id of the Child-A deviation record, when disposition is DEVIATED_WITH_DOCUMENTED_REASON.';

CREATE INDEX IF NOT EXISTS idx_post_build_verdicts_venture ON post_build_verdicts (venture_id);
CREATE INDEX IF NOT EXISTS idx_post_build_verdicts_disposition ON post_build_verdicts (disposition);

ALTER TABLE post_build_verdicts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access to post_build_verdicts" ON post_build_verdicts;
CREATE POLICY "Service role full access to post_build_verdicts"
  ON post_build_verdicts FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Authenticated can read post_build_verdicts" ON post_build_verdicts;
CREATE POLICY "Authenticated can read post_build_verdicts"
  ON post_build_verdicts FOR SELECT
  USING (auth.role() = 'authenticated');
