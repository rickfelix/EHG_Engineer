#!/usr/bin/env node
// SD-LEO-INFRA-CLEANUP-NON-VENTURE-001 / FR1
// Audit script — enumerates eva_vision_documents rows violating the rich-shape
// CHECK predicate that A.3 (UNIFY Child A.3) ships as NOT VALID.
//
// Predicate (matches CHECK exactly per database-agent CONDITIONAL_PASS R1):
//   status='active' AND NOT (extracted_dimensions IS NOT NULL AND char_length(content) > 500)
//
// Categorizes for human readability:
//   - short_stub: clen<500 (regardless of dims) — likely stub-writer orphans
//   - long_nulldims: clen>500 but dims IS NULL/empty — extraction skipped/failed
//   - L1_outlier: level=L1 violators
//
// Run as smoke test before+after applying the cleanup migration:
//   node scripts/one-off/_audit-cleanup-non-venture-l2-violators.mjs

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function hasDims(row) {
  return row.extracted_dimensions != null
    && typeof row.extracted_dimensions === 'object'
    && Object.keys(row.extracted_dimensions).length > 0;
}

function violates(row) {
  return row.status === 'active'
    && !(hasDims(row) && (row.content || '').length > 500);
}

async function main() {
  const { data, error } = await supabase
    .from('eva_vision_documents')
    .select('id, vision_key, level, status, chairman_approved, content, extracted_dimensions, venture_id, created_by, created_at');
  if (error) {
    console.error('ERROR querying eva_vision_documents:', error.message);
    process.exit(2);
  }

  const violators = (data || []).filter(violates);
  const categories = {
    short_stub: [],
    long_nulldims: [],
    L1_outlier: [],
  };
  for (const row of violators) {
    const clen = (row.content || '').length;
    if (row.level === 'L1') categories.L1_outlier.push(row);
    else if (clen < 500) categories.short_stub.push(row);
    else categories.long_nulldims.push(row);
  }

  const total = violators.length;
  console.log(`Audit @ ${new Date().toISOString()}`);
  console.log(`Total active rows violating rich-shape predicate: ${total}`);
  console.log(`  short_stub (clen<500):       ${categories.short_stub.length}`);
  console.log(`  long_nulldims (clen>=500):   ${categories.long_nulldims.length}`);
  console.log(`  L1_outlier:                  ${categories.L1_outlier.length}`);

  if (total > 0) {
    const fmt = (r) => `  ${r.id} | ${r.vision_key} | level=${r.level} clen=${(r.content||'').length} chair=${r.chairman_approved} venture=${r.venture_id ? 'YES' : 'no'} created_by=${r.created_by || '(null)'}`;
    if (categories.short_stub.length) {
      console.log('\n--- short_stub ---');
      categories.short_stub.forEach(r => console.log(fmt(r)));
    }
    if (categories.long_nulldims.length) {
      console.log('\n--- long_nulldims ---');
      categories.long_nulldims.forEach(r => console.log(fmt(r)));
    }
    if (categories.L1_outlier.length) {
      console.log('\n--- L1_outlier ---');
      categories.L1_outlier.forEach(r => console.log(fmt(r)));
    }
  }

  // Exit code: 0 if zero violators (post-migration expected state), 1 otherwise.
  process.exit(total === 0 ? 0 : 1);
}

main().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(2);
});
