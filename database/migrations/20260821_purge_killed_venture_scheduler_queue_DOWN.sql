-- DOWN migration for 20260821_purge_killed_venture_scheduler_queue.sql
-- SD-LEO-INFRA-EVA-SCHEDULER-HYGIENE-001 (FR-2) — break-glass restore from
-- eva_scheduler_queue_qkilled20260821.
-- @chairman-gated
--
-- ⚠ NO `-- @approved-by:` LINE — same reason as the UP. The chairman supplies the attestation and
--   runs `node scripts/apply-migration.js <this file> --prod-deploy`. APPLY IS NOT MINE.
--
-- ⚠ DO NOT run with --split-statements (named dollar-quoted DO blocks).
-- ⚠ NO EXPLICIT BEGIN/COMMIT — apply-migration.js owns the transaction.
--
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- TWO DESIGN DECISIONS THAT ARE LOAD-BEARING. Both are the difference between a restore and a
-- restore-shaped no-op, and neither is obvious.
--
-- (1) PRE-CLEAR ON venture_id, NOT `ON CONFLICT (id)`.
--     eva_scheduler_queue carries a UNIQUE index on venture_id (idx_esq_venture_id) IN ADDITION to
--     its id primary key, and fn_auto_enqueue_venture re-enqueues a venture on any eva_ventures
--     INSERT. So between the UP and this DOWN, a purged venture can acquire a BRAND NEW queue row
--     with a NEW id. That row collides with the archived original on venture_id — a constraint
--     `ON CONFLICT (id)` does not name and therefore cannot absorb: the restore would die with
--     23505 on idx_esq_venture_id, or (worse, with DO NOTHING) silently restore nothing.
--     Step 3 clears on venture_id OR id, so both collision axes are covered.
--
-- (2) THE INSERT COLUMN LIST IS COMPUTED FROM THE CATALOG, NOT HARDCODED.
--     database/migrations/20260213_eva_master_scheduler.sql declares
--       blocking_decision_age_seconds NUMERIC GENERATED ALWAYS AS (...) STORED
--     and a GENERATED STORED column REJECTS an explicit INSERT value (SQLSTATE 428C9), so a
--     hardcoded list naming it would break the restore.
--     BUT THE LIVE COLUMN IS NOT GENERATED. Measured read-only against live 2026-08-21:
--       pg_attribute.attgenerated = '' for ALL 14 columns; the column is nullable NUMERIC
--       DEFAULT 0 sitting at attnum 14 (last), not at the position the CREATE TABLE puts it —
--       the signature of a DROP + re-ADD as a plain column that no migration in this repo records.
--       Confirmed by writing to it inside a rolled-back transaction: the UPDATE succeeded.
--     So the hazard is INVERTED versus the declaration: hardcoding an EXCLUDE would silently drop a
--     real, writable column on restore and reset all 45 rows to the DEFAULT 0 — invisible today,
--     because every live row happens to hold 0, and therefore exactly the kind of silent data loss
--     that surfaces years later.
--     Resolving this by picking a side would be guessing. The catalog predicate `attgenerated = ''`
--     is correct under BOTH shapes: it includes the column while it is plain, and excludes it the
--     moment anyone restores the GENERATED declaration. The value-identity post-assert (step 5)
--     then proves the outcome rather than trusting the reasoning.
--
--     Live column list as of 2026-08-21, for human eyeballing (the catalog, not this comment,
--     is what executes):
--       id, venture_id, last_blocking_decision_at, fifo_key, status, max_stages_per_cycle,
--       last_dispatched_at, last_dispatch_outcome, dispatch_count, error_count, last_error,
--       created_at, updated_at, blocking_decision_age_seconds
--
-- TRIGGER SIDE-EFFECTS: eva_scheduler_queue's only non-internal trigger is trg_esq_updated_at,
--   which is BEFORE UPDATE. A restore is an INSERT, so it does not fire and the archived
--   updated_at values survive verbatim. (Verified live 2026-08-21.)
-- ─────────────────────────────────────────────────────────────────────────────────────────────

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

