#!/usr/bin/env node
// LEAD-phase enrichment for SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-G.
// Corrects the auto-generated boilerplate key_changes/success_criteria against the
// VALIDATION sub-agent's independent re-verification (agent a20fa54cf1d140606) and records
// mechanism_verifications citations for GATE_MECHANISM_CLAIM_VERIFIER.
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const SD_KEY = 'SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-G';
const now = new Date().toISOString();

const key_changes = [
  {
    change: "Register all 11 spec-§9 gauges (michael-brief-landed, michael-feeder-health, michael-seat-uptime, michael-oauth-health, michael-classifier-drift, michael-gmail-modify-ceiling, michael-surface-rate, michael-reopen-rate, michael-overdue-cleared, michael-ledger-gap, michael-account-independence) in lib/governance/gauge-registry.js with ownerRole:'michael'. VALIDATION corrected the SD's original 'detectorFn: null' claim: tests/unit/governance/gauge-registry.test.js:35-40 asserts every live entry has a non-null, non-empty string detectorFn (detectorFn === id convention, test:42-47); the real stub-adoption precedent is enabled:false with a real detectorFn string, matching adam_self_score_age/coordinator_self_score_age/solomon_self_score_age (gauge-registry.js:211-242). tests/unit/governance/gauge-registry.test.js:25 (toHaveLength(30)) and :28-33 (hardcoded live/stub id counts) must be updated to include the 11 new ids in the same PR — unnamed by the SD's original description, found by VALIDATION. michael-token-budget is explicitly deferred per spec §9 and is NOT registered. Detector inputs already exist from earlier children (chairman-oauth.js:81 child C, michael-register.cjs:212 child A account_profile) — PLAN decides whether to wire 11 real (still-disabled) detectorFn resolvers into scripts/gauge-runner.mjs or accept its existing non-fatal unresolved-key skip (gauge-runner.mjs:753).",
    impact: "Every gauge the spec requires for Michael's go-live criteria (michael-seat-uptime trips go-live per spec §10) exists as a registered, disabled stub the moment detection logic is ready, instead of go-live being blocked on registry work discovered late."
  },
  {
    change: "Register PAYLOAD_KINDS.MICHAEL_HANDOFF = 'michael_handoff' in lib/fleet/worker-status.cjs (currently absent, worker-status.cjs:74-129) and add it to the existing DRAIN_SETS.michael array (worker-status.cjs:410-415, whose own comment at :405-409 explicitly names child G as the one that registers this kind). A companion database/migrations/ file (chairman-gated header, `-- @approved-by: PENDING — chairman-gated apply required`, NOT applied by this session) inserts ('michael','michael_handoff',<SD-key>) into role_drain_sets via the confirmed ON CONFLICT DO NOTHING pattern (precedent: database/migrations/20260906_role_drain_sets_add_worker_signal.sql) — tests/unit/fleet/drain-set-registry.test.js enforces 1:1 JS-floor/migration parity so the JS change and the migration land in the same PR. Add exactly one new line to lib/coordinator/dispatch.cjs's declaredAddresseeRole (dispatch.cjs:271, immediately after the existing `if (payload.kind === 'solomon_consult') return 'solomon';` line): `if (payload.kind === 'michael_handoff') return 'michael';` — a first VALIDATION pass recommended skipping this function entirely, citing its 'do not widen without a measured occurrence' comment (QF-20260728-944); a second pass cross-checking docs/michael/05-SOLOMON-ADJUDICATION.md Q6 (the chairman-ratified adjudication, ACCEPT-WITH-CONDITION) found it explicitly names declaredAddresseeRole as one of the five files that MUST register michael_handoff 'in the same PR' or the registration is 'the untyped-row class' — a ratified, scoped, one-line addition mirroring an existing precedented line is not the open-ended widening the QF comment warns against, and Solomon's own evidence (a real specimen: 'an untyped row to the coordinator... landed at 13:56Z' on 2026-09-05) is itself the measured occurrence that comment asks for. peer-target.cjs is confirmed ALREADY DONE (child A, lib/coordinator/peer-target.cjs:36,106) — no action there. lib/coordination/lane-lint-gauge.cjs needs no code change: its untyped_row check (lane-lint-gauge.cjs:108) fires on a missing/null/empty payload.kind, not an unrecognized-but-present one, so a real michael_handoff-typed row is never flagged — Solomon's condition that the gauge 'reads it' is satisfied automatically once the kind is registered elsewhere, verified by a test asserting exactly that rather than by adding a code path.",
    impact: "The michael_handoff kind is registered at every one of the five points Solomon's ratified Q6 adjudication requires in the same PR, closing the SD-A-deferred gap and the exact untyped-row risk Solomon's own measured incident illustrated, while still leaving the two mechanisms that genuinely need no change (peer-target.cjs, lane-lint-gauge.cjs) untouched."
  },
  {
    change: "Create scripts/michael-inbox.cjs (VALIDATION confirmed this exact filename, not a differently-named 'advisory' script, since shipped child-A code already calls it by this path: michael-register.cjs:297 lazy-requires `{ drainMichaelOutbound }` from it, michael-quiet-tick.mjs:148 calls it, and .claude/commands/michael.md:71 documents a `--quiet` CLI flag). Drains DRAIN_SETS.michael kinds (including the new michael_handoff kind above) using the drain pattern of scripts/solomon-advisory.cjs (:267 DRAIN_SETS.solomon.filter, :273/:278 inbox/orphan predicates, :461-462 resolveRecognizedKinds) — but exports only inbox/drain functionality, no send/request functions, since michael-register.cjs:407 confirms Michael's seat sends nothing outbound through this path.",
    impact: "Directed rows sent to the michael seat (coordinator directives, michael_handoff rows from Adam) are actually drained by a working script that already-shipped code depends on by name, rather than being silently unreachable because the file child A deferred was never created."
  },
  {
    change: "Build the encode mechanism (not the ratification itself — that is a chairman-only in-terminal act, out of scope for this seat) for the Adam carve-out personal-day-lane clause: a script mirroring the confirmed precedent scripts/one-off/qf-20260905-813-encode-lens-predicates.mjs (SECTION_ID const, verbatim OLD_CLAUSE, an includes()-count-must-equal-1 guard, replace, --dry-run default, then regenerate CLAUDE.md) targeting leo_protocol_sections id=601 (adam_role_contract; VALIDATION found the CHAIRMAN COMMS heading appears exactly once at char 2107, section 5g 'CHAIRMAN SMS CHANNEL DUTY' at char 35167 already carries a forward reference at char 91692 saying the clause is 'encoded by child G' — PLAN picks the exact insertion line within 5g using that anchor). VALIDATION found a live marker-cross-check risk this child must design around: lib/chairman/ratification-writer.mjs:167-238 requires the ratified marker text be a literal substring of EVERY named target contract's rendered file, so a ratification naming targetContracts:['adam','michael'] requires the identical literal clause text to also land in the michael_role_contract leo_protocol_sections row (today CLAUDE_MICHAEL.md/docs/protocol/michael/role-contract.md:67 only paraphrase it as 'personal-day lane clause') — the encode script must write both sections in one pass, or the ratification's own cross-check will fail closed. No chairman_ratifications row exists yet for this clause (VALIDATION queried all 86 rows; zero target 'michael'; none quotes 'personal-day') — this child ships the encode tooling, staged and inert until the chairman actually ratifies the clause in-terminal, the same chairman-gated posture every other Michael migration in this family follows. VALID_TARGET_CONTRACTS in lib/chairman/ratification-writer.mjs already includes 'michael' (child A, ratification-writer.mjs:30) — no change needed there, contrary to the SD's original description implying it as this child's work.",
    impact: "The mechanical act of encoding the chairman's ratified carve-out language into both adam_role_contract and michael_role_contract is ready and idempotent the moment the chairman actually ratifies it, rather than being invented ad hoc under time pressure on the first morning Michael and Adam's lanes actually need to be distinguished."
  }
];

