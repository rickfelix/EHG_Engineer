import 'dotenv/config';
import { createSupabaseServiceClient } from '../lib/supabase-client.js';
const sb = createSupabaseServiceClient();

const WINDOW_START = '2026-09-14T02:46:00Z';
const WINDOW_END = '2026-09-14T02:48:00Z';

// 1. All rows carrying the backfill provenance marker
const marked = [];
let lastId = null;
for (;;) {
  let q = sb.from('product_requirements_v2').select('id, metadata')
    .not('metadata->integration_backfill', 'is', null)
    .order('id', { ascending: true }).limit(1000);
  if (lastId) q = q.gt('id', lastId);
  const { data, error } = await q;
  if (error) { console.log('ERR', error.message); break; }
  if (!data || !data.length) break;
  marked.push(...data);
  lastId = data[data.length - 1].id;
  if (data.length < 1000) break;
}
const unrestored = marked.filter(r => Object.keys(r.metadata || {}).length === 1);
const restored = marked.filter(r => Object.keys(r.metadata || {}).length > 1);
console.log(`marked rows: ${marked.length} | only-provenance-key (unrestored): ${unrestored.length} | multi-key (restored): ${restored.length}`);

// 2. Blast radius from the audit log: how many of the marked rows had a NON-EMPTY
//    pre-backfill metadata (i.e. actually lost keys)?
let withPreImage = 0, lostKeysTotal = 0, noAuditRow = 0, emptyPrior = 0;
const perRowPrior = new Map();
for (const r of marked) {
  const { data, error } = await sb.from('governance_audit_log')
    .select('old_values, changed_at')
    .eq('table_name', 'product_requirements_v2').eq('record_id', r.id).eq('operation', 'UPDATE')
    .gte('changed_at', WINDOW_START).lte('changed_at', WINDOW_END)
    .order('changed_at', { ascending: true }).limit(1);
  if (error) { console.log('audit err', error.message); break; }
  const prior = data?.[0]?.old_values?.metadata;
  if (!data || data.length === 0) { noAuditRow++; continue; }
  const priorKeys = Object.keys(prior || {});
  perRowPrior.set(r.id, prior || {});
  if (priorKeys.length === 0) { emptyPrior++; continue; }
  withPreImage++;
  lostKeysTotal += priorKeys.length;
}
console.log(`audit pre-images: rows-with-non-empty-prior-metadata (true blast radius) = ${withPreImage}, keys destroyed = ${lostKeysTotal}`);
console.log(`rows whose prior metadata was genuinely EMPTY (no loss) = ${emptyPrior}; rows with NO audit row in window = ${noAuditRow}`);

// 3. Containment check: every restored row must currently CONTAIN its pre-image
let contained = 0, notContained = 0;
const violations = [];
for (const r of restored) {
  const prior = perRowPrior.get(r.id);
  if (!prior) continue;
  const cur = r.metadata || {};
  const missing = Object.keys(prior).filter(k => !(k in cur));
  if (missing.length === 0) contained++;
  else { notContained++; if (violations.length < 5) violations.push({ id: r.id, missing }); }
}
console.log(`containment (metadata superset of pre-image): ok=${contained} violated=${notContained}`);
if (violations.length) console.log('violations:', JSON.stringify(violations, null, 2));

// 4. The still-unrestored rows: do they have recoverable pre-images, and what SD status?
const stillLost = unrestored.filter(r => (Object.keys(perRowPrior.get(r.id) || {}).length > 0));
console.log(`\nSTILL UNRESTORED with real data to recover: ${stillLost.length}`);
console.log('ids:', stillLost.map(r => r.id).slice(0, 25).join(', '));
if (stillLost.length) {
  const { data: prds } = await sb.from('product_requirements_v2').select('id, sd_id').in('id', stillLost.map(r => r.id));
  const sdIds = [...new Set((prds || []).map(p => p.sd_id).filter(Boolean))];
  const { data: sds } = await sb.from('strategic_directives_v2').select('id, sd_key, status').in('id', sdIds);
  const f = {};
  for (const s of sds || []) f[s.status] = (f[s.status] || 0) + 1;
  console.log('owning SD status:', JSON.stringify(f));
  console.log('keys still missing per row:', stillLost.slice(0, 5).map(r => `${r.id}: ${Object.keys(perRowPrior.get(r.id)).join('|')}`).join('\n  '));
}
