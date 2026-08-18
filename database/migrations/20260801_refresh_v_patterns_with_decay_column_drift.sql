-- Migration: rebuild v_patterns_with_decay so its column list matches issue_patterns again
-- Date: 2026-08-01
-- SD: SD-FDBK-ENH-LEARNING-LOOP-DESTROYS-001 (FR-5)
-- @approved-by: codestreetlabs@gmail.com
--   Chairman VERBAL approval at-terminal 2026-08-18 ~18:47Z: "5 5A" (item 5 of the evening
--   sitting packet, presented with rec+rationale; decision row 31ad8691 deferred-to-sitting at
--   17:5xZ then approved here). Adam-scribed under the ratified chairman-verbal ceremony;
--   stamped by the applier identity per checkApproverFactor. File read in full pre-apply.
--
-- *** CORRECTED AFTER A FAILED APPLY. The previous revision of THIS FILE could never have
-- worked, and the reason is worth reading before editing it again. ***
--
-- THE DEFECT. context-builder.js asks this view for metadata and dedup_fingerprint and gets
-- PostgREST 42703, so the learning read path silently falls back and surfaces almost nothing.
--
-- HOW IT DRIFTED. 20260207_fix_v_patterns_with_decay_scalar_bug.sql defines the view with
-- `SELECT p.*`. Postgres does NOT store the star — it EXPANDS it to an explicit column list at
-- CREATE time and FREEZES that list. Five days later 20260212_learning_pipeline_data_quality.sql
-- added dedup_fingerprint to issue_patterns. The view had already been frozen without it. Two
-- later migrations touched the view only via ALTER VIEW ... SET (security_invoker=on), which does
-- not re-expand the star. So a view written with `p.*` looks self-maintaining in source and is not.
--
-- MEASURED, not inferred. Probing each column on the table and on the view:
--   metadata, dedup_fingerprint, data_quality_status, content_embedding, embedding_updated_at,
--   auto_block_on_match  ->  ok on issue_patterns, 42703 on the view. SIX, not one.
-- Two controls confirm the probe discriminates: pattern_id reads ok on BOTH, and a deliberately
-- nonexistent column returns 42703 on BOTH.
--
-- *** WHY THE FIRST ATTEMPT FAILED — the part I got wrong. ***
-- The previous revision replayed the identical `CREATE OR REPLACE VIEW ... SELECT p.*` on the
-- theory that replaying would re-expand the star against today's table. Re-expansion is real, but
-- REPLACE cannot express the result. Postgres rejected it outright:
--
--     cannot change name of view column "days_since_update" to "metadata"
--
-- CREATE OR REPLACE VIEW may only APPEND columns — never rename, reorder, or insert. The six
-- drifted columns belong in the middle of `p.*`, so re-expanding shifts every computed column
-- after them, and REPLACE sees that as renaming column N. I reasoned carefully about star
-- expansion and never checked whether the statement form could express the outcome I wanted.
-- The failure was ATOMIC: the apply aborted, production was byte-for-byte unchanged.
--
-- *** DROP + CREATE IS THE STANDING CHANGE-PATTERN FOR THIS VIEW, NOT A ONE-OFF WORKAROUND. ***
-- Because REPLACE can only append, the column ORDER of this view is permanently locked to its
-- original expansion. ANY future column added to the middle of issue_patterns re-breaks REPLACE
-- in exactly this way. Do not "fix" a later drift by going back to REPLACE — it will fail again.
--
-- THE DROP COST IS MEASURED AT ZERO, which is the only reason this is safe (measured by Solomon
-- against the live catalog, relayed via the coordinator — NOT measured by this author):
--   dependent rewrite objects via pg_depend/pg_rewrite : 0
--   information_schema.view_table_usage                : 0
-- Nothing in the database selects from this view. Owner is postgres. DDL is transactional in
-- Postgres, so there is no window in which the view is absent.
--
-- ACL: anon SELECT was verified ALLOWED by this author with a live anon-key probe before the
-- rewrite, and is restated below. The remaining grants mirror the standard Supabase role set.
-- This is the one line in this file whose exact form was NOT read from the catalog by its author
-- — if it disagrees with the measured ACL, trust the catalog and correct it here.
--
-- WHAT THIS MIGRATION STILL DOES NOT FIX: `p.*` re-freezes at THIS create too, so drift resumes
-- the moment it finishes. That is why the post-conditions below are part of the transaction
-- rather than a separate test — see the note above the DO block.

BEGIN;

-- Capture the CURRENT owner before the DROP discards it. A DROP takes ownership with it and the
-- CREATE assigns it to whoever is running, so if this is applied under a different role the view
-- silently changes owner and the owner ACL entry is not what it was. That is invisible to BOTH
-- assertions below: the columns are all present and security_invoker is set regardless of who
-- owns the view.
--
-- Asserts PRESERVATION, not owner='postgres'. Hardcoding would false-fail in any environment
-- legitimately owned by another role — the same defect avoided in the security_invoker match.
-- ON COMMIT DROP so it cannot leak out of the transaction, and a rollback leaves nothing behind.
CREATE TEMP TABLE _vpwd_pre_owner
ON COMMIT DROP
AS
SELECT pg_get_userbyid(c.relowner) AS owner_name
  FROM pg_class c
 WHERE c.relname = 'v_patterns_with_decay'
   AND c.relnamespace = 'public'::regnamespace;

