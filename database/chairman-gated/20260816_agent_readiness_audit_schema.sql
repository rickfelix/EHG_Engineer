-- ============================ STAGED. NOT APPLIED. ============================
-- CHAIRMAN-GATED per coordinator ruling (signal 6555f927, 2026-08-16T14:03:52Z): apply-token
-- issuance for a live prod-DB write was correctly denied by the permission classifier at EXEC
-- time (this is an additive new-tables schema, not an RLS-policy-on-existing-table or
-- governed-literal-row class, but the classifier gates ANY live-DB write regardless of shape).
-- No @approved-by attestation — the builder stages; the chairman applies (matching
-- QF-20260816-456's convention: "CREATE OR REPLACE VIEW is TIER-2 ... never auto-applied. No
-- @approved-by attestation. The builder stages; the chairman applies.").
-- Schema dry-run verified in BEGIN/ROLLBACK by database-agent (sub_agent_execution_results
-- 7f9340e1, 12 negative refusals + 3 positive accepts under final names) before staging. Rides
-- the ceremony AFTER the 2026-08-17T13:30Z bundle (already frozen/reviewed) unless Adam
-- explicitly pulls it forward.
-- SD-LEO-FEAT-AGENT-READINESS-SERVICE-001 — TR-4 (agent_readiness_audit_run, agent_readiness_audit_sample, llm_txt_version).
--
-- SUPERSEDES the automatic DATABASE sub-agent pass (row aff93029-ba84-42ec-a752-ffaf27f89951,
-- PASS/100, 2026-08-16T12:16:45Z) which concluded "No database migrations needed for this SD".
-- That pass fired DURING PRD creation, before technical_requirements existed, so it measured an
-- empty PRD and reported the emptiness as a clean bill of health. TR-4 exists to record that the
-- verdict was wrong; this file is the correction.
--
-- WHAT THIS SCHEMA IS FOR, AND WHY IT IS CONSTRAINT-HEAVY.
-- The product of this service is a BEFORE/AFTER DELTA — "the found/recommended rate rose after
-- llm.txt shipped". Every column here exists to make that delta falsifiable. TR-2 records the two
-- ways it can be silently corrupted, and both are PRODUCTION-CORRECT DEFAULTS that a refactor will
-- happily restore:
--   * lib/llm/client-factory.js:435 caches identical (systemPrompt,userPrompt,model) for 30 min —
--     an "after" sample could be a replay of the "before" answer;
--   * lib/sub-agents/vetting/provider-adapters.js:747 falls back to a DIFFERENT model on 429/503 —
--     a sample attributed to model A could be model B's answer.
-- An application-level flag asserting "we set cacheTTLMs:0 and no-fallback" is a CLAIM. The CHECK
-- constraints below are a MEASUREMENT. That distinction is the whole point of the file: if the
-- flags are ever mis-plumbed, the database refuses the row and the run fails loudly, instead of
-- producing a corrupted-but-plausible delta that reads as a real result.
--
-- DELIBERATELY NOT INCLUDED: a foreign key to public.ventures. `ventures` has NO url/domain/website
-- column (measured: only id + name among candidate columns), and this service audits REAL EXTERNAL
-- BUSINESSES, not only EHG ventures — so the FK would be NULL on most rows while still taking a
-- ShareRowExclusive lock on a hot table at apply time. venture_url IS the identity here, which is
-- why it carries a normalization constraint instead.

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Canonical model-set helper.
--
-- model_set is compared BY EQUALITY in the before/after pairing query (find the "before" run with
-- the same venture_url + prompt_set_id + model_set). PostgreSQL array equality is ORDER-SENSITIVE:
-- ARRAY['claude','gpt'] <> ARRAY['gpt','claude']. Two runs over the identical model set, written by
-- callers that happened to enumerate the set in different orders, would therefore FAIL TO PAIR —
-- and a failed pair is indistinguishable from "no before run exists", i.e. the measurement silently
-- disappears rather than erroring. Canonicalizing at write time makes the pairing total.
--
-- A CHECK constraint cannot contain a subquery (SQLSTATE 0A000), so the sort+dedupe lives in an
-- IMMUTABLE function that the CHECK calls.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.canonical_model_set(models TEXT[])
RETURNS TEXT[] LANGUAGE sql IMMUTABLE STRICT AS $canon$
  SELECT array_agg(DISTINCT m ORDER BY m) FROM unnest(models) AS m
$canon$;

COMMENT ON FUNCTION public.canonical_model_set(TEXT[]) IS
  'SD-LEO-FEAT-AGENT-READINESS-SERVICE-001: sorted+deduped model set. Postgres array equality is order-sensitive, so the before/after pairing query only pairs if both runs stored the set canonically.';

-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- agent_readiness_audit_run — one row per audit execution (before or after).
-- ═════════════════════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.agent_readiness_audit_run (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The audited business. Normalized (lowercased, trimmed, no trailing slash) BY CONSTRAINT rather
  -- than by convention: this column is the join key for before/after pairing, so two spellings of
  -- one site ('https://x.com' vs 'https://x.com/') would split one venture's history into two
  -- unpairable halves and read as "no before run".
  venture_url           TEXT NOT NULL,

  run_type              TEXT NOT NULL CHECK (run_type IN ('before', 'after')),

  -- PRE-REGISTERED METHODOLOGY (FR-3). These are NOT bookkeeping — they are the registration.
  -- A run whose methodology is recorded only in the code that produced it cannot be checked later.
  prompt_set_id         TEXT NOT NULL,
  prompt_count          INTEGER NOT NULL,
  model_set             TEXT[] NOT NULL,
  samples_per_cell      INTEGER NOT NULL,
  pinned_temperature    NUMERIC(4,3) NOT NULL,

  -- FR-5: the explicit pipeline-stage marker. NOT NULL, closed vocabulary, and NOTE THE ABSENCE OF
  -- AN 'unknown' MEMBER — see the CHECK below.
  stage_tag             TEXT NOT NULL,

  -- Derived, not supplied. This is the denominator of the completeness check in
  -- v_agent_readiness_audit_run_integrity: prompts x models x replicates. A writer-supplied expected count could be
  -- back-fitted to whatever was actually written, which would make the check vacuous.
  expected_sample_count INTEGER GENERATED ALWAYS AS
                          (prompt_count * cardinality(model_set) * samples_per_cell) STORED,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT agent_readiness_audit_run_venture_url_normalized CHECK (
    venture_url = lower(btrim(venture_url))
    AND venture_url ~ '^https?://'
    AND venture_url NOT LIKE '%/'
  ),
  CONSTRAINT agent_readiness_audit_run_prompt_set_id_nonempty CHECK (btrim(prompt_set_id) <> ''),

  -- FR-3 floors, enforced here rather than trusted to the runner. A 3-prompt / 2-sample run is not
  -- a weaker version of the pre-registered methodology; it is a different experiment whose variance
  -- estimate cannot support the "improvement exceeds repeat-sample variance" claim FR-3 requires.
  CONSTRAINT agent_readiness_audit_run_prompt_count_floor    CHECK (prompt_count >= 5),
  CONSTRAINT agent_readiness_audit_run_samples_per_cell_floor CHECK (samples_per_cell >= 5),
  CONSTRAINT agent_readiness_audit_run_model_set_nonempty     CHECK (cardinality(model_set) >= 1),
  CONSTRAINT agent_readiness_audit_run_model_set_canonical
    CHECK (model_set = public.canonical_model_set(model_set)),

  -- "Pinned" is the requirement (FR-3). Pinned means recorded, and a NULL or out-of-range
  -- temperature makes the two halves of the delta incomparable.
  CONSTRAINT agent_readiness_audit_run_temperature_range CHECK (pinned_temperature >= 0 AND pinned_temperature <= 2),

  -- FR-5, the load-bearing constraint: "never silently absent". NOT NULL alone does not achieve
  -- that — a free-text column satisfies NOT NULL with 'unkown', 'n/a', '' or a typo'd stage, each
  -- of which is absent-in-effect at the read site while looking present at the write site. There is
  -- deliberately NO 'unknown'/'unspecified' member: an escape-hatch value would reconstruct the
  -- exact hole FR-5 exists to close, under a name that passes review.
  CONSTRAINT agent_readiness_audit_run_stage_tag_vocabulary CHECK (
    stage_tag IN (
      'standalone_pre_pipeline',  -- instrument run directly; venture NOT stood up via EVA Stage-0/nursery
      'eva_stage0_nursery',       -- venture stood up through the EVA Stage-0/nursery pipeline
      'dogfood_internal'          -- run against an EHG-owned property to exercise the instrument
    )
  )
);

COMMENT ON TABLE public.agent_readiness_audit_run IS
  'SD-LEO-FEAT-AGENT-READINESS-SERVICE-001 TR-4/FR-3/FR-5: one buyer-intent audit execution (before or after llm.txt ships), with its PRE-REGISTERED methodology. NOT a governance/security audit table despite the name — see COMMENT ON COLUMN stage_tag.';
COMMENT ON COLUMN public.agent_readiness_audit_run.stage_tag IS
  'FR-5: which pipeline context produced this run. Closed vocabulary with no unknown-member, so the first-pipeline-proof claim is checkable against this tag rather than asserted from memory.';
COMMENT ON COLUMN public.agent_readiness_audit_run.expected_sample_count IS
  'Derived denominator for completeness. A run with fewer actual samples than this had samples REFUSED by the agent_readiness_audit_sample integrity CHECKs — see v_agent_readiness_audit_run_integrity.';

-- The before/after pairing query: same venture_url + prompt_set_id + model_set, opposite run_type,
-- most recent first. Leading columns match the equality predicates in that order.
CREATE INDEX IF NOT EXISTS agent_readiness_audit_run_pair_lookup_idx
  ON public.agent_readiness_audit_run (venture_url, prompt_set_id, model_set, run_type, created_at DESC);

-- FR-5 read pattern: "show me every run that came through the nursery pipeline".
CREATE INDEX IF NOT EXISTS agent_readiness_audit_run_stage_tag_idx
  ON public.agent_readiness_audit_run (stage_tag, created_at DESC);

-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- agent_readiness_audit_sample — one row per (prompt, model, replicate) within a run.
--
-- NOTE THE CARDINALITY. TR-4's data contract reads "one row per (prompt, model) sample within a
-- run", but FR-3 requires n>=5 samples per (prompt,model) AND uses the spread across those repeats
-- as the noise floor the improvement must beat. The grain is therefore (prompt, model, REPLICATE);
-- a (prompt, model) unique key would have made the variance estimator unstorable.
-- ═════════════════════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.agent_readiness_audit_sample (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  audit_run_id           UUID NOT NULL REFERENCES public.agent_readiness_audit_run(id) ON DELETE CASCADE,

  prompt                 TEXT NOT NULL,

  -- The two measurement-integrity columns. See the CHECKs below — they are the reason this table
  -- is worth more than a log file.
  requested_model        TEXT NOT NULL,
  actual_responder_model TEXT NOT NULL,
  cache_hit              BOOLEAN NOT NULL,

  -- Which replicate within the (run, prompt, model) cell. 1-based.
  sample_index           INTEGER NOT NULL,

  found                  BOOLEAN NOT NULL,
  recommended            BOOLEAN NOT NULL,
  raw_response           TEXT NOT NULL,

  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT agent_readiness_audit_sample_prompt_nonempty          CHECK (btrim(prompt) <> ''),
  CONSTRAINT agent_readiness_audit_sample_requested_model_nonempty CHECK (btrim(requested_model) <> ''),
  CONSTRAINT agent_readiness_audit_sample_sample_index_positive    CHECK (sample_index >= 1),

  -- raw_response is the evidence for found/recommended. An empty one makes those two booleans
  -- unfalsifiable assertions.
  CONSTRAINT agent_readiness_audit_sample_raw_response_nonempty CHECK (btrim(raw_response) <> ''),

  -- ───────────────────────────────────────────────────────────────────────────────────────────
  -- THE TWO INTEGRITY INVARIANTS, ENFORCED AT THE DATABASE RATHER THAN THE APPLICATION.
  --
  -- Both encode TR-2. Application-side, "no fallback" and "no cache" are FLAGS PASSED TO A SHARED
  -- CLIENT whose defaults are the opposite (30-min cache at client-factory.js:435; model fallback
  -- at provider-adapters.js:747) — and those defaults are CORRECT for every other caller, so they
  -- will never be removed and a future refactor restoring them is a normal, reviewable change that
  -- looks right. The failure is silent by construction: a cached or substituted answer is a
  -- well-formed answer. Nothing downstream can tell it apart from a real one.
  --
  -- Refusing the row converts that silent corruption into a write error at the moment it happens.
  -- Cost of the constraint: a refused sample leaves a GAP rather than a marked-bad row — which is
  -- why expected_sample_count and v_agent_readiness_audit_run_integrity exist. Guarding only the sample would have
  -- covered the wrong half: the constraint makes bad samples impossible, and the completeness view
  -- makes MISSING samples visible.
  -- ───────────────────────────────────────────────────────────────────────────────────────────
  CONSTRAINT agent_readiness_audit_sample_no_fallback CHECK (actual_responder_model = requested_model),
  CONSTRAINT agent_readiness_audit_sample_no_cache    CHECK (cache_hit = false)
);

COMMENT ON TABLE public.agent_readiness_audit_sample IS
  'SD-LEO-FEAT-AGENT-READINESS-SERVICE-001 TR-4: one (prompt, model, replicate) sample. Grain includes the replicate because FR-3 uses same-run repeat spread as the noise floor.';
COMMENT ON CONSTRAINT agent_readiness_audit_sample_no_fallback ON public.agent_readiness_audit_sample IS
  'TR-2: in audit mode a rate-limited primary must FAIL the sample, never be substituted. A substituted answer is well-formed and otherwise indistinguishable from a real one.';
COMMENT ON CONSTRAINT agent_readiness_audit_sample_no_cache ON public.agent_readiness_audit_sample IS
  'TR-2: client-factory.js caches identical prompts for 30 min. A cached "after" sample can be a replay of the "before" answer, which manufactures a zero delta or a fake one.';

-- One row per cell-replicate. Prompts are unbounded text and a btree index row is capped at ~2704
-- bytes, so the prompt participates as md5() rather than in full.
CREATE UNIQUE INDEX IF NOT EXISTS agent_readiness_audit_sample_cell_replicate_key
  ON public.agent_readiness_audit_sample (audit_run_id, md5(prompt), requested_model, sample_index);

-- Postgres does not index foreign keys automatically; every read here is by run, and the ON DELETE
-- CASCADE needs it too.
CREATE INDEX IF NOT EXISTS agent_readiness_audit_sample_run_idx
  ON public.agent_readiness_audit_sample (audit_run_id);

-- The rate computation: found/recommended counts per (run, model).
CREATE INDEX IF NOT EXISTS agent_readiness_audit_sample_rate_idx
  ON public.agent_readiness_audit_sample (audit_run_id, requested_model, found, recommended);

-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- llm_txt_version — one row per generated llm.txt version per venture.
-- ═════════════════════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.llm_txt_version (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  venture_url         TEXT NOT NULL,
  content             TEXT NOT NULL,

  -- FR-7. The lint rejects reading-agent-directed imperatives (prompt injection wearing the costume
  -- of disclosure).
  content_lint_passed BOOLEAN NOT NULL,
  lint_report         JSONB,

  -- NULL = generated but not live. Liveness is DERIVED (latest non-null published_at wins) rather
  -- than stored as a settable is_live flag, so "which version is live" cannot disagree with itself.
  published_at        TIMESTAMPTZ,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT llm_txt_version_venture_url_normalized CHECK (
    venture_url = lower(btrim(venture_url))
    AND venture_url ~ '^https?://'
    AND venture_url NOT LIKE '%/'
  ),
  CONSTRAINT llm_txt_version_content_nonempty CHECK (btrim(content) <> ''),

  -- "content_lint_passed must be true before a version counts as live" stated as an INVARIANT
  -- instead of a procedure. Publishing a lint-failing version is not a mistake that gets caught in
  -- review; it is a write that cannot happen.
  CONSTRAINT llm_txt_version_publish_requires_lint
    CHECK (published_at IS NULL OR content_lint_passed = true)
);

COMMENT ON TABLE public.llm_txt_version IS
  'SD-LEO-FEAT-AGENT-READINESS-SERVICE-001 TR-4/FR-7: generated llm.txt versions. published_at IS NOT NULL is the live marker, and it is unsettable unless content_lint_passed.';

-- "The live version for this site", the read on every serve.
CREATE INDEX IF NOT EXISTS llm_txt_version_live_idx
  ON public.llm_txt_version (venture_url, published_at DESC)
  WHERE published_at IS NOT NULL;

-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- IMMUTABILITY. Same rationale as venture_consent_events, same threat model: every writer here runs
-- as service_role, so a guard binding only anon/authenticated binds nobody.
--
-- agent_readiness_audit_run/agent_readiness_audit_sample are APPEND-ONLY. The delta between two runs IS the product; an editable
-- sample is an editable result, and a result that can be edited after the fact is not evidence.
-- ═════════════════════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.agent_readiness_measurement_freeze()
RETURNS TRIGGER LANGUAGE plpgsql AS $freeze$
BEGIN
  RAISE EXCEPTION
    '% is append-only: row % cannot be modified or deleted. A recorded measurement is the evidence for the before/after delta; re-running the audit means RECORDING A NEW RUN, so what was actually observed survives.',
    TG_TABLE_NAME, OLD.id
    USING ERRCODE = 'check_violation';
END
$freeze$;

DROP TRIGGER IF EXISTS agent_readiness_audit_run_freeze_trg ON public.agent_readiness_audit_run;
CREATE TRIGGER agent_readiness_audit_run_freeze_trg
  BEFORE UPDATE OR DELETE ON public.agent_readiness_audit_run
  FOR EACH ROW EXECUTE FUNCTION public.agent_readiness_measurement_freeze();

DROP TRIGGER IF EXISTS agent_readiness_audit_sample_freeze_trg ON public.agent_readiness_audit_sample;
CREATE TRIGGER agent_readiness_audit_sample_freeze_trg
  BEFORE UPDATE OR DELETE ON public.agent_readiness_audit_sample
  FOR EACH ROW EXECUTE FUNCTION public.agent_readiness_measurement_freeze();

-- llm_txt_version is NOT fully frozen — a draft must be publishable, which is an UPDATE. So the
-- trigger freezes exactly the fields whose mutability would break the invariant, and leaves
-- published_at settable ONCE. Without the once-only clause, publish/unpublish/republish would make
-- "when did this version go live" unanswerable, and the before/after boundary depends on that date.
CREATE OR REPLACE FUNCTION public.llm_txt_version_publish_only()
RETURNS TRIGGER LANGUAGE plpgsql AS $publish_only$
BEGIN
  IF NEW.content IS DISTINCT FROM OLD.content
     OR NEW.venture_url IS DISTINCT FROM OLD.venture_url
     OR NEW.content_lint_passed IS DISTINCT FROM OLD.content_lint_passed THEN
    RAISE EXCEPTION
      'llm_txt_version % is immutable except for publication: editing content, venture_url or content_lint_passed would let a lint-failing artifact inherit a passing version''s identity. Generate a NEW version instead.',
      OLD.id USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.published_at IS NOT NULL AND NEW.published_at IS DISTINCT FROM OLD.published_at THEN
    RAISE EXCEPTION
      'llm_txt_version % is already published at %: publication is once-only. The before/after boundary is anchored to that timestamp, so moving it silently re-dates the measurement.',
      OLD.id, OLD.published_at USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END
$publish_only$;

DROP TRIGGER IF EXISTS llm_txt_version_publish_only_trg ON public.llm_txt_version;
CREATE TRIGGER llm_txt_version_publish_only_trg
  BEFORE UPDATE ON public.llm_txt_version
  FOR EACH ROW EXECUTE FUNCTION public.llm_txt_version_publish_only();

-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- COMPLETENESS / INTEGRITY VIEW.
--
-- The CHECKs make a corrupt sample unwritable, which means corruption now presents as ABSENCE.
-- This view is the other half of that guard: a run whose actual sample count is below its derived
-- expectation had samples refused, and its delta must not be reported as a clean measurement.
--
-- cache_hit_samples / fallback_samples are 0 BY CONSTRUCTION today. They are kept deliberately: if
-- a future migration ever weakens either CHECK, this view starts reporting non-zero instead of
-- silently going along with it.
-- ═════════════════════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW public.v_agent_readiness_audit_run_integrity AS
SELECT
  r.id                AS audit_run_id,
  r.venture_url,
  r.run_type,
  r.stage_tag,
  r.prompt_set_id,
  r.model_set,
  r.pinned_temperature,
  r.expected_sample_count,
  count(s.id)                                                          AS actual_sample_count,
  (count(s.id) = r.expected_sample_count)                              AS is_complete,
  count(*) FILTER (WHERE s.cache_hit)                                  AS cache_hit_samples,
  count(*) FILTER (WHERE s.actual_responder_model <> s.requested_model) AS fallback_samples,
  r.created_at
FROM public.agent_readiness_audit_run r
LEFT JOIN public.agent_readiness_audit_sample s ON s.audit_run_id = r.id
GROUP BY r.id;

COMMENT ON VIEW public.v_agent_readiness_audit_run_integrity IS
  'SD-LEO-FEAT-AGENT-READINESS-SERVICE-001: is_complete=false means samples were REFUSED by the integrity CHECKs — the run''s delta is not a clean measurement. Never report a delta for a run where is_complete is false.';

-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- ACCESS POSTURE.
--
-- agent_readiness_audit_sample.raw_response holds full model output ABOUT A NAMED REAL BUSINESS — competitor
-- mentions, model-asserted claims about a company, prospect intelligence for businesses that never
-- asked to be audited. It is the most sensitive column in this SD and it is not ours to disclose.
-- A grant to anon/authenticated on these tables is a disclosure, not an untidy permission.
--
-- llm_txt_version.content is eventually PUBLIC by design — but drafts (published_at IS NULL) are
-- not, and a table grant cannot tell them apart. Public exposure belongs on the src-resident route
-- (TR-3/FR-2) reading the live row, never on a PostgREST table grant.
-- ═════════════════════════════════════════════════════════════════════════════════════════════
ALTER TABLE public.agent_readiness_audit_run       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_readiness_audit_sample    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.llm_txt_version ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agent_readiness_audit_run_service_role ON public.agent_readiness_audit_run;
CREATE POLICY agent_readiness_audit_run_service_role ON public.agent_readiness_audit_run
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS agent_readiness_audit_sample_service_role ON public.agent_readiness_audit_sample;
CREATE POLICY agent_readiness_audit_sample_service_role ON public.agent_readiness_audit_sample
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS llm_txt_version_service_role ON public.llm_txt_version;
CREATE POLICY llm_txt_version_service_role ON public.llm_txt_version
  FOR ALL TO service_role USING (true) WITH CHECK (true);

REVOKE ALL ON public.agent_readiness_audit_run           FROM anon, authenticated, PUBLIC;
REVOKE ALL ON public.agent_readiness_audit_sample        FROM anon, authenticated, PUBLIC;
REVOKE ALL ON public.llm_txt_version     FROM anon, authenticated, PUBLIC;
REVOKE ALL ON public.v_agent_readiness_audit_run_integrity FROM anon, authenticated, PUBLIC;

GRANT ALL ON public.agent_readiness_audit_run           TO service_role;
GRANT ALL ON public.agent_readiness_audit_sample        TO service_role;
GRANT ALL ON public.llm_txt_version     TO service_role;
GRANT SELECT ON public.v_agent_readiness_audit_run_integrity TO service_role;

-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- LANDING ASSERTIONS. Every guard above is load-bearing for measurement integrity, and a guard
-- that silently failed to land is worse than no guard because the code will assume it is there.
-- ═════════════════════════════════════════════════════════════════════════════════════════════
DO $verify$
DECLARE
  missing text;
BEGIN
  FOR missing IN
    SELECT c FROM unnest(ARRAY[
      'agent_readiness_audit_sample_no_fallback',
      'agent_readiness_audit_sample_no_cache',
      'agent_readiness_audit_run_stage_tag_vocabulary',
      'agent_readiness_audit_run_model_set_canonical',
      'llm_txt_version_publish_requires_lint'
    ]) AS c
    WHERE NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = c)
  LOOP
    RAISE EXCEPTION
      'SD-LEO-FEAT-AGENT-READINESS-SERVICE-001: integrity constraint % did not land — a corrupted sample or an unlinted publish would be accepted while the application assumes the database refuses it', missing;
  END LOOP;

  FOR missing IN
    SELECT t FROM unnest(ARRAY['agent_readiness_audit_run_freeze_trg','agent_readiness_audit_sample_freeze_trg','llm_txt_version_publish_only_trg']) AS t
    WHERE NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = t AND NOT tgisinternal)
  LOOP
    RAISE EXCEPTION
      'SD-LEO-FEAT-AGENT-READINESS-SERVICE-001: immutability trigger % did not land — recorded measurements would be editable after the fact and therefore would not be evidence', missing;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND table_name IN ('agent_readiness_audit_run','agent_readiness_audit_sample','llm_txt_version','v_agent_readiness_audit_run_integrity')
      AND grantee IN ('anon','authenticated','PUBLIC')
  ) THEN
    RAISE EXCEPTION
      'SD-LEO-FEAT-AGENT-READINESS-SERVICE-001: a non-service grant is present on the audit tables — agent_readiness_audit_sample.raw_response is model output about named real businesses, so that is a disclosure';
  END IF;

  IF (SELECT public.canonical_model_set(ARRAY['gpt','claude','gpt'])) <> ARRAY['claude','gpt'] THEN
    RAISE EXCEPTION
      'SD-LEO-FEAT-AGENT-READINESS-SERVICE-001: canonical_model_set does not sort/dedupe — before/after runs would fail to pair and the missing pair would read as "no before run"';
  END IF;
END
$verify$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- ROLLBACK
--   DROP VIEW IF EXISTS public.v_agent_readiness_audit_run_integrity;
--   DROP TABLE IF EXISTS public.agent_readiness_audit_sample;
--   DROP TABLE IF EXISTS public.llm_txt_version;
--   DROP TABLE IF EXISTS public.agent_readiness_audit_run;
--   DROP FUNCTION IF EXISTS public.llm_txt_version_publish_only();
--   DROP FUNCTION IF EXISTS public.agent_readiness_measurement_freeze();
--   DROP FUNCTION IF EXISTS public.canonical_model_set(TEXT[]);
-- ─────────────────────────────────────────────────────────────────────────────────────────────
