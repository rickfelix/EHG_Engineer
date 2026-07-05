-- SD-LEO-INFRA-POST-BUILD-ARTIFACT-001-A
-- Creates a purpose-built adherence_rubrics table for the chairman-ratified
-- Post-Build Artifact Reconciliation Gate rubric.
--
-- ARCHITECTURE NOTE (corrected during EXEC after direct schema inspection — the
-- LEAD-phase plan named leo_scoring_rubrics/leo_vetting_rubrics as reuse candidates;
-- both were found unsuitable once their actual DB-level constraints were read, not
-- just their column lists):
--   - leo_scoring_rubrics has a BEFORE INSERT trigger (leo_scoring_rubrics_validate ->
--     validate_rubric_json) that HARD-CODES the exact 6 dimension keys used by the
--     prioritization_v1 rubric (value/alignment/risk/effort/dependency/confidence) and
--     REJECTS any other dimension set. It is not a generic rubric-storage table despite
--     its name.
--   - leo_vetting_rubrics has a CHECK constraint (chk_rubric_rules_schema) requiring
--     rules->>'pass_threshold' to be a NUMERIC BETWEEN 0 AND 1 (a normalized
--     weighted-sum threshold). The chairman's actual ratified rule ("every dimension
--     >=3 AND mean >=4 on a 1-5 scale AND zero unscored") has no natural [0,1]
--     normalization without an indirect, non-obvious encoding.
-- Forcing either table would require contorting the chairman's rule into semantics it
-- wasn't designed for. A small dedicated table is clearer and equally durable.
--
-- Mirrors leo_scoring_rubrics' house style: immutable via a BEFORE UPDATE/DELETE
-- trigger (privileged roles only), versioned with a supersedes_rubric_id chain,
-- checksummed, RLS with anon-read-published + service-role-full-access.
--
-- ADDITIVE ONLY: new table, no existing objects touched.
CREATE TABLE IF NOT EXISTS adherence_rubrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rubric_key text NOT NULL,
  version integer NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'deprecated')),
  dimensions jsonb NOT NULL,
  dimension_floor numeric NOT NULL,
  mean_floor numeric NOT NULL,
  zero_unscored_fails boolean NOT NULL DEFAULT true,
  supersedes_rubric_id uuid REFERENCES adherence_rubrics(id) ON DELETE SET NULL,
  checksum text NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'::uuid,
  published_at timestamptz,
  CONSTRAINT uq_adherence_rubrics_key_version UNIQUE (rubric_key, version),
  CONSTRAINT chk_adherence_rubrics_published_has_date CHECK (
    (status = 'published' AND published_at IS NOT NULL) OR status <> 'published'
  )
);

COMMENT ON TABLE adherence_rubrics IS
  'Chairman-ratified adherence-rubric registry for the Post-Build Artifact Reconciliation '
  'Gate (SD-LEO-INFRA-POST-BUILD-ARTIFACT-001). Rows are immutable once created — future '
  'threshold changes INSERT a new version with supersedes_rubric_id set, never UPDATE.';
COMMENT ON COLUMN adherence_rubrics.dimensions IS
  'jsonb map of dimension_name -> {scale, description, evidence_required, behavioral_anchors}. '
  'No DB-level restriction on dimension names (unlike leo_scoring_rubrics).';
COMMENT ON COLUMN adherence_rubrics.dimension_floor IS 'Per-dimension minimum passing score (chairman-ratified: 3, on a 1-5 scale).';
COMMENT ON COLUMN adherence_rubrics.mean_floor IS 'Minimum mean score across all dimensions (chairman-ratified: 4, on a 1-5 scale).';
COMMENT ON COLUMN adherence_rubrics.zero_unscored_fails IS 'If true, any unscored (no-evidence) dimension fails the rubric regardless of other scores (chairman-ratified: true).';

CREATE OR REPLACE FUNCTION adherence_rubrics_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF current_setting('role', true) = 'leo_admin' OR
     current_setting('request.jwt.claims', true)::jsonb->>'role' = 'service_role' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'adherence_rubrics_immutable: UPDATE and DELETE are blocked. Rubric versions are immutable once created — INSERT a new version with supersedes_rubric_id set instead. SQLSTATE=42501';
END;
$function$;

DROP TRIGGER IF EXISTS trg_adherence_rubrics_immutable_update ON adherence_rubrics;
CREATE TRIGGER trg_adherence_rubrics_immutable_update
  BEFORE UPDATE ON adherence_rubrics
  FOR EACH ROW EXECUTE FUNCTION adherence_rubrics_immutable();

