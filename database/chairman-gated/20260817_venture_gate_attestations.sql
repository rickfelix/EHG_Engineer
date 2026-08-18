-- SD-FDBK-FIX-VENTURE-CRACK-GATE-001 — PLAN/Gate-1 database design (DRAFT for EXEC)
-- Target DB: EHG_Engineer consolidated (dedlbzhpgkmetvhbkyzq)
--
-- @approved-by:
--   ^ INTENTIONALLY BLANK. checkApproverFactor() fails closed on a missing header, so this
--     migration cannot be applied by accident. Do NOT fill this in on the SD's behalf.
--     WHY chairman-gated rather than database/migrations/: this file creates RLS POLICIES and
--     TRIGGERS. isDelegatableForApply() (lib/migration/adam-delegated-apply.js, reached from
--     scripts/lib/migration-guards.js:105) scopes Adam's delegated apply to
--     "additive-no-policy/rls OR governed literal INSERT" — so this is chairman-path-only by
--     construction, not by preference.
--
-- ============================================================================
-- WHY THIS TABLE EXISTS, AND WHY IT IS NOT chairman_decisions
--
-- MEASURED THIS SESSION (live, over the pooler — not read from a file):
--   lib/eva/stage-templates/analysis-steps/stage-17-blueprint-review.js:467-473 writes
--   {status:'approved', decision:'approve', resolved_at:<now>} to chairman_decisions whenever
--   its OWN gateRecommendation === 'PASS'. The judge and the judged are the same code path.
--
--   That write CURRENTLY FAILS, and fails INVISIBLY. Probed live with the exact payload against
--   a 0-row match: PGRST204 "Could not find the 'resolved_at' column of 'chairman_decisions' in
--   the schema cache" — chairman_decisions has NO resolved_at column (information_schema count
--   = 0, 37 columns present). The call site does `await supabase...update(...)` WITHOUT binding
--   `error`, so nothing throws, the surrounding catch never fires, and the next line logs
--   "[Stage17] PASS — chairman decision auto-approved". The log asserts a state change that
--   never happened.
--
--   THIS IS THE LANDMINE, and it is the reason the attestation cannot live in chairman_decisions:
--   the rubber-stamp is not "a hypothetical risk" and it is not "already broken, therefore fine".
--   It is ARMED AND DISCONNECTED. Adding a `resolved_at` column — a textbook TIER-1 additive
--   change that no reviewer would blink at — silently ENABLES fleet-wide machine self-approval
--   with zero change to any code and zero mention of Stage-17 in the diff. A gate that reads
--   chairman_decisions.status='approved' is therefore reading a field that a machine both can
--   and intends to set. Attestation must be a SEPARATE relation whose every row carries the
--   identity of the attester and a structural judge<>judged constraint.
--
-- MODELLED ON: database/migrations/20260809_venture_demand_verdicts.sql (applied; verified live
-- EXISTS with 0 rows). Every load-bearing property of that file is reproduced here: closed enum
-- verdict (never a boolean), citation NOT NULL on EVERY row including PASS, a path_to_pass
-- equivalent, DB-clock computed_at, append-only UPDATE+DELETE freezes naming service_role as the
-- threat model, and a verify block that ABORTS THE DEPLOY rather than reporting a false success.
--
-- ADDITIVE ONLY. This migration does not touch venture_nursery, ventures, ventures.metadata,
-- chairman_decisions, or any existing policy/grant. The PBN column-add for venture_nursery is a
-- SEPARATE, deliberately chairman-gated file (20260815_venture_nursery_pbn_verdict.sql) that is
-- NOT part of this SD's scope and is NOT applied by this file.
--
-- NAME. The brief proposed `venture_crack_gate_checks`; this file uses
-- `venture_gate_attestations`. Reasoning (the SD text pins no name — verified: zero occurrences
-- of "venture_crack_gate_checks"/"crack_gate"/"gate_checks" in strategic_directives_v2 for this
-- SD, and no PRD row exists yet, so nothing downstream is broken by the change):
--   (a) "check" describes a COMPUTATION; every row here is an ATTESTATION BY A NAMED ACTOR, and
--       the actor identity is the load-bearing column, not a side note. The name should say what
--       makes the row trustworthy.
--   (b) "crack" encodes the AltifyAI incident framing into a permanent schema identifier.
--       Incident-named tables age badly once the incident is forgotten; the sibling precedent is
--       venture_demand_verdicts, which did NOT name itself after the marketing-autonomy incident
--       that motivated it.
--   (c) It parallels venture_demand_verdicts, so the two gate inputs read as one family.
-- To keep the brief's name instead, this file is safe to sed: the identifier appears only in
-- object names, never in data.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.venture_gate_attestations (
  id            BIGSERIAL PRIMARY KEY,

  venture_id    UUID NOT NULL REFERENCES public.ventures(id) ON DELETE CASCADE,

  -- Closed vocabulary. Both attestation kinds share one table because the gate asks the same
  -- question of both ("is there a fresh PASS by a real actor bound to this content"), and a
  -- table-per-kind duplicates every guard below — which is how two guards drift apart.
  check_type    TEXT NOT NULL CHECK (check_type IN ('stage17_judgment', 'chairman_site_review')),

  -- THREE STATES, NEVER A BOOLEAN, AND POSITIVELY PHRASED — all three properties are load-bearing
  -- and are inherited verbatim from venture_demand_verdicts:52.
  --   * A boolean cannot carry the third state, and the third state is the point.
  --   * NO_DATA is first-class and is NEVER folded. Folded into PASS it fabricates a review that
  --     nobody performed; folded into BLOCKED it becomes indistinguishable from a venture that
  --     WAS reviewed and failed, which hides that nobody is reviewing.
  --   * Positive phrasing decides the safety property: .maybeSingle() returns {data:null,
  --     error:null} on absence, so `if (a?.verdict === 'PASS')` blocks on absence (fail-CLOSED)
  --     while `if (!a?.blocked)` passes on absence (fail-OPEN). The negative form is not offered.
  verdict       TEXT NOT NULL CHECK (verdict IN ('PASS', 'BLOCKED', 'NO_DATA')),

  -- ── THE ANTI-RUBBER-STAMP COLUMNS ────────────────────────────────────────────────────────────
  -- attested_by: WHO SIGNED. produced_by: WHO/WHAT MADE THE THING BEING SIGNED FOR.
  -- Stage-17 today supplies both from one code path; the CHECK below makes that literal case
  -- unrecordable. See the honesty note on enforcement_strength — this is a necessary, not a
  -- sufficient, condition for independence.
  attested_by   TEXT NOT NULL,
  produced_by   TEXT NOT NULL,

  -- ── CONTENT BINDING (the answer to "a stamp that outlives the thing it stamped") ─────────────
  -- subject_ref names WHAT was reviewed (deployed URL, artifact path). subject_content_hash is
  -- SHA-256 of that exact artifact. Precedent + rationale transfer verbatim from
  -- database/chairman-gated/20260816_plan_critiques_add_metadata_and_content_hash.sql: a human
  -- sign-off lands minutes-to-days after the fact, so CONTENT IDENTITY is what must bind, not a
  -- particular evaluation run. Any subsequent change to the site yields a different hash and the
  -- gate re-blocks instead of coasting on a stale approval.
  subject_ref   TEXT NOT NULL,

  -- NULLABLE ON PURPOSE, AND THIS IS THE SAME REASONING THAT BANNED THE SCORE COLUMN IN THE
  -- PRECEDENT. A NOT NULL hash would force every unmeasurable row to INVENT one, and an invented
  -- hash is indistinguishable from a measured one — the exact fabrication this design abolishes.
  -- A chairman who could not load the site has no content to hash; that row is honestly NO_DATA
  -- with a NULL hash. The bite is applied where it matters instead: a PASS MUST carry a real
  -- hash (vga_pass_requires_content_hash below).
  subject_content_hash TEXT,

  -- NOT NULL on EVERY row, not only on NO_DATA/BLOCKED. A PASS with no citation is an assertion,
  -- not a measurement — that is the whole difference between a checked all-clear and an
  -- unchecked one.
  citation      TEXT NOT NULL,

  -- A verdict that says only "BLOCKED" is not good enough: the row must name what would produce
  -- the missing evidence, so a blocked venture has a legible route forward rather than an opaque
  -- refusal. NOT NULL on PASS too, where it states what would have to stop being true to lose it.
  path_to_pass  TEXT NOT NULL,

  -- Per-check detail. JSONB because the finding set is owned by application code and will grow;
  -- a column-per-finding makes every new finding a migration.
  findings      JSONB NOT NULL,

  -- ── HONESTY TAG (never silent about how weak the enforcement actually is) ─────────────────────
  -- Precedent: database/migrations/20260706_gate_witness_events_strength_tagging.sql, which made
  -- convention-tier enforcement first-class QUERYABLE evidence rather than something inferred by
  -- cross-referencing a registry. NOT NULL with NO DEFAULT — a default would let every writer
  -- inherit the flattering value without stating it.
  enforcement_strength TEXT NOT NULL CHECK (enforcement_strength IN ('structural', 'convention')),

  -- NOT SUPPLIED BY THE WRITER. A writer that supplies its own timestamp can BACKDATE an
  -- attestation, which is a fakeability hole in a table whose entire purpose is unfakeability.
  -- "Latest by computed_at wins" for read purposes (see the _latest view below).
  -- If the writer wants to record when the HUMAN actually looked (which can precede the row by
  -- hours), it goes in findings->>'reviewed_at' and is EXPLICITLY NON-AUTHORITATIVE: it is never
  -- used for ordering, freshness, or precedence. Only this DB clock orders this table.
  computed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- ── CONSTRAINTS ──────────────────────────────────────────────────────────────────────────────

  CONSTRAINT vga_citation_resolvable_shape CHECK (
    btrim(citation) <> ''
    AND length(btrim(citation)) >= 12
    -- SHAPE, not prose. Without this, "citation NOT NULL" degrades into what
    -- lib/venture-email/provision-venture-email.js guardSequenceSend self-documents as
    -- "PRESENCE ONLY, NOT PROVENANCE" — any non-empty string passes, including "reviewed it".
    -- Accepts exactly three resolvable forms: a URL, a `kind:identifier` reference, or a
    -- `path@sha` pin. A DB CHECK can enforce that a citation is SHAPED like something that
    -- dereferences; it CANNOT dereference it. The writer must additionally prove the reference
    -- resolves to a row of the right kind, for the right venture, for the right subject — the
    -- four-part discipline in lib/marketing/venture-consent.js:115-141 resolveCaptureWitness.
    -- That half is convention-tier and must be tagged as such in enforcement_strength.
    AND btrim(citation) ~ '^(https?://[^[:space:]]+|[a-z_][a-z0-9_]*:[A-Za-z0-9._/-]{6,}|[A-Za-z0-9._/-]+@[0-9a-f]{7,64})$'
  ),

  CONSTRAINT vga_path_to_pass_nonempty CHECK (btrim(path_to_pass) <> ''),
  CONSTRAINT vga_subject_ref_nonempty  CHECK (btrim(subject_ref) <> ''),

  -- findings must be a JSON OBJECT. Without this, `findings: 0` or `findings: "none"` satisfies
  -- NOT NULL and stores a shape no consumer can read.
  CONSTRAINT vga_findings_is_object CHECK (jsonb_typeof(findings) = 'object'),

  CONSTRAINT vga_content_hash_shape CHECK (
    subject_content_hash IS NULL OR subject_content_hash ~ '^[0-9a-f]{64}$'
  ),

  -- A PASS is the only verdict that lets a venture through, so a PASS is the only verdict that
  -- must be pinned to content. 'n/a' / 'unknown' / '' cannot satisfy the sha256 shape.
  CONSTRAINT vga_pass_requires_content_hash CHECK (
    verdict <> 'PASS' OR subject_content_hash IS NOT NULL
  ),

  -- ── JUDGE <> JUDGED ──────────────────────────────────────────────────────────────────────────
  -- Precedent: chk_witness_not_self_judged in
  -- database/migrations/20260705_create_gate_witness_events.sql. IT APPLIES HERE, AND MORE
  -- DIRECTLY THAN IT DID THERE: that migration guarded a hypothetical self-attestation, whereas
  -- Stage-17 ALREADY writes its own chairman approval from the branch that computed the
  -- recommendation. This constraint makes that exact row unrecordable.
  -- Normalised on both sides — a bare `attested_by <> produced_by` is evaded by 'Adam' vs 'adam'
  -- or a trailing space, which is a one-character bypass of the SD's central control.
  CONSTRAINT vga_attester_not_producer CHECK (
    lower(btrim(attested_by)) <> lower(btrim(produced_by))
  ),

  -- ── THE ACTOR MUST BE SOMEBODY ───────────────────────────────────────────────────────────────
  -- Rejects the generic-actor class outright. The denylist is matched against a NORMALISED value
  -- (lower + trim + trailing digit/separator stripped) so 'system', 'System ', 'worker_2' and
  -- 'agent-01' all collapse to the same denied token — otherwise the constraint is satisfied by
  -- appending a digit, which is not a control.
  -- Measured basis for the list (live chairman_decisions.decided_by census, 25 distinct values):
  -- real values look like 'codestreetlabs@gmail.com', 'chairman-cli', 'chairman_via_eva_decisions_cli',
  -- 'adam'; the machine values that DID stamp Stage-17 approvals look like 'testing_agent' and
  -- 'monitoring_agent'. Those are legitimately named agents and are ALLOWED here for
  -- stage17_judgment (they identify a specific actor) but are excluded from chairman_site_review
  -- by vga_chairman_review_is_human below. Anonymous role words are what this rejects.
  CONSTRAINT vga_attested_by_is_identified CHECK (
    btrim(attested_by) <> ''
    AND length(btrim(attested_by)) >= 3
    AND lower(regexp_replace(btrim(attested_by), '[-_. ]?[0-9]+$', '')) NOT IN (
      'system','systems','sys','worker','workers','agent','agents','subagent','sub_agent',
      'bot','robot','service','services','service_role','serviceaccount','svc',
      'admin','administrator','root','superuser','operator','automation','automated','auto',
      'ci','cd','cicd','pipeline','cron','job','task','runner','daemon','script','process',
      'machine','llm','ai','model','claude','gpt','openai','anthropic','eva','leo','orchestrator',
      'unknown','unspecified','undefined','none','null','nil','na','n/a','tbd','todo','pending',
      'test','tests','testing','tester','anonymous','anon','default','user','users','someone',
      'somebody','me','self','it','they','placeholder','xxx','foo','bar','temp','tmp'
    )
  ),

  -- Same rule for the producer: "produced by 'system'" defeats judge<>judged just as effectively
  -- as "attested by 'system'", because an unnamed producer can never be shown to equal anybody.
  CONSTRAINT vga_produced_by_is_identified CHECK (
    btrim(produced_by) <> ''
    AND length(btrim(produced_by)) >= 3
    AND lower(regexp_replace(btrim(produced_by), '[-_. ]?[0-9]+$', '')) NOT IN (
      'system','systems','sys','worker','workers','agent','agents','subagent','sub_agent',
      'bot','robot','service','services','service_role','serviceaccount','svc',
      'admin','administrator','root','superuser','operator','automation','automated','auto',
      'ci','cd','cicd','pipeline','cron','job','task','runner','daemon','script','process',
      'machine','llm','ai','model','claude','gpt','openai','anthropic','eva','leo','orchestrator',
      'unknown','unspecified','undefined','none','null','nil','na','n/a','tbd','todo','pending',
      'test','tests','testing','tester','anonymous','anon','default','user','users','someone',
      'somebody','me','self','it','they','placeholder','xxx','foo','bar','temp','tmp'
    )
  ),

  -- ── A CHAIRMAN REVIEW MUST BE ATTESTED BY A HUMAN MAILBOX ────────────────────────────────────
  -- The strongest identity assertion this schema can make without per-actor credentials. Precedent
  -- for using a bare email as THE chairman factor: APPROVED_BY_RE in scripts/lib/migration-guards.js:30,
  -- which is the mechanism gating this very migration. 'adam', 'coordinator', 'testing_agent' and
  -- every other agent handle are structurally excluded from this check_type — an agent cannot be
  -- the chairman by choosing a nicer name.
  CONSTRAINT vga_chairman_review_is_human CHECK (
    check_type <> 'chairman_site_review'
    OR btrim(attested_by) ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  ),

  -- 'structural' is a strong claim, so it costs something to make: the row must carry an external
  -- verification reference. Otherwise every writer tags itself 'structural' and the honesty tag
  -- measures nothing. (A gate is only as honest as the data it trusts.)
  --
  -- ADVERSARIAL REVIEW FIX (PR1 deep-tier review): the original form only rejected an absent key
  -- or a literal JSON null, so {}/false/0/"" all satisfied it (non-null jsonb_typeof, not equal
  -- to 'null'::jsonb) while carrying zero actual evidence. Requiring the value be a JSON OBJECT
  -- with at least one key makes an empty/scalar placeholder unrecordable, mirroring the shape
  -- discipline vga_citation_resolvable_shape already applies a few constraints up.
  CONSTRAINT vga_structural_requires_external_verification CHECK (
    enforcement_strength <> 'structural'
    OR (jsonb_typeof(findings -> 'external_verification') = 'object'
        AND findings -> 'external_verification' <> '{}'::jsonb)
  )
);

