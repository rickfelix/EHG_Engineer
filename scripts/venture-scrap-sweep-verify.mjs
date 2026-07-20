// QF-20260709-797: assert-zero completion check for venture scrap sweeps.
//
// The 2026-07-08 scrap-all cancelled ventures by ENUMERATED ID (sequential updates), so a
// venture missing from the enumeration (Proactora) stayed active SILENTLY — 35/36 looked done
// and nobody re-queried. This verifier is the durable guard: run it as the LAST step of ANY
// scrap sweep (scripted or ad-hoc). It re-queries the live table and exits non-zero listing
// every still-active venture, so an enumeration miss can never go silent again.
//
// Usage:
//   node scripts/venture-scrap-sweep-verify.mjs                    # assert ZERO active ventures
//   node scripts/venture-scrap-sweep-verify.mjs --allow <id[,id]>  # scrap-all-except: listed venture ids may stay active
//
// Exit codes: 0 = assertion holds; 1 = unexpected active ventures remain (listed on stdout);
//             2 = query error (verification could not run — treat as NOT verified).
import { createSupabaseServiceClient } from '../lib/supabase-client.js';
import { fetchAllPaginated } from '../lib/db/fetch-all-paginated.mjs';

const args = process.argv.slice(2);
const allowIdx = args.indexOf('--allow');
const allowed = new Set(allowIdx !== -1 && args[allowIdx + 1] ? args[allowIdx + 1].split(',').map((s) => s.trim()) : []);

// Canonical env-walking client (QF-20260504-755): finds the parent worktree's .env, so this
// verifier runs correctly from a manual `git worktree add` checkout too.
const supabase = createSupabaseServiceClient();

// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9: this is an assert-ZERO guard —
// a capped read would silently under-list still-active ventures beyond row 1000. Paginate.
let data;
try {
  data = await fetchAllPaginated(() => supabase
    .from('ventures')
    .select('id, name, status, updated_at')
    .eq('status', 'active')
    .order('id', { ascending: true }));
} catch (e) {
  console.error(`SCRAP-SWEEP-VERIFY: query error — sweep NOT verified: ${e.message}`);
  process.exit(2);
}

const unexpected = data.filter((v) => !allowed.has(v.id));
if (unexpected.length === 0) {
  console.log(`SCRAP-SWEEP-VERIFY: PASS — 0 unexpected active ventures${allowed.size ? ` (${allowed.size} allowed exception(s))` : ''}.`);
  process.exit(0);
}

console.error(`SCRAP-SWEEP-VERIFY: FAIL — ${unexpected.length} venture(s) STILL ACTIVE after the sweep:`);
for (const v of unexpected) {
  console.error(`  - ${v.id}  ${v.name}  (updated_at ${v.updated_at})`);
}
console.error('The sweep missed these (enumeration gap, fixture leak, or concurrent create). Cancel them and re-run this verifier.');
process.exit(1);
