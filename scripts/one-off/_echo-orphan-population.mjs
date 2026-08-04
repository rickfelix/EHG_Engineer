// LEAD evidence for SD-LEO-INFRA-RELEASED-MID-PHASE-001.
// The SD names TWO rows. Acceptance (b) is population-scoped, so measure the POPULATION before
// believing the sample — a 2-row anecdote and a 40-row class need different remedies.
// Paginated deliberately: PostgREST caps an unbounded select at 1000 and truncates SILENTLY.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const db = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function pageAll(cols, apply) {
  const out = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    let q = db.from('strategic_directives_v2').select(cols).range(from, from + PAGE - 1);
    q = apply(q);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    out.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

// The class: active (not draft, not completed), mid-phase, and UNCLAIMED.
const rows = await pageAll(
  'sd_key,status,current_phase,claiming_session_id,is_working_on,metadata,updated_at',
  (q) => q.in('status', ['active', 'in_progress', 'pending_approval']).is('claiming_session_id', null)
);

console.log('unclaimed non-draft rows (paged):', rows.length);

const HOLD_KEYS = ['hold', 'on_hold', 'hold_reason', 'blocked_reason', 'parked', 'park_reason', 'deferred', 'defer_reason'];
const hasHold = (m) => {
  if (!m || typeof m !== 'object') return false;
  return HOLD_KEYS.some((k) => m[k] !== undefined && m[k] !== null && m[k] !== false && m[k] !== '');
};
const hasResumeHint = (m) => !!(m && (m.released_by_sweep || m.resume_hint || m.released_at || m.prior_claimant));

const invisible = rows.filter((r) => !hasHold(r.metadata) && !hasResumeHint(r.metadata));
const held = rows.filter((r) => hasHold(r.metadata));
const hinted = rows.filter((r) => hasResumeHint(r.metadata));

console.log('  with an explicit hold      :', held.length);
console.log('  with a resume hint         :', hinted.length);
console.log('  NEITHER (the orphan class) :', invisible.length, '  <-- acceptance (b) requires this to reach ZERO');

const byPhase = {};
for (const r of invisible) byPhase[`${r.status}/${r.current_phase}`] = (byPhase[`${r.status}/${r.current_phase}`] || 0) + 1;
console.log('\ninvisible rows by status/phase:');
for (const [k, v] of Object.entries(byPhase).sort((a, b) => b[1] - a[1])) console.log(`  ${v.toString().padStart(3)}  ${k}`);

console.log('\nthe two rows the SD names:');
for (const key of ['SD-FDBK-FIX-HEAL-BEFORE-COMPLETE-001', 'SD-FDBK-INFRA-CLAUDE-SOLOMON-EXCEEDS-001']) {
  const r = rows.find((x) => x.sd_key === key);
  console.log(`  ${key}: ${r ? `status=${r.status} phase=${r.current_phase} hold=${hasHold(r.metadata)} hint=${hasResumeHint(r.metadata)}` : 'NOT in the unclaimed set (claimed since, or status changed)'}`);
}

console.log('\noldest 8 invisible rows (staleness = how long work has been unseen):');
for (const r of invisible.sort((a, b) => String(a.updated_at).localeCompare(String(b.updated_at))).slice(0, 8)) {
  const days = ((Date.now() - Date.parse(r.updated_at)) / 86400000).toFixed(1);
  console.log(`  ${String(days).padStart(6)}d  ${r.status}/${r.current_phase}  ${r.sd_key}`);
}