-- NO CASCADE, DELIBERATELY. The measurement says nothing depends on this view, but the whole
-- point of a measurement someone else took is that this statement should not silently act as if
-- it were certainly true. Without CASCADE, an unmeasured dependent makes the DROP ERROR and the
-- transaction roll back; with CASCADE it would be destroyed without comment. If this migration
-- ever fails here, the correct response is to look at what depends on the view — not to add
-- CASCADE.
DROP VIEW IF EXISTS v_patterns_with_decay;

CREATE VIEW v_patterns_with_decay
    WITH (security_invoker = on)
AS
SELECT
    p.*,
    EXTRACT(DAY FROM NOW() - COALESCE(p.updated_at, p.created_at)) AS days_since_update,

    -- Severity weight calculation
    CASE LOWER(COALESCE(p.severity, 'unknown'))
        WHEN 'critical' THEN 10
        WHEN 'high' THEN 5
        WHEN 'medium' THEN 2
        WHEN 'low' THEN 1
        ELSE 1  -- unknown/null defaults to low
    END AS severity_weight,

    -- Composite score: severity_weight*20 + occurrence_count*5 + actionability_bonus
    (
        CASE LOWER(COALESCE(p.severity, 'unknown'))
            WHEN 'critical' THEN 10
            WHEN 'high' THEN 5
            WHEN 'medium' THEN 2
            WHEN 'low' THEN 1
            ELSE 1
        END * 20
        + (COALESCE(p.occurrence_count, 1) * 5)
        + CASE
            WHEN p.proven_solutions IS NOT NULL
                 AND jsonb_typeof(p.proven_solutions) = 'array'
                 AND jsonb_array_length(p.proven_solutions) > 0
            THEN 15
            ELSE 0
          END
    ) AS composite_score,

    -- Legacy decay_adjusted_confidence (kept for backward compatibility)
    ROUND(
        (50 + (COALESCE(p.occurrence_count, 1) * 5)) *
        EXP(-0.023 * EXTRACT(DAY FROM NOW() - COALESCE(p.updated_at, p.created_at)))
    )::INTEGER AS decay_adjusted_confidence,

    -- Recency status
    CASE
        WHEN EXTRACT(DAY FROM NOW() - COALESCE(p.updated_at, p.created_at)) > 60 THEN 'stale'
        WHEN EXTRACT(DAY FROM NOW() - COALESCE(p.updated_at, p.created_at)) > 30 THEN 'aging'
        ELSE 'fresh'
    END AS recency_status,

    -- Minimum occurrence threshold bypass for critical/high severity
    CASE LOWER(COALESCE(p.severity, 'unknown'))
        WHEN 'critical' THEN 1
        WHEN 'high' THEN 1
        ELSE 3
    END AS min_occurrence_threshold,

    -- Flag: Does this pattern meet its severity-adjusted threshold?
    CASE
        WHEN LOWER(COALESCE(p.severity, 'unknown')) IN ('critical', 'high') THEN true
        WHEN COALESCE(p.occurrence_count, 1) >= 3 THEN true
        ELSE false
    END AS meets_threshold

FROM issue_patterns p
WHERE p.status = 'active';

-- ACL replay. A DROP takes the grants with it, so these are not optional decoration: omit them
-- and every non-owner reader loses access at COMMIT, silently as far as this migration is
-- concerned. anon SELECT was probed ALLOWED against the live view before this rewrite.
GRANT SELECT ON v_patterns_with_decay TO anon;
GRANT SELECT ON v_patterns_with_decay TO authenticated;
GRANT SELECT ON v_patterns_with_decay TO service_role;

COMMENT ON VIEW v_patterns_with_decay IS
'Patterns with severity-weighted composite scoring. Critical/high severity patterns surface with 1 occurrence.
Composite score = severity_weight*20 + occurrence_count*5 + actionability_bonus.
Severity weights: critical=10, high=5, medium=2, low=1.
Guards jsonb_array_length() with jsonb_typeof() to prevent scalar crashes.
WRITTEN WITH p.* ON PURPOSE: an explicit column list freezes and drifts the moment a column is
added to issue_patterns, which is how six columns went missing between 2026-02-07 and 2026-08-01.
CHANGE THIS VIEW WITH DROP + CREATE IN A TRANSACTION, NEVER CREATE OR REPLACE: REPLACE can only
append columns, so any column added to the middle of issue_patterns makes REPLACE fail with
"cannot change name of view column".';

