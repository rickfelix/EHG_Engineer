import 'dotenv/config';
import { storeSubAgentResults } from '../lib/sub-agent-executor/index.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../lib/sub-agents/resolve-repo.js';

const SD_UUID = 'f965be5e-12c9-4026-a90d-afe7cc57b77f';
const SD_KEY = 'SD-LEO-INFRA-FIXTURE-VENTURES-IDENTIFIED-001';

const SUMMARY = [
  'LEAD-TO-PLAN premise validation, measured against live DB + code pinned at commit c20d8eb9426.',
  'CORE PREMISE CONFIRMED: the 4-venture specimen matches the SD exactly (2 of 4 is_demo=true; flagged pair updated 2026-09-06T23:30:09Z, ~3h52m after a 0.17s creation burst);',
  'the cited creator tests/e2e/venture-launch/protocol-validation.spec.ts sets no is_demo and ventures.is_demo is boolean/nullable/DEFAULT false;',
  'decision d87a7018 exists on venture 8344c34b (is_demo=true); the consumer count is EXACTLY 26 distinct files as claimed.',
  'THREE ADVISORY FINDINGS (non-blocking).',
  '(A) REFUTED ATTRIBUTION: neither backfill script can have stamped the specimen. Both delegate to isFixtureVenture, which returns false for all four names (the epoch-tail regex requires a dash or colon before the digits; these names carry a SPACE).',
  'Corroborated live: only 2 ventures were updated in the 23:29-23:32 window, 127ms apart, inconsistent with the script single chunked .in() UPDATE; and 7 of 171 live ventures are is_demo=true with names the predicate does not match.',
  'The retroactive-stamping conclusion HOLDS; the attribution to backfill-fixture-venture-flags.mjs does NOT. The actual stamper is unidentified, which undercuts proposed fix (c).',
  '(B) QUALIFY THE CHAIRMAN CLAIM: d87a7018 is decision_type=review, blocking=false, admitted by NEITHER isConsoleActionable nor isEscalationActionable, and absent from chairman_pending_decisions, chairman_unified_decisions and get_pending_chairman_items today.',
  'It was written 23:22:51, about 7 minutes BEFORE the flag landed, so the write-seam gap is real, but "reached the chairman decision queue" is not established by the row alone.',
  '(C) BREADTH NUMBERS UNDERSTATE: a full census (not a 20-sample) finds 53 test files inserting ventures, 48 omitting is_demo and 5 setting it. The SD says 19 of 20 with 1 setter, so the claim is conservative by roughly 2.6x, not inflated.',
  'FIX-SHAPE FINDING (highest value for PLAN): the mechanism proposed as fix (b) ALREADY EXISTS, is CI-enforced and GREEN.',
  'lib/governance/fixture-producer-guard.mjs insertGuarded() asserts the canonical discriminant and OWNS the insert (no check/write seam), and scripts/lint/fixture-producer-guard-lint.mjs enforces adoption (live at c20d8eb9426: 241 files, 4 roots, 30 guarded, 0 unguarded, exit 0).',
  'The gap is SCAN_ROOTS = [tests/integration, tests/database, scripts/harness, scripts/canary]: tests/e2e (home of the cited creator), tests/ddl and tests/unit are out of scope BY CONSTRUCTION, named in the lint own header as KNOWN LIMITATION #3.',
  'Recommend PLAN scope ADOPTION + SCOPE EXTENSION, not new machinery.',
].join(' ');

