import fs from 'fs';

const path = 'CHANGELOG.md';
const content = fs.readFileSync(path, 'utf8');

const featuresMarker = "### Features\n\n- **The two media-generation systems in this repo were both orphaned";
const idx = content.indexOf(featuresMarker);
if (idx === -1) throw new Error('features marker not found');

const entryLines = [
  "- **A chairman-targeted decision held under a pending Solomon consult had no reliable release path: the readback that would confirm the hold's own anchor was never checked, the release sweep supplied no clock, the schema was missing 3 fields the rubric hard-requires, and the naive fix for the last one would have doubled the SMS text the chairman receives** - PR #7579 (SD-LEO-INFRA-CHAIRMAN-SMS-DECISION-002)",
  "  - **What shipped**: readback-verifies the pre-send Solomon consult insert and threads the row id into `chairman_held_sends.consult_row_id` (the column existed since the base migration but was never written); defaults and MERGES a clock into the release sweep's rubric context so quiet-hours evaluation runs instead of throwing `gate_unavailable`; a new migration adds `reply_instruction`/`reply_id`(singular)/`no_reply_consequence` (nullable, no CHECK) so a released decision can satisfy the rubric a second time; UUID-validates `--decision-id` before any hold-path write; and a new unit-testable JS orphan detector covers signals the existing db-tier-only unreconcilable view is blind to for a row's first 24h.",
  "  - **A LEAD-phase VALIDATION pass caught a critical defect purely at PRD-authoring time, before any code existed**: the naive release-path fix (reconstruct the held row's already-composed body and re-dispatch) would have re-run the gate's unconditional body-composition a SECOND time, visibly duplicating the options/reply-instruction/no-reply-consequence text in the chairman's SMS. Pinned to an explicit `skipCompose` flag `releaseHeldSend()` alone sets, verified against the *existing* shipped test contract proving hold-time composition (not release-time) is the intentional design.",
  "  - **An EXEC-phase TESTING pass found 5 real regression-blindness gaps in the first-pass test suite** — most notably an orphan-scan query the test fixture couldn't even execute (`.in()` unsupported), silently swallowed by its own best-effort catch, so every test read green while the scan never actually ran; and a release-path test that mocked `sendChairmanSMS` entirely, proving nothing about whether the reply-field restoration and the double-composition fix actually work together end to end. All 5 closed with genuine round-trip tests against the real gate and rubric.",
  "  - **A PLAN_VERIFICATION VALIDATION pass then found the new regression test written to prove the double-composition fix had itself reintroduced the exact flake class the OTHER fix (the release sweep's clock) explicitly exists to prevent** — it used `Date.now()` against a blocking quiet-hours rubric check, so it would fail nightly 22:00-06:00 ET, and its negative control stayed green in that window for the wrong reason. Fixed with a deterministic `context.nowHourET`; mutation-verified a second, related regression guard by temporarily reverting the production fix and confirming the test actually failed.",
  "  - **REGRESSION found the new UUID validation correctly broke one pre-existing CLI test** that used a placeholder decision-id which was never a valid UUID — updated the fixture to a real UUID (the intended tightened contract) rather than relaxing the guard.",
  "  - **Two confirmed-dead historical held rows were voided with independently re-verified provenance**: their underlying `chairman_decisions` row no longer existed in the database (re-confirmed by 3 separate sub-agent passes across LEAD/EXEC/PLAN_VERIFICATION), so neither could ever complete a release regardless of the fixes above — marked `status='abandoned'` rather than left silently stuck.",
  "  - **Verification**: LEAD-TO-PLAN, PLAN-TO-EXEC 95%, EXEC-TO-PLAN 90% (after TESTING+SECURITY fix round), PLAN-TO-LEAD 95%, LEAD-FINAL-APPROVAL 95%. 10 SD-scoped test files / 114 tests passing; broad regression sweep across every consumer of the 6 shared files touched (112 files / 1676 tests, 0 unrelated failures).",
  "",
  ""
].join("\n");

const newContent = content.slice(0, idx) + entryLines + content.slice(idx);
fs.writeFileSync(path, newContent);
console.log('CHANGELOG_UPDATED');