SELECT pg_advisory_xact_lock(hashtext('eva_scheduler_queue_killed_venture_purge'));

-- 0) Guards: the archive must exist, and this DOWN must not have run before.
DO $esqd_guard$
BEGIN
  IF to_regclass('public.eva_scheduler_queue_qkilled20260821') IS NULL THEN
    RAISE EXCEPTION 'DOWN aborted: eva_scheduler_queue_qkilled20260821 not found — nothing to restore';
  END IF;
  IF to_regclass('public.eva_scheduler_queue_qkilled20260821_interlopers') IS NOT NULL THEN
    RAISE EXCEPTION 'DOWN aborted: ..._interlopers already exists — this DOWN already ran, investigate before re-running';
  END IF;
END
$esqd_guard$;

LOCK TABLE eva_scheduler_queue IN ACCESS EXCLUSIVE MODE;
LOCK TABLE eva_ventures        IN ACCESS EXCLUSIVE MODE;

-- 1) Archive the INTERLOPERS before destroying them. Step 3's pre-clear deletes live rows that were
--    never part of the original snapshot (a venture re-enqueued after the purge). Deleting them
--    unrecorded would make this "restore" a net data LOSS for those ventures. Snapshot first.
CREATE TABLE eva_scheduler_queue_qkilled20260821_interlopers AS
SELECT t.*
FROM eva_scheduler_queue t
WHERE EXISTS (
  SELECT 1 FROM eva_scheduler_queue_qkilled20260821 s
  WHERE s.venture_id = t.venture_id OR s.id = t.id
);

DO $esqd_interlopers$
DECLARE
  v_n bigint;
BEGIN
  SELECT count(*) INTO v_n FROM eva_scheduler_queue_qkilled20260821_interlopers;
  IF v_n > 0 THEN
    RAISE NOTICE 'DOWN: % live row(s) re-appeared for archived ventures since the purge; archived to eva_scheduler_queue_qkilled20260821_interlopers and about to be replaced by the originals', v_n;
  END IF;
END
$esqd_interlopers$;

-- 2) (intentionally blank — numbering kept aligned with the narrative above)

-- 3) PRE-CLEAR on BOTH unique axes: venture_id (idx_esq_venture_id) and id (primary key).
--    venture_id is the one that actually bites; id is included so the clear is total.
DELETE FROM eva_scheduler_queue t
USING eva_scheduler_queue_qkilled20260821 s
WHERE t.venture_id = s.venture_id
   OR t.id = s.id;

-- 4) Restore, with the INSERT column list computed from the catalog (see design note (2)).
--    5) The value-identity + count post-asserts live in the same block, because they must observe
--    the same column list the INSERT used — splitting them would let the two drift apart.
DO $esqd_restore$
DECLARE
  v_q        CONSTANT text := 'eva_scheduler_queue_qkilled20260821';
  v_cols     text;
  v_qcols    text;
  v_tcols    text;
  v_missing  text;
  v_expected bigint;
  v_restored bigint;
  v_diff     bigint;