const results = {
  verdict: 'PASS',
  confidence: 90,
  summary: SUMMARY,
  execution_time_ms: 0,
  metadata: {
    sd_key: SD_KEY,
    phase: 'LEAD-TO-PLAN',
    pinned_commit: 'c20d8eb9426',
    measured_at: new Date().toISOString(),
    gate: 'GATE_1_LEAD_PRE_APPROVAL',
    claims_confirmed: {
      specimen_four_ventures: 'CONFIRMED EXACT - 4 rows created 2026-09-06T19:37:52.181/.246/.301/.349Z; stages 8/2/23/1; is_demo true/false/true/false; flagged pair updated 23:30:09.748 and .875Z (~3h52m post-creation)',
      creator_omits_is_demo: 'CONFIRMED - tests/e2e/venture-launch/protocol-validation.spec.ts:66-77 createTestVenture() inserts name, problem_statement, solution, target_market, current_lifecycle_stage, dwell_days, company_id; NO is_demo',
      column_definition: 'CONFIRMED - ventures.is_demo boolean, nullable=YES, DEFAULT false',
      backfill_is_retroactive: 'CONFIRMED - scripts/backfill-fixture-venture-flags.mjs:68-72 is a chunked .update({is_demo:true}).in(id), dry-run by default; never an insert-time stamp',
      decision_d87a7018: 'CONFIRMED - d87a7018-b442-4e90-8e93-ab244a76e9cc on venture 8344c34b-e587-4382-96f4-c53a883cbcdc (is_demo=true), created 2026-09-06T23:22:51.597Z, type=review, status=pending, blocking=false',
      consumer_count_26: 'CONFIRMED EXACT - 40 is_demo filter lines across exactly 26 distinct files under scripts/ + lib/ excluding archive|one-off|temp',
    },
    advisory_findings: [
      {
        id: 'A',
        severity: 'MEDIUM',
        title: 'Stamping-path attribution refuted',
        detail: 'isFixtureVenture (both lib/chairman/chairman-actionable.mjs and lib/governance/fixture-exclusion.mjs) returns false for all four specimen names with is_demo forced false. EPOCH_TAIL_RE requires a dash/colon immediately before the digits; the names read "...High-Success 1788723470896" with a space. Corroboration: exactly 2 ventures updated in 23:29-23:32, 127ms apart (a single chunked .in() UPDATE would share one timestamp); 7 of 171 live ventures are is_demo=true with non-matching names. Retroactive stamping HOLDS; the named script did not do it. Impacts proposed fix (c).',
      },
      {
        id: 'B',
        severity: 'LOW',
        title: 'Chairman-queue claim needs qualification',
        detail: 'decision_type=review with blocking=false is admitted by neither isConsoleActionable nor isEscalationActionable, and the row is absent from chairman_pending_decisions (3 rows), chairman_unified_decisions (395 rows) and get_pending_chairman_items() today. Written about 7 minutes before the flag landed, so the write-seam gap is genuine; the rendering claim is not established by the row alone.',
      },
      {
        id: 'C',
        severity: 'LOW',
        title: 'Breadth numbers understate rather than overstate',
        detail: 'Full census: 53 test files insert ventures; 48 omit is_demo and 5 set it (tests/ddl/ventures-canonical-writer-choke-ddl.db.test.js, tests/e2e/state-machine/golden-nugget-validation.spec.ts, tests/integration/eva/chairman-product-review-gate-realdb.test.js, tests/integration/eva/high-consequence-blocking-gate-realdb.test.js, tests/unit/harness/spine-verify-first-run-guard.test.js). SD claims 19 of 20 with 1 setter.',
      },
    ],
    existing_infrastructure: {
      guard: 'lib/governance/fixture-producer-guard.mjs - insertGuarded(supabase, table, row, {classification, source, reason}). FIXTURE asserts the row trips the canonical discriminant and THROWS before the write; the guard owns the insert so there is no object-identity seam. From SD-LEO-INFRA-ONE-SYNTHETIC-ROW-001-D.',
      lint: 'scripts/lint/fixture-producer-guard-lint.mjs - the coverage half. Live at c20d8eb9426: scanned 241 files across 4 roots, 30 guarded, 0 unguarded, exit 0.',
      gap: 'SCAN_ROOTS = [tests/integration, tests/database, scripts/harness, scripts/canary]. tests/e2e, tests/ddl and tests/unit are excluded by construction (lint header KNOWN LIMITATION #3). The cited creator lives in tests/e2e.',
      shared_helper: 'tests/helpers/database-helpers.js:330 createTestVenture() - existing shared helper, sets no is_demo. A wrapper is KNOWN LIMITATION #2 (invisible to the lint), so it needs a hand fix.',
      db_trigger_precedent: 'ventures already carries insert-time triggers (trg_reject_live_born_venture, trg_enforce_stage0_origin, reset_stage_write_token_on_insert), so a DB fence is precedented. But it cannot distinguish a test connection from production (same service role, same pooler), so recommend AGAINST the DB-level leg of fix (b).',
    },
    recommended_fr_shape: [
      'FR-a: extend fixture-producer-guard-lint SCAN_ROOTS to tests/e2e (plus tests/ddl, tests/unit) - immediately converts the 48 omitting producers into enforced findings',
      'FR-b: convert those producers to insertGuarded(..., {classification: FIXTURE, source})',
      'FR-c: close a real guard hole - isFixtureVenture is flag-first OR name-based, so FIXTURE can be satisfied by a fixture-SHAPED NAME while is_demo stays false, which does NOT meet the SD exit predicate. Have the guard STAMP is_demo:true on FIXTURE rows (lib/governance/fixture-producer-guard.mjs:264) instead of merely asserting.',
      'FR-d: route tests/helpers/database-helpers.js createTestVenture() through the guard by hand (a wrapper is invisible to the lint)',
      'DROP or DEMOTE fix (c) (backfill becomes historical-only): low value, and per finding A the backfill is not the specimen stamper',
      'KEEP fix (d) (no 27th consumer filter): agreed and reinforced - the independent count is exactly 26',
    ],
    gate_1_checklist: {
      duplicate_check: 'PARTIAL DUPLICATE FOUND - the enforcement mechanism exists (insertGuarded + coverage lint). Not blocking: the SD target (tests/e2e producers) is outside the existing lint scope. Scope PLAN to adoption + scope extension, not new machinery.',
      infrastructure_check: 'Existing infrastructure identified and reusable - see existing_infrastructure',
      claims_verification: 'All six measured claims independently re-measured against live DB + code: 6 confirmed, 3 advisory divergences recorded',
    },
  },
};

const resolution = await resolveSubAgentRepo({
  sdId: SD_UUID,
  targetApplication: 'EHG_Engineer',
  subAgentCode: 'VALIDATION',
});
applySubAgentRepoVerdict(results, resolution);

const stored = await storeSubAgentResults('VALIDATION', SD_UUID, { code: 'VALIDATION' }, results, {
  sdKey: SD_KEY,
  phase: 'LEAD-TO-PLAN',
});

console.log('STORED ROW ID:', stored?.id || JSON.stringify(stored).slice(0, 400));
console.log('verdict:', results.verdict, '| confidence:', results.confidence);
console.log('repo_path:', results.metadata.repo_path, '| resolved:', results.metadata.repo_resolved);
process.exit(0);
