-- Migration: Pocock ADR schema (Child B of SD-LEO-PROTOCOL-POCOCK-PATTERNS-ORCH-001)
-- Tables: pocock_adrs (with superseded_by self-FK ON DELETE SET NULL, FK to brainstorm_sessions)
-- RPC: accept_adr(int, text) SECURITY DEFINER
-- Schema extension: strategic_directives_v2.adrs_consulted text[] DEFAULT array[]::text[]
-- Idempotent throughout (IF NOT EXISTS / CREATE OR REPLACE / DROP POLICY IF EXISTS)

BEGIN;

-- ============================================================================
-- TABLE: pocock_adrs (Architecture Decision Records, single-paragraph Pocock format)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.pocock_adrs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  adr_number int UNIQUE NOT NULL,
  slug text UNIQUE NOT NULL,
  title text NOT NULL,
  body text NOT NULL CHECK (length(body) <= 800),
  status text NOT NULL DEFAULT 'proposed'
    CHECK (status IN ('proposed', 'accepted', 'deprecated', 'superseded')),
  superseded_by uuid REFERENCES public.pocock_adrs(id) ON DELETE SET NULL,
  source_pivot_event_id text,
  source_brainstorm_id uuid REFERENCES public.brainstorm_sessions(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  approved_by text
);

CREATE INDEX IF NOT EXISTS idx_pocock_adrs_status
  ON public.pocock_adrs (status);

CREATE INDEX IF NOT EXISTS idx_pocock_adrs_adr_number
  ON public.pocock_adrs (adr_number);

ALTER TABLE public.pocock_adrs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pocock_adrs_service_role_all ON public.pocock_adrs;
CREATE POLICY pocock_adrs_service_role_all
  ON public.pocock_adrs FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS pocock_adrs_authenticated_read_accepted ON public.pocock_adrs;
CREATE POLICY pocock_adrs_authenticated_read_accepted
  ON public.pocock_adrs FOR SELECT TO authenticated
  USING (status = 'accepted');

-- ============================================================================
-- SCHEMA EXTENSION: strategic_directives_v2.adrs_consulted text[]
-- ============================================================================
ALTER TABLE public.strategic_directives_v2
  ADD COLUMN IF NOT EXISTS adrs_consulted text[] NOT NULL DEFAULT ARRAY[]::text[];

-- ============================================================================
-- RPC: accept_adr(p_number int, p_approved_by text)
-- Flips proposed → accepted for the specified ADR. Emits audit_log entry.
-- SECURITY DEFINER; anon role blocked.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.accept_adr(
  p_number int,
  p_approved_by text
)
RETURNS public.pocock_adrs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_previous_status text;
  v_updated_row public.pocock_adrs;