const success_criteria = [
  { criterion: "All 11 spec-§9 gauges are registered with ownerRole:'michael', a non-null detectorFn matching each gauge's id, and enabled:false", measure: "tests/unit/governance/gauge-registry.test.js updated counts (30→41 total, live-count unchanged, stub-id list grown by 11) pass; a new assertion confirms all 11 ids are present with ownerRole 'michael' and enabled===false" },
  { criterion: "michael-token-budget is NOT registered (spec-deferred)", measure: "grep for 'michael-token-budget' in gauge-registry.js returns nothing" },
  { criterion: "michael_handoff is a real, drainable kind for the michael role", measure: "PAYLOAD_KINDS.MICHAEL_HANDOFF exists in worker-status.cjs; DRAIN_SETS.michael includes it; the role_drain_sets migration file exists (chairman-gated, not applied); tests/unit/fleet/drain-set-registry.test.js passes (JS-floor/migration parity)" },
  { criterion: "scripts/michael-inbox.cjs exists and exports drainMichaelOutbound with the shape michael-register.cjs:297 and michael-quiet-tick.mjs:148 already expect", measure: "a unit test for scripts/michael-inbox.cjs asserts drainMichaelOutbound(supabase, {newSessionId, oldSessionIds}) returns {moved}, and drains exactly the DRAIN_SETS.michael kind set" },
  { criterion: "declaredAddresseeRole gains exactly one new line for michael_handoff; lane-lint-gauge.cjs is left unmodified", measure: "git diff shows exactly one added line in lib/coordinator/dispatch.cjs's declaredAddresseeRole (mirroring the existing solomon_consult line) and zero changes to lib/coordination/lane-lint-gauge.cjs; a unit test asserts a michael_handoff-kind row is never flagged untyped_row by the lane-lint gauge" },
  { criterion: "The Adam-carve-out encode script exists, is dry-run-by-default, verifies its target text appears exactly once before replacing, and touches both adam_role_contract (id=601) and michael_role_contract in one pass", measure: "a unit test seeds fixture section content, runs the encode function, and asserts both sections are updated together and it refuses if either target's marker count is not exactly 1" },
  { criterion: "No chairman_ratifications row is written by this child (chairman-only act, deferred)", measure: "grep the diff/tests: no code path in this child's tests calls recordChairmanRatification against a live client; the encode script requires an existing ratification row as a precondition rather than creating one" }
];

