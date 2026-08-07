-- @approved-by: rickfelix2000@gmail.com
-- (Chairman ratification 2026-08-07 12:58:56Z, verbatim 'Yes', decision row 74f2a2c9 approved, capture 54769df1, relayed via Adam a31ae727 — scoped to the single RESTRICTIVE SELECT policy on codebase_health_snapshots, dry-run verified sha256 799110f2; header transcribed per the chairman transcription ruling of 2026-08-07 15:43:36Z, verbatim 'Yes', row a63434fb, capture 5d86e2e3, scribe-executed at the chairman's live direction in-session.)
-- APPLIED 2026-08-07 — this file is now a HISTORICAL RECORD, not a pending action.
--
-- The paragraph that stood here said "NOT YET APPROVED FOR APPLY ... there is no approved-by
-- attestation on this file". Both halves became false the moment the header above was transcribed
-- and the apply ran, and it is corrected rather than left standing: a file whose own prose denies
-- the attestation printed directly above it would tell the next reader this migration is still
-- pending. Stale narration that contradicts the artifact it sits on is exactly the class of defect
-- this SD spent its whole life catching, so it does not get to ship inside it.
--
-- WHAT ACTUALLY HAPPENED: authored by a worker (Alpha-2) as scribe work under coordinator ruling
-- 246c81da — authoring is delegable, APPLYING IS NOT. Chairman ratified (74f2a2c9), the header was
-- transcribed at his live direction, and the apply ran from the apply seat at his direction:
-- MIGRATION_APPLY_PROD_PASS, content sha256 799110f2 verified byte-identical beneath the header.
--
-- VERIFIED, BOTH ARMS, and neither on trust:
--   * CATALOG (apply seat, over the pg driver): pg_policies returns exactly one row —
--     polname=trend_eyes_receipt_service_role_only, polpermissive=FALSE (restrictive),
--     roles={anon,authenticated}, qual=(dimension IS DISTINCT FROM 'trend_eyes_sweep_receipt').
--   * BEHAVIOURAL (worker seat, minted authenticated JWT, scripts/solomon/trend-eyes-receipt-rls-probe.mjs
--     --verify): a seeded synthetic receipt is INVISIBLE to authenticated (0), where the pre-apply
--     baseline had proved the identical seed WAS visible (1) — so the check could actually fail;
--     and non-receipt rows read 3976 against 3976 by service-role at the same instant, proving the
--     policy is scoped rather than over-broad.
--
-- The original standing warning remains true in general and is kept deliberately: a migration file
-- is a LEAD, never proof of a live database object. Nothing is in effect until it is applied AND
-- read back from pg_policies. That is what the two arms above are.
--
-- Migration: bound read access to the Trend-Eyes run-receipt with a RESTRICTIVE policy
-- Date: 2026-08-07
-- SD: SD-LEO-INFRA-TREND-EYES-OFF-001
-- Raised by: SECURITY sub-agent finding #04 (evidence rows c7937d18, 42357fdf)
--
-- ======================= WHAT IS WRONG, AND WHY IT IS NEW =======================
-- public.codebase_health_snapshots was granted a blanket authenticated SELECT in March, when it
-- held exactly what its name says: CODE-HEALTH numbers. Nothing about that grant was wrong for
-- that content.
--
-- This SD is the FIRST to write CHAIRMAN-BEHAVIOURAL data into that table. The Trend-Eyes run
-- receipt (dimension='trend_eyes_sweep_receipt') carries, per run:
--   * exploration_floor — the chairman's SMS TOPIC LABELS with per-topic counts
--   * classifier_coverage — inbound volume, automated-watchdog count, unclassified count
-- Together those disclose his topic distribution, his messaging volume, and the cadence at which
-- he repeats himself. No message bodies, no phone numbers, no row ids — labels and integers only.
-- That is still a behavioural profile, and it is a different KIND of content than the grant was
-- written for. The table's access rule did not change; what we put in the table did.
--
-- ============================== MEASURED, NOT INFERRED ==============================
-- Measured by Alpha-2 against the live database, 2026-08-07T12:5x UTC:
--   * trend_eyes_sweep_receipt rows currently in the table: 0
--   * total codebase_health_snapshots rows: 3,949
--   * anon SELECT on the table: succeeds, returns 0 rows (anon is already filtered)
-- Measured by the SECURITY sub-agent (NOT by me — recorded with its provenance): reachability was
-- proven with a MINTED `authenticated` JWT rather than read off the policy text, and under that
-- role the table returns rows while sms_relay_staging and feedback both return zero. So the
-- exposure is specifically the AUTHENTICATED lane, and the receipt is the only surface that
-- crosses — the candidate rows themselves are unreachable to both anon and authenticated.
--
-- ZERO RECEIPTS EXIST TODAY. Every sweep run so far has been --dry-run, so nothing has been
-- written yet. This is the only window in which prevention is available at all; after the first
-- scheduled run the same fix becomes remediation over already-disclosed data. That timing is the
-- entire reason this is staged now rather than filed as follow-up.
--
-- ==================== WHY RESTRICTIVE, AND NOT A TIGHTENED PERMISSIVE ====================
-- RLS OR-s permissive policies together, so the WEAKEST permissive policy governs. Tightening or
-- dropping `authenticated_read_snapshots` would close one door and look like a fix while any other
-- permissive SELECT policy on the table keeps serving the same rows. A RESTRICTIVE policy is ANDed
-- with every permissive policy at once, so it closes the class rather than an instance. This is the
-- same reasoning applied in 20260802_bound_anon_feedback_ingress.sql, and it is cited here because
-- the shape of the mistake it prevents is identical.
--
-- service_role is not listed: it carries BYPASSRLS, so this policy is never evaluated for it. The
-- sweep (which writes the receipt) and any external liveness reader (which must read it to alarm on
-- a dead sweep) both run with service-role credentials and are unaffected. That matters — the whole
-- point of the receipt is that something OUTSIDE the sweep can notice it has stopped, and a fix
-- that blinded the liveness reader would reinstate the defect it is protecting against.
--
-- ============================== WHAT THIS DOES NOT DO ==============================
-- It does not touch the other 3,949 rows: every existing dimension stays exactly as readable as it
-- is today. It does not redact the receipt's contents. That is deliberate and was the SECURITY
-- sub-agent's explicit recommendation: classifier_coverage is the ANTI-NARROWING instrument — it is
-- how a silently-degrading classifier becomes visible as a rising unclassified rate instead of as
-- an unexplained quiet spell. Removing it would reinstate blindness while leaving the more
-- sensitive topic labels in place. The content is required; the ACCESS is what was wrong.
--
-- ============================== APPLY / VERIFY / ROLLBACK ==============================
-- Apply (chairman-ratified only):
--   psql "$DATABASE_URL" -f database/migrations/20260807_trend_eyes_receipt_service_role_only_STAGED.sql
--
-- Verify AFTER applying — read it back from the catalog, do not trust the apply:
--   select policyname, permissive, roles::text, cmd, qual
--     from pg_policies
--    where schemaname='public' and tablename='codebase_health_snapshots';
--   -- expect one row with permissive='RESTRICTIVE' named trend_eyes_receipt_service_role_only
--
-- Two-sided check (a one-sided check cannot tell you it worked):
--   * with an `authenticated` JWT: select count(*) ... where dimension='trend_eyes_sweep_receipt'
--       -> MUST be 0
--   * with an `authenticated` JWT: select count(*) ... where dimension<>'trend_eyes_sweep_receipt'
--       -> MUST be unchanged from before the apply (this is the arm that catches an over-broad
--          policy silently closing the whole table)
--
-- Rollback:
--   DROP POLICY IF EXISTS trend_eyes_receipt_service_role_only ON public.codebase_health_snapshots;

BEGIN;

DROP POLICY IF EXISTS trend_eyes_receipt_service_role_only ON public.codebase_health_snapshots;

CREATE POLICY trend_eyes_receipt_service_role_only
  ON public.codebase_health_snapshots
  AS RESTRICTIVE
  FOR SELECT
  TO anon, authenticated
  USING (dimension IS DISTINCT FROM 'trend_eyes_sweep_receipt');

COMMENT ON POLICY trend_eyes_receipt_service_role_only ON public.codebase_health_snapshots IS
  'SD-LEO-INFRA-TREND-EYES-OFF-001: the Trend-Eyes run-receipt carries chairman SMS topic labels, '
  'volume and repeat cadence. codebase_health_snapshots carries a blanket authenticated SELECT '
  'granted for code-health numbers; this RESTRICTIVE policy ANDs with every permissive policy so '
  'the receipt dimension is service-role-only without altering access to any other dimension. '
  'IS DISTINCT FROM (not <>) so a NULL dimension stays readable rather than being silently hidden.';

COMMIT;
