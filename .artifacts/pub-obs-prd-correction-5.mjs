import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const PRD_ID = 'PRD-SD-LEO-INFRA-PUBLISH-OUTCOME-OBSERVER-001';
const { data: prd, error: readErr } = await supabase.from('product_requirements_v2').select('functional_requirements, risks, metadata, technical_requirements').eq('id', PRD_ID).single();
if (readErr) throw readErr;

const fr = prd.functional_requirements;
const byId = (arr, id) => arr.find(x => x.id === id);

// FR-5 AC text reconciliation (EXEC-phase TESTING finding): the code's actual, correct
// two-layer defense was mis-described as a pure "replacement".
byId(fr, 'FR-5').acceptance_criteria = [
  "evaluateGraduation's candidate SELECT filters by execution_mode when a mode argument is supplied (both the primary and 42703-fallback forms), so a mode-aware call never even sees a cross-mode row -- this is the PRIMARY mechanism",
  "The loop's own row.execution_mode==='mock' break is RETAINED, not removed, as a defense-in-depth backstop for callers that omit the mode argument entirely (this file's own pre-existing test suite calls evaluateGraduation directly without a mode argument in several places) -- it is redundant once a mode filter is applied, but load-bearing when one is not",
  "venture_channel_autonomy is written only for mode==='live' or an omitted mode key (backward-compatible legacy callers); mode==='mock', an explicit null, or any other value skips the write entirely in both directions (EXEC-phase SECURITY finding SEC-2, fixed fail-closed after an initial fail-open fix was found and corrected in the same phase)"
];

// FR-4: document rows_joined + the unknown-path counter as delivered (EXEC-phase TESTING finding)
byId(fr, 'FR-4').acceptance_criteria.push("main()'s summary additionally reports rows_joined (the ledger-to-campaign_content join succeeded, regardless of what happened after) and rows_left_unknown (every row that hit the 'unknown' continue path) -- a sweep where every lookup fails transiently is now visibly distinguishable from a healthy zero-yield run");
byId(fr, 'FR-4').acceptance_criteria.push("A 23514 (expected-pre-migration) write failure is counted in rows_write_failed_expected_pre_migration, DISTINCT from rows_write_failed (a genuine failure) -- corrected at the cron layer after TESTING found the original code discarded recordPublishOutcome's reason field entirely");

// FR-2/FR-3: document the payload-shape fixes (EXEC-phase TESTING CRITICAL/HIGH findings)
byId(fr, 'FR-2').acceptance_criteria.push("getPostRecord requires positive evidence (raw.uri) for exists:true and recognizes AT Protocol's documented RecordNotFound error shape (HTTP 400 + error:RecordNotFound), not only a plain 404 -- without this, 'reverted' was unreachable on the Bluesky path and a deleted post stayed 'unknown' forever (EXEC-phase TESTING finding, HIGH)");
byId(fr, 'FR-3').acceptance_criteria.push("getTweet requires positive evidence (raw.data.id) for exists:true and recognizes X API v2's documented not-found shape (HTTP 200 + an errors array, no data key) as exists:false -- without this, a deleted X post was written to the ledger as shipped_clean, a wrong TERMINAL outcome that could earn autonomy graduation (EXEC-phase TESTING finding, CRITICAL, the most severe finding of this SD)");