const success_metrics = [
  { metric: "Registry parity", target: "gauge-registry.test.js and drain-set-registry.test.js both pass with zero adjustment beyond the counts this child updates" },
  { metric: "No unintended widening", target: "Zero diff lines in declaredAddresseeRole or lane-lint-gauge.cjs" },
  { metric: "Encode idempotency", target: "Running the Adam-carve-out encode script twice against unchanged fixture content is a no-op on the second run (matching the qf-20260905-813 precedent's occurs-exactly-once guard)" }
];

const mechanism_verifications = [
  { verified_by: 'validation-agent:a20fa54cf1d140606', verified_at: 'lib/governance/gauge-registry.js:0 (no ownerRole michael entries exist yet)' },
  { verified_by: 'validation-agent:a20fa54cf1d140606', verified_at: 'tests/unit/governance/gauge-registry.test.js:35-40' },
  { verified_by: 'validation-agent:a20fa54cf1d140606', verified_at: 'lib/governance/gauge-registry.js:211-242' },
  { verified_by: 'validation-agent:a20fa54cf1d140606', verified_at: 'lib/fleet/worker-status.cjs:74-129' },
  { verified_by: 'validation-agent:a20fa54cf1d140606', verified_at: 'lib/fleet/worker-status.cjs:405-415' },
  { verified_by: 'validation-agent:a20fa54cf1d140606', verified_at: 'database/migrations/20260906_role_drain_sets_add_worker_signal.sql:1' },
  { verified_by: 'validation-agent:a20fa54cf1d140606', verified_at: 'lib/coordinator/dispatch.cjs:260-277' },
  { verified_by: 'validation-agent:a20fa54cf1d140606', verified_at: 'lib/coordinator/peer-target.cjs:36' },
  { verified_by: 'validation-agent:a20fa54cf1d140606', verified_at: 'lib/coordination/lane-lint-gauge.cjs:34,108' },
  { verified_by: 'validation-agent:a20fa54cf1d140606', verified_at: 'scripts/michael-register.cjs:297' },
  { verified_by: 'validation-agent:a20fa54cf1d140606', verified_at: 'scripts/solomon-advisory.cjs:267' },
  { verified_by: 'validation-agent:a20fa54cf1d140606', verified_at: 'scripts/one-off/qf-20260905-813-encode-lens-predicates.mjs:16-56' },
  { verified_by: 'validation-agent:a20fa54cf1d140606', verified_at: 'lib/chairman/ratification-writer.mjs:30' },
  { verified_by: 'validation-agent:a20fa54cf1d140606', verified_at: 'lib/chairman/ratification-writer.mjs:167-238' },
  { verified_by: 'LEAD (session 33c321b9), cross-checked against Explore agent report', verified_at: 'docs/michael/05-SOLOMON-ADJUDICATION.md:107 (Q6 verdict, ratified)' },
  { verified_by: 'LEAD (session 33c321b9), cross-checked against Explore agent report', verified_at: 'lib/coordinator/dispatch.cjs:1440-1462 (DISPATCH_UNTYPED_ADAM_KIND precedent, Adam-only, no Michael equivalent exists yet)' },
];

