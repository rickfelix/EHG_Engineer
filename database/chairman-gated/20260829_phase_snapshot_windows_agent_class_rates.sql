-- 20260829_phase_snapshot_windows_agent_class_rates.sql
-- SD-LEO-INFRA-BURN-TELEMETRY-PER-001-D (FR-1, FR-2, FR-3, FR-4)
--
-- Phase-boundary snapshot mechanics: sd_phase_handoffs (36,560+ live rows, ~862/week) is
-- ALREADY the phase-boundary event source -- no new table. Adds two nullable, additive
-- columns stamped at INSERT time (by scripts/modules/handoff/recording/HandoffRecorder.js)
-- on the row that OPENS the phase the SD is entering, keyed by that row's own id (never
-- (sd_id, to_phase), which repeats across cycles -- 485 EXEC->PLAN and 614 PLAN->LEAD
-- transitions in a single 30-day window).
--
-- Pre-registration immutability (chairman-approved M1+M2 burn-lever amendment, .artifacts/
-- solomon-burn-lever-plan-20260829.md): a plain nullable column is post-hoc-writable and
-- would let mean-reversion masquerade as lever effect if the window could be edited after
-- outcomes are known. A BEFORE UPDATE trigger closes that gap, mirroring the append-only
-- freeze pattern already proven on chairman_ratifications (database/chairman-gated/
-- 20260823_chairman_ratifications.sql) -- but scoped to ONLY these two columns, since this
-- table's other columns (status, validation_score, etc.) are legitimately updated by the
-- handoff pipeline as a phase progresses.
--
-- Per-agent-class rates: correction-manager.js's sd_corrections write target is confirmed
-- genuinely 0 live rows (dormant) -- NOT the rollup source, contrary to this SD's original
-- scope text. sub_agent_execution_results (26,482 live rows; sub_agent_code x phase is the
-- real per-invocation agent-class discriminator today) is the real, populated source.
--
-- Both additions are purely additive: no REVOKE/GRANT/RLS-policy change, so this migration
-- classifies TIER-1 under scripts/lib/migration-tier-classifier.mjs, not chairman-gated.

ALTER TABLE sd_phase_handoffs
  ADD COLUMN IF NOT EXISTS window_registered_at TIMESTAMPTZ;

ALTER TABLE sd_phase_handoffs
  ADD COLUMN IF NOT EXISTS baseline_snapshot JSONB;

COMMENT ON COLUMN sd_phase_handoffs.window_registered_at IS
  'SD-LEO-INFRA-BURN-TELEMETRY-PER-001-D (FR-1/FR-2): stamped at INSERT time by HandoffRecorder.js on the row that opens the phase this handoff transitions INTO (to_phase) -- a genuine pre-registration point, since the row is created before any work in the new phase has occurred. Keyed by this row''s own id, never by (sd_id, to_phase), which is non-unique across repeated phase cycles. Immutable once set (see phase_snapshot_window_freeze trigger below) -- satisfies the chairman-approved M1+M2 burn-lever amendment''s requirement that a baseline window be declared before, not after, a phase starts.';

COMMENT ON COLUMN sd_phase_handoffs.baseline_snapshot IS
  'SD-LEO-INFRA-BURN-TELEMETRY-PER-001-D (FR-1/FR-2): the pre-registered baseline metrics snapshot paired with window_registered_at. Immutable once set (see phase_snapshot_window_freeze trigger below).';

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- IMMUTABILITY: window_registered_at/baseline_snapshot may transition NULL -> set exactly once.
-- Every other column on this table remains freely updatable by the handoff pipeline as a phase
-- progresses (status, validation_score, accepted_at, etc.) -- this trigger scopes ONLY to the
-- two window columns, unlike chairman_ratifications' whole-row freeze.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.phase_snapshot_window_freeze()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $freeze$
BEGIN
  IF OLD.window_registered_at IS NOT NULL
     AND (NEW.window_registered_at IS DISTINCT FROM OLD.window_registered_at
          OR NEW.baseline_snapshot IS DISTINCT FROM OLD.baseline_snapshot)
  THEN
    RAISE EXCEPTION
      'sd_phase_handoffs.window_registered_at/baseline_snapshot are pre-registered and immutable once set (row %): a rewrite after the fact would let mean-reversion masquerade as lever effect (critique M2).',
      OLD.id;
  END IF;

  RETURN NEW;
