// SD-LEO-FEAT-MEDIA-PRODUCTION-CAPABILITY-001-C (FR-1, TS-7, TR-1, TR-6, TR-7) — static,
// live-probe-free assertions on the creative_asset_variant_scores migration pair. Pins the DDL
// shape and, critically, proves the table file classifies TIER-1 (auto-apply eligible) while
// also being non-delegatable via the Adam-delegated apply path (contains ENABLE RLS). Also
// asserts the "no ON DELETE" invariant that FR-1/FR-9 depend on -- the single most
// consequential DDL decision in this SD -- statically, before the migration is ever submitted
// for apply (G8/G9, TESTING evidence d82e9679-c331-4225-b36d-9cf3bb5d9116).
//
// SECURITY REGRESSION GUARD (added after a live-proven cross-tenant hole, SECURITY evidence
// 9c3ebaf6-e37b-432c-9dc0-b0af0eaa5827): the ORIGINAL `cavs_venture_access` policy constrained
// only creative_asset_id and declared no WITH CHECK, so a tenant of venture A could INSERT
// (own_asset_id, venture_B_variant_id) and permanently block venture B from deleting its own
// variant. The earlier version of THIS FILE asserted only that the qual mentioned
// `creative_asset_id` and `user_company_access` -- both of which the VULNERABLE policy also
// satisfied. That is the defect class this suite now exists to prevent: an assertion that the
// broken artifact passes is not a test. Every assertion below is therefore written so the
// vulnerable predicate FAILS it.
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyMigration } from '../../scripts/lib/migration-tier-classifier.mjs';
import { isDelegatableAdditive } from '../../lib/migration/adam-delegated-apply.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATION = path.resolve(__dirname, '../../database/migrations/20260826_creative_asset_variant_scores.sql');
// The corrected authenticated-role policy CANNOT live in database/migrations/: it depends on a
// SECURITY DEFINER resolver (see the RLS_FIX file header for why an inline EXISTS is measurably
// wrong), which is TIER-2, and database/chairman-gated/README.md is explicit that a worker
// cannot place chairman-gated DDL in an auto-applied path and still call it gated.
const RLS_FIX = path.resolve(__dirname, '../../database/chairman-gated/20260826_creative_asset_variant_scores_rls_fix.sql');

// Strip `--` line comments before scanning for literal DDL tokens -- these files' own header
// prose deliberately DISCUSSES "ON DELETE", "COMMENT ON TABLE" and the vulnerable predicate as
// hazards to avoid, so a naive whole-file regex would false-positive on the documentation, not
// the DDL. The classifier itself already handles this correctly (proven live); this helper
// matches that.
function stripSqlComments(text) {
  return text
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
}

describe('creative_asset_variant_scores migration (FR-1)', () => {
  let sql;
  let ddlOnly;
  beforeAll(() => {
    sql = fs.readFileSync(MIGRATION, 'utf8');
    ddlOnly = stripSqlComments(sql);
  });

  it('creates the join table with plain (NO ACTION) FKs -- never ON DELETE', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS creative_asset_variant_scores/);
    expect(sql).toMatch(/creative_asset_id\s+UUID NOT NULL REFERENCES creative_assets\(id\)/);
    expect(sql).toMatch(/variant_id\s+UUID NOT NULL REFERENCES marketing_content_variants\(id\)/);
    expect(sql).toMatch(/UNIQUE \(creative_asset_id, variant_id\)/);
    // G9: the single most consequential DDL decision (plain FKs, not cascade) is checkable
    // statically, before the irreversible apply step -- not only post-apply via pg_constraint.
    expect(ddlOnly.toUpperCase()).not.toMatch(/ON DELETE/);
  });

  it('enables RLS and ships ONLY the service_role policy -- fail-closed for authenticated', () => {
    expect(ddlOnly).toMatch(/ALTER TABLE creative_asset_variant_scores ENABLE ROW LEVEL SECURITY/);
    expect(ddlOnly).toMatch(/cavs_service_role[\s\S]*FOR ALL TO service_role[\s\S]*USING \(true\)/);
    // RLS on + no permissive policy for `authenticated` = Postgres denies every row to that
    // role. An incomplete authenticated policy here would be OPEN; absence is CLOSED.
    expect(ddlOnly).not.toMatch(/FOR ALL TO authenticated/);
  });

  it('REGRESSION: never reintroduces a creative_asset_id-only authenticated policy (the live-proven hole)', () => {
    // The vulnerable artifact defined cavs_venture_access in THIS file. Its defining
    // characteristic: it scoped creative_asset_id through user_company_access while leaving
    // variant_id entirely unconstrained. Any CREATE POLICY here is now a regression.
    expect(ddlOnly).not.toMatch(/CREATE POLICY cavs_venture_access/i);
    expect(ddlOnly).not.toMatch(/user_company_access/);
  });

  it('classifies TIER-1 (auto-apply eligible)', () => {
    const result = classifyMigration(sql);
    expect(result.tier).toBe(1);
  });

  it('is NOT delegatable via the Adam-delegated apply path (TR-7) -- TIER-1 is necessary but not sufficient for delegation', () => {
    const result = isDelegatableAdditive(sql);
    expect(result.delegatable).toBe(false);
    expect(result.reason).toMatch(/policy_or_rls_chairman_only/);
  });

  it('uses only `--` header comments, never COMMENT ON TABLE (TR-6)', () => {
    expect(ddlOnly).not.toMatch(/COMMENT ON TABLE/i);
  });
});

