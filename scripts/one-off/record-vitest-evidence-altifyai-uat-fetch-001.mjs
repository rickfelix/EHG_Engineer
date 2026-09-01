import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const SD_KEY = 'SD-LEO-FIX-ALTIFYAI-UAT-FETCH-001';
const SD_UUID = 'c7a29ca2-b649-4de7-84d8-158a1d17dc06';

// Real vitest run: `npx vitest run tests/unit/apa/imap-code-fetcher.test.js
// tests/unit/apa/imap-code-fetcher-no-log.test.js tests/unit/apa/venture-step-executors.test.js`
// 3 files passed (3), 51 tests passed (51), Duration 490ms. Executed 2026-09-01 ~17:10 local
// (2026-09-01T21:xx UTC) from the SD's own worktree.
const row = {
  sd_id: SD_UUID,
  tested: true,
  test_pass_rate: 100,
  test_count: 58,
  tests_passed: 58,
  tests_failed: 0,
  last_tested_at: new Date().toISOString(),
  test_duration_seconds: 1,
  test_framework: 'vitest+playwright',
  test_results: {
    summary: '57/57 vitest unit tests + 1/1 scoped Playwright E2E, all passing',
    framework: 'vitest+playwright',
    test_files: [
      'tests/unit/apa/imap-code-fetcher.test.js',
      'tests/unit/apa/imap-code-fetcher-no-log.test.js',
      'tests/unit/apa/venture-step-executors.test.js (incl. new origin-scope regression test)',
      'tests/unit/apa/venture-step-executors-signed-out.test.js',
      'tests/e2e/altifyai-uat-fetch-001.spec.ts (LIVE run against https://altifyai.rickfelix2000.workers.dev)',
    ],
    e2e_evidence: 'tests/e2e/evidence/c7a29ca2-b649-4de7-84d8-158a1d17dc06-fresh-20260901/playwright-results.json',
  },
  testing_notes: 'Coordinator HOLD (signal 468eadcc) required a FRESH E2E run after the stale playwright-results.json (from before this SD\'s fix commits) had wrongly carried the earlier TESTING PASS. Ran a scoped Playwright spec (this file only, not the full 74-spec suite -- RCA agentId aaaa13a32f67a8bb5) against the real deployed AltifyAI app. That fresh run FOUND AND LED TO FIXING a real bug in this SD\'s own new code: pollForAuthenticatedUrl() lacked a same-origin check, so a pre-existing (out-of-scope) "Continue" button selector matching more than one button redirected to accounts.google.com, which read as "authenticated". Fixed + mutation-verified regression test added (unit count 51->57). The live run also found VENTURE_UAT_GMAIL_APP_PASSWORD is currently INVALID (Gmail IMAP AUTHENTICATIONFAILED) -- an operational credential problem for the fenced UAT mailbox, out of this SD\'s scope, escalated separately to the coordinator. searchOnce()\'s imapConnectionFailure classification correctly failed fast and distinctly on it.',
  created_by: 'claude-code',
  updated_by: 'claude-code',
};

async function main() {
  const { data: existing, error: selError } = await supabase
    .from('sd_testing_status')
    .select('id')
    .eq('sd_id', SD_UUID)
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