const technical_requirements = prd.technical_requirements;
technical_requirements.push({
  id: 'TR-10',
  title: 'DEFERRED FOLLOW-UP: fixed observation window + read-budget backoff at the cron layer',
  description: "sweepOnce currently has no created_at window predicate and no explicit backoff -- a backlog of permanently-transient rows could be re-polled every 30 minutes indefinitely, and at the current DEFAULT_ROW_LIMIT (200) this could exceed X's 15K-reads/month Basic-tier budget within days if the backlog is large (EXEC-phase TESTING finding, MEDIUM). Oldest-first ordering was added in the same phase to at least prevent starvation of long-waiting rows; the full fixed-window + backoff logic is deferred to a follow-up SD/QF, not blocking for this increment."
});
technical_requirements.push({
  id: 'TR-11',
  title: 'DEFERRED FOLLOW-UP: a real end-to-end test wiring sweepOnce through the actual autonomy-gate.js (not a mocked stub)',
  description: "No test in this SD drives the real recordPublishOutcome -> evaluateGraduation path through the scheduled cron step end-to-end; every cron-level test injects recordPublishOutcomeFn as a mock. This is exactly the gap that let the SEC-2 mode-filter defects (both the original inertness and the first fail-open fix attempt) go undetected by the SD's own test suite until an independent EXEC-phase TESTING pass caught them by direct code inspection. FR-8's AC-1 (evaluateGraduation has run at least once from a recorded MOCK-mode outcome produced by this new path) remains asserted only at the PRD level, not proven by an automated test. Deferred to a follow-up, not blocking for this increment."
});

const metadata = {
  ...prd.metadata,
  plan_revision_note_5: {
    at: new Date().toISOString(),
    reason: "EXEC-phase TESTING sub-agent review (pub-obs-testing-exec) returned a substantive FAIL verdict (not merely the gate-satisfying generic-scanner CONDITIONAL_PASS row) with 1 CRITICAL, 3 HIGH, and 4 MEDIUM findings against the actual shipped code, independently of and in addition to the concurrent SECURITY review. Fixed in code: (1) CRITICAL -- X getTweet asserted exists:true from HTTP-ok alone; a deleted post (HTTP 200 + errors array, no data key) was written to the ledger as shipped_clean, inverting FR-7's entire guarantee and manufacturing false graduation credit -- fixed to require raw.data.id and recognize the documented not-found shape. (2) HIGH -- Bluesky getPostRecord only checked status===404; AT Protocol returns not-found as HTTP 400 + error:RecordNotFound, making 'reverted' unreachable on that platform -- fixed to check both, plus positive-evidence (raw.uri) required for exists:true. (3) HIGH -- the SEC-2 fix from earlier in this phase was itself fail-open: any mode value other than the literal string 'mock' (null, undefined-explicitly-passed, 'dry_run', etc.) fell through to the venture_channel_autonomy write, reproducing the exact demotion harm SEC-2 existed to close, and reachable in production because recordPublishOutcome passes mode straight through from a ledger row whose execution_mode column can be NULL -- fixed to fail closed (only mode==='live' or an omitted mode key, preserving backward compatibility with pre-existing direct-caller tests, may proceed to the write). (4) HIGH -- rows_joined did not exist anywhere and rows classifying 'unknown' were counted nowhere, so a sweep where every lookup failed transiently was indistinguishable from a healthy zero-yield run -- fixed by adding a joined flag to observeOutcome's return and rows_joined/rows_left_unknown counters to sweepOnce. Also fixed: TS-12's reason was discarded at the cron layer (now a distinct rows_write_failed_expected_pre_migration counter), and SEC-4 (the observer's cron workflow exposed three posting-capable secrets -- X_API_KEY, BLUESKY_HANDLE, BLUESKY_APP_PASSWORD -- to a read-only job that uses none of them; removed). Documented as explicit deferred follow-ups (TR-10, TR-11), per the reviewing sub-agent's own stated bar for what could ship as a follow-up rather than a blocker: a fixed observation window + read-budget backoff at the cron layer, and a real end-to-end test wiring sweepOnce through the actual autonomy-gate.js rather than a mocked stub. FR-5's acceptance criteria text was also corrected to accurately describe the code's real (and correct) two-layer defense, which the original AC text mis-described as a pure replacement.",
    source_evidence_row: '765a242e-5161-4190-a1fc-076d1efab821'
  }
};

const { error: writeErr } = await supabase.from('product_requirements_v2').update({ functional_requirements: fr, technical_requirements, metadata }).eq('id', PRD_ID);
if (writeErr) throw writeErr;
console.log('PRD round-5 corrected.');
