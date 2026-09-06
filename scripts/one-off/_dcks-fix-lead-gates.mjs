import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const SD_KEY = 'SD-LEO-INFRA-DURABLE-CHAIRMAN-KEYSTROKE-001';

const mechanism_verifications = [
  { verified_at: 'lib/chairman/classifier-denial-guard.mjs:80', verified_by: 'lead-explore-evidence (unit test: records a chairman_approval row for an ungated SD declaring a NOT_APPLIED migration)' },
  { verified_at: 'lib/chairman/classifier-denial-guard.mjs:143', verified_by: 'lead-explore-evidence (unit test: verifies a migration_apply_wait approval and resolves the covering completion-flag row)' },
  { verified_at: 'scripts/adam-quiet-tick.mjs:1640', verified_by: 'lead-explore-evidence (node --check passed; wired alongside the existing chairman-gated-decision-row-guard call)' },
  { verified_at: 'scripts/adam-startup-check.mjs:102', verified_by: 'lead-explore-evidence (node scripts/lint/quiet-tick-token-parity-lint.mjs: 0 drift)' },
  { verified_at: 'scripts/chairman-decisions.mjs:176', verified_by: 'lead-explore-evidence (node --check passed; bridge added to the same trigger point as the two existing bridges)' },
  { verified_at: 'tests/unit/chairman/classifier-denial-guard.test.js:1', verified_by: 'lead-explore-evidence (npx vitest run: 9/9 passing)' },
  { verified_at: 'complete-quick-fix.js measurement (QF-20260906-881)', verified_by: 'lead-explore-evidence (net source LOC 183 > 75 cap, correctly routed to this SD wrapper)' },
];

// Read-then-write on a shared JSONB column races a concurrent metadata writer (this repo runs
// many parallel sessions). Guarded with an updated_at compare-and-swap: retry the read+merge if
// another writer landed between fetch and update, instead of silently clobbering it.
let done = false;
for (let attempt = 0; attempt < 5 && !done; attempt++) {
  const { data: sd, error: readErr } = await supabase
    .from('strategic_directives_v2')
    .select('id, metadata, updated_at')
    .eq('sd_key', SD_KEY)
    .maybeSingle();
  if (readErr) { console.error(readErr); process.exit(1); }

  const metadata = { ...(sd.metadata || {}), mechanism_verifications };

  const { data: updated, error: writeErr } = await supabase
    .from('strategic_directives_v2')
    .update({ metadata })
    .eq('id', sd.id)
    .eq('updated_at', sd.updated_at)
    .select('id');
  if (writeErr) { console.error('WRITE ERROR', writeErr); process.exit(1); }
  if (updated && updated.length > 0) {
    done = true;
    console.log('SD-LEO-INFRA-DURABLE-CHAIRMAN-KEYSTROKE-001 enriched: metadata.mechanism_verifications.');
  } else {
    console.log(`   [CAS] updated_at changed since read (attempt ${attempt + 1}/5) -- retrying`);
  }
}
if (!done) { console.error('CAS retries exhausted -- another writer keeps winning the race'); process.exit(1); }
