// SAFE PROBE — does a rejected UPDATE surface distinguishably from a 0-row (CAS-lost) UPDATE via supabase-js?
// Safety: every write below sets status='zzz_invalid_probe', which violates
// strategic_directives_v2_status_check (allowlist of 9 values). The statement therefore CANNOT commit
// under any outcome -- it either aborts in a BEFORE trigger or aborts at the CHECK. No row is ever mutated.
import { createSupabaseServiceClient } from '../lib/supabase-connection.js';

const sb = await createSupabaseServiceClient('engineer');
const INVALID = 'zzz_invalid_probe';

const { data: target } = await sb
  .from('strategic_directives_v2')
  .select('id, sd_key, status, updated_at')
  .eq('status', 'completed')
  .limit(1)
  .maybeSingle();

if (!target) { console.log('NO TARGET ROW'); process.exit(1); }
console.log('TARGET id=' + target.id + ' sd_key=' + target.sd_key + ' status=' + target.status);
console.log('');

const show = (label, { data, error }) => {
  console.log('### ' + label);
  console.log('   error       = ' + (error ? JSON.stringify({ code: error.code, message: String(error.message).slice(0, 110) }) : 'null'));
  console.log('   data        = ' + JSON.stringify(data));
  console.log('   Array?      = ' + Array.isArray(data) + '   length = ' + (Array.isArray(data) ? data.length : 'n/a'));
  console.log('   won-style   = ' + (Array.isArray(data) && data.length > 0));
  console.log('');
};

// CELL A — row MATCHES the predicate, write is rejected. Does it error, or silently return 0 rows?
show('A. REJECTED write, row matches (.eq id only) + .select("id")',
  await sb.from('strategic_directives_v2').update({ status: INVALID }).eq('id', target.id).select('id'));

// CELL B — CAS predicate EXCLUDES the row: no trigger fires, no constraint evaluated.
show('B. CAS-LOST (.eq status=__nonexistent__) + .select("id")',
  await sb.from('strategic_directives_v2').update({ status: INVALID }).eq('id', target.id).eq('status', '__nonexistent__').select('id'));

// CELL C — cas-completion.js's exact shape: rejected write that DOES match the CAS predicate.
show('C. REJECTED write that MATCHES the CAS predicate (.eq status=completed) + .select("id")',
  await sb.from('strategic_directives_v2').update({ status: INVALID }).eq('id', target.id).eq('status', target.status).select('id'));

// CELL D — no .select() (orchestrator-terminal-guard.js / skip-and-continue.js shape), rejected.
show('D. REJECTED write, NO .select()',
  await sb.from('strategic_directives_v2').update({ status: INVALID }).eq('id', target.id));

// CELL E — no .select(), CAS lost.
show('E. CAS-LOST, NO .select()',
  await sb.from('strategic_directives_v2').update({ status: INVALID }).eq('id', target.id).eq('status', '__nonexistent__'));

// CELL F — skip-and-continue.js's optimistic-lock shape: stale updated_at excludes the row.
show('F. OPTIMISTIC-LOCK MISS (.eq updated_at = stale), NO .select()',
  await sb.from('strategic_directives_v2').update({ status: INVALID }).eq('id', target.id).eq('updated_at', '1999-01-01T00:00:00Z'));

// Does an error message ever contain the literal substring skip-and-continue.js matches on?
const { error: probeErr } = await sb.from('strategic_directives_v2').update({ status: INVALID }).eq('id', target.id);
console.log('### skip-and-continue.js discriminator check');
console.log('   error.message              = ' + (probeErr ? String(probeErr.message) : 'null'));
console.log('   message.includes("0 rows") = ' + (probeErr ? String(probeErr.message).includes('0 rows') : 'n/a'));
console.log('');

// Confirm the target row was never mutated.
const { data: after } = await sb.from('strategic_directives_v2').select('status, updated_at').eq('id', target.id).maybeSingle();
console.log('### SAFETY VERIFICATION');
console.log('   status before = ' + target.status + '   after = ' + after?.status);
console.log('   updated_at unchanged = ' + (after?.updated_at === target.updated_at));
console.log('   ROW MUTATED = ' + (after?.status !== target.status || after?.updated_at !== target.updated_at));