DROP TRIGGER IF EXISTS trg_adherence_rubrics_immutable_delete ON adherence_rubrics;
CREATE TRIGGER trg_adherence_rubrics_immutable_delete
  BEFORE DELETE ON adherence_rubrics
  FOR EACH ROW EXECUTE FUNCTION adherence_rubrics_immutable();

ALTER TABLE adherence_rubrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anon can read published adherence rubrics" ON adherence_rubrics;
CREATE POLICY "Anon can read published adherence rubrics"
  ON adherence_rubrics FOR SELECT
  USING (status = 'published');

DROP POLICY IF EXISTS "Service role full access to adherence_rubrics" ON adherence_rubrics;
CREATE POLICY "Service role full access to adherence_rubrics"
  ON adherence_rubrics FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Seed the chairman-ratified rubric row. Values transcribed verbatim from
-- strategic_directives_v2.metadata.rubric_thresholds_ratified on the parent orchestrator
-- SD-LEO-INFRA-POST-BUILD-ARTIFACT-001 (ratified_by='chairman', ratified_at=2026-07-04T16:40:45Z).
-- An automated test (tests/unit/eva/post-build-adherence-rubric.test.js) asserts this row
-- matches that source exactly.
WITH seed AS (
  SELECT
    jsonb_build_object(
      'user_story_coverage', jsonb_build_object(
        'scale', '1-5',
        'description', 'Do the venture''s user stories have built, evidence-linked UI/API surfaces?',
        'evidence_required', true,
        'behavioral_anchors', jsonb_build_object(
          '1', 'No evidence any user story has a built surface',
          '2', 'A minority of user stories have linked evidence; most are unverifiable or missing',
          '3', 'About half of user stories have linked evidence, including at least one UI-facing story',
          '4', 'Most user stories have linked evidence; gaps are documented deviations, not silent misses',
          '5', 'All user stories have linked evidence (BUILT or DEVIATED-WITH-DOCUMENTED-REASON); zero undocumented gaps'
        )
      ),
      'persona_surface_coverage', jsonb_build_object(
        'scale', '1-5',
        'description', 'Do persona-implied surfaces (forms, displays, signup, etc.) exist and evidence-link?',
        'evidence_required', true,
        'behavioral_anchors', jsonb_build_object(
          '1', 'No persona-implied surface has any built evidence',
          '2', 'A minority of persona-implied surfaces are evidenced',
          '3', 'About half of persona-implied surfaces are evidenced',
          '4', 'Most persona-implied surfaces are evidenced; remaining gaps are documented deviations',
          '5', 'All persona-implied surfaces are evidenced or have a documented, sensible deviation'
        )
      ),
      'data_model_fidelity', jsonb_build_object(
        'scale', '1-5',
        'description', 'Does the built schema match the planned data model / ERD / API contract?',
        'evidence_required', true,
        'behavioral_anchors', jsonb_build_object(
          '1', 'Built schema bears no resemblance to the planned data model',
          '2', 'Minor fragments of the planned data model are present',
          '3', 'Roughly half of planned entities/fields are present in the built schema',
          '4', 'Most planned entities/fields are present; deviations are documented',
          '5', 'Built schema matches the planned data model, or deviations are documented and sensible'
        )
      ),
      'architecture_conformance', jsonb_build_object(
        'scale', '1-5',
        'description', 'Does the built system conform to the planned technical architecture?',
        'evidence_required', true,
        'behavioral_anchors', jsonb_build_object(
          '1', 'Built architecture bears no resemblance to the plan',
          '2', 'Minor fragments of the planned architecture are present',
          '3', 'Roughly half of planned architectural components are present',
          '4', 'Most planned components are present; deviations are documented',
          '5', 'Built architecture matches the plan, or deviations are documented and sensible'
        )
      )
    ) AS dims
)
INSERT INTO adherence_rubrics (
  rubric_key, version, status, dimensions, dimension_floor, mean_floor,
  zero_unscored_fails, checksum, published_at
)
SELECT
  'post_build_adherence_v1',
  1,
  'published',
  seed.dims,
  3,
  4,
  true,
  md5(seed.dims::text || '3' || '4' || 'true'),
  now()
FROM seed
ON CONFLICT (rubric_key, version) DO NOTHING;
