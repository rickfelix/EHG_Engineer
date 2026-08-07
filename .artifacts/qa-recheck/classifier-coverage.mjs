import { createClient } from '@supabase/supabase-js';
import { questionClass, isAutomatedMessage } from '../../scripts/solomon/trend-eyes-sweep.mjs';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// POPULATION FIRST, then the sample. A capped fetch grouped in memory measures the cap.
const { count: total, error: cErr } = await sb.from('sms_relay_staging').select('*', { count: 'exact', head: true });
if (cErr) throw new Error('count failed: ' + cErr.message);
console.log(`POPULATION (exact count, head): ${total} rows in sms_relay_staging`);

// Paginate until fetched === total. Never trust one page.
const rows = [];
const PAGE = 500;
for (let off = 0; ; off += PAGE) {
  const { data, error } = await sb.from('sms_relay_staging')
    .select('id, body_raw, received_at, from_phone').order('received_at', { ascending: true })
    .range(off, off + PAGE - 1);
  if (error) throw new Error('page failed: ' + error.message);
  rows.push(...(data || []));
  if (!data || data.length < PAGE) break;
}
console.log(`FETCHED: ${rows.length} rows  (fetched===population: ${rows.length === total})`);

let automated = 0, classified = 0, unclassified = 0;
const byClass = new Map();
const unclassifiedSamples = [];
for (const r of rows) {
  if (isAutomatedMessage(r.body_raw)) { automated++; continue; }
  const c = questionClass(r.body_raw);
  if (!c) { unclassified++; if (unclassifiedSamples.length < 15) unclassifiedSamples.push(String(r.body_raw || '').slice(0, 90).replace(/\s+/g, ' ')); continue; }
  classified++;
  byClass.set(c, (byClass.get(c) || 0) + 1);
}
const nonAuto = rows.length - automated;
console.log(`\n== FULL POPULATION CLASSIFICATION ==`);
console.log(`  automated (watchdog, excluded): ${automated}`);
console.log(`  non-automated corpus:           ${nonAuto}`);
console.log(`  classified:                     ${classified}  (${(100*classified/nonAuto).toFixed(1)}% of non-automated, ${(100*classified/rows.length).toFixed(1)}% of all)`);
console.log(`  unclassified -> null:           ${unclassified}  (${(100*unclassified/nonAuto).toFixed(1)}% of non-automated, ${(100*unclassified/rows.length).toFixed(1)}% of all)`);
console.log(`\n  by class:`);
[...byClass.entries()].sort((a,b)=>b[1]-a[1]).forEach(([k,v]) => console.log(`    ${k.padEnd(18)} ${v}`));

// THE FOUNDING-CASE CHECK: of rows mentioning sms/text/message, how many get sms-coverage?
const mentions = rows.filter((r) => /\b(sms|texts?|messages?)\b/i.test(String(r.body_raw || '')));
const mentionsNonAuto = mentions.filter((r) => !isAutomatedMessage(r.body_raw));
const smsCov = mentionsNonAuto.filter((r) => questionClass(r.body_raw) === 'sms-coverage');
console.log(`\n== FOUNDING CASE (the prior measurement's 97-row cohort) ==`);
console.log(`  rows mentioning sms/text(s)/message(s):   ${mentions.length}`);
console.log(`  ...of which non-automated:                ${mentionsNonAuto.length}`);
console.log(`  ...assigned sms-coverage:                 ${smsCov.length}   (was ZERO before the fix)`);
const missedMentions = mentionsNonAuto.filter((r) => questionClass(r.body_raw) !== 'sms-coverage');
console.log(`  ...mentioning but NOT sms-coverage:       ${missedMentions.length}`);
missedMentions.slice(0, 8).forEach((r) => console.log(`      [${questionClass(r.body_raw) || 'null'}] ${String(r.body_raw||'').slice(0,80).replace(/\s+/g,' ')}`));

console.log(`\n== UNCLASSIFIED SAMPLES (what is still dropping) ==`);
unclassifiedSamples.forEach((s) => console.log(`    ${s}`));