-- *** THREE POST-CONDITIONS, ALL INSIDE THE TRANSACTION, ON PURPOSE. ***
-- Columns exposed, security_invoker preserved, and ownership preserved. Each of the three is
-- invisible to the other two: the column check passes with the wrong posture, the posture check
-- passes under the wrong owner, and both pass while a column is missing from the view.
-- These were considered as an external test and deliberately put here instead. The vitest `db`
-- project in this repo is gated to zero files when no non-production target is designated, so a
-- live-DB test asserting this would report green having executed nothing — which is precisely the
-- failure class the SD this migration belongs to exists to remove. An assertion inside the
-- transaction cannot silently not-run: if it fails, the whole migration rolls back.
DO $$
DECLARE
    missing_cols text;
    invoker_ok   boolean;
    prev_owner   name;
    curr_owner   name;
BEGIN
    -- 1. Every column of issue_patterns must be exposed by the view. This is the drift check.
    --    It fails LOUDLY rather than leaving a future reader to rediscover 42703 at runtime.
    SELECT string_agg(t.column_name, ', ' ORDER BY t.column_name)
      INTO missing_cols
      FROM information_schema.columns t
     WHERE t.table_schema = 'public'
       AND t.table_name   = 'issue_patterns'
       AND NOT EXISTS (
            SELECT 1
              FROM information_schema.columns v
             WHERE v.table_schema = 'public'
               AND v.table_name   = 'v_patterns_with_decay'
               AND v.column_name  = t.column_name);

    IF missing_cols IS NOT NULL THEN
        RAISE EXCEPTION
          'v_patterns_with_decay is still missing issue_patterns column(s): %. The star did not re-expand as intended.',
          missing_cols;
    END IF;

    -- 2. security_invoker MUST survive the recreate.
    --    THIS IS THE HAZARD THAT PASSES EVERY OBVIOUS CHECK. A DROP discards reloptions. If the
    --    CREATE omitted security_invoker, the view would silently flip its RLS posture: no error,
    --    no failed gate, and the AC-6/AC-7 column readback would still pass perfectly, because
    --    the columns are all present. The only way to catch it is to assert it directly.
    --    Matched on the OPTION KEY with a value-tolerant test rather than the literal string
    --    'security_invoker=on'. reloptions preserves the spelling it was given, so an exact-string
    --    match would false-FAIL against a perfectly correct view stored as security_invoker=true.
    --    An assertion that aborts a correct migration is its own defect.
    SELECT EXISTS (
             SELECT 1
               FROM pg_class c, unnest(c.reloptions) AS o(opt)
              WHERE c.relname = 'v_patterns_with_decay'
                AND c.relnamespace = 'public'::regnamespace
                AND split_part(o.opt, '=', 1) = 'security_invoker'
                AND lower(split_part(o.opt, '=', 2)) IN ('on', 'true', '1', 'yes'))
      INTO invoker_ok;

    IF invoker_ok IS DISTINCT FROM true THEN
        RAISE EXCEPTION
          'v_patterns_with_decay was recreated WITHOUT security_invoker=on — RLS posture would have changed silently.';
    END IF;

    -- 3. Ownership must survive the recreate.
    --    Invisible to checks (1) and (2) — they pass regardless of who owns the view — so an
    --    apply under the wrong role produces a green migration with a changed owner ACL entry.
    --    An apply-time precondition would also catch it, but only if whoever applies remembers;
    --    an assertion inside the transaction cannot be skipped by anyone.
    --    IS DISTINCT FROM rather than <> so a NULL on either side cannot silently pass.
    SELECT owner_name INTO prev_owner FROM _vpwd_pre_owner LIMIT 1;

    IF prev_owner IS NOT NULL THEN
        SELECT pg_get_userbyid(c.relowner)
          INTO curr_owner
          FROM pg_class c
         WHERE c.relname = 'v_patterns_with_decay'
           AND c.relnamespace = 'public'::regnamespace;

        IF curr_owner IS DISTINCT FROM prev_owner THEN
            RAISE EXCEPTION
              'v_patterns_with_decay ownership changed across the recreate: was %, now %. The applying role differs from the original owner, so the owner ACL entry is not what it was.',
              prev_owner, curr_owner;
        END IF;
    END IF;
    -- prev_owner NULL means the view did not pre-exist: there is no ownership to preserve, so this
    -- SKIPS rather than fires. An assertion that aborts a correct migration is its own defect.
END $$;

COMMIT;

-- VERIFICATION AFTER APPLY (the acceptance is the readback, not the apply exit code):
--   SELECT metadata, dedup_fingerprint, data_quality_status,
--          content_embedding, embedding_updated_at, auto_block_on_match
--   FROM v_patterns_with_decay LIMIT 1;
-- CONTROL — this must still raise 42703, proving the check can detect a genuinely absent column:
--   SELECT zzz_nonexistent FROM v_patterns_with_decay LIMIT 1;
-- AND the posture, which the column readback cannot see:
--   SELECT reloptions FROM pg_class
--    WHERE relname = 'v_patterns_with_decay' AND relnamespace = 'public'::regnamespace;
