import { createClient } from '@supabase/supabase-js';
import { questionClass, isAutomatedMessage, resolveT1Facts } from '../../scripts/solomon/trend-eyes-sweep.mjs';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// The SD's founding specimen: the SMS-coverage question asked 2026-08-03 and again 2026-08-05.
const { data, error } = await sb.from('sms_relay_staging')
  .select('id, body_raw, received_at').gte('received_at', '2026-08-02T00:00:00Z')
  .lte('received_at', '2026-08-06T23:59:59Z').order('received_at', { ascending: true });
if (error) throw error;
console.log(`== INBOUND 08-02..08-06 (${data.length} rows) — the founding window ==`);
for (const r of data) {
  const b = String(r.body_raw || '').replace(/\s+/g, ' ');
  if (!/\b(sms|texts?|messages?|cover|reach|miss|through|deliver|receiv)\b/i.test(b)) continue;
  const auto = isAutomatedMessage(b);
  console.log(`  ${r.received_at}  auto=${auto ? 'Y' : 'n'}  class=${String(questionClass(b))}`);
  console.log(`      "${b.slice(0, 140)}"`);
}

// The ONE row in the entire corpus that does classify as sms-coverage
const { data: all } = await sb.from('sms_relay_staging').select('id, body_raw, received_at').order('received_at').range(0, 999);
const hits = all.filter((r) => !isAutomatedMessage(r.body_raw) && questionClass(r.body_raw) === 'sms-coverage');
console.log(`\n== EVERY sms-coverage HIT IN THE WHOLE CORPUS (${hits.length}) ==`);
hits.forEach((r) => console.log(`  ${r.received_at}  "${String(r.body_raw).replace(/\s+/g,' ').slice(0,140)}"`));

// What does the SWEEP actually cluster in its real 168h window?
const t1 = await resolveT1Facts(sb, { now: new Date() });
console.log(`\n== resolveT1Facts LIVE (168h window) ==`);
console.log('  coverage:', JSON.stringify(t1.coverage));
console.log('  clusters:', JSON.stringify(t1.clusters.map((c) => ({ cls: c.questionClass, n: c.occurrences.length })), null, 0));

// What the watchdog body actually looks like (does it mention sms/text?)
const auto = all.filter((r) => isAutomatedMessage(r.body_raw));
console.log(`\n== WATCHDOG SAMPLE (${auto.length} rows matched isAutomatedMessage) ==`);
console.log(`  "${String(auto[0]?.body_raw).replace(/\s+/g,' ').slice(0,200)}"`);
