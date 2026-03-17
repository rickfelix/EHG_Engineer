#!/usr/bin/env node
/**
 * FR-004: Detect Orphan Visions
 * SD-LEO-INFRA-BRAINSTORM-SD-PIPELINE-001
 *
 * Queries v_orphan_visions to surface vision/architecture documents
 * created from brainstorms that never produced an SD.
 *
 * Usage:
 *   node scripts/detect-orphan-visions.js [--json] [--min-age-days N]
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { parseArgs } from 'node:util';

const { values: args } = parseArgs({
  options: {
    json: { type: 'boolean', default: false },
    'min-age-days': { type: 'string', default: '0' },
  },
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const minAgeDays = parseInt(args['min-age-days'], 10) || 0;

const { data, error } = await supabase
  .from('v_orphan_visions')
  .select('*')
  .gte('age_days', minAgeDays)
  .order('brainstorm_created_at', { ascending: false });

if (error) {
  console.error('Error querying v_orphan_visions:', error.message);
  process.exit(1);
}

if (args.json) {
  console.log(JSON.stringify(data, null, 2));
  process.exit(0);
}

if (!data.length) {
  console.log('No orphan visions found.');
  process.exit(0);
}

console.log(`\nOrphan Visions (${data.length} found):\n`);
console.log('%-20s %-20s %-15s %-6s %s', 'Vision Key', 'Arch Key', 'Outcome', 'Days', 'Topic');
console.log('-'.repeat(90));

for (const row of data) {
  console.log(
    '%-20s %-20s %-15s %-6d %s',
    row.vision_key || '(none)',
    row.plan_key || '(none)',
    row.outcome_type || '?',
    row.age_days,
    (row.brainstorm_topic || '').substring(0, 40)
  );
}

console.log('\nTo create SDs from these, run: /leo create --vision-key <KEY> --arch-key <KEY>');
