#!/usr/bin/env node
/**
 * SD-LEO-INFRA-AUDIT-LOG-MUTATION-BLIND-001 — FR-4 (amplification) and FR-5 (coverage).
 *
 * Two questions about audit_log that nobody could answer without reading 232k rows:
 *
 *   COVERAGE (FR-5)      how much of the table records a state MUTATION rather than a creation?
 *                        old_value is the discriminator — a creation advisory has no prior value.
 *                        Baseline at 2026-08-02: 388 of 232,811 rows = 0.167%.
 *
 *   AMPLIFICATION (FR-4) how many advisory rows does one entity generate? The trigger is
 *                        AFTER INSERT, so the honest ratio is ~1 per created SD. Measured: 5,519
 *                        SDs against 214,099 advisories = 38.8 each, and ONE key with 9,728 rows
 *                        that has ZERO rows in strategic_directives_v2.
 *
 * DELIBERATELY REPORT-ONLY. This does not delete, dedupe or quieten anything. The advisory is
 * correctly reporting real, repeated, provenance-less inserts; muting it would destroy the evidence
 * of an active defect while leaving the defect running (see TR-4 — the Stage-20 producer already
 * has four downstream workarounds and no fix).
 *
 * Usage: node scripts/audit-log-coverage.mjs [--top N]
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const TOP = (() => {
  const i = process.argv.indexOf('--top');
  const n = i > -1 ? Number(process.argv[i + 1]) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.min(n, 50) : 10;
})();

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const head = { count: 'exact', head: true };
const pct = (n, d) => (d ? ((n / d) * 100).toFixed(3) : '0.000');

/** Exact count — never a select().length, which silently caps at the PostgREST 1000-row limit. */
async function count(filterFn) {
  const q = filterFn(sb.from('audit_log').select('*', head));
  const { count: c, error } = await q;
  if (error) throw new Error(`count failed: ${error.message}`); // must DIE, never default to 0
  return c;
}

const total = await count((q) => q);
const withOld = await count((q) => q.not('old_value', 'is', null));
const withNew = await count((q) => q.not('new_value', 'is', null));

console.log('audit_log coverage');
console.log('  total rows          ' + total);
console.log('  old_value populated ' + withOld + '  (' + pct(withOld, total) + '%)   <- the MUTATION record');
console.log('  new_value populated ' + withNew + '  (' + pct(withNew, total) + '%)');

// CONTROL: a filter that returns 0 because it is wrong looks identical to one that returns 0
// because the population is empty. metadata is populated on every row, so a non-zero here proves
// .not(is,null) actually filters and the zero-ish old_value number above is a measurement.
const withMeta = await count((q) => q.not('metadata', 'is', null));
console.log('  [control] metadata  ' + withMeta + '  (proves the null-filter discriminates)');

console.log('\nmutation events present');
const { data: muts, error: mErr } = await sb
  .from('audit_log').select('event_type').not('old_value', 'is', null).limit(1000);
if (mErr) throw new Error(mErr.message);
const byType = {};
for (const r of muts || []) byType[r.event_type] = (byType[r.event_type] || 0) + 1;
const types = Object.entries(byType).sort((a, b) => b[1] - a[1]);
if (!types.length) console.log('  (none — no row in the table carries a prior value)');
for (const [t, n] of types) console.log('  ' + String(n).padStart(6) + '  ' + t);
if ((muts || []).length === 1000) console.log('  (sampled the newest 1000 mutation rows — counts above are of that sample)');

console.log('\nadvisory amplification (rows per entity)');
const { count: sdCount } = await sb.from('strategic_directives_v2').select('*', head);
const advisory = await count((q) => q.eq('event_type', 'sd_creation_source_missing'));
console.log('  strategic_directives_v2 rows ' + sdCount);
console.log('  sd_creation_source_missing   ' + advisory);
console.log('  ratio                        ' + (sdCount ? (advisory / sdCount).toFixed(1) : 'n/a')
  + ' advisory rows per SD   (an AFTER INSERT trigger should give ~1)');

// Sample the newest window rather than the whole table: the point is to name the loudest current
// offenders, and a full group-by would need a view this SD deliberately does not create.
const { data: recent } = await sb
  .from('audit_log').select('entity_id')
  .eq('event_type', 'sd_creation_source_missing')
  .order('created_at', { ascending: false }).limit(1000);
const perEntity = {};
for (const r of recent || []) perEntity[r.entity_id] = (perEntity[r.entity_id] || 0) + 1;
const ranked = Object.entries(perEntity).sort((a, b) => b[1] - a[1]).slice(0, TOP);
console.log('  newest 1000 advisory rows span ' + Object.keys(perEntity).length + ' distinct entities');

for (const [entity, n] of ranked) {
  const { count: liveRows } = await sb
    .from('strategic_directives_v2').select('*', head).eq('sd_key', entity);
  const lifetime = await count((q) => q.eq('entity_id', entity).eq('event_type', 'sd_creation_source_missing'));
  // A key with advisory rows and NO live SD row is the decisive shape: the trigger fires only on
  // INSERT, so those rows are inserts of something that does not survive — a loop, not a backlog.
  const flag = liveRows === 0 ? '  <- NO live SD row: repeated inserts of a row that never persists' : '';
  console.log('  ' + String(n).padStart(4) + ' in window · ' + String(lifetime).padStart(6) + ' lifetime · '
    + entity + flag);
}

console.log('\nThis report changes nothing. Advisory volume is expected to stay flat until the');
console.log('producer behind the amplification is fixed under its own SD.');