END
$freeze$;

DROP TRIGGER IF EXISTS phase_snapshot_window_freeze_trg ON public.sd_phase_handoffs;
CREATE TRIGGER phase_snapshot_window_freeze_trg
  BEFORE UPDATE ON public.sd_phase_handoffs
  FOR EACH ROW EXECUTE FUNCTION public.phase_snapshot_window_freeze();

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- v_phase_snapshot_windows: registered baseline windows per handoff row. Excludes rows that do
-- not represent an opened phase (status='blocked', or metadata.wait=true from recordFailure/
-- recordWait). LEAD->LEAD self-transitions (412/30d) are INCLUDED but flagged via
-- is_self_transition, since they are a real phase re-entry (e.g. LEAD-FINAL rejection looping
-- back), not a no-op -- callers that want to exclude them can filter on this column.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.v_phase_snapshot_windows AS
SELECT
  id,
  sd_id,
  from_phase,
  to_phase,
  (from_phase = to_phase) AS is_self_transition,
  window_registered_at,
  baseline_snapshot,
  created_at
FROM public.sd_phase_handoffs
WHERE window_registered_at IS NOT NULL
  AND status IS DISTINCT FROM 'blocked'
  AND COALESCE((metadata->>'wait')::boolean, false) IS NOT TRUE;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- v_agent_class_rates: error/rework/escalation-shaped rollup over sub_agent_execution_results
-- (26,482 live rows) -- sub_agent_code x phase is the real per-invocation agent-class
-- discriminator today; sd_type is joined via sd_id where available (26,471/26,482 rows join).
-- Deliberately does NOT reference sd_corrections, which is confirmed genuinely 0 live rows.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.v_agent_class_rates AS
SELECT
  r.sub_agent_code,
  r.phase,
  sd.sd_type,
  COUNT(*) AS total_count,
  COUNT(*) FILTER (WHERE r.verdict = 'FAIL') AS fail_count,
  COUNT(*) FILTER (WHERE r.verdict = 'BLOCKED') AS blocked_count,
  COUNT(*) FILTER (WHERE r.verdict = 'ERROR') AS error_count,
  COUNT(*) FILTER (WHERE r.verdict IN ('FAIL', 'BLOCKED', 'ERROR')) AS escalation_count,
  ROUND(
    COUNT(*) FILTER (WHERE r.verdict IN ('FAIL', 'BLOCKED', 'ERROR'))::numeric
      / NULLIF(COUNT(*), 0),
    4
  ) AS escalation_rate
FROM public.sub_agent_execution_results r
LEFT JOIN public.strategic_directives_v2 sd ON sd.id = r.sd_id
GROUP BY r.sub_agent_code, r.phase, sd.sd_type;

COMMENT ON VIEW public.v_phase_snapshot_windows IS
  'SD-LEO-INFRA-BURN-TELEMETRY-PER-001-D (FR-3): registered pre-phase baseline windows, excluding non-phase-opening rows. Consumed by Solomon''s burn-lever gauge proposal.';

COMMENT ON VIEW public.v_agent_class_rates IS
  'SD-LEO-INFRA-BURN-TELEMETRY-PER-001-D (FR-4): per-sub_agent_code x phase x sd_type error/escalation rollup over sub_agent_execution_results (never sd_corrections, which is dormant/0-rows). Consumable by Solomon''s gauge proposal and future A2 model-tier-demotion decisions -- acting on these rates is out of scope for this SD.';
