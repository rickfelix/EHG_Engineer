import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const PRD_ID = 'PRD-SD-LEO-FEAT-YOUTUBE-INGESTION-CREDENTIAL-001';

const { data: prd, error: fetchErr } = await supabase
  .from('product_requirements_v2')
  .select('functional_requirements, test_scenarios, risks, metadata')
  .eq('id', PRD_ID)
  .maybeSingle();

if (fetchErr || !prd) { console.log('FETCH_FAILED', fetchErr?.message); process.exit(1); }

// Fix FR-4's stale/wrong citations (TESTING T9 finding).
const functionalRequirements = prd.functional_requirements.map((fr) => {
  if (fr.id !== 'FR-4') return fr;
  return {
    ...fr,
    description: fr.description
      .replace('post-processor.js (lines 183, 262, 277)', 'post-processor.js (real OAuth acquisition at line 208, not 183 as first cited; also lines 262, 277)')
      .replace('strategy-extract-core.js (lines 271, 302, 329)', "strategy-extract-core.js's caller scripts/eva/youtube-strategy-extract.js:231 (strategy-extract-core.js itself has NO OAuth dependency -- the real write-scope consumer is its caller, corrected per TESTING agent finding T9)"),
    acceptance_criteria: fr.acceptance_criteria.map((ac) =>
      ac.includes('strategy-extract-core.js')
        ? "scripts/eva/youtube-strategy-extract.js (the actual OAuth write-scope consumer, not strategy-extract-core.js) is unmodified and continues to use the existing (unchanged) client."
        : ac
    ),
  };
});

// Replace the two vacuous/tautological scenarios (TS-3, TS-4) and add coverage for the 8 gap ACs +
// the two feasibility fixes (T4 workflow-env wiring test, T7 pure-mapping unit test) per TESTING findings.
const testScenarios = [
  { id: 'TS-1', scenario: 'FR-1 gate blocks EXEC when decision is still pending', type: 'unit',
    expected: "A pre-EXEC check against chairman_decisions id a94f88c8 halts progress with a clear message rather than defaulting to a branch. NOTE (TESTING T6): chairman_decisions has no 'answer' column -- FR-1's check must read `decision`/`rationale`, not a nonexistent 'answer' field, and must give EXEC an explicit YES/NO mapping, not just 'status != pending' (a rejected/expired row has no clean branch)." },
  { id: 'TS-2', scenario: "FR-3 (if shipped): mapVideoToIntakeRow sets a real playlistItem id, unit-testable NOW", type: 'unit',
    expected: "TESTING T7: authorable today with an injected fake YouTube client (no live API needed) -- assert mapVideoToIntakeRow(item) returns youtube_playlist_item_id === item.id. Write this test BEFORE the chairman answers, since playlist-sync.js currently has zero test files." },
  { id: 'TS-3', scenario: "FR-4 (if shipped): the real write-scope consumer keeps working after the new read-only client is introduced", type: 'regression',
    expected: "CORRECTED (TESTING T1): the original scenario (narrowing SCOPES and re-running existing tests) is a tautology -- SCOPES is module-private/untested and both existing test suites mock the OAuth dependency away entirely. The real test: scripts/eva/youtube-strategy-extract.js (the actual write-scope consumer per the FR-4 citation fix) must be exercised with the NEW read-only client swapped in for playlist-sync.js's read path, proving the two clients are genuinely independent -- not just that unrelated mocked tests still pass." },
  { id: 'TS-4', scenario: 'FR-5 real-pull verification -- seeded, not incidental', type: 'e2e',
    expected: "CORRECTED (TESTING T2): eva_youtube_intake is currently 284/284 already-processed rows with zero pending -- a plain before/after row-count check would measure 0 either way (inserted=0 is indistinguishable from a dead credential), AND updateSyncState's atomic RPC resets consecutive_failures=0 on error=null regardless of synced_count, so the existing --verify healthcheck would report HEALTHY on a zero-item pull. Corrected method: seed one known-new video into the playlist immediately before the workflow_dispatch run, then assert that specific youtube_video_id lands in eva_youtube_intake with a non-null youtube_playlist_item_id. This subsumes TS-2's live-API confirmation." },
  { id: 'TS-5', scenario: 'FR-5 AC-2 log-visibility fix', type: 'unit',
    expected: "TESTING T3: playlist-sync.js's item-count logs are gated behind `if (verbose)`, and eva-idea-sync-cron.yml's cron invocation (`npm run eva:ideas:sync -- --source all`) never passes --verbose/-v -- so FR-5 AC-2 ('log shows an item count') is unachievable as written today. Either the cron invocation must add --verbose, or AC-2 must be satisfied via the DB row-count check (TS-4) instead of log output -- do not leave both unresolved." },
  { id: 'TS-6', scenario: 'FR-6 circuit-breaker prerequisite is real and currently true', type: 'unit',
    expected: "eva_sync_state's youtube/'For Processing' row currently shows consecutive_failures=3 and syncYouTube() early-returns before its try block (playlist-sync.js ~lines 286-290), confirmed live by TESTING sub-agent -- assert the reset actually clears this early-return path before FR-5's verification is attempted, not just that a counter changed." },
  { id: 'TS-7', scenario: 'eva-idea-sync-cron.yml env wiring test for the new credential(s)', type: 'unit',
    expected: "TESTING T4: no AC currently requires the new env var(s) (YOUTUBE_API_KEY / YOUTUBE_FOR_PROCESSING_PLAYLIST_ID, or the new OAuth client's secrets) be wired into the workflow's env block -- today it sets only Supabase + Todoist. Extend the EXISTING harness tests/unit/cron/eva-idea-sync-cron-wiring.test.js (which already parses the workflow YAML and asserts on TODOIST_INTAKE_PROJECTS) to assert the new var(s) are present, rather than relying on a laptop .env that CI never sees." },
  { id: 'TS-8', scenario: 'FR-4 AC-3/AC-4 security core -- GitHub Environment scoping and no-DB-fallback', type: 'unit',
    expected: "TESTING found these entirely untested despite being the security core of the fallback branch in a public repo with 210+ workflows. Assert (a) the new secret(s) are referenced only under a job `environment:` key, not as bare repository secrets, and (b) oauth-manager.js's new read-only client path has zero code that reads/writes eva_sync_state for its tokens -- env var only." },
];

// Add a risk entry documenting the correction, so future readers see the trail.
const risks = [
  ...prd.risks,
  {
    risk: "Original test scenarios (TS-3, TS-4 as first drafted) were tautological/vacuous per an independent TESTING sub-agent pass -- they would have passed regardless of whether the implementation was correct.",
    mitigation: "Corrected in place (see TS-3/TS-4 above) before PLAN-TO-EXEC proceeded. TS-2/TS-5/TS-6/TS-7/TS-8 added to close 8 previously-untested acceptance criteria, including the FR-4 security-core ACs.",
    severity: "medium",
  },
];

const { data: updated, error: updateErr } = await supabase
  .from('product_requirements_v2')
  .update({
    functional_requirements: functionalRequirements,
    test_scenarios: testScenarios,
    risks,
    metadata: {
      ...prd.metadata,
      testing_agent_evidence_id: '35f00b3c-8e5e-4450-919d-ac4ce01d9cb7',
      testing_agent_corrections_applied: ['T1', 'T2', 'T3', 'T4', 'T6', 'T7', 'T9'],
    },
  })
  .eq('id', PRD_ID)
  .select('id');

console.log(JSON.stringify({ updated, updateErr: updateErr?.message }, null, 2));