-- The gate's hot question is "is there a fresh PASS for this venture and this check_type", and
-- the read path is DISTINCT ON (venture_id, check_type) ... ORDER BY computed_at DESC.
CREATE INDEX IF NOT EXISTS venture_gate_attestations_venture_type_computed_idx
  ON public.venture_gate_attestations (venture_id, check_type, computed_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- APPEND-ONLY. Pattern from venture_demand_verdicts:105-135 (itself from
-- database/migrations/20260803_drive_reports.sql:197-267).
--
-- WHY THE DELETE GUARD IS NOT REDUNDANT WITH THE UPDATE GUARD: freezing UPDATE alone leaves
-- delete-and-reinsert as a complete bypass — the row id changes but the venture's current
-- attestation becomes whatever was inserted last, which is exactly the mutability the freeze was
-- meant to remove.
--
-- BOTH GUARDS NAME service_role AS THEIR OWN THREAT MODEL. service_role has rolbypassrls = TRUE
-- (measured live) and is the role every writer in this codebase actually runs as, so an RLS
-- policy constrains nobody who can currently reach this table. A TRIGGER does, because triggers
-- are not bypassed by rolbypassrls.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.venture_gate_attestations_freeze()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $freeze$
BEGIN
  RAISE EXCEPTION
    'venture_gate_attestations is append-only: row % (venture %, %) cannot be modified after insert. An attestation is an OBSERVATION BY A NAMED ACTOR — revising it means recording a NEW attestation, so what was attested, by whom, and against which content hash all survive.',
    OLD.id, OLD.venture_id, OLD.check_type;
END
$freeze$;

DROP TRIGGER IF EXISTS venture_gate_attestations_no_update ON public.venture_gate_attestations;
CREATE TRIGGER venture_gate_attestations_no_update
  BEFORE UPDATE ON public.venture_gate_attestations
  FOR EACH ROW EXECUTE FUNCTION public.venture_gate_attestations_freeze();

CREATE OR REPLACE FUNCTION public.venture_gate_attestations_no_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $nodelete$
BEGIN
  RAISE EXCEPTION
    'venture_gate_attestations is append-only: row % (venture %) cannot be deleted. Without this guard, delete-and-reinsert bypasses the update freeze completely.',
    OLD.id, OLD.venture_id;
END
$nodelete$;

DROP TRIGGER IF EXISTS venture_gate_attestations_no_delete_trg ON public.venture_gate_attestations;
CREATE TRIGGER venture_gate_attestations_no_delete_trg
  BEFORE DELETE ON public.venture_gate_attestations
  FOR EACH ROW EXECUTE FUNCTION public.venture_gate_attestations_no_delete();

-- ADVERSARIAL REVIEW FIX (PR1 deep-tier review): row-level triggers do NOT fire for TRUNCATE —
-- only a statement-level trigger can intercept it. service_role bypasses RLS (rolbypassrls=TRUE,
-- measured) and is granted ALL below (including TRUNCATE), which is the migration's own stated
-- threat model, so without this guard the entire attestation history is one TRUNCATE away from
-- silent, un-audited erasure — the same "delete-and-reinsert" bypass class the DELETE trigger
-- exists to close, via a statement type that trigger cannot see.
CREATE OR REPLACE FUNCTION public.venture_gate_attestations_no_truncate()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $notrunc$
BEGIN
  RAISE EXCEPTION 'venture_gate_attestations is append-only: TRUNCATE is not permitted. It would erase the entire attestation history with no row-level trigger able to observe it.';
END
$notrunc$;

DROP TRIGGER IF EXISTS venture_gate_attestations_no_truncate_trg ON public.venture_gate_attestations;
CREATE TRIGGER venture_gate_attestations_no_truncate_trg
  BEFORE TRUNCATE ON public.venture_gate_attestations
  FOR EACH STATEMENT EXECUTE FUNCTION public.venture_gate_attestations_no_truncate();

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- POSTURE. MEASURED, not assumed: pg_default_acl shows public-schema tables are created with
--   anon=arwdDxtm/postgres | authenticated=arwdDxtm/postgres
-- i.e. a brand-new table in this database is FULLY READ-WRITE to the anon key until revoked.
-- RLS-with-no-policy blocks the ROWS, but THE GRANT STILL EXISTS and nothing says so — the table
-- would sit one permissive policy away from letting the anon key INSERT its own chairman
-- attestations. That is safety-by-coincidence, and the one-word edit that ends it reads as
-- ordinary house style.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.venture_gate_attestations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS venture_gate_attestations_service_role ON public.venture_gate_attestations;
CREATE POLICY venture_gate_attestations_service_role
  ON public.venture_gate_attestations
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON public.venture_gate_attestations FROM anon, authenticated, PUBLIC;
REVOKE ALL ON SEQUENCE public.venture_gate_attestations_id_seq FROM anon, authenticated, PUBLIC;
GRANT ALL ON public.venture_gate_attestations TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.venture_gate_attestations_id_seq TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- LATEST-WINS READ SURFACE.
-- EXPLICIT COLUMN LIST, NEVER `SELECT *`. Postgres does not store the star — it EXPANDS it at
-- CREATE time and FREEZES the result. A later ALTER TABLE ... ADD COLUMN is then invisible
-- through the view and consumers get PostgREST 42703. That defect class is already documented in
-- this repo twice: 20260801_refresh_v_patterns_with_decay_column_drift.sql (six columns lost) and
-- note (1) of 20260815_venture_nursery_pbn_verdict.sql (v_nursery_pending_evaluation frozen at 17
-- columns). Writing the list out does not prevent the freeze — nothing does — but it makes the
-- frozen set legible in the diff instead of invisible.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.v_venture_gate_attestations_latest AS
SELECT DISTINCT ON (a.venture_id, a.check_type)
  a.id,
  a.venture_id,
  a.check_type,
  a.verdict,
  a.attested_by,
  a.produced_by,
  a.subject_ref,
  a.subject_content_hash,
  a.citation,
  a.path_to_pass,
  a.findings,
  a.enforcement_strength,
  a.computed_at
FROM public.venture_gate_attestations a
ORDER BY a.venture_id, a.check_type, a.computed_at DESC, a.id DESC;

COMMENT ON VIEW public.v_venture_gate_attestations_latest IS
  'Newest attestation per (venture_id, check_type) by DB-clock computed_at. Tie-break on id DESC '
  'so two rows sharing a timestamp still order deterministically. ABSENCE OF A ROW IS NOT A PASS: '
  'read it fail-closed as `verdict = ''PASS''`, never as `verdict <> ''BLOCKED''`.';

REVOKE ALL ON public.v_venture_gate_attestations_latest FROM anon, authenticated, PUBLIC;
GRANT SELECT ON public.v_venture_gate_attestations_latest TO service_role;

COMMENT ON TABLE public.venture_gate_attestations IS
  'SD-FDBK-FIX-VENTURE-CRACK-GATE-001. Per-venture attestations of stage17_judgment and '
  'chairman_site_review over PASS/BLOCKED/NO_DATA. Append-only: a re-attestation is a NEW row, '
  'latest-by-computed_at wins. NO_DATA is first-class and is never folded. Deliberately NOT '
  'stored in chairman_decisions, whose status column a machine both can and (per '
  'stage-17-blueprint-review.js:467-473) intends to set. No boolean, no numeric score, no '
  'negatively-phrased flag exists here by design; the migration verify block asserts their '
  'absence AND behaviourally proves the anti-generic and judge<>judged guards actually reject.';

COMMENT ON COLUMN public.venture_gate_attestations.attested_by IS
  'The identified human or named agent recording this attestation. Anonymous role words '
  '(system/worker/agent/bot/...) are rejected structurally, including digit-suffixed evasions. '
  'chairman_site_review additionally requires an email-shaped identity. NECESSARY, NOT SUFFICIENT: '
  'under a shared SUPABASE_SERVICE_ROLE_KEY a DB constraint cannot verify that a given string is '
  'the actor it names — that limit is why enforcement_strength exists and why honest writers tag '
  'these rows ''convention''.';

COMMENT ON COLUMN public.venture_gate_attestations.produced_by IS
  'Who or what produced the artifact being attested (e.g. ''stage-17-blueprint-review''). Must '
  'differ from attested_by (vga_attester_not_producer), normalised for case and whitespace.';

COMMENT ON COLUMN public.venture_gate_attestations.subject_content_hash IS
  'SHA-256 of the exact artifact reviewed (deployed sha + rendered site build). NULL is permitted '
  'and honest for BLOCKED/NO_DATA — forcing a hash onto an unmeasurable row would fabricate one. '
  'Mandatory on PASS. Any later change to the artifact yields a different hash, so the gate '
  're-blocks rather than coasting on a stale approval.';

COMMENT ON COLUMN public.venture_gate_attestations.computed_at IS
  'DB clock. Never writer-supplied — a writer that supplies its own timestamp can backdate an '
  'attestation. The sole ordering key for latest-wins. A human review time, if recorded, lives in '
  'findings->>''reviewed_at'' and is explicitly non-authoritative.';

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- VERIFY. CREATE TABLE IF NOT EXISTS advertises an idempotence that HIDES A REAL FAILURE: if the
-- table already exists in another shape, every CHECK above silently does NOT land and this file
-- still reports success. This block aborts the deploy instead.
--
-- THE FINAL THREE CHECKS ARE BEHAVIOURAL, NOT EXISTENTIAL, and that is the point. Asserting that a
-- constraint EXISTS proves only that a name is present in pg_constraint; it does not prove the
-- predicate rejects anything. These attempt real INSERTs that MUST fail. Each runs inside the DO
-- block's implicit subtransaction, so nothing survives whether it passes or fails — and the table
-- is append-only, so a row that DID land could never be cleaned up. Behavioural proof is the only
-- kind worth having for the single control this SD exists to add.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
DO $verify$
DECLARE
  bad_col text;
  v_id    uuid;
  truncate_was_blocked boolean := false;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.venture_gate_attestations'::regclass
      AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%verdict = ANY%'
  ) THEN
    RAISE EXCEPTION 'venture_gate_attestations: the CHECK on verdict did not land — the vocabulary is open, so a typo becomes a silent fourth state that no consumer handles';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.venture_gate_attestations'::regclass
      AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%check_type = ANY%'
  ) THEN
    RAISE EXCEPTION 'venture_gate_attestations: the CHECK on check_type did not land';
  END IF;

  -- ABSENCE ASSERTIONS. The design decision "no boolean, no score, no negative flag" is worth
  -- nothing if a later ALTER TABLE can quietly reintroduce one: a column named passed/blocked/
  -- score would let a read site pick the fail-OPEN polarity, and a NOT NULL score would force
  -- every NO_DATA row to invent a number.
  FOR bad_col IN
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'venture_gate_attestations'
      AND (column_name IN ('passed','blocked','denied','failed','approved','score','health','is_valid','ok')
           OR data_type = 'boolean')
  LOOP
    RAISE EXCEPTION 'venture_gate_attestations: column % must not exist. A boolean cannot carry the three-state vocabulary, a numeric score forces every NO_DATA row to invent a number, and a negatively-phrased flag inverts fail-closed polarity because a null from .maybeSingle() is falsy.', bad_col;
  END LOOP;

  FOR bad_col IN SELECT unnest(ARRAY['vga_attester_not_producer','vga_attested_by_is_identified',
                                     'vga_produced_by_is_identified','vga_chairman_review_is_human',
                                     'vga_pass_requires_content_hash','vga_citation_resolvable_shape'])
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                   WHERE conrelid='public.venture_gate_attestations'::regclass AND conname=bad_col) THEN
      RAISE EXCEPTION 'venture_gate_attestations: constraint % did not land — the anti-rubber-stamp control is incomplete', bad_col;
    END IF;
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.venture_gate_attestations'::regclass
                 AND tgname='venture_gate_attestations_no_update' AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'venture_gate_attestations: the append-only UPDATE freeze did not land — an attestation is editable and therefore fakeable';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.venture_gate_attestations'::regclass
                 AND tgname='venture_gate_attestations_no_delete_trg' AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'venture_gate_attestations: the append-only DELETE guard did not land — delete-and-reinsert bypasses the update freeze completely';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.venture_gate_attestations'::regclass
                 AND tgname='venture_gate_attestations_no_truncate_trg' AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'venture_gate_attestations: the append-only TRUNCATE guard did not land — row-level UPDATE/DELETE triggers do not fire for TRUNCATE, so the whole table would be one TRUNCATE away from silent erasure';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.role_table_grants
             WHERE table_schema='public' AND table_name='venture_gate_attestations'
               AND grantee IN ('anon','authenticated','PUBLIC')) THEN
    RAISE EXCEPTION 'venture_gate_attestations: a non-service grant is present — this table gates whether a venture may face strangers and must not be reachable by anon or authenticated (pg_default_acl grants anon arwdDxtm on new public tables, so this REVOKE is load-bearing)';
  END IF;

  -- ── BEHAVIOURAL PROOF 0: TRUNCATE is actually rejected (needs no existing row) ────────────────
  -- A boolean flag, not exception-message pattern matching, distinguishes "the trigger correctly
  -- raised" from "some other error occurred" — message-substring matching is a fragile way to
  -- tell those apart and this is the one guard in this file that specifically must not be.
  BEGIN
    EXECUTE 'TRUNCATE public.venture_gate_attestations';
  EXCEPTION
    WHEN raise_exception THEN truncate_was_blocked := true;
  END;
  IF NOT truncate_was_blocked THEN
    RAISE EXCEPTION 'venture_gate_attestations: GUARD DID NOT FIRE — TRUNCATE succeeded. The append-only guarantee is decorative; refusing to deploy.';
  END IF;

  -- ── BEHAVIOURAL PROOF 1: the generic-actor guard actually rejects ────────────────────────────
  SELECT id INTO v_id FROM public.ventures LIMIT 1;
  IF v_id IS NOT NULL THEN
    BEGIN
      INSERT INTO public.venture_gate_attestations
        (venture_id, check_type, verdict, attested_by, produced_by, subject_ref,
         subject_content_hash, citation, path_to_pass, findings, enforcement_strength)
      VALUES
        (v_id, 'stage17_judgment', 'PASS', 'system', 'stage-17-blueprint-review', 'probe://verify',
         repeat('a',64), 'probe:verify-guard-fires', 'n/a — verify probe', '{}'::jsonb, 'convention');
      RAISE EXCEPTION 'venture_gate_attestations: GUARD DID NOT FIRE — attested_by=''system'' was ACCEPTED. The anti-rubber-stamp control is decorative; refusing to deploy.';
    EXCEPTION
      WHEN check_violation THEN NULL;  -- expected: the guard rejected it
    END;

    -- ── BEHAVIOURAL PROOF 2: judge <> judged actually rejects the Stage-17 shape ────────────────
    BEGIN
      INSERT INTO public.venture_gate_attestations
        (venture_id, check_type, verdict, attested_by, produced_by, subject_ref,
         subject_content_hash, citation, path_to_pass, findings, enforcement_strength)
      VALUES
        (v_id, 'stage17_judgment', 'PASS', 'stage-17-blueprint-review', 'Stage-17-Blueprint-Review ',
         'probe://verify', repeat('a',64), 'probe:verify-guard-fires', 'n/a — verify probe',
         '{}'::jsonb, 'convention');
      RAISE EXCEPTION 'venture_gate_attestations: GUARD DID NOT FIRE — a self-judged row (attester = producer, differing only in case/whitespace) was ACCEPTED. This is the exact stage-17-blueprint-review.js:467-473 shape; refusing to deploy.';
    EXCEPTION
      WHEN check_violation THEN NULL;  -- expected
    END;
  END IF;
END
$verify$;

COMMIT;

-- ============================================================================
-- ROLLBACK — see 20260817_venture_gate_attestations_DOWN.sql
--
-- APPLY (chairman ceremony; this file is NOT Adam-delegatable — it creates policies + triggers):
--   node scripts/apply-migration.js --issue-token
--   MIGRATION_APPLY_TOKEN=<token> node scripts/apply-migration.js \
--     "database/chairman-gated/20260817_venture_gate_attestations.sql" \
--     --prod-deploy --allow-any-path
-- ============================================================================