const smoke_test_steps = [
  { step_number: 1, instruction: "grep -c \"ownerRole: 'michael'\" lib/governance/gauge-registry.js", expected_outcome: "Prints 11 (one per spec-§9 gauge; michael-token-budget excluded)" },
  { step_number: 2, instruction: "npx vitest run tests/unit/governance/gauge-registry.test.js tests/unit/fleet/drain-set-registry.test.js", expected_outcome: "All green: updated gauge counts (41 total, 27 pre-existing live + new stubs), and DRAIN_SETS.michael/role_drain_sets parity" },
  { step_number: 3, instruction: "node -e \"const {PAYLOAD_KINDS,DRAIN_SETS}=require('./lib/fleet/worker-status.cjs'); console.log(PAYLOAD_KINDS.MICHAEL_HANDOFF, DRAIN_SETS.michael.includes('michael_handoff'))\"", expected_outcome: "Prints 'michael_handoff true'" },
  { step_number: 4, instruction: "node -e \"const {declaredAddresseeRole}=require('./lib/coordinator/dispatch.cjs'); console.log(declaredAddresseeRole({kind:'michael_handoff'}))\"", expected_outcome: "Prints 'michael'" },
  { step_number: 5, instruction: "node scripts/michael-inbox.cjs --help (or --quiet against a fixture/mocked client)", expected_outcome: "Runs without throwing MODULE_NOT_FOUND; exports drainMichaelOutbound callable with {newSessionId, oldSessionIds} returning {moved}" },
];

async function main() {
  const { data: existing, error: readErr } = await supabase
    .from('strategic_directives_v2')
    .select('metadata')
    .eq('sd_key', SD_KEY)
    .single();
  if (readErr) { console.error('READ_FAILED', readErr); process.exit(1); }

  const metadata = {
    ...existing.metadata,
    mechanism_verifications,
    lead_design_notes: {
      corrected_scope_at: now,
      corrected_by: 'LEAD (session 33c321b9), independently re-verified via validation-agent:a20fa54cf1d140606',
      corrections: [
        "declaredAddresseeRole (dispatch.cjs:271) GAINS exactly one new line for michael_handoff -> 'michael', mirroring the existing solomon_consult line. A first VALIDATION pass (agent a20fa54cf1d140606) recommended skipping this, citing the function's 'do not widen without a measured occurrence' comment; a second Explore pass cross-checking docs/michael/05-SOLOMON-ADJUDICATION.md Q6 found the chairman-ratified adjudication explicitly requires it, and Solomon's own cited real incident (an untyped row landing at 13:56Z, 2026-09-05) IS the measured occurrence the QF comment asks for. The first pass's code-level caution was correct in general but did not cross-check the ratified spec adjudication before recommending a scope cut — corrected here before PLAN.",
        "lane-lint-gauge.cjs is NOT touched — has no per-role kind dimension; michael_handoff is body-carrying so needs no bodyless-exempt entry; its untyped_row check fires on missing/null/empty kind only, so a registered kind is read correctly with zero code change, satisfying Solomon's Q6 condition that the gauge 'reads it'",
        "peer-target.cjs registration and VALID_TARGET_CONTRACTS both already done by child A — not this child's work",
        "scripts/michael-inbox.cjs is the correct, already-referenced-by-shipped-code filename (michael-register.cjs:297, michael-quiet-tick.mjs:148) — not a differently-named advisory script",
        "the Adam carve-out chairman_ratifications row is a chairman-only in-terminal act; this child ships the encode tooling only, staged and inert until ratified",
        "the encode script must update BOTH adam_role_contract and michael_role_contract in one pass or the ratification writer's own marker cross-check (ratification-writer.mjs:167-238) fails closed"
      ]
    }
  };

  const { error: updateErr } = await supabase
    .from('strategic_directives_v2')
    .update({ key_changes, success_criteria, success_metrics, smoke_test_steps, metadata })
    .eq('sd_key', SD_KEY);
  if (updateErr) { console.error('UPDATE_FAILED', updateErr); process.exit(1); }
  console.log('SD-G enriched successfully.');
}

main();
