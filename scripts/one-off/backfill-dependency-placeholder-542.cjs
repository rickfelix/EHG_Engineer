#!/usr/bin/env node
/**
 * QF-20260525-542 one-time backfill: normalize the legacy leo-create-sd
 * { dependency:'none', status:'available' } placeholder in
 * strategic_directives_v2.dependencies to an empty array. Idempotent — only
 * touches rows whose dependencies carry NO real SD-key AND consist solely of the
 * 'none' placeholder shape. Safe to re-run (a second pass finds zero targets).
 */
const { createSupabaseServiceClient } = require('../../lib/supabase-client.cjs');
const { parseSdDependencies } = require('../../lib/utils/parse-sd-dependencies.cjs');

async function main() {
  const supabase = createSupabaseServiceClient();
  const { data: rows, error } = await supabase
    .from('strategic_directives_v2')
    .select('sd_key, dependencies')
    .not('dependencies', 'is', null);
  if (error) { console.error('Query failed:', error.message); process.exit(1); }

  const targets = (rows || []).filter((r) => {
    const d = r.dependencies;
    if (!Array.isArray(d) || d.length === 0) return false;
    if (parseSdDependencies(d).length > 0) return false; // real SD-key deps — leave intact
    return d.every((e) => e && typeof e === 'object' && e.dependency === 'none'); // placeholder-only
  });

  console.log(`QF-20260525-542 backfill: ${targets.length} placeholder row(s) to normalize.`);
  let updated = 0;
  for (const t of targets) {
    const { error: upErr } = await supabase
      .from('strategic_directives_v2').update({ dependencies: [] }).eq('sd_key', t.sd_key);
    if (upErr) console.error(`  ${t.sd_key}: ${upErr.message}`);
    else { updated++; console.log(`  normalized ${t.sd_key}`); }
  }
  console.log(`Done. ${updated}/${targets.length} normalized.`);
}

main();
