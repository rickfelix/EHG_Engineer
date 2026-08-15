// REAL_CALLEE_ATTESTATION for SD-LEO-FEAT-PROVEN-BETTER-NEW-001 (gate is presence-only, non-blocking
// this increment -- see scripts/modules/handoff/executors/exec-to-plan/gates/real-callee-attestation.js).
// Names, for each cross-module call this SD's implementation introduced, the test that exercises the
// REAL (unmocked) callee -- verified by reading the actual test files, not asserted from memory.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-LEO-FEAT-PROVEN-BETTER-NEW-001'; // metadata lives on sd_key, id is a separate uuid PK

const { data: current, error: fetchErr } = await supabase.from('strategic_directives_v2')
  .select('metadata').eq('sd_key', SD_KEY).maybeSingle();
if (fetchErr) throw fetchErr;
if (!current) throw new Error(`No SD found for sd_key=${SD_KEY}`);

const real_callee_attestation = {
  'pbn-integration.js:runPbnGate -> pbn-scoring.js:scorePbnBuckets, pbn-gate.js:buildPbnVerdict, venture-nursery.js:recordNurseryEvaluation':
    'tests/unit/eva/stage-zero/pbn-integration.test.js -- calls the real chain unmocked; only the true I/O boundary (llmClient, supabase) is dependency-injected.',
  'chairman-review.js:persistVentureBrief -> pbn-integration.js:runPbnGate':
    'tests/unit/eva/stage-zero/pbn-gate-flow.test.js mocks runPbnGate to isolate the caller (chairman-review.js orchestration); the real runPbnGate side of this same edge is covered separately by pbn-integration.test.js above, not by this flow test.',
  'venture-nursery.js:recordNurseryEvaluation (direct)':
    'tests/unit/eva/stage-zero/venture-nursery.test.js exercises the function directly; also reached unmocked as the terminal callee inside pbn-integration.test.js.',
};

const metadata = { ...(current.metadata || {}), real_callee_attestation };

const { data: updated, error: updateErr } = await supabase.from('strategic_directives_v2')
  .update({ metadata })
  .eq('sd_key', SD_KEY)
  .select('sd_key, metadata').maybeSingle();
if (updateErr) throw updateErr;
console.log('real_callee_attestation set, keys:', Object.keys(updated.metadata.real_callee_attestation));
