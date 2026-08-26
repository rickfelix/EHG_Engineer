// SD-LEO-GEN-ALL-VENTURES-PRODUCED-001-A -- PRD fix per TESTING sub-agent findings
// (row 860819cd-1224-4ec0-a6c8-8a9a11c73bd3, phase PLAN-TO-EXEC).
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const PRD_ID = 'PRD-SD-LEO-GEN-ALL-VENTURES-PRODUCED-001-A';

const { data: prd, error: fetchErr } = await supabase
  .from('product_requirements_v2')
  .select('functional_requirements, test_scenarios')
  .eq('id', PRD_ID)
  .single();
if (fetchErr) { console.error('FETCH_FAILED', fetchErr); process.exit(1); }

const fr = [...prd.functional_requirements];

// FR-1: resolve the truncation-vs-CHECK ambiguity; DB CHECK is a backstop, not primary enforcement.
const fr1 = fr.find((f) => f.id === 'FR-1');
fr1.description += " OVERSIZED-PAYLOAD RESOLUTION (was ambiguous): app-side truncation is the PRIMARY path -- the RPC computes the properties value to insert by truncating any p_properties exceeding 8000 octets and merging in {truncated:true} BEFORE the insert; the DB-level octet_length(properties::text)<=8000 CHECK is a defense-in-depth backstop that should never fire on the normal path -- if it does fire, that indicates the app-side truncation logic itself is broken, and the RPC should RAISE (22023) rather than silently reject a well-formed call.";
fr1.acceptance_criteria.push(
  'A p_properties payload exceeding 8000 octets is truncated app-side with {truncated:true} merged in before insert; the row is stored, not rejected',
  'The DB-level CHECK constraint never fires under normal operation (verified by a test that bypasses the RPC and inserts an oversized properties value directly, confirming the CHECK exists as a backstop)'
);

// FR-2: gate-integrity ordering -- rate-limit check strictly before the venture_artifacts upsert.
const fr2 = fr.find((f) => f.id === 'FR-2');
fr2.description += ' GATE-INTEGRITY ORDERING (TESTING sub-agent finding): the rate-limit check (FR-3) MUST run strictly before the venture_artifacts upsert (FR-4) in the RPC body. Without this ordering, a venture rate-limited on its very first call -- zero events actually stored -- could still receive its Stage-23 gate witness artifact and clear a kill gate unearned.';
fr2.acceptance_criteria.push(
  'A rate-limited call (venture or global cap) produces zero venture_usage_events rows AND leaves venture_artifacts entirely unchanged for that venture -- verified by a single test asserting both negatives together, not two independent tests'
);

// FR-4: venture_artifacts.title NOT NULL; auth-ordering test; concurrency; stage-number-agnostic test; activation chain.
const fr4 = fr.find((f) => f.id === 'FR-4');
fr4.description += " venture_artifacts.title is NOT NULL -- the upsert MUST set a constant, descriptive title (e.g. 'Usage Signal Wired') per artifact_type, not derived per-event; omitting it raises 23502 and, per FR-4's no-exception-handler requirement, breaks ALL ingestion for every venture the instant this migration applies (venture-artifacts-write-lint.mjs does not catch this: it scans JS .from().insert() call sites only and cannot see a SQL INSERT inside a migration's function body).";
fr4.acceptance_criteria.push(
  'The venture_artifacts upsert always sets a non-null title; a test that omits title in a hand-rolled equivalent insert confirms 23502 would fire, proving the production code path sets it',
  "A concurrency test opens a second DB client and submits two events for the same new venture at effectively the same time; both must complete without a 23505 unhandled-conflict error rolling back either event insert (ON CONFLICT can still raise under a concurrent uncommitted transaction -- this must be handled, not merely hoped to not occur)",
  'A test seeds a stub launch_readiness_gate-equivalent stage at a DIFFERENT stage_number (e.g. 24, simulating the post-renumbering world) and confirms the produced venture_artifacts row and gate behavior are correct there too -- proving the stage_key lookup, not a hardcoded 23, actually drives the lifecycle_stage value written'
);

fr.push({
  id: 'FR-6',
  title: 'CI must actually run the new DDL-level tests (path-filter fix)',
  description: ".github/workflows/drive-reports-ddl.yml's `paths:` trigger is a literal file list, not a glob pattern -- a PR that adds only a new migration file plus a new tests/ddl/ test file will trigger NO CI run at all for those tests (confirmed: this exact gap has already caused 3 prior SDs' DDL tests to silently never execute, and the workflow's own comment records a live '0 of 54 checks matched' incident). All new test scenarios for this SD belong in tests/ddl/ (using vitest.ddl.config.mjs, which sets passWithNoTests:false) rather than tests/integration/ (which routes to the db vitest project with passWithNoTests:true, DESIGNATED_NON_PROD_REFS empty, and a CI step that is continue-on-error plus `|| true` -- meaning tests placed there execute ZERO assertions and still report green).",
  priority: 'critical',
  acceptance_criteria: [
    'All new test files for this SD live under tests/ddl/, never tests/integration/',
    ".github/workflows/drive-reports-ddl.yml's literal paths: list is updated to include the new migration file path and the new tests/ddl/ test file path(s), verified by confirming the workflow actually triggers on a PR touching only those paths"
  ],
});

