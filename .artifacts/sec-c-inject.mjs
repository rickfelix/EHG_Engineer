import dotenv from 'dotenv';
dotenv.config();
import { createSupabaseServiceClient } from '../lib/supabase-client.js';
const sb = createSupabaseServiceClient();

// ---- A. Prove what URL the shipped filters actually generate (no await = no request) ----
const show = (label, b) => console.log(`\n[${label}]\n  ${decodeURIComponent(b.url.search)}\n  RAW: ${b.url.search}`);

const nowIso = new Date().toISOString();
show('shipped assist-engine .or()', sb.from('v_feedback_with_sensemaking').select('*')
  .not('status','in','(resolved,wont_fix,shipped,snoozed,invalid)')
  .or(`snoozed_until.is.null,snoozed_until.lte.${nowIso}`));

show('shipped getSnoozedItems (no userId)', sb.from('feedback').select('*')
  .eq('metadata->snooze->>active','true').gt('snoozed_until', nowIso));

// ---- B. ATTEMPT injection through options.userId (the only caller-controlled value) ----
const payloads = {
  'add-new-param':      'x&limit=1',
  'or-tree-breakout':   "x&or=(id.not.is.null)",
  'comma-in-value':     'x,id.not.is.null',
  'paren-breakout':     "x)&and=(id.not.is.null",
  'operator-swap':      'x&metadata->snooze->>snoozed_by=neq.zzz',
  'sql-ish':            "x' OR 1=1--",
  'null-byte-ish':      'x%00y',
};
for (const [name, p] of Object.entries(payloads)) {
  const b = sb.from('feedback').select('*')
    .eq('metadata->snooze->>active','true').gt('snoozed_until', nowIso)
    .eq('metadata->snooze->>snoozed_by', p);
  const params = [...b.url.searchParams.keys()];
  console.log(`\n[inject:${name}] payload=${JSON.stringify(p)}`);
  console.log(`  param COUNT=${params.length} keys=${JSON.stringify(params)}`);
  console.log(`  RAW: ${b.url.search}`);
}

// ---- C. EXECUTE against live DB: shipped filters + negative controls ----
const run = async (label, p) => {
  const { data, error } = await p;
  console.log(`\n[exec:${label}] ${error ? 'ERROR ' + error.code + ': ' + error.message : 'OK rows=' + data.length}`);
};
await run('shipped .or() on view', sb.from('v_feedback_with_sensemaking').select('id')
  .or(`snoozed_until.is.null,snoozed_until.lte.${nowIso}`).limit(3));
await run('NEGATIVE CONTROL malformed .or()', sb.from('v_feedback_with_sensemaking').select('id')
  .or('snoozed_until.is.null,,,snoozed_until.lte.((').limit(3));
await run('shipped 2-level metadata eq', sb.from('feedback').select('id')
  .eq('metadata->snooze->>active','true').gt('snoozed_until', nowIso).limit(3));
await run('NEGATIVE CONTROL bad column path', sb.from('feedback').select('id')
  .eq('metadata->>->>snooze','true').limit(3));
await run('injected userId (or-tree-breakout)', sb.from('feedback').select('id')
  .eq('metadata->snooze->>active','true').eq('metadata->snooze->>snoozed_by', 'x&or=(id.not.is.null)').limit(3));
