import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const PRD_ID = 'PRD-SD-LEO-INFRA-PUBLISH-OUTCOME-OBSERVER-001';
const { data: prd, error: readErr } = await supabase.from('product_requirements_v2').select('functional_requirements, technical_requirements, risks, metadata').eq('id', PRD_ID).single();
if (readErr) throw readErr;

const fr = prd.functional_requirements;
const byId = (arr, id) => arr.find(x => x.id === id);

// F1 (HIGH, VERIFY-phase VALIDATION finding): the observation window FR-4/FR-7 always
// required was never actually built. Now fixed -- document it.
byId(fr, 'FR-1').acceptance_criteria.push("A join-miss (no campaign_content row, null external_post_id, or a dry-run sentinel) classifies 'unknown' (retried next run), not 'unmeasurable', while the ledger row is still within OBSERVATION_WINDOW_MS (24h) of its own created_at -- the approval-gated path's human-paced retry may simply not have happened yet. Only past the window does the same join-miss become the terminal 'unmeasurable' -- 'does not exist AND NEVER WILL', not merely 'does not exist yet' (VERIFY-phase VALIDATION finding F1, HIGH: without this, a scheduled tick landing in the gap between an out-of-band chairman approval and the human-paced publish() retry would wrongly, permanently classify a row that would otherwise have succeeded)");

// F4 (LOW, VERIFY-phase VALIDATION finding): FR-5's AC-1 claimed the 42703-fallback query
// ALSO filters by execution_mode, which is structurally impossible -- that branch's whole
// premise is that the execution_mode column does not exist, so it cannot be filtered on.
byId(fr, 'FR-5').acceptance_criteria[0] = "evaluateGraduation's candidate SELECT filters by execution_mode when a mode argument is supplied -- ONLY on the PRIMARY query form. The 42703-fallback form (used only when the execution_mode column itself does not exist) cannot apply this filter by construction -- filtering on a column asserted absent is meaningless. On that fallback branch, the loop's row.execution_mode==='mock' break (AC-2 below) is the ONLY mode-isolation mechanism, since row.execution_mode is always undefined there and the break condition (executionModeAvailable && ...) is gated off. Corrected from an earlier claim that both forms filter (VERIFY-phase VALIDATION finding F4)";

// F5 (LOW, VERIFY-phase VALIDATION finding): the original FR-2/FR-3 ACs (written before
// the getPostRecord/getTweet return shape was finalized) used a `deletedOrErrored` field
// name the shipped code never has -- the real, and better, design is a 3-state
// {exists: true|false|null, transient: boolean} shape that separates exactly what FR-7's
// never-guess rule needs separated (confirmed-absent vs "couldn't tell").
const fr2 = byId(fr, 'FR-2');
fr2.acceptance_criteria[0] = "A mocked 200 response with a valid record classifies {exists: true, transient: false}";
fr2.acceptance_criteria[1] = "A mocked 404/tombstone response classifies {exists: false, transient: false} (reverted candidate)";
fr2.acceptance_criteria[2] = "A mocked 500 or network-error response classifies {exists: null, transient: true} (FR-7 transient case), never thrown uncaught. Corrected from an earlier ACs' use of a non-existent `deletedOrErrored` field name -- the shipped {exists, transient} shape is the better design, separating confirmed-absent from could-not-tell (VERIFY-phase VALIDATION finding F5)";
const fr3 = byId(fr, 'FR-3');
fr3.acceptance_criteria[0] = "A mocked 200 response with a valid tweet classifies {exists: true, transient: false}";
fr3.acceptance_criteria[1] = "A mocked 404 response classifies {exists: false, transient: false}";
fr3.acceptance_criteria[2] = "A mocked 429/500/network-error response classifies {exists: null, transient: true} (FR-7 transient case, stays unknown, never a terminal outcome). Corrected from an earlier ACs' use of a non-existent `deletedOrErrored` field name (VERIFY-phase VALIDATION finding F5)";

// FR-8/TR-11: TS-7 is now WRITTEN and passing, not merely planned. Update FR-8's ACs and
// retire TR-11's "deferred" framing to "delivered".
byId(fr, 'FR-8').acceptance_criteria[0] = "evaluateGraduation runs at least once from a recorded MOCK-mode outcome produced by this SD's new scheduled path -- proven end-to-end (not merely per-unit) by a dedicated test driving the REAL sweepOnce -> recordPublishOutcome -> evaluateGraduation composition against a faked supabase client, with only the platform adapter's transport and the credential resolver faked (tests/unit/cron/publish-outcome-observer.test.js, 'sweepOnce end-to-end...' describe block). This closes a gap VALIDATION and TESTING both independently flagged: every per-unit test injected fakes for BOTH observeOutcome and recordPublishOutcome, so the real composition -- exactly where the SEC-2 mode-filter defects hid, twice -- was never exercised until this test existed.";