BEGIN
  -- Defense-in-depth: block anon role explicitly
  IF current_setting('request.jwt.claim.role', true) = 'anon' THEN
    RAISE EXCEPTION 'permission denied: anon role cannot accept ADRs'
      USING ERRCODE = '42501';
  END IF;

  SELECT status INTO v_previous_status
  FROM public.pocock_adrs
  WHERE adr_number = p_number
  FOR UPDATE;

  IF v_previous_status IS NULL THEN
    RAISE EXCEPTION 'ADR not found: %', p_number
      USING ERRCODE = 'P0002';
  END IF;

  IF v_previous_status <> 'proposed' THEN
    RAISE EXCEPTION 'ADR not in proposed status (current: %)', v_previous_status
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.pocock_adrs
  SET status      = 'accepted',
      accepted_at = now(),
      approved_by = p_approved_by,
      updated_at  = now()
  WHERE adr_number = p_number
  RETURNING * INTO v_updated_row;

  -- Best-effort audit_log emission (schema-tolerant per Child A precedent)
  BEGIN
    INSERT INTO public.audit_log (
      action, operator, target_table, target_id,
      previous_value, new_value, created_at
    ) VALUES (
      'adr_accepted', p_approved_by,
      'pocock_adrs', v_updated_row.id::text,
      jsonb_build_object('status', v_previous_status),
      jsonb_build_object('status', 'accepted', 'adr_number', p_number, 'slug', v_updated_row.slug),
      now()
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'audit_log insert failed (non-fatal): %', SQLERRM;
  END;

  RETURN v_updated_row;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_adr(int, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_adr(int, text) TO service_role;

-- ============================================================================
-- BACKFILL: 12 canonical LEO decision ADRs (status=accepted, chairman pre-approved)
-- Idempotent via ON CONFLICT (adr_number) DO NOTHING — re-running the migration
-- after manual ADR additions does not overwrite. Use accept_adr RPC for further
-- approvals (this backfill is the one-time genesis seed).
-- ============================================================================
INSERT INTO public.pocock_adrs (adr_number, slug, title, body, status, accepted_at, approved_by)
VALUES
  (1, 'canonical-pause-five-point',
   'Canonical Pause is a five-point set',
   'LEO sessions pause work only for one of five enumerated reasons: orchestrator completion (chaining off), blocking error requiring human decision, test failures after 2 retry attempts, all children blocked, or critical security or data-loss scenario. Any other rationale for pausing is a protocol violation. Implemented at CLAUDE.md "Canonical Pause Points" section; enforced by AUTO-PROCEED mode default.',
   'accepted', now(), 'chairman-backfill-2026-05-14'),

  (2, 'auto-proceed-default-on',
   'AUTO-PROCEED is ON by default',
   'Phase transitions, PRD creation, child decomposition, refactors, and scope-lock boundaries proceed automatically without per-step user confirmation. The user delegates per-step approval by approving the SD at LEAD. Pauses occur only at the five canonical pause points. Rationale: confirmation-fishing is the most common AUTO-PROCEED failure mode in Opus 4.7 sessions.',
   'accepted', now(), 'chairman-backfill-2026-05-14'),

  (3, 'database-first-no-markdown-source',
   'Database is the single source of truth (no markdown source-of-truth)',
   'Strategic Directives, PRDs, retrospectives, and handoffs live in strategic_directives_v2, product_requirements_v2, retrospectives, and sd_phase_handoffs respectively. Markdown files drift silently and cannot be queried by the gate pipeline. Schema constraints and state transitions are enforceable only at the database layer.',
   'accepted', now(), 'chairman-backfill-2026-05-14'),

  (4, 'handoff-js-canonical-writer-no-bypass',
   'handoff.js is the canonical writer for phase transitions',
   'All LEAD-TO-PLAN, PLAN-TO-EXEC, EXEC-TO-PLAN, PLAN-TO-LEAD, and LEAD-FINAL-APPROVAL transitions go through scripts/handoff.js execute. Direct INSERTs into sd_phase_handoffs are prohibited. Bypasses via --bypass-validation --bypass-reason are rate-limited (3 per SD, 10 per day) and logged to audit_log.',
   'accepted', now(), 'chairman-backfill-2026-05-14'),

  (5, 'mode-declaration-product-vs-campaign',
   'Sessions declare product mode vs campaign mode',
   'Product mode (default for non-SD-LEO SDs) defers harness bugs to backlog via log-harness-bug.js. Campaign mode (default for SD-LEO-* / QF-* SDs) fixes harness bugs inline. User overrides via [MODE: product] or [MODE: campaign] declarations. Implicit "is this harness or product work" inference drifts without explicit declaration.',
   'accepted', now(), 'chairman-backfill-2026-05-14'),

  (6, 'pretooluse-pivot-additional-context-not-posttooluse',
   'Hook injection uses PreToolUse additionalContext, not PostToolUse',
   'Goal-chain and rule injection happen at PreToolUse hook boundary via additionalContext, not at PostToolUse. PostToolUse cannot influence the current tool call; PreToolUse can shape behavior before it executes. Documented in brainstorm session a6b92936 pivot history.',
   'accepted', now(), 'chairman-backfill-2026-05-14'),

  (7, 'goal-advisory-only-binding-rejected',
   '/goal is advisory-only; binding goal rejection',
   '/goal outputs guidance but does not bind subsequent decisions. T=0 multi-sample voting (3 samples) protects against single-sample bias. Binding goal injection was rejected because it constrains autonomous reasoning paths the chairman cannot pre-audit. Documented in brainstorm session a8938664 not_doing entries.',
   'accepted', now(), 'chairman-backfill-2026-05-14'),

  (8, 'scope-completion-contract-approach',
   'Scope completion is verified by contract, not heuristic',
   'Every deliverable named in sd_scope_deliverables must exist in merged code at LEAD-FINAL-APPROVAL. Audited by scope-completion-chain view (cross-SD). Heuristic scoring (LOC count, file count) is insufficient — explicit deliverable enumeration is required.',
   'accepted', now(), 'chairman-backfill-2026-05-14'),

  (9, 'lineage-fix-prerequisite-to-instrumentation',
   'Lineage fix is prerequisite to deeper instrumentation',
   '61% of SDs lack parent_sd_id lineage per 2026-05-14 brainstorm audit. Instrumentation built on top of broken lineage produces phantom relationships. Child 0 lineage shadow-write is the prerequisite for any orchestrator-level analytics. Source: brainstorm session a6b92936.',
   'accepted', now(), 'chairman-backfill-2026-05-14'),

  (10, 'sibling-orchestrator-pattern-additive-over-merge',
   'Sibling orchestrators preferred over merge into existing orchestrator',
   'When a new pattern emerges (Pocock adoption), file a sibling orchestrator SD rather than merging children into an existing orchestrator. Sibling pattern preserves isolation, completion semantics, and retrospective scoping. Merge pattern produces god orchestrators with diluted phase boundaries.',
   'accepted', now(), 'chairman-backfill-2026-05-14'),

  (11, 'adversarial-subagent-grilling-replaces-interactive-human',
   'Adversarial sub-agent grilling replaces interactive human grilling',
   'Pocock /grill-me pattern adapted: Builder vs Challenger vs Judiciary loop with T=0 multi-sample voting at rounds=5, convergence_required=true. Chairman participates async via deliberation artifacts, not real-time. Preserves autonomy economics while preserving rigor.',
   'accepted', now(), 'chairman-backfill-2026-05-14'),

  (12, 'progressive-disclosure-skill-body-discipline',
   'Skill bodies follow progressive-disclosure (median 30-100 LOC + supporting docs)',
   'Pocock progressive-disclosure pattern: skill body is the discipline; supporting docs (CONVERGENCE-PROTOCOL.md style) live in the skill subdir. Agent reads body first; dives into supporting docs only when needed. CI rule warns at >200 LOC body. /brainstorm currently >3000 LOC body — refactor deferred to separate SD.',
   'accepted', now(), 'chairman-backfill-2026-05-14')

ON CONFLICT (adr_number) DO NOTHING;

COMMIT;
