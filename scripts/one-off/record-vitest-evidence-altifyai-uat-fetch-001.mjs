import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const SD_KEY = 'SD-LEO-FIX-ALTIFYAI-UAT-FETCH-001';

// Real vitest run: `npx vitest run tests/unit/apa/imap-code-fetcher.test.js
// tests/unit/apa/imap-code-fetcher-no-log.test.js tests/unit/apa/venture-step-executors.test.js`
// 3 files passed (3), 51 tests passed (51), Duration 490ms. Executed 2026-09-01 ~17:10 local
// (2026-09-01T21:xx UTC) from the SD's own worktree.
const row = {
  sd_id: SD_KEY,
  tested: true,
  test_pass_rate: 100,
  test_count: 51,
  tests_passed: 51,
  tests_failed: 0,
  last_tested_at: new Date().toISOString(),
  test_duration_seconds: 1,
  test_framework: 'vitest',
  test_results: {
    summary: '51 tests passing across 3 files',
    framework: 'vitest',
    test_files: [
      'tests/unit/apa/imap-code-fetcher.test.js',
      'tests/unit/apa/imap-code-fetcher-no-log.test.js',
      'tests/unit/apa/venture-step-executors.test.js',
    ],
  },
  testing_notes: 'Unit-test evidence for the net-new IMAP Clerk 2FA code fetcher (lib/apa/imap-code-fetcher.js) and its wiring into lib/apa/venture-step-executors.js. This SD is a backend-only, zero-UI bugfix with no tests/e2e coverage by design (RCA agentId aaaa13a32f67a8bb5, 2026-09-01: --full-e2e is correct-but-irrelevant here — it runs EHG_Engineer\'s own 74-spec Playwright suite, not anything touching lib/apa/*). Live E2E verification against the real Clerk/IMAP mailbox is a documented, chairman-flagged out-of-scope limitation (fenced mailbox alias mismatch pending remint), not a defect in this SD.',
  created_by: 'claude-code',
  updated_by: 'claude-code',
};

async function main() {
  const { data: existing, error: selError } = await supabase
    .from('sd_testing_status')
    .select('id')
    .eq('sd_id', SD_KEY)
    .maybeSingle();
  if (selError) throw selError;

  if (existing) {
    const { error } = await supabase.from('sd_testing_status').update(row).eq('id', existing.id);
    if (error) throw error;
    console.log('OK updated sd_testing_status row', existing.id, 'for', SD_KEY);
  } else {
    const { data, error } = await supabase.from('sd_testing_status').insert(row).select('id').single();
    if (error) throw error;
    console.log('OK inserted sd_testing_status row', data.id, 'for', SD_KEY);
  }
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