BEGIN
  -- A live column is restorable when it is (a) NOT generated — GENERATED ALWAYS ... STORED columns
  -- are computed by Postgres and reject an explicit INSERT value (428C9) — and (b) present in the
  -- archive. Correct under both the declared and the measured shape of the table.
  SELECT string_agg(quote_ident(a.attname), ', '            ORDER BY a.attnum),
         string_agg('q.' || quote_ident(a.attname), ', '    ORDER BY a.attnum),
         string_agg('t.' || quote_ident(a.attname), ', '    ORDER BY a.attnum)
    INTO v_cols, v_qcols, v_tcols
  FROM pg_attribute a
  WHERE a.attrelid = 'public.eva_scheduler_queue'::regclass
    AND a.attnum > 0
    AND NOT a.attisdropped
    AND a.attgenerated = ''
    AND EXISTS (
      SELECT 1 FROM pg_attribute qa
      WHERE qa.attrelid = ('public.' || v_q)::regclass
        AND qa.attname  = a.attname
        AND qa.attnum > 0
        AND NOT qa.attisdropped
    );

  IF v_cols IS NULL THEN
    RAISE EXCEPTION 'DOWN aborted: no restorable columns in common between eva_scheduler_queue and % — archive shape is unusable', v_q;
  END IF;

  -- TRIPWIRE: a live NOT NULL column with no default that the archive cannot supply means the
  -- archive predates a schema change and the restore would be lossy. Abort rather than half-restore.
  SELECT string_agg(a.attname, ', ' ORDER BY a.attnum)
    INTO v_missing
  FROM pg_attribute a
  WHERE a.attrelid = 'public.eva_scheduler_queue'::regclass
    AND a.attnum > 0
    AND NOT a.attisdropped
    AND a.attgenerated = ''
    AND a.attnotnull
    AND NOT EXISTS (SELECT 1 FROM pg_attrdef d WHERE d.adrelid = a.attrelid AND d.adnum = a.attnum)
    AND NOT EXISTS (
      SELECT 1 FROM pg_attribute qa
      WHERE qa.attrelid = ('public.' || v_q)::regclass
        AND qa.attname = a.attname AND qa.attnum > 0 AND NOT qa.attisdropped
    );
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'DOWN aborted: archive cannot supply live NOT NULL column(s) with no default: % — schema drifted since the purge', v_missing;
  END IF;

  RAISE NOTICE 'DOWN: restoring columns [%]', v_cols;
  EXECUTE format('INSERT INTO public.eva_scheduler_queue (%s) SELECT %s FROM public.%I', v_cols, v_cols, v_q);

  -- 5a) Every archived row is live again.
  EXECUTE format('SELECT count(*) FROM public.%I', v_q) INTO v_expected;
  EXECUTE format(
    'SELECT count(*) FROM public.eva_scheduler_queue t WHERE EXISTS (SELECT 1 FROM public.%I q WHERE q.id = t.id)',
    v_q) INTO v_restored;
  IF v_restored <> v_expected THEN
    RAISE EXCEPTION 'DOWN post-assert failed: restored % of % archived row(s)', v_restored, v_expected;
  END IF;

  -- 5b) VALUE IDENTITY, not just row count. A count-only assert passes on a restore that wrote
  --     defaults into every column — which is precisely the failure mode design note (2) is about.
  --     ROW(...) IS DISTINCT FROM ROW(...) compares field-wise and is NULL-safe.
  EXECUTE format(
    'SELECT count(*) FROM public.%I q JOIN public.eva_scheduler_queue t ON t.id = q.id WHERE ROW(%s) IS DISTINCT FROM ROW(%s)',
    v_q, v_qcols, v_tcols) INTO v_diff;
  IF v_diff <> 0 THEN
    RAISE EXCEPTION 'DOWN post-assert failed: % restored row(s) differ from the archive on at least one column', v_diff;
  END IF;

  RAISE NOTICE 'DOWN restore complete: % row(s) restored, value-identical on every restorable column', v_restored;
END
$esqd_restore$;

-- 6) Both archive tables are deliberately KEPT after restore (drop manually after verification):
--    eva_scheduler_queue_qkilled20260821 is the purge audit trail, and
--    eva_scheduler_queue_qkilled20260821_interlopers records what the pre-clear replaced.
--
-- VERIFY (run after apply):
--   SELECT count(*) FROM eva_scheduler_queue q JOIN eva_ventures v ON v.id = q.venture_id
--    WHERE v.status = 'killed';                       -- back to the pre-purge, hazardous count
--   SELECT count(*) FROM eva_scheduler_queue_qkilled20260821_interlopers;  -- what was replaced