const technical_requirements = prd.technical_requirements;
const trById = (id) => technical_requirements.find(x => x.id === id);

trById('TR-10').title = 'PARTIALLY DELIVERED: fixed observation window delivered; read-budget batching/backoff remains deferred';
trById('TR-10').description = "The fixed observation window (FR-1's OBSERVATION_WINDOW_MS, 24h) is now delivered, closing VERIFY-phase VALIDATION finding F1 -- a join-miss within the window stays 'unknown' (retried), never a premature terminal 'unmeasurable'. STILL DEFERRED: sweepOnce has no read-budget batching or backoff -- a backlog of permanently-transient rows (adapter lookup failures, not join-misses) could still be re-polled every 30 minutes indefinitely, and at DEFAULT_ROW_LIMIT=200 this could exceed X's 15K-reads/month Basic-tier budget within days if such a backlog is large (VALIDATION finding F2, MEDIUM -- compounds with F1 if F1 had gone unfixed, though F1's fix removes the join-miss contribution to this risk). Oldest-first ordering (added in the same phase as F1's fix) at least prevents starvation of long-waiting rows. The remaining batching/backoff logic is deferred to a follow-up SD/QF, not blocking for this increment.";

trById('TR-11').title = 'DELIVERED: a real end-to-end test wiring sweepOnce through the actual autonomy-gate.js (was deferred, now written)';
trById('TR-11').description = "Originally deferred as a follow-up; both VERIFY-phase VALIDATION and the earlier EXEC-phase TESTING review independently flagged it as cheap to close since all the seams already existed, so it was written in the same round as F1's fix rather than deferred further. tests/unit/cron/publish-outcome-observer.test.js's 'sweepOnce end-to-end with the REAL observeOutcome/recordPublishOutcome/evaluateGraduation' test drives the actual composition (only the adapter's fetchImpl and the credential resolver are faked) and asserts: the row is joined, recordPublishOutcome writes it, evaluateGraduation's real candidate query runs scoped to venture/channel/execution_mode='mock', and venture_channel_autonomy is never touched. Verified to genuinely discriminate: reverting the SEC-2 fail-closed fix causes this exact test to fail (autonomyUpsert called when it should not be) -- direct proof this composition-level test would have caught the SEC-2 regression the per-unit tests missed.";

const metadata = {
  ...prd.metadata,
  plan_revision_note_6: {
    at: new Date().toISOString(),
    reason: "VERIFY-phase VALIDATION sub-agent review (re-checked at HEAD 8f2b2843755) returned CONDITIONAL_PASS @ 90 with one genuine HIGH gap (F1) plus two MEDIUM and two LOW findings, all against the actual shipped code -- and independently corroborated (by re-deriving from scratch, not reading the commit message) the two defects the concurrent EXEC-phase TESTING review found. Fixed in code: F1 (HIGH) -- FR-4's observation window was never built; a join-miss on the approval-gated path could be wrongly, permanently classified 'unmeasurable' if a scheduled tick landed between an out-of-band chairman approval and the human-paced publish() retry, even though the post would exist once the retry happened -- fixed with OBSERVATION_WINDOW_MS (24h): within the window a join-miss stays 'unknown' (retried), only past it does it become terminal. F3/TR-11 (MEDIUM, deferred follow-up promoted to delivered) -- wrote the real end-to-end composition test both reviewers flagged as cheap and valuable, proven to genuinely discriminate against the exact SEC-2 regression class. F4/F5 (LOW, PRD-wording defects, code was already correct) -- corrected FR-5's AC-1 (the 42703-fallback query cannot filter by a column asserted absent) and FR-2/FR-3's stale ACs (a `deletedOrErrored` field name the shipped code never used; the real {exists, transient} shape is the better design and is now what the ACs describe). F2 (MEDIUM, read-budget batching/backoff) remains an explicit deferred follow-up per both reviewers' own stated bar -- TR-10 updated to reflect the window is delivered while batching/backoff is not.",
    source_evidence_row: 'af9e60e8-51ce-48ae-b516-31cf0d4cdb4f'
  }
};

const { error: writeErr } = await supabase.from('product_requirements_v2').update({ functional_requirements: fr, technical_requirements, metadata }).eq('id', PRD_ID);
if (writeErr) throw writeErr;
console.log('PRD round-6 corrected.');