describe('creative_asset_variant_scores RLS fix (chairman-gated, cross-tenant hole closure)', () => {
  let sql;
  let ddlOnly;
  beforeAll(() => {
    sql = fs.readFileSync(RLS_FIX, 'utf8');
    ddlOnly = stripSqlComments(sql);
  });

  it('is staged chairman-gated with an unfilled approver -- never self-approved by a worker', () => {
    // guard 3 (approver) compares this header to the invoker's `git config user.email`. A
    // worker filling in a human's address here would forge the one factor that makes the
    // ceremony a human decision.
    expect(sql).toMatch(/^--\s*@approved-by:\s*PENDING\s*$/m);
    expect(sql).toMatch(/STAGED, NOT APPLIED\. CHAIRMAN-GATED\./);
  });

  it('classifies TIER-2 -- must NOT be auto-appliable from database/migrations/', () => {
    expect(classifyMigration(sql).tier).toBe(2);
    expect(isDelegatableAdditive(sql).delegatable).toBe(false);
  });

  it('replaces the vulnerable policy rather than layering beside it', () => {
    expect(ddlOnly).toMatch(/DROP POLICY IF EXISTS cavs_venture_access ON public\.creative_asset_variant_scores/);
    expect(ddlOnly).toMatch(/CREATE POLICY cavs_venture_access ON public\.creative_asset_variant_scores/);
    expect(ddlOnly).toMatch(/FOR ALL TO authenticated/);
  });

  it('CORE: constrains variant_id to the asset\'s own venture in BOTH USING and WITH CHECK', () => {
    // This is the assertion the vulnerable policy could not have passed. The old qual named
    // creative_asset_id and user_company_access (which the previous version of this suite
    // checked, and which the hole satisfied) but never once referenced variant_id.
    const using = ddlOnly.match(/USING \(([\s\S]*?)\n  WITH CHECK/);
    const withCheck = ddlOnly.match(/WITH CHECK \(([\s\S]*?)\n  \);/);
    expect(using).not.toBeNull();
    expect(withCheck).not.toBeNull();

    for (const [label, clause] of [['USING', using[1]], ['WITH CHECK', withCheck[1]]]) {
      // the venture-match check on the variant side -- the actual hole closure
      expect(clause, `${label} must constrain variant_id`).toMatch(
        /cavs_variant_matches_venture\(\s*creative_asset_variant_scores\.variant_id,\s*ca\.venture_id\s*\)/
      );
      // and it must still carry the original tenant scoping it replaced
      expect(clause, `${label} must retain user_company_access scoping`).toMatch(/user_company_access/);
      expect(clause, `${label} must key off the row's creative_asset_id`).toMatch(
        /ca\.id = creative_asset_variant_scores\.creative_asset_id/
      );
    }
  });

  it('WITH CHECK is stated explicitly -- a NULL with_check silently reuses USING on the write path', () => {
    // The original policy omitted WITH CHECK entirely; Postgres then reused the incomplete
    // USING expression for INSERT/UPDATE, which is how a read-side gap became a write-side
    // cross-tenant hole. Explicitness here is the guard against that recurring.
    expect(ddlOnly).toMatch(/WITH CHECK \(/);
  });

  it('the variant->venture resolver is SECURITY DEFINER with a pinned search_path, and not reachable by anon', () => {
    // SECURITY DEFINER is REQUIRED, not incidental: marketing_content_variants/marketing_content
    // scope `authenticated` through ventures.created_by, so an RLS-filtered inline EXISTS
    // returns false for every row and denies legitimate same-venture access (measured).
    expect(ddlOnly).toMatch(/CREATE OR REPLACE FUNCTION public\.cavs_variant_matches_venture\(p_variant_id uuid, p_venture_id uuid\)/);
    expect(ddlOnly).toMatch(/SECURITY DEFINER/);
    expect(ddlOnly).toMatch(/SET search_path = public, pg_temp/);
    expect(ddlOnly).toMatch(/RETURNS boolean/); // boolean, not venture-id-returning: minimises disclosure
    // Postgres grants EXECUTE to PUBLIC on creation AND this project has an ALTER DEFAULT
    // PRIVILEGES entry granting anon/authenticated explicitly -- independent ACL entries, so
    // revoking FROM PUBLIC alone leaves anon holding EXECUTE (this directory's README, SEC-M2).
    expect(ddlOnly).toMatch(/REVOKE EXECUTE ON FUNCTION public\.cavs_variant_matches_venture\(uuid, uuid\) FROM PUBLIC, anon/);
    expect(ddlOnly).toMatch(/GRANT EXECUTE ON FUNCTION public\.cavs_variant_matches_venture\(uuid, uuid\) TO authenticated, service_role/);
  });

  it('carries a post-condition block that fails the apply if the hole is still open', () => {
    expect(ddlOnly).toMatch(/DO \$verify\$/);
    expect(ddlOnly).toMatch(/with_check IS NULL/);
    expect(ddlOnly).toMatch(/prosecdef/);
  });
});
