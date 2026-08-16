// SD-LEO-INFRA-LEAD-FINAL-CASCADE-ISOLATION-001 -- REAL_CALLEE_ATTESTATION (EXEC-TO-PLAN,
// non-blocking this increment, content never judged -- presence only). Writing a genuine,
// honest attestation rather than "none" since I have real answers, including one real gap
// (handleExecuteCommand) named plainly rather than glossed over -- matching the gate's own
// stated purpose (SD-PAT-FIX-STUBBED-WRITER-BLINDNESS-001 FR-1).
//
// Merges into strategic_directives_v2.metadata (read-modify-write) -- never overwrites the
// whole jsonb column.

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_ID = '86a0cc7f-169e-407a-8905-0d103f40b801';

const attestation = [
  {
    callee: 'classifyAllDispatchIneligibility + CLAIM_WRITE_FENCE_AXES (lib/fleet/claim-eligibility.cjs)',
    called_from: 'selectNextSD, findNextAvailableOrchestrator, getNextReadyChild, getReadyChildren',
    tested_by: 'tests/unit/handoff/queue-selector.test.js, orchestrator-completion-hook.test.js (authority fence describe blocks), child-sd-selector.test.js (authority fence FR-6/S2 describe blocks) -- all import and call the REAL claim-eligibility.cjs functions against fixture rows, never mocked/stubbed',
  },
  {
    callee: 'printHandoffResultLines + runWithGuaranteedReprint (execution-helpers.js)',
    called_from: 'cli-main.js handleExecuteWithContinuation',
    tested_by: 'tests/unit/handoff/execution-helpers-guaranteed-reprint.test.js calls the REAL runWithGuaranteedReprint with fake body/reprintFn; cli-main-cascade-reprint-wiring.test.js statically verifies the actual wiring against real source text',
  },
  {
    callee: 'handleExecuteCommand (cli-main.js, called from within handleExecuteWithContinuationLoop at 4 cascade sites)',
    called_from: "handleExecuteWithContinuation's cascade loop",
    tested_by: 'none -- UNTESTED via unit test. Bare lexical intra-module reference; vi.mock cannot intercept a same-module direct call (precedent: tests/unit/handoff/standalone-sd-chaining.test.js claims to test this but never imports cli-main.js). Coverage substitute: static source-text verification that the 4 real call sites exist, are correctly ordered, and are paired with cascadeAttempted=true + the AUTO-CHAIN ATTEMPT delimiter -- proves wiring correctness, not runtime behavior of handleExecuteCommand itself.',
  },
  {
    callee: 'fetchAllPaginated (lib/db/fetch-all-paginated.mjs, claimed-session pagination)',
    called_from: 'selectNextSD, findNextAvailableOrchestrator',
    tested_by: "queue-selector.test.js's makeChainableQuery mock explicitly includes .range() (whose absence causes a documented fail-open blind spot in this codebase's Supabase mocks), so the real fetchAllPaginated code path is exercised, not silently bypassed",
  },
];

const { data: sd, error: fetchErr } = await supabase
  .from('strategic_directives_v2')
  .select('metadata')
  .eq('id', SD_ID)
  .single();

if (fetchErr) {
  console.error('FETCH_ERROR', fetchErr.message);
  process.exit(1);
}

const mergedMetadata = { ...(sd.metadata || {}), real_callee_attestation: attestation };

const { error: updateErr } = await supabase
  .from('strategic_directives_v2')
  .update({ metadata: mergedMetadata })
  .eq('id', SD_ID);

if (updateErr) {
  console.error('UPDATE_ERROR', updateErr.message);
  process.exit(1);
}

console.log('ATTESTATION_SET', SD_ID, 'entries:', attestation.length);
