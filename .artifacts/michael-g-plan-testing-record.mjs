#!/usr/bin/env node
// Records the PLAN-TO-EXEC TESTING strategy-review evidence for child -G and folds the
// review's corrections into metadata.lead_design_notes for EXEC to follow.
import { storeSubAgentResults } from '../lib/sub-agent-executor/results-storage.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../lib/sub-agents/resolve-repo.js';
import { getSupabaseClient } from '../lib/sub-agent-executor/supabase-client.js';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const SD_KEY = 'SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-G';

async function main() {
  const db = await getSupabaseClient();
  const resolution = await resolveSubAgentRepo({ sdId: SD_KEY, targetApplication: null, subAgentCode: 'TESTING', supabase: db });
  const results = {
    verdict: 'WARNING',
    confidence: 80,
    summary: "Test-strategy review of the 7 PRD test_scenarios before EXEC starts. TS-1/3/4/7 sound. TS-2 (drain-set parity) found NON-ENFORCING as written: tests/unit/fleet/drain-set-registry.test.js's role-parity loop excludes 'michael' entirely, so it would pass unchanged even with a missing/wrong FR-3 migration — must add 'michael' to the loop and the migration-path list. TS-5 (lane-lint) found TAUTOLOGICAL: isUntypedRow only checks kind presence, so it passes trivially before any FR lands; re-point at michael-inbox.cjs's orphan predicate instead (must be drained, not orphan-surfaced). TS-6 (encode script) under-specified on 3 fixture-shape points: must export a pure planner (not a top-level-client script), 'no-op on re-run' must mean clean exit 0 on already-encoded content (not throw-on-0-occurrences like the precedent), and the dual-target write must be verified non-transactional-safe via a call-recording client asserting zero updates when either target's marker count is wrong. Two acceptance criteria (FR-5 AC-2 require-without-MODULE_NOT_FOUND, FR-6 AC-3 no-live-ratification-call) have no dedicated scenario and should get one.",
    findings: [
      "TS-2 must add 'michael' to drain-set-registry.test.js's role-parity loop and RECONCILIATION_MIGRATION_PATHS, or it silently passes with FR-3 absent/wrong",
      "TS-5 must assert drain-not-orphan-surfaced via scripts/michael-inbox.cjs's orphan predicate, not the untyped_row check which is trivially true regardless of registration",
      "TS-6 needs a pure, injectable planner function (not a top-level-client script), a corrected no-op semantic (exit 0 on already-encoded, not throw), and a call-recording client proving zero writes on a marker-count mismatch in either target",
      "Regression gates EXEC must run: tests/unit/governance/gauge-registry.test.js, tests/unit/fleet/drain-set-registry.test.js, tests/unit/coordinator-dispatch-addressee-role-precondition.test.js, tests/unit/comms-delivery-contract-typed-kind.test.js, tests/static-guards/drain-set-registry-readers.test.js, tests/unit/fleet/drain-sets-send-warn.test.js, tests/unit/fleet/drain-sets-adam-reconciliation.test.js, tests/unit/coordination/lane-lint-gauge.test.js, tests/unit/governance/drain-inventory.test.js, tests/unit/governance/revisit-tags.test.js, tests/integration/coverage-matrix.test.js"
    ],
    metadata: {
      recorded_by: 'scripts one-off transcription (michael-g-plan-testing-record.mjs), family pattern established at children E/F',
      producer_note: 'Transcribes the independent findings of Task-tool testing-agent a2311426206eee3aa; strategy review only, nothing built yet.'
    }
  };
  applySubAgentRepoVerdict(results, resolution);
  const stored = await storeSubAgentResults('TESTING', SD_KEY, null, results, { phase: 'PLAN' });
  console.log('TESTING evidence stored:', stored.id);

  // Fold EXEC-time conditions into metadata.lead_design_notes.
  const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: existing, error: readErr } = await supabase.from('strategic_directives_v2').select('metadata').eq('sd_key', SD_KEY).single();
  if (readErr) { console.error('READ_FAILED', readErr); process.exit(1); }
  const metadata = {
    ...existing.metadata,
    lead_design_notes: {
      ...(existing.metadata.lead_design_notes || {}),
      exec_time_conditions_from_testing_review: {
        recorded_at: new Date().toISOString(),
        recorded_via: 'testing-agent:a2311426206eee3aa PLAN-TO-EXEC strategy review',
        conditions: [
          "TS-2 (FR-3 parity): add 'michael' to drain-set-registry.test.js's role-parity loop and to RECONCILIATION_MIGRATION_PATHS — the loop as written silently excludes michael",
          "TS-5 (FR-2/FR-3 lane-lint condition): assert via scripts/michael-inbox.cjs's own orphan predicate that a michael_handoff row is drained, not orphan-surfaced — the untyped_row check alone is tautologically true before any FR lands",
          "TS-6 (FR-6 encode script): export a pure planner function taking injected sections/client (not a top-level-client script like the precedent); 'idempotent second run' means clean exit 0 on already-encoded content, not the precedent's throw-on-0-occurrences; verify via a call-recording client that zero writes occur when either target's marker count is not exactly 1",
          "add a scenario for FR-5 AC-2 (require('./scripts/michael-inbox.cjs') from michael-register.cjs's exact call site succeeds, no MODULE_NOT_FOUND)",
          "add a scenario for FR-6 AC-3 (static grep/AST guard: no code path in this child's tests or scripts calls recordChairmanRatification against a live client)",
          "run the 11 regression-gate test files listed in the TESTING evidence row before considering EXEC done, not just the 7 PRD-listed TS scenarios"
        ]
      }
    }
  };
  const { error: updateErr } = await supabase.from('strategic_directives_v2').update({ metadata }).eq('sd_key', SD_KEY);
  if (updateErr) { console.error('METADATA_UPDATE_FAILED', updateErr); process.exit(1); }
  console.log('metadata.lead_design_notes.exec_time_conditions_from_testing_review recorded.');
}

main();
