#!/usr/bin/env node
/**
 * SD-LEO-INFRA-CHRONIC-RED-GUARD-001 — VALIDATION at the PLAN-phase VERIFY step (EXEC-TO-PLAN).
 *
 * PRD-vs-delivered check for FR-1, FR-1b, FR-2, FR-2b, FR-3, FR-4. Deliverables re-derived from
 * git (merge-base 56207c842a2..HEAD 6fedfde1220), not taken from the requesting agent's file list.
 * The SEC-2/SEC-3 remediation chain was re-verified against live Postgres catalog state with an
 * INDEPENDENT instrument (a pg_depend view-dependency scan), not by re-reading the same source the
 * SECURITY sub-agent read.
 */
import 'dotenv/config';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD = 'SD-LEO-INFRA-CHRONIC-RED-GUARD-001';

const results = {
  verdict: 'CONDITIONAL_PASS',
  confidence: 95,
  execution_time_ms: 0,
  critical_issues: [],
  warnings: [
    {
      id: 'VAL-1',
      severity: 'LOW',
      issue: 'FR-2 AC-3 literal gap: the sole baseline-with-justification entry carries a documentation ref but review_by: null',
      evidence:
        "docs/audits/sentinel-finding-dispositions.json rls_disabled_in_public.venture_artifacts_storm_quarantine_20260704 has disposition='exempt' (the taxonomy's baseline-with-justification slot) with a documented ref (FR-2b manifest + COMMENT ON TABLE) but review_by=null. FR-2 AC-3 requires 'a documentation ref AND a review-by date'. Defensible in substance -- the reason states the table 'will never be queried live again', so a review date is arguably meaningless for a retired-quarantine snapshot -- but the criterion is stated conjunctively.",
      location: 'docs/audits/sentinel-finding-dispositions.json',
      recommendation:
        'Either set a review_by date on the exempt entry, or record on the SD that permanent retirement exemptions are exempt from AC-3\'s date requirement. Non-blocking.',
    },
    {
      id: 'VAL-2',
      severity: 'LOW',
      issue: 'FR-2 AC-5 satisfied by reference rather than per-entry: no disposition entry states its TIER-1/TIER-2 posture',
      evidence:
        "All 12 remediate_staged entries carry fields [disposition, migration, reason, review_by] -- none contains a TIER token. The posture IS stated, thoroughly and with empirical classifier verification, in the two migration headers: 20260825_enable_rls_...sql:6-9 (TIER-1 by raw classifier, chairman-gated by adam-delegated-apply.js GAP A governance) and 20260825_pin_search_path_...sql:4-10 (TIER-2 by default-deny, classifyMigration() run live returning {tier:2}). Since every remediate_staged entry points at exactly one of those two files, the posture is derivable per object -- one dereference away, not absent.",
      location: 'docs/audits/sentinel-finding-dispositions.json',
      recommendation:
        'Optionally add a tier field per entry so the disposition table is self-contained. Non-blocking -- the posture is stated and empirically verified where it is load-bearing (the migration itself).',
    },
    {
      id: 'VAL-3',
      severity: 'LOW',
      issue: "Prose imprecision repeated in two artifacts: a policy described as 'naming this exact view' names the TABLE, not the view",
      evidence:
        "docs/audits/sentinel-finding-dispositions.json scope_completion_chain.reason and SECURITY evidence 865b0b78 both say the pre-existing migration adds a policy 'naming this exact view' / 'naming the writer_consumer_asymmetry_witnesses view'. Read live: database/migrations/20260616_security_hygiene_rls_searchpath.sql:55-58 is CREATE POLICY scope_completion_chain_read_all ON scope_completion_chain FOR SELECT USING (true) -- a blanket policy on the TABLE with no TO clause (defaults TO PUBLIC). It COVERS the security_invoker view's read path, which is what matters, but it does not name the view. The substantive claim (anon/authenticated read access is preserved) is TRUE and independently verified; only the specificity of the wording overstates.",
      location: 'docs/audits/sentinel-finding-dispositions.json',
      recommendation:
        "Reword to 'a permissive table-level FOR SELECT USING (true) policy that preserves the view's read path'. Matches this repo's GUARD-PROSE=UNVERIFIED discipline. Non-blocking.",
    },
    {
      id: 'VAL-4',
      severity: 'LOW',
      issue: 'FR-4 AC-3 and AC-4 are post-merge measurements and are structurally unsatisfiable at EXEC-TO-PLAN',
      evidence:
        "FR-4 AC-3 ('the drift guard's next scheduled/triggered run post-merge is measured') and AC-4 ('the sentinel's next MONDAY scheduled run post-merge is measured') both require a post-merge workflow run. Neither can be evidenced pre-merge. This is a deferred obligation, not a delivery gap.",
      location: 'PRD FR-4',
      recommendation:
        'Carry AC-3/AC-4 as an explicit post-merge obligation on the SD; cite gh run list/gh run view output before LEAD-FINAL-APPROVAL. workflow_dispatch with strict=true is an acceptable earlier trigger per AC-4 itself.',
    },
    {
      id: 'VAL-5',
      severity: 'LOW',
      issue: "Seeder's --gaps= parser anchors the JSON start but not its end (pre-existing, untouched by this SD)",
      evidence:
        "scripts/seed-migration-dispositions.mjs:253 uses lines.findIndex(l => l.trim()==='{') with no brace-matched end, so piping the verifier's own --json stdout in crashes on the trailing [MIGRATION_APPLY_STATE_GAPS_FOUND] marker. FR-1b's new fixture added exactly that end brace-matching while citing the seeder as precedent, leaving the seeder the less robust of the two.",
      location: 'scripts/seed-migration-dispositions.mjs:253',
      recommendation: 'Follow-up QF. Outside this SD\'s FRs; no acceptance criterion depends on it.',
    },
  ],
  recommendations: [
    'All 6 FRs (FR-1, FR-1b, FR-2, FR-2b, FR-3, FR-4) are substantively delivered. 42 tests pass across the three suites (24 unit seeder + 5 migration-gate integration + 13 unit security-hygiene), 0 failing.',
    'FR-1b AC-3 verified the strongest way available: git diff of scripts/verify-migration-apply-state.mjs across the whole branch is +10/-0 and comment-only, so the contradiction-detection logic the PRD forbade touching is provably untouched.',
    'FR-2 SEC-2 chain fully live-verified: scope_completion_chain is relrowsecurity=false with 0 policies (matching the "never applied" claim); public.writer_consumer_asymmetry_witnesses exists with reloptions security_invoker=on, SELECT granted to BOTH anon and authenticated, and a definition that both references scope_completion_chain and contains a UNION. Every element of the SEC-2 premise is true against live catalog state.',
    'FR-2 SEC-3 chain verified: claim_rejects IS still in the migration ALTER TABLE list (line 121) and scope_completion_chain is NOT (comments only). The migration enables RLS on exactly 9 tables, matching the corrected disposition table.',
    'INDEPENDENT ADVERSARIAL CHECK (the highest-value finding of this review): the SEC-2 defect class was "the application-code census missed a SQL-level view consumer". I re-ran that detection class as a pg_depend/pg_rewrite scan across all 9 REMAINING migration tables -- ZERO dependent views or matviews exist on any of them. The SEC-2 miss does not recur for the remaining scope.',
    'Cross-repo consumer re-check: .from() grep across EHG_Engineer and ehg/src found consumers for 5 of the 9 tables, but every one is a backend lib/ module taking supabase as an INJECTED parameter (coverage-matrix-referent-audit.js, coverage-matrix-retrodiction.js, stage-24-go-live.js) reached only from service-role entrypoints. ehg/src (the browser anon-key surface) returned 0 hits for all 9. The dispositions correctly analyze at the ENTRYPOINT level, where the role is decided, rather than enumerating every call site.',
    'FR-2 AC-4 (north_star) PASS: disposition=follow_up_sd, review_by=2026-09-25, consumer risk documented naming both useNorthStar.ts and northStarIntent.ts, and the table is absent from the migration -- never RLS-enabled with zero policy.',
    'FR-2 AC-6 (pg_net untouched) PASS: pg_net is absent as a disposition key and absent from both migration files.',
    'FR-4 AC-1 PASS: 20260819_eva_scheduler_metrics_created_at_index.sql carries an explicit recorded disposition in SD metadata (fr4_migration_disposition = deliberately_deferred_companion_action) with the CREATE INDEX CONCURRENTLY environment blocker documented, and is deliberately NOT ledger-suppressed -- self-consistent with this SD\'s own thesis that ordinary drift must stay visible.',
    'No duplicate implementation found: the SEC-2 fix correctly REUSED a pre-existing dormant chairman-gated migration from a prior SD (SD-LEO-INFRA-SECURITY-HYGIENE-RLS-SEARCHPATH-001, tracked at merge-base) rather than authoring a competing one that would have raced it. This is the duplicate-avoidance outcome this sub-agent exists to enforce.',
    'Proceed to PLAN-TO-LEAD. VAL-1..VAL-3 are documentation-precision nits, VAL-4 is a deferred post-merge obligation, VAL-5 is out-of-scope follow-up. None blocks.',
  ],
  detailed_analysis: [
    'VALIDATION at PLAN-phase VERIFY (EXEC-TO-PLAN) for SD-LEO-INFRA-CHRONIC-RED-GUARD-001.',
    'Branch feat/SD-LEO-INFRA-CHRONIC-RED-GUARD-001, HEAD 6fedfde1220, merge-base 56207c842a2. 17 files changed, +1083/-42.',
    '',
    'METHOD. Deliverables were re-derived from git rather than accepted from the requesting agent\'s file list; the list matched. PRD loaded from product_requirements_v2 (PRD-SD-LEO-INFRA-CHRONIC-RED-GUARD-001, 6 FRs, 22 acceptance criteria). Test suites were RUN, not inspected. The security-critical chain was verified against live Postgres with an instrument the prior SECURITY review did not use.',
    '',
    'PER-FR OUTCOME:',
    'FR-1 PASS (4/4 AC). The hardcoded path.join(ROOT,"database","migrations",base) is gone; readGapBodies() at seed-migration-dispositions.mjs:229-240 delegates to resolveMigrationPath(), which repo-root-resolves any id containing a separator and thus covers database/chairman-gated/. Ledger has exactly 7 entries, alphabetical ordering verified programmatically. Both 20260821 files are DEFERRED via auto:chairman-gate-marker. AC-3 is PARTIAL-but-correct: the verifier still reports one CEREMONY_PENDING gap (20260824_strategic_directives_canonical_writer_choke.sql), which carries a valid @approved-by stamp, so Rule A correctly DECLINES it -- that is the seeder working, not the bug surviving. Re-running the seeder against live gaps is idempotent (preserved 7, seeded 0).',
    '',
    'FR-1b PASS (3/3 AC). The hardcoded 20260713_quick_fixes_factory_lane.sql basename survives only in a doc comment; the fixture now binds to (report.recentGaps||[])[0] from a live --json --recent-only verifier run. 5/5 tests pass under --project migration-gate. The verify-migration-apply-state.mjs diff is +10/-0 comment-only, proving the contradiction-detection logic the PRD explicitly forbade changing was not changed.',
    '',
    'FR-2 PASS with 3 documentation nits (4/6 AC clean, 2 partial). 15 disposition entries over 14 distinct objects -- claim_rejects deliberately appears in both rls_disabled_in_public and sensitive_columns_exposed with an entry explaining the strict-subset relationship, which is exactly the round-2 double-count correction the PRD demanded. No wildcard entry. AC-3 and AC-5 are the two partials (see VAL-1, VAL-2).',
    '',
    'THE CRITICAL VERIFICATION (requested explicitly, performed independently):',
    '- scope_completion_chain.migration points at database/migrations/20260616_security_hygiene_rls_searchpath.sql. That file EXISTS, is tracked at the merge-base (genuinely pre-existing, not authored by this SD), and was last touched by f306fc33d82 for SD-LEO-INFRA-SECURITY-HYGIENE-RLS-SEARCHPATH-001 -- a different, prior SD, as claimed.',
    '- It does what the disposition claims: :46 ALTER TABLE scope_completion_chain ENABLE ROW LEVEL SECURITY, and :55-58 CREATE POLICY scope_completion_chain_read_all ON scope_completion_chain FOR SELECT USING (true), guarded by an idempotent pg_policy existence check. It is chairman-gated (TIER-2 header, deliberately empty @approved-by).',
    '- Live catalog confirms it was never applied: scope_completion_chain relrowsecurity=false, 0 policies -- consistent with the sentinel still reporting it.',
    '- The view underpinning SEC-2 is real: public.writer_consumer_asymmetry_witnesses, relkind=v, reloptions=["security_invoker=on"], SELECT granted to anon AND authenticated, definition references scope_completion_chain and contains UNION. So a bare RLS-enable would indeed have zeroed that branch. Pulling it out was correct.',
    '- claim_rejects was NOT removed: it is present at :121 of the zero-consumer migration. scope_completion_chain appears in that file ONLY in explanatory comments, never in an ALTER statement. The ALTER list is exactly the 9 expected tables.',
    '',
    'INTERNAL CONSISTENCY OF THE TWO CORRECTED ENTRIES: both hold. scope_completion_chain\'s reasoning (census missed a SQL-level consumer -> pull from this SD\'s migration -> re-point at a pre-existing correctly-scoped fix -> do not race it with a duplicate) is coherent and every factual step is live-verified. claim_rejects\'s reasoning (no app-code consumer; sole write path is a trigger; every write role bypasses RLS; anon/authenticated have no write path to the triggering column) is coherent and its conclusion -- RLS-enable-only is safe for the write paths that exist today -- is correctly scoped to the present, with the future-path caveat stated rather than hidden. The one flaw is prose, not logic (VAL-3).',
    '',
    'FR-2b PASS (3/3 AC). EXEMPTED_TABLES/EXEMPTED_TABLE_PATTERNS are now derived at audit-security-linter.mjs:51-55 from exempted-tables.json; grep for the former hardcoded members returns zero hits in the linter. Both quarantine siblings _20260610 and _20260704 are in the manifest with reasons. 13/13 tests pass. Note the data-file fixture asserts manifest SHAPE while the adjacent isExemptTable(..._20260704)===true test is what actually couples predicate to manifest -- together sufficient, individually neither would be.',
    '',
    'FR-3 PASS (2/2 AC). Both guards carry the principle AND name their manifest: verify-migration-apply-state.mjs:605-613 points at docs/audits/migration-dispositions.json, audit-security-linter.mjs:46-50 points at exempted-tables.json. No new predicate-level exemption in either -- the verifier diff is comment-only and the linter diff removes two hardcoded arrays without touching isExemptTable\'s body.',
    '',
    'FR-4 PARTIAL-BY-CONSTRUCTION (2/5 AC verifiable pre-merge, both PASS). AC-1 and AC-2 pass. AC-3/AC-4 are post-merge measurements (VAL-4). AC-5 (a synthetic novel finding still hard-fails each guard) is covered by the passing migration-gate case "an APPLIED ledger entry cannot suppress a real gap or fake completion" plus the security-linter suite, and is cited in the SD\'s own mechanism_verifications.',
    '',
    'DUPLICATE-DETECTION VERDICT (this sub-agent\'s primary mandate): no duplicate implementation was introduced. The SEC-2 fix is a textbook reuse-over-rebuild outcome -- it found a dormant, correctly-scoped, already-chairman-gated migration from a prior SD and re-pointed at it instead of authoring a second competing chairman-gated migration that would have raced the first. The disposition file records why.',
    '',
    'RESIDUAL RISK: low. The only path to a silent break would be a non-service-role consumer of one of the 9 tables that neither the app-code census, the cross-repo .from() grep, nor the pg_depend view-dependency scan can see (e.g. a raw-SQL anon RPC). All three instruments agree, and the browser anon surface (ehg/src) is empty for all 9.',
  ].join('\n'),
  metadata: {
    reviewed_commit: '6fedfde1220',
    merge_base: '56207c842a25101a828da462152839404b0fb970',
    frs_checked: ['FR-1', 'FR-1b', 'FR-2', 'FR-2b', 'FR-3', 'FR-4'],
    acceptance_criteria_total: 22,
    acceptance_criteria_pass: 18,
    acceptance_criteria_partial: 2,
    acceptance_criteria_deferred_post_merge: 2,
    tests_run: { seeder_unit: '24/24', migration_gate_integration: '5/5', security_hygiene_unit: '13/13' },
    independent_instruments_used: [
      'git diff vs merge-base (deliverable re-derivation, not the requesting agent\'s file list)',
      'live pg_depend/pg_rewrite view-dependency scan across all 9 migration tables (re-ran the SEC-2 detection class; zero dependent views found)',
      'live pg_class.relrowsecurity + pg_policy counts for the 9 tables and scope_completion_chain',
      'live pg_get_viewdef + information_schema.role_table_grants for writer_consumer_asymmetry_witnesses',
      'cross-repo .from() grep incl. ehg/src browser anon surface (0 hits for all 9)',
      'vitest execution of all three affected suites',
    ],
    sec2_chain_verified: true,
    sec3_claim_rejects_retained_in_migration: true,
    scope_completion_chain_removed_from_migration: true,
    prior_security_evidence_reviewed: '865b0b78-09f8-4f2b-94ae-965110a060b1',
  },
};

async function main() {
  const resolution = await resolveSubAgentRepo({
    sdId: SD,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'VALIDATION',
  });
  applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'VALIDATION',
    SD,
    { name: 'Principal Systems Analyst', code: 'VALIDATION' },
    results,
    { phase: 'EXEC-TO-PLAN', sdKey: SD },
  );
  console.log('STORED ID:', stored?.id, '| verdict:', stored?.verdict, '| phase:', stored?.phase, '| confidence:', stored?.confidence);
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error('❌', err.message);
    process.exit(1);
  });
}