// New test_scenarios replacing/extending TS-1..TS-8 per TESTING sub-agent findings.
const ts = [
  { id: 'TS-1', scenario: 'Apply the staged migration to a local/test instance; run its DO $verify$ block', type: 'ddl', expected: 'venture_usage_events + fn_submit_venture_usage_event exist; all grant-posture assertions pass' },
  { id: 'TS-2', scenario: 'Submit a valid page_view event with a correct ingest_secret', type: 'ddl', expected: '{ok:true,id:<uuid>,reason:null}; row inserted; venture_artifacts launch_usage_signal row created with a non-null title' },
  { id: 'TS-3a', scenario: 'Submit 6 events in quick succession (burst, all within the 5-minute cooldown window) for the same venture', type: 'ddl', expected: '6 venture_usage_events rows; venture_artifacts row NOT duplicated; last_event_at UNCHANGED after the first update (proves the cooldown actually fires, not just that the row is not duplicated)' },
  { id: 'TS-3b', scenario: 'Back-date a prior last_event_at by 6+ minutes, then submit another event for the same venture', type: 'ddl', expected: 'last_event_at advances to the new event time; first_event_at remains unchanged' },
  { id: 'TS-3c', scenario: 'Open a second DB client; submit two events for the same brand-new venture at effectively the same time (concurrent uncommitted transactions)', type: 'ddl', expected: 'Both event inserts complete successfully; no unhandled 23505 rolls back either event row (ON CONFLICT must be handled correctly under real concurrency, not just sequential calls)' },
  { id: 'TS-4', scenario: 'Submit with an incorrect ingest_secret and OTHERWISE-VALID inputs', type: 'ddl', expected: 'SQLSTATE 28000; zero rows written to either table; error message byte-identical to the sibling RPCs\' equivalent reject message' },
  { id: 'TS-5', scenario: 'Submit a mismatched event_type/event_name pair with a CORRECT ingest_secret', type: 'ddl', expected: 'DB-level pairing CHECK rejection (22023-class), occurring only after the ownership check has already passed' },
  { id: 'TS-6', scenario: 'Exceed the per-venture and, separately, the global rate cap', type: 'ddl', expected: '{ok:false,id:null,reason:\'rate_limited_venture\'} or \'rate_limited_global\', HTTP 200, no exception; zero venture_usage_events rows written AND venture_artifacts left entirely unchanged for that venture (single test asserting both)' },
  {
    id: 'TS-9',
    scenario: "Auth-ordering cross-cell test (TESTING sub-agent's top finding): four calls -- (a) wrong secret + valid event_type, (b) wrong secret + INVALID event_type, (c) a NONEXISTENT venture_id + invalid event_type, (d) correct secret + invalid event_type",
    type: 'ddl',
    expected: '(a) 28000; (b) 28000 -- this is the ordering-sensitive cell, proving the ownership check runs before input validation; (c) 28000 with error message BYTE-IDENTICAL to (b) -- proving no existence-enumeration oracle; (d) 22023. Only (b) and (c) would fail if the validation order were reversed.',
  },
  { id: 'TS-7a', scenario: 'Attempt to advance a venture past launch_readiness_gate with no usage-signal artifact present, via both fn_advance_venture_stage and checkStageArtifactPrecondition()', type: 'ddl', expected: 'Both block, naming the missing artifact_type' },
  { id: 'TS-7b', scenario: 'Submit a successful usage event for that same venture (producing the launch_usage_signal artifact), then repeat the advance attempt via both paths -- the activation half TS-7 omitted', type: 'ddl', expected: 'Both paths now permit the advance -- this is the full block-then-unblock activation-invariant chain, set as this PRD\'s activation_test_id once implemented' },
  {
    id: 'TS-8',
    scenario: "Source-pin producer test, following this repo's canonical-writer-preflight convention (tests/unit/canonical-writer-preflight-follow-wire-registered-001.test.js): read the migration file IN-TEST, normalize CRLF, assert the anchor text (the venture_artifacts INSERT literal for 'launch_usage_signal') is actually FOUND before asserting anything about it, then mutate it out in-memory and re-assert failure",
    type: 'unit',
    expected: "Test FAILS if the anchor is not found at all (proves the test isn't silently vacuous), FAILS when the producer INSERT is mutated out, PASSES when it is present -- a real mutation test, not a no-op",
  },
  { id: 'TS-10', scenario: 'Insert a properties payload exceeding 8000 octets via the RPC', type: 'ddl', expected: 'Row is stored with properties truncated and {truncated:true} merged in -- NOT rejected. A separate direct-insert test (bypassing the RPC) with an oversized properties value confirms the DB CHECK backstop exists and fires only in that bypass scenario.' },
];

const { error: updateErr } = await supabase
  .from('product_requirements_v2')
  .update({ functional_requirements: fr, test_scenarios: ts })
  .eq('id', PRD_ID);
if (updateErr) { console.error('UPDATE_FAILED', updateErr); process.exit(1); }

console.log('PRD_UPDATED', PRD_ID, 'FR_COUNT', fr.length, 'TS_COUNT', ts.length);
