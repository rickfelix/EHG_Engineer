/**
 * Test Venture Sweep — Safety-net cleanup for orphaned test ventures
 *
 * Deletes ventures matching known test name patterns that were left behind
 * by automated test suites (XSS, integration, e2e) that failed to clean up.
 *
 * Safe to run repeatedly — fully idempotent.
 *
 * Usage:
 *   node scripts/sweep-test-ventures.cjs              # Dry run (report only)
 *   node scripts/sweep-test-ventures.cjs --delete     # Actually delete
 *   node scripts/sweep-test-ventures.cjs --archive    # Archive instead of delete
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Patterns that identify test ventures (case-insensitive)
const TEST_PATTERNS = [
  'Low-Cap Low-Success',
  'Low-Cap High-Success',
  'High-Cap Low-Success',
  'High-Cap High-Success',
  'Launch Checklist Test',
  'Critical Attention',
  'XSS Test',
  'Pipeline-Test-',
  'Test Venture',
  'X-Injected-Header',
  'UI/UX Assessment Test',
  'P0 RLS Fix Test',
];

// Real ventures that happen to match patterns above — never touch these
const PROTECTED_NAMES = [
  // Add any real venture names here if they ever collide with test patterns
];

async function sweep(mode) {
  // Build OR filter for all patterns
  const orFilter = TEST_PATTERNS.map(p => `name.ilike.%${p}%`).join(',');

  const { data: candidates, error } = await supabase
    .from('ventures')
    .select('id, name, status, current_lifecycle_stage, created_at')
    .or(orFilter)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error querying ventures:', error.message);
    process.exit(1);
  }

  // Filter out protected names
  const toClean = (candidates || []).filter(
    v => !PROTECTED_NAMES.some(p => v.name === p)
  );

  if (toClean.length === 0) {
    console.log('[sweep-test-ventures] No test ventures found. Database is clean.');
    return;
  }

  console.log(`[sweep-test-ventures] Found ${toClean.length} test venture(s):`);
  for (const v of toClean) {
    console.log(`  ${v.name} | status=${v.status} | stage=${v.current_lifecycle_stage} | created=${v.created_at.substring(0, 10)}`);
  }

  if (mode === 'dry') {
    console.log('\n[DRY RUN] No changes made. Use --delete or --archive to clean up.');
    return;
  }

  const ids = toClean.map(v => v.id);

  // Clean FK dependencies first
  const fkTables = ['chairman_decisions', 'venture_stage_work', 'venture_artifacts', 'stage_proving_journal'];
  for (const table of fkTables) {
    const { count, error: fkErr } = await supabase
      .from(table)
      .delete({ count: 'exact' })
      .in('venture_id', ids);
    if (fkErr && !fkErr.message.includes('Could not find')) {
      console.error(`  ${table}: error — ${fkErr.message}`);
    } else if (count > 0) {
      console.log(`  ${table}: deleted ${count} rows`);
    }
  }

  if (mode === 'archive') {
    const { count, error: archErr } = await supabase
      .from('ventures')
      .update({ status: 'archived' })
      .in('id', ids);
    if (archErr) console.error('Archive error:', archErr.message);
    else console.log(`\n[sweep-test-ventures] Archived ${count || ids.length} test venture(s).`);
  } else {
    const { count, error: delErr } = await supabase
      .from('ventures')
      .delete({ count: 'exact' })
      .in('id', ids);
    if (delErr) console.error('Delete error:', delErr.message);
    else console.log(`\n[sweep-test-ventures] Deleted ${count} test venture(s).`);
  }
}

// Parse args
const args = process.argv.slice(2);
let mode = 'dry';
if (args.includes('--delete')) mode = 'delete';
else if (args.includes('--archive')) mode = 'archive';

sweep(mode).catch(err => {
  console.error('Sweep failed:', err);
  process.exit(1);
});
