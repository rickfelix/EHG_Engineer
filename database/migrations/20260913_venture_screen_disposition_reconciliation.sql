-- SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-I FR-2/FR-4 -- two new, isolated tables (no existing
-- production table altered, no existing data at risk) so this is a plain additive migration,
-- not chairman-gated. Deliberately NOT a new venture_artifacts.artifact_type value: that column
-- is governed by the live venture_artifacts_artifact_type_check CHECK constraint and its own CI
-- parity gate (tests/unit/eva/artifact-type-db-parity.test.js), which requires a chairman-gated
-- migration to widen -- these tables sidestep that dependency entirely (LEAD/PLAN-phase TESTING
-- sub-agent finding, PRD FR-4).

-- FR-2: one disposition record per unreachable-screen finding. A screen can be COMPLETE
-- (its disposition is a settled, present-tense fact -- e.g. retired) or OPEN (a commitment
-- that has not yet been independently evidenced -- e.g. "will build via Stripe portal").
CREATE TABLE IF NOT EXISTS venture_screen_dispositions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID NOT NULL REFERENCES ventures(id) ON DELETE CASCADE,
  screen_id TEXT NOT NULL,
  disposition_class TEXT NOT NULL CHECK (disposition_class IN ('D2_RETIRE', 'D2_BUILD_THIRD_PARTY', 'ENTRY_POINT')),
  disposition_status TEXT NOT NULL DEFAULT 'OPEN' CHECK (disposition_status IN ('COMPLETE', 'OPEN')),
  reason TEXT NOT NULL,
  evidence_ref TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (venture_id, screen_id)
);

CREATE INDEX IF NOT EXISTS idx_venture_screen_dispositions_venture ON venture_screen_dispositions(venture_id);

COMMENT ON TABLE venture_screen_dispositions IS
'SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-I FR-2: durable disposition for each screen the stage-15 '
'coverage reader finds unreachable by journey steps. disposition_status=OPEN means the '
'disposition is a commitment (e.g. build-via-third-party) not yet independently evidenced; '
'COMPLETE means it is a settled, present-tense fact.';
COMMENT ON COLUMN venture_screen_dispositions.disposition_class IS
'D2_RETIRE: screen intentionally retired with a written reason (present-tense, always COMPLETE). '
'D2_BUILD_THIRD_PARTY: screen handled by a third-party surface per a chairman ruling (OPEN until '
'the third-party surface is independently evidenced, then COMPLETE). ENTRY_POINT: screen is '
'genuinely built but unreferenced by any journey step because it is the journey''s own entry '
'node (COMPLETE once its backing artifact is cited via evidence_ref).';
COMMENT ON COLUMN venture_screen_dispositions.evidence_ref IS
'Citation backing the disposition: a chairman_decisions.id for D2 classes, or a venture_artifacts '
'artifact_type/id for ENTRY_POINT.';

ALTER TABLE venture_screen_dispositions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vsd_venture_access" ON venture_screen_dispositions
  FOR SELECT TO authenticated
  USING (
    venture_id IN (
      SELECT v.id FROM ventures v
      WHERE v.company_id IN (SELECT company_id FROM user_company_access WHERE user_id = auth.uid())
    )
  );
CREATE POLICY "vsd_service_role" ON venture_screen_dispositions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- FR-4: one reconciliation row per wireframe screen, tracing it through its built surface,
-- the journeys referencing it, and walked/verified UAT evidence. Additive to (not derived from)
-- venture_screen_dispositions -- a screen can be reconciliation_status='unreachable' here while
-- also having a COMPLETE disposition row above; the two tables answer different questions
-- (journey coverage vs. build/walk-through completeness).
CREATE TABLE IF NOT EXISTS venture_screen_reconciliation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID NOT NULL REFERENCES ventures(id) ON DELETE CASCADE,
  screen_id TEXT NOT NULL,
  screen_name TEXT,
  built_surface_artifact_type TEXT,
  journey_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  walked_step_evidence JSONB,
  reconciliation_status TEXT NOT NULL CHECK (reconciliation_status IN ('built_and_walked', 'built_not_walked', 'not_built', 'unreachable')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (venture_id, screen_id)
);

CREATE INDEX IF NOT EXISTS idx_venture_screen_reconciliation_venture ON venture_screen_reconciliation(venture_id);

COMMENT ON TABLE venture_screen_reconciliation IS
'SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-I FR-4: one row per wireframe screen tracing it through '
'built surface, referencing journeys, and walked/verified UAT evidence -- attached verbatim to '
'the sitting packet (chairman-product-review.js). Deliberately a dedicated table, never a new '
'venture_artifacts.artifact_type value (see file header).';

ALTER TABLE venture_screen_reconciliation ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vsr_venture_access" ON venture_screen_reconciliation
  FOR SELECT TO authenticated
  USING (
    venture_id IN (
      SELECT v.id FROM ventures v
      WHERE v.company_id IN (SELECT company_id FROM user_company_access WHERE user_id = auth.uid())
    )
  );
CREATE POLICY "vsr_service_role" ON venture_screen_reconciliation
  FOR ALL TO service_role USING (true) WITH CHECK (true);
