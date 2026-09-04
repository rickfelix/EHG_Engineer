import { createClient } from '@supabase/supabase-js';
import { REQUIRED_SUBAGENTS } from '../scripts/modules/handoff/required-subagents.js';
import { validateSubagentEvidence } from '../scripts/modules/handoff/gates/subagent-evidence-gate.js';
console.log('REQUIRED_SUBAGENTS keys:', Object.keys(REQUIRED_SUBAGENTS).join(' | '));
console.log('LEAD-TO-PLAN required:', JSON.stringify(REQUIRED_SUBAGENTS['LEAD-TO-PLAN']));
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const KEY = 'SD-LEO-FIX-KPI-COUNTS-CHEAP-001';
const UUID = '0e12ecbe-da83-4c52-879c-6426997075d4';
for (const [label, sdId] of [['SD-KEY (what ENF-18 passes)', KEY], ['UUID (what preflight passes)', UUID]]) {
  console.log('\n=================== ' + label + ' : ' + sdId);
  const handoffType = 'LEAD-TO-PLAN';
  let r;
  try { r = await validateSubagentEvidence({ handoffType, sdId, supabase }, supabase); }
  catch (e) { console.log('THREW (ENF-18 would fail-open):', e.message); continue; }
  console.log('  passed =', r.passed, '| wait =', r.wait, '| reason =', r.details?.reason);
  console.log('  issues =', JSON.stringify(r.issues));
  const WOULD_BLOCK = r.passed === false && !r.wait;
  console.log('  >>> ENF-18 (passed===false && !wait) WOULD BLOCK? ', WOULD_BLOCK);
}
