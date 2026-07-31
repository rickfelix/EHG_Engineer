-- SD-LEO-INFRA-WORKER-ESCALATION-WRITE-001 (FR-2): durable receipt ledger.
-- @approved-by: codestreetlabs@gmail.com
--
-- CHAIRMAN-AUTHORIZED 2026-07-31 ~14:09Z, verbatim: "YES - the table fixes the metric gap."
-- (decision row 9921b2ba, answering packet adam-decision-receiptledger-20260731). Double-stitched:
-- rides the standing additive-DDL frame AND carries an explicit chairman word on top. THE
-- AUTHORIZATION BINDS TO THIS FILE'S CONTENT — if this file changes after Adam stamps it, the stamp
-- no longer covers it and it must be re-asked.
--
-- WHY THIS TABLE EXISTS — the metric gap, measured.
-- The answered-rate for worker escalation signals cannot be computed from session_coordination,
-- because cleanup_expired_coordination() deletes ACKED rows at expires_at (created + 24h) while
-- UNACKED rows persist. The denominator is therefore curated by the exact state being measured:
--   * 0 of 31 acked signal rows survive past 24h; 1,930 unacked rows do.
--   * Transfer function: to DISPLAY 60% on the survivor table, the true rate would have to be 98.6%.
-- That is not a biased sample, it is a population actively pruned by the property under measurement,
-- so the SD's acceptance criterion is unmeasurable in principle without an append-only record
-- written at transition time. Receipts recorded here survive the cleanup that deletes their source
-- row, which is the entire point.
--
-- ADDITIVE + IDEMPOTENT + REVERSIBLE. Creates one new table; touches nothing existing.
--
-- SCOPE IS DELIBERATELY CREATE TABLE ONLY — no policies, no RLS, no GRANTs. Those are
-- non-delegable and would bounce this file to the full chairman gate, converting a fast additive
-- approval into a slow one. They are follow-on work, not an omission.
--
-- NO INNER BEGIN/COMMIT — DELIBERATE, NOT AN OVERSIGHT. scripts/apply-migration.js wraps this file
-- in its own transaction (BEGIN :341, COMMIT :430, ROLLBACK :376/:434). A nested inner COMMIT closes
-- the HARNESS transaction early and silently strips its rollback: the DDL still lands, nothing fails
-- loudly, and a later statement erroring leaves the schema half-applied with nothing to undo.
-- 18 of the 20 most recent migrations here omit transaction control for this reason. Match them.

CREATE TABLE IF NOT EXISTS coordination_receipts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The coordination row this receipt is about. Deliberately NOT a foreign key: the source row is
  -- deleted by retention at 24h and the receipt MUST outlive it. An FK would either block the
  -- cleanup or cascade the receipt away, reintroducing the exact deletion bias this table exists to
  -- escape.
  coordination_id uuid NOT NULL,

  -- Which lane the receipt came from, so ONE receipt contract covers all of them rather than a
  -- signal-lane patch: friction signals, WORK_ASSIGNMENT fulfilment, Adam advisories, and
  -- resolution-by-work_assignment (resolves_files) currently each half-implement their own.
  lane            text NOT NULL,

  -- delivered | seen | disposed. Three DISTINCT states, independently queryable: transport
  -- succeeded / a consumer actually surfaced it to a decider / an outcome was recorded. Conflating
  -- delivery with disposition is the root defect this SD addresses.
  state           text NOT NULL,

  -- Present only for state='disposed': actioned | declined | superseded.
  disposition     text,

  -- WHO acted. Without this the metric cannot distinguish fleet behaviour from a single busy
  -- session — measured 2026-07-31, every ack then in the table belonged to one coordinator session.
  actor_session   text,
  actor_role      text,

  -- TRUE when written by retention/flood-control rather than by an answering agent. Mirrors
  -- payload.auto_acked (lib/retention/retention-ack-marker.cjs, FR-7). A retention stamp must never
  -- be counted as an answer, and must never again be indistinguishable from one.
  is_retention    boolean NOT NULL DEFAULT false,

  -- Age of the source row when the receipt was written; lets time-to-answer be computed even after
  -- the source row is gone.
  source_age_ms   bigint,

  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- The acceptance query is "answered rate over a window, by lane, excluding retention stamps",
-- so index the columns it filters and groups on.
CREATE INDEX IF NOT EXISTS idx_coordination_receipts_created_at
  ON coordination_receipts (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_coordination_receipts_lane_state
  ON coordination_receipts (lane, state);
CREATE INDEX IF NOT EXISTS idx_coordination_receipts_coordination_id
  ON coordination_receipts (coordination_id);

COMMENT ON TABLE coordination_receipts IS
  'SD-LEO-INFRA-WORKER-ESCALATION-WRITE-001 FR-2: append-only receipt ledger. The answered-rate metric MUST be computed from this table, never from session_coordination, whose cleanup deletes ACKED rows at created+24h while unacked rows persist — measured 0 of 31 acked rows surviving 24h vs 1,930 unacked, so a survivor-table rate measures the deletion policy rather than anyone''s conduct.';
COMMENT ON COLUMN coordination_receipts.coordination_id IS
  'Source session_coordination row. Intentionally NOT a foreign key — the source is deleted by retention at 24h and the receipt must outlive it.';
COMMENT ON COLUMN coordination_receipts.state IS
  'delivered | seen | disposed — three independently queryable states. Delivery is not disposition.';
COMMENT ON COLUMN coordination_receipts.is_retention IS
  'TRUE when written by retention/flood-control rather than an answering agent; such receipts are excluded from the answered-rate. Mirrors payload.auto_acked (FR-7).';
COMMENT ON COLUMN coordination_receipts.actor_session IS
  'Which session acted, so the metric can be shown to span multiple coordinator sessions rather than one busy seat.';

-- Rollback (reversible):
--   DROP TABLE IF EXISTS coordination_receipts;
