#!/usr/bin/env node
/**
 * Records the mechanism-claim verifiers for SD-LEO-FIX-CHILD-TAIL-CHAIRMAN-001's corrected spine,
 * per GATE_MECHANISM_CLAIM_VERIFIER's contract (scripts/modules/handoff/executors/lead-to-plan/
 * gates/mechanism-claim-verifier.js). Read-modify-write on metadata -- never clobber existing keys.
 */
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';

const SD_KEY = 'SD-LEO-FIX-CHILD-TAIL-CHAIRMAN-001';
const supabase = await getSupabaseClient();

const { data: existing, error: readError } = await supabase
  .from('strategic_directives_v2')
  .select('metadata')
  .eq('sd_key', SD_KEY)
  .single();
if (readError) { console.error('READ FAILED:', readError.message); process.exit(1); }

const mechanism_verifications = [
  { verified_by: 'Explore sub-agent (sub_agent_execution_results b6299fa0-ddd6-416a-b2d1-32e0e1900085)', verified_at: 'lib/chairman/chairman-actionable.mjs:41' },
  { verified_by: 'Explore sub-agent (sub_agent_execution_results b6299fa0-ddd6-416a-b2d1-32e0e1900085)', verified_at: 'database/migrations/20260717_extend_fixture_patterns_get_pending_chairman_items.sql:51' },
  { verified_by: 'Explore sub-agent (sub_agent_execution_results b6299fa0-ddd6-416a-b2d1-32e0e1900085)', verified_at: 'lib/governance/fixture-exclusion.mjs:81' },
  { verified_by: 'Explore sub-agent (sub_agent_execution_results b6299fa0-ddd6-416a-b2d1-32e0e1900085)', verified_at: 'tests/unit/chairman/fixture-pattern-parity.test.js:24' },
  { verified_by: 'validation-agent (sub_agent_execution_results 222a077c-6af1-46b1-8612-930c20e3d966)', verified_at: 'scripts/adam-decision-email.mjs:24' },
  { verified_by: 'validation-agent (sub_agent_execution_results 222a077c-6af1-46b1-8612-930c20e3d966)', verified_at: 'lib/chairman/record-pending-decision.mjs:26' },
  { verified_by: 'validation-agent (sub_agent_execution_results 222a077c-6af1-46b1-8612-930c20e3d966)', verified_at: 'tests/integration/get-pending-chairman-items.contract.test.js:24' },
];

const mergedMetadata = { ...(existing?.metadata || {}), mechanism_verifications };

const { data, error } = await supabase
  .from('strategic_directives_v2')
  .update({ metadata: mergedMetadata, updated_at: new Date().toISOString() })
  .eq('sd_key', SD_KEY)
  .select('sd_key, metadata')
  .maybeSingle();
if (error) { console.error('UPDATE FAILED:', error.message); process.exit(1); }
if (!data) { console.error('UPDATE MATCHED ZERO ROWS'); process.exit(1); }
console.log('mechanism_verifications written:', data.metadata.mechanism_verifications.length);
console.log('metadata keys preserved:', Object.keys(data.metadata).length);
