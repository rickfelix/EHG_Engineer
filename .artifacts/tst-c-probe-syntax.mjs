// READ-ONLY probe of the exact PostgREST filter syntax shipped in 4e7a170d2c2.
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);

const now = new Date().toISOString();
const results = [];

async function probe(label, fn) {
  try {
    const { data, error } = await fn();
    if (error) { results.push({ label, ok: false, err: `${error.code || ''} ${error.message}`, hint: error.hint, details: error.details }); }
    else { results.push({ label, ok: true, rows: Array.isArray(data) ? data.length : (data ? 1 : 0) }); }
  } catch (e) { results.push({ label, ok: false, err: 'THREW: ' + e.message }); }
}

// P1: exact assist-engine.js:295 .or() clause
await probe('P1 assist-engine .or(snoozed_until.is.null,snoozed_until.lte.<iso>)', () =>
  supabase.from('feedback').select('id').or(`snoozed_until.is.null,snoozed_until.lte.${now}`).limit(2));

// P1b: same clause CHAINED after the existing .not() exactly as shipped
await probe('P1b .not(status,in,...) THEN .or(...)  [shipped chain order]', () =>
  supabase.from('feedback').select('id,status,snoozed_until')
    .not('status', 'in', '(resolved,wont_fix,shipped,snoozed,invalid)')
    .or(`snoozed_until.is.null,snoozed_until.lte.${now}`).limit(2));

// P2: exact snooze-manager two-level nested filter, wakeExpiredSnoozes
await probe('P2 .eq(metadata->snooze->>active,true).lt(snoozed_until,now)', () =>
  supabase.from('feedback').select('id,title').eq('metadata->snooze->>active', 'true').lt('snoozed_until', now).limit(2));

// P3: exact getSnoozedItems userId filter
await probe('P3 .eq(metadata->snooze->>snoozed_by,<val>)', () =>
  supabase.from('feedback').select('id').eq('metadata->snooze->>active', 'true').eq('metadata->snooze->>snoozed_by', 'probe-nobody').limit(2));

// P4: NEGATIVE CONTROL - deliberately malformed nested path; MUST error, proving P2/P3 success is real parsing not silent-pass
await probe('P4 NEGATIVE CONTROL .eq(metadata->>->snooze,x) [must FAIL]', () =>
  supabase.from('feedback').select('id').eq('metadata->>->snooze', 'x').limit(1));

// P5: NEGATIVE CONTROL - malformed .or(); MUST error
await probe('P5 NEGATIVE CONTROL .or(snoozed_until.bogusop.1) [must FAIL]', () =>
  supabase.from('feedback').select('id').or('snoozed_until.bogusop.1').limit(1));

// P6: semantic check - does .or() actually discriminate? count future-snoozed rows
const { count: futureCount, error: fcErr } = await supabase.from('feedback')
  .select('id', { count: 'exact', head: true }).gt('snoozed_until', now);
const { count: totalCount, error: tcErr } = await supabase.from('feedback')
  .select('id', { count: 'exact', head: true });
const { count: passCount, error: pcErr } = await supabase.from('feedback')
  .select('id', { count: 'exact', head: true }).or(`snoozed_until.is.null,snoozed_until.lte.${now}`);

console.log(JSON.stringify({ probes: results, census: {
  total: totalCount, totalErr: tcErr?.message || null,
  future_snoozed_excluded_by_filter: futureCount, futureErr: fcErr?.message || null,
  rows_passing_or_filter: passCount, passErr: pcErr?.message || null,
  arithmetic_consistent: (totalCount != null && futureCount != null && passCount != null) ? (totalCount - futureCount === passCount) : 'indeterminate'
}}, null, 2));
