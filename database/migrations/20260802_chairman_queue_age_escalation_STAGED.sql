-- CHAIRMAN QUEUE — AGE-ESCALATION MARKER FIX (FR-5 SQL half)
-- SD-FDBK-INFRA-DECISION-QUEUE-RETIREMENT-001
--
-- STAGED — NOT YET APPROVED FOR APPLY. requires-chairman-apply. Do NOT auto-apply on merge; there
-- is no approved-by attestation on this file. CREATE OR REPLACE is TIER-2 under
-- scripts/lib/migration-tier-classifier.mjs:323 (FC-8), so the classifier will never auto-apply it.
--
-- ============================ WHAT IS WRONG =============================
-- chairman_pending_decisions computes:
--     (effective_rank < priority_rank) AS age_escalated
-- where effective_rank = GREATEST(1, priority_rank - bump).
-- For priority='critical' the priority_rank is 1, the GREATEST floor absorbs the bump, and the
-- comparison is 1 < 1 — FALSE AT ANY AGE. Every critical row is structurally unmarkable, and arm 4
-- of the union hardcodes priority='critical', so every row that arm emits is blind by construction.
--
-- The rank floor itself is CORRECT: critical genuinely cannot outrank critical, and sort order
-- depends on it. The defect is conflating "did the rank move" with "did this cross the age
-- threshold". This migration changes ONLY the marker; effective_rank and ORDER BY are untouched,
-- so the rendered ordering is unchanged.
--
-- The JS half already shipped (lib/chairman/decision-queue.mjs, `escalated: bump > 0`). This brings
-- the SQL surface into agreement; until it is applied the two surfaces disagree, and the VIEW is the
-- one that governs the marker for any consumer that reads age_escalated directly.
--
-- ======================= MEASURED IMPACT, LIVE ==========================
-- Measured 2026-08-02 against the 7 live pending rows:
--     marked today: 3   |   marked after this migration: 6
--   1315d76e normal   55.6d  now=true  -> true
--   c08f4368 normal   55.6d  now=true  -> true
--   acb3f2eb high     21.6d  now=true  -> true
--   3aa84300 critical 15.4d  now=FALSE -> TRUE   <- the blind class
--   48a264b4 critical  7.6d  now=FALSE -> TRUE
--   376d3ae5 critical  7.6d  now=FALSE -> TRUE
--   496ac883 critical  1.1d  now=false -> false  <- control: fresh critical stays unmarked
--
-- READ THIS BEFORE APPLYING. Raising the marked count from 3 to 6 is an INCREASE IN NOISE unless the
-- consumer also clocks from the chairman's deferral. The CLI already does: FR-6
-- (lib/chairman/decision-queue.mjs renderPendingLine + decision-disposition.mjs) overrides the
-- view's boolean when a disposition exists, and all 7 live rows carry a chairman deferral within
-- ~1.3 days, so `chairman-decisions.mjs list` currently renders ZERO marked rows.
-- ANY OTHER CONSUMER THAT READS age_escalated DIRECTLY — without that override — WILL SEE 6.
-- Before applying, enumerate those consumers and confirm each either applies the deferral override
-- or is content with the raw signal. lib/chairman/decision-layman.mjs is the first to check.
--
-- ======================= WHAT THIS DOES NOT DO ==========================
-- FR-2's arm-6 exit is NOT in this file. Arm 6 (leo_feature_flags -> flag_enablement) lives in
-- chairman_all_decision_signals, a THIRD view (7432 chars live), not in the two replaced here.
-- Excluding a ruled flag requires editing that view's arm-6 predicate to consult a disposition —
-- deliberately NOT attempted from a migration-file reading of it, because the live definition
-- diverges from the migration history and TR-1 forbids deriving view facts from files.
-- Whoever lands FR-2 must start from `SELECT definition FROM pg_views WHERE
-- viewname='chairman_all_decision_signals'`.
-- Do NOT implement arm 6 by mutating the flag: setting lifecycle_state to disabled/archived
-- re-asserts the KILL disposition the 2026-07-12 coordinator ruling reverted, and updating
-- created_at exits the predicate while destroying provenance and re-arming in 7 days.
--
-- =========================== APPLY RUNBOOK ==============================
--   (1) Chairman approval (verbal or written), and confirm the consumer enumeration above.
--   (2) node scripts/apply-migration.js database/migrations/20260802_chairman_queue_age_escalation_STAGED.sql --prod-deploy
--       (--prod-deploy + a single-use 1h token + an `-- @approved-by: <email>` header matching
--        git config user.email — enforced by scripts/lib/migration-guards.js)
--   (3) npm run schema:snapshot:lint and commit the regenerated snapshot in the same PR.
--   (4) Verify with a service_role probe: a critical row older than 72h reports age_escalated=true,
--       a critical row younger than 72h reports false, and the rendered ORDER of
--       `node scripts/chairman-decisions.mjs list` is byte-identical to before.

CREATE OR REPLACE VIEW public.chairman_pending_decisions AS
 SELECT id,
    decision_type,
    title,
    priority,
    status,
    venture_id,
    stage,
    gate_type,
    recommendation,
    response_deadline,
    created_at,
    decided_at,
    decided_by,
    requestor_name,
    venture_name,
    details,
    blocking,
        CASE effective_rank
            WHEN 1 THEN 'critical'::text
            WHEN 2 THEN 'high'::text
            WHEN 3 THEN 'normal'::text
            ELSE 'low'::text
        END AS effective_priority,
    -- FR-5: the marker is a property of AGE, not of rank movement. Was
    -- (effective_rank < priority_rank), which is 1 < 1 for every critical row at any age.
    -- Mirrors lib/chairman/decision-queue.mjs `escalated: bump > 0`.
    ((now() - created_at) > '72:00:00'::interval) AS age_escalated
   FROM ( SELECT u.id,
            u.decision_type,
            u.title,
            u.priority,
            u.status,
            u.venture_id,
            u.stage,
            u.gate_type,
            u.recommendation,
            u.response_deadline,
            u.created_at,
            u.decided_at,
            u.decided_by,
            u.requestor_name,
            u.venture_name,
            u.details,
            u.blocking,
                CASE u.priority
                    WHEN 'critical'::text THEN 1
                    WHEN 'high'::text THEN 2
                    WHEN 'normal'::text THEN 3
                    WHEN 'low'::text THEN 4
                    ELSE 5
                END AS priority_rank,
            -- UNCHANGED. The floor is correct and ORDER BY depends on it.
            GREATEST(1, (
                CASE u.priority
                    WHEN 'critical'::text THEN 1
                    WHEN 'high'::text THEN 2
                    WHEN 'normal'::text THEN 3
                    WHEN 'low'::text THEN 4
                    ELSE 5
                END -
                CASE
                    WHEN ((now() - u.created_at) > '72:00:00'::interval) THEN 1
                    ELSE 0
                END)) AS effective_rank
           FROM chairman_unified_decisions u
          WHERE (u.status = 'pending'::text)) ranked
  ORDER BY blocking DESC, effective_rank, created_at;

-- security_invoker must survive the replace. tests/unit/chairman-decision-queue.test.js:141-143
-- asserts this by reading a MIGRATION FILE, so that assertion would keep passing even if this
-- statement were dropped — see TR-10. Re-point that test at pg_views before relying on it.
ALTER VIEW public.chairman_pending_decisions SET (security_invoker = on);
