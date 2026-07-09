-- SD-LEO-INFRA-VALUE-AUTHENTICITY-SPEC-001 (FR-1, FR-6)
-- Canonical criteria library: the anti-mock assertion forms (T0-T4) that spec authors
-- SELECT + PARAMETERIZE from, and that pair-half B (APA runtime, SD-LEO-INFRA-VALUE-
-- AUTHENTICITY-APA-001) reads + runs at runtime by criterion_id (round-trip SSOT,
-- docs/design/value-authenticity-system-design.md §4.3).
--
-- Contract version 1 (FR-6 exit criterion): criterion_id format is 'VA-<T_FORM>-<slug>'
-- (e.g. VA-T1-source-reached-market-research). This format is frozen as of this
-- migration; a future breaking change to the ID scheme requires a documented contract
-- version bump (add a `contract_version` value, never silently reshape existing rows).

CREATE TABLE IF NOT EXISTS value_authenticity_criteria_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  criterion_id TEXT NOT NULL UNIQUE,
  contract_version INTEGER NOT NULL DEFAULT 1,
  t_form TEXT NOT NULL CHECK (t_form IN ('T0', 'T1', 'T2', 'T3', 'T4')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  -- What a spec author fills in when selecting this form for a leaf (FR-1).
  -- Shape varies per T-form; documented per-row in parameter_schema_notes.
  parameter_schema JSONB NOT NULL DEFAULT '{}'::jsonb,
  parameter_schema_notes TEXT,
  -- E0-E3 weakest-link evidence grade (§2 primitive #2). This table defines the FIELD;
  -- the propagation engine across domain-claim -> spec-criterion -> runtime-verdict is
  -- L3's job (a future SD), not this one.
  evidence_grade TEXT CHECK (evidence_grade IN ('E0', 'E1', 'E2', 'E3')),
  -- true for T0/T1/T2 (hard catchers, can gate); false for T3/T4 (soft corroborators,
  -- can never hard-fail a leaf per SSOT §1-L1 fail-closed bar).
  hard_catcher BOOLEAN NOT NULL,
  -- Free-text provenance of why this form is proven mock-distinguishing (the FR-1
  -- meta-gate: v1 is manual-review-with-checklist, not an automated prover).
  mock_distinguishing_proof TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_value_authenticity_criteria_library_t_form
  ON value_authenticity_criteria_library (t_form);

-- Seed the 5 T0-T4 forms (FR-1 acceptance criterion), each mapped to the MarketLens
-- persona-generation origin incident per docs/design/value-authenticity-system-design.md
-- §4.1 (the gate's own acceptance test / TS-1).
INSERT INTO value_authenticity_criteria_library
  (criterion_id, t_form, title, description, parameter_schema, parameter_schema_notes, hard_catcher, mock_distinguishing_proof)
VALUES
  (
    'VA-T0-source-exists',
    'T0',
    'Source-EXISTS static check',
    'AST/grep the value engine for ANY external dependency (model call / data corpus / external fetch). A pure-function-of-user-input implementation is an automatic finding. Catches the honest stub.',
    '{"target_module": "string (path to the value-engine module)", "expected_external_dependency_pattern": "string (e.g. an API call, a corpus file read, an LLM invocation)"}'::jsonb,
    'Author supplies the module path and what external dependency SHOULD be present; the check fails if grep/AST finds none.',
    true,
    'MarketLens''s FNV-1a hash stub has NO external dependency (pure function of input text) — T0 catches it trivially. Any real research/generation engine has a real dependency; a stub by definition does not.'
  ),
  (
    'VA-T1-source-reached',
    'T1',
    'Source-REACHED runtime instrumentation assertion (PRIMARY hard catcher)',
    'During the walkthrough, APA''s own instrumentation (instrument-don''t-mock; author != adjudicator, never the build''s own test suite) asserts the declared source was ACTUALLY consulted at runtime. Catches the dishonest stub that deleted the honesty comment. Keys on the PRODUCT-LEVEL claim (numbers presented as real research), never an in-code string.',
    '{"instrumented_call_site": "string (the exact function/API call APA must observe being invoked)", "product_level_claim": "string (the user-facing claim this call site backs, e.g. \"WTP derived from real market research\")"}'::jsonb,
    'Author names the exact call site APA instruments and the user-facing claim it substantiates — never an in-code string match (defeatable by renaming).',
    true,
    'A hash stub never reaches any external call site — T1 observes zero invocations at runtime regardless of what the code comments claim, closing the "deleted the honesty comment" loophole T0 alone cannot catch.'
  ),
  (
    'VA-T2-metamorphic-monotonicity',
    'T2',
    'Metamorphic-MONOTONICITY (deterministic, low false-positive)',
    'A CONTROLLED DIRECTED perturbation (e.g. budget up, segment shift; template-generated, no LLM) must produce the CORRESPONDING directed output change — checking direction/ordering, not absolute values. Rule: input-sensitivity != input-responsiveness. A hash stub moves outputs randomly on ANY input change; its sensitivity is uncorrelated with meaning.',
    '{"perturbation": "string (the directed input change, e.g. \"increase stated budget by 2x\")", "expected_direction": "string (the expected directional output change, e.g. \"WTP band should shift upward\")"}'::jsonb,
    'The probe BACKEND that executes this check is pair-half B''s (APA runtime) build cost — this row only defines the form/parameter shape a spec author selects at spec-time.',
    true,
    'MarketLens''s hash stub is input-sensitive (any input change moves the hash) but NOT input-responsive in a meaningful direction — a 2x budget increase does not reliably shift its WTP band upward. T2 is the form specifically designed to catch "differs per input" as insufficient.'
  ),
  (
    'VA-T3-paraphrase-invariance',
    'T3',
    'Paraphrase-INVARIANCE (SOFT corroborator only)',
    'Stability under meaning-preserving edits. FP-prone versus real LLM variance, so under the fail-closed bar it must NEVER hard-fail a leaf. Keys only on absolute-value product-sensitivity, wide tolerance, biased toward false-negatives (i.e. biased to NOT flag).',
    '{"paraphrase_pairs": "array of {original, paraphrased} input pairs", "tolerance": "number (wide tolerance band for output similarity)"}'::jsonb,
    'Soft-only: findings from this form can corroborate a T1/T2 finding but can never independently block a leaf.',
    false,
    'Corroborator only — proof of mock-distinguishing-ness is inherited from T1/T2, not independently required for a soft form.'
  ),
  (
    'VA-T4-plausibility-as-persona',
    'T4',
    'Plausibility-as-persona (model-tier, SOFT)',
    'An agent walks the flow AS the persona and judges "specific to my input vs canned boilerplate." Routed through the design SSOT §5 two-stage funnel; corroborates, never blocks.',
    '{"persona_definition": "string (the persona the judging agent adopts)", "plausibility_rubric": "string (what counts as specific-vs-canned for this leaf)"}'::jsonb,
    'Soft-only, same non-blocking constraint as T3. Judge-integrity constraints (SSOT §1-L5: brand-stripped, multimodal, triangulated) apply when this form is actually executed at runtime (pair-half B / APA Child E), not at spec-time.',
    false,
    'Corroborator only — same rationale as T3.'
  )
ON CONFLICT (criterion_id) DO NOTHING;

COMMENT ON TABLE value_authenticity_criteria_library IS
  'SD-LEO-INFRA-VALUE-AUTHENTICITY-SPEC-001: canonical anti-mock criteria library (T0-T4 forms). Spec-time gate (this SD) writes selections here; APA runtime (pair-half B, SD-LEO-INFRA-VALUE-AUTHENTICITY-APA-001) reads+runs by criterion_id. Contract version 1 — see migration header comment before changing the ID format.';
