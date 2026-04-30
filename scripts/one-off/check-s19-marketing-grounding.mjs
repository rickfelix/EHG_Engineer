import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const ventureId = '94856fc6-9ba9-4f56-9a5c-85041031a0fc';

const { data } = await sb
  .from('venture_artifacts')
  .select('artifact_data, created_at, version')
  .eq('venture_id', ventureId)
  .eq('artifact_type', 'blueprint_sprint_plan')
  .eq('is_current', true)
  .limit(1);

const sp = data?.[0]?.artifact_data;
if (!sp) {
  console.log('no sprint plan yet');
  process.exit(0);
}

console.log(`current is_current sprint plan v${data[0].version} @ ${data[0].created_at}`);
console.log('');

const fullText = JSON.stringify(sp).toLowerCase();

// Marketing-copy-specific phrases that would ONLY appear if S19 read from S18.
// These are exact strings from the LexiGuard marketing copy in venture_artifacts.
const checks = [
  'ai legal counsel',
  'smarter software contracts',
  'analyze contract free',
  'finally, legal contracts',
  'built for developers',
  'devan',
  'persona_target',
  'legal contracts built',
  'lexiguard',
];

console.log('Cross-reference (marketing-copy-specific phrases in sprint plan):');
let hits = 0;
for (const term of checks) {
  let count = 0;
  let idx = 0;
  while ((idx = fullText.indexOf(term, idx)) !== -1) {
    count++;
    idx += term.length;
  }
  if (count > 0) hits++;
  console.log(`  ${term.padEnd(35)} ${count}`);
}

console.log('');
console.log('Sample item titles:');
for (const item of (sp.items || []).slice(0, 7)) {
  console.log(`  - ${item.title}`);
}

console.log('');
console.log('Sprint goal:');
console.log(`  ${sp.sprint_goal}`);

console.log('');
console.log(`Hit count: ${hits}/${checks.length} marketing-copy-specific phrases`);
console.log(hits > 0 ? '✓ Sprint plan is now grounded in approved marketing copy.' : '✗ Sprint plan does NOT reference approved marketing copy.');
