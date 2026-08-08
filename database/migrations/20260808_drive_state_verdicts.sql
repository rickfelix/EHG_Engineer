-- SD-LEO-INFRA-DRIVE-STATE-OBSERVABILITY-001 — FR-1.
--
-- THE GAP THIS CLOSES: lib/governance/drive-state/ computes a six-axis verdict over
-- CLEAR / STALLED / UNMEASURABLE and contains NO write path. Both consumers render it and drop it
-- (coordinator-hourly-review.cjs reportDriveState console.logs the line array; adam-pm-board.mjs
-- returns the lines to its caller). Because nothing is retained, no question with a time dimension
-- is answerable: how long an axis has been STALLED, whether one flipped today, whether the
-- unmeasurable count is trending. An axis can sit stalled indefinitely while every individual
-- hourly render still reads as an ordinary report.
--
-- GRAIN: ONE ROW PER (run_id, axis) — six rows per run. Taken from
-- database/migrations/20260614_adam_adherence_ledger.sql, already one row per (run_id, probe)
-- carrying a three-value categorical verdict that includes an "unknown" member.
--
-- WHAT IS DELIBERATELY ABSENT: there is NO boolean column and NO numeric score/health column on
-- this table. That absence is the structural defence of the three-state vocabulary, not a
-- stylistic choice. The rejected alternative was the codebase_health_snapshots idiom, whose
-- `score NUMERIC NOT NULL CHECK (0..100)` would force every UNMEASURABLE axis to carry a number —
-- and its existing consumer (lib/governance/recursion-governor.js:160) already demonstrates the
-- coercion, writing 0 when no measurement exists. An UNMEASURABLE axis stored as 0 is
-- indistinguishable from a genuine zero, which is the exact fold contract.cjs:9-14 forbids.

CREATE TABLE IF NOT EXISTS public.drive_state_verdicts (
  id           BIGSERIAL PRIMARY KEY,

  -- The grouping key that makes six rows one run. Without it the six rows of a run cannot be
  -- reliably re-assembled, and every duration derived from the table is guesswork.
  run_id       TEXT NOT NULL,

  -- CHECK IS LOAD-BEARING, NOT DECORATION. Prose ("axis text NOT NULL") gives the drift guard
  -- nothing to diverge from and makes its test vacuous by construction. Note the precedent does
  -- NOT supply this: adam_adherence_ledger constrains `verdict` but leaves `probe`, its per-row
  -- key, unconstrained — so following the template alone would have left `axis` open.
  -- THIS LIST IS A SECOND REPRESENTATION OF lib/governance/drive-state/contract.cjs AXES and it is
  -- accepted ONLY because tests/unit/governance/drive-state-vocabulary-drift.test.js parses this
  -- constraint and asserts set-equality against the frozen list, in both directions. If that test
  -- is ever deleted, this CHECK must be deleted with it.
  axis         TEXT NOT NULL CHECK (axis IN (
                 'chairman_decisions',
                 'coordinator_performance',
                 'roadmap_motion',
                 'venture_stage_motion',
                 'fleet_health',
                 'learning_conversion'
               )),

  -- The three-state vocabulary, stored as its literal token. UNMEASURABLE is a first-class state,
  -- never folded into CLEAR: a probe that cannot see is not a probe that sees nothing wrong.
  state        TEXT NOT NULL CHECK (state IN ('CLEAR', 'STALLED', 'UNMEASURABLE')),

  -- contract.cjs:63-68 requires a citation on EVERY state, not only UNMEASURABLE — that is the
  -- whole difference between a checked all-clear and an unchecked one, so it is NOT NULL here too.
  citation     TEXT NOT NULL,

  -- Mandatory only when state = UNMEASURABLE (contract.cjs:69-71). Enforced as a row-level rule
  -- rather than a bare NOT NULL, so a CLEAR row is not forced to invent one.
  reason       TEXT,

  action_taken TEXT NOT NULL CHECK (action_taken IN ('NONE', 'RECORDED', 'UNVERIFIABLE')),
  -- contract.cjs:75-77: RECORDED requires an artifact to point at.
  action_citation TEXT,

  -- NOT SUPPLIED BY THE WRITER. This table exists to measure a DURATION, so the timestamp is the
  -- one column whose provenance actually matters, and a client clock is the wrong authority: two
  -- producers with any drift interleave into a history that is subtly out of order and shows
  -- nothing wrong. The database clock is single-sourced.
  recorded_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT drive_state_verdicts_unmeasurable_needs_reason
    CHECK (state <> 'UNMEASURABLE' OR (reason IS NOT NULL AND btrim(reason) <> '')),
  CONSTRAINT drive_state_verdicts_recorded_needs_citation
    CHECK (action_taken <> 'RECORDED' OR (action_citation IS NOT NULL AND btrim(action_citation) <> '')),

  -- Without this a retried run writes twelve rows and the "exactly six per run" property holds
  -- only on the happy path. The grain template pointedly lacks this constraint, so precedent
  -- would not have supplied it.
  CONSTRAINT drive_state_verdicts_one_row_per_run_axis UNIQUE (run_id, axis)
);

-- The duration query reads recent rows per axis and walks them in time order.
CREATE INDEX IF NOT EXISTS drive_state_verdicts_axis_recorded_idx
  ON public.drive_state_verdicts (axis, recorded_at DESC);

CREATE INDEX IF NOT EXISTS drive_state_verdicts_run_idx
  ON public.drive_state_verdicts (run_id);

ALTER TABLE public.drive_state_verdicts ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.drive_state_verdicts IS
  'SD-LEO-INFRA-DRIVE-STATE-OBSERVABILITY-001: durable history of the six-axis drive-state verdict, one row per (run_id, axis). Written only by the coordinator hourly review. No boolean or numeric health column exists here by design — see the header.';
