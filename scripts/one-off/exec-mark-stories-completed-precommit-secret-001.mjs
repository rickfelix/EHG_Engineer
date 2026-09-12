#!/usr/bin/env node
// EXEC-TO-PLAN USER_STORY_COVERAGE gate for SD-LEO-FIX-PRE-COMMIT-SECRET-001: mark the 4
// auto-generated user stories (US-001..US-004) validated/completed now that the acceptance
// criteria they describe are genuinely implemented and tested (commit 67b4bd8a91f,
// tests/unit/husky/pre-commit-merge-basis.test.js, 12/12 passing; TESTING evidence b6035ffe,
// REGRESSION evidence 1d785f8f, SECURITY evidence 31065390). Each story's acceptance
// criteria are traced to shipped code below, not marked complete by assertion alone.
//
// US-001 (merge-commit-aware basis for STAGED_CONTENT, HEAD-only preserved for non-merge):
//   .husky/pre-commit IS_MERGE_COMMIT branch + STAGED_CONTENT_HEAD/STAGED_CONTENT_MERGE.
// US-002 (FIXTURE_CONTENT gets the identical merge-aware basis as STAGED_CONTENT):
//   .husky/pre-commit FIXTURE_CONTENT_HEAD/FIXTURE_CONTENT_MERGE, same IS_MERGE_COMMIT branch.
// US-003 (never silently scan nothing): implemented as an exit-status-gated fallback (not the
//   originally-worded emptiness-gated one -- corrected at EXEC per
//   exec-correct-fallback-precommit-secret-001.mjs after TDD falsified the emptiness variant).
//   *_MERGE_STATUS -ne 0 check in .husky/pre-commit; T7 in the test suite covers it.
// US-004 (regression suite covering all 10 cases): tests/unit/husky/pre-commit-merge-basis.test.js,
//   T1-T10, 12/12 passing.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_ID = '5cb177fc-6627-44b5-9bfe-0ebc531fbb29';

const STORY_KEYS = [
  'SD-LEO-FIX-PRE-COMMIT-SECRET-001:US-001',
  'SD-LEO-FIX-PRE-COMMIT-SECRET-001:US-002',
  'SD-LEO-FIX-PRE-COMMIT-SECRET-001:US-003',
  'SD-LEO-FIX-PRE-COMMIT-SECRET-001:US-004',
];

async function main() {
  const { data, error } = await supabase
    .from('user_stories')
    .update({ status: 'completed', validation_status: 'validated' })
    .eq('sd_id', SD_ID)
    .in('story_key', STORY_KEYS)
    .select('story_key, status, validation_status');
  if (error) throw error;
  if (!data || data.length !== STORY_KEYS.length) {
    throw new Error(`Expected ${STORY_KEYS.length} rows updated, got ${data ? data.length : 0}`);
  }
  console.log('OK updated', JSON.stringify(data, null, 2));
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => {
    console.error('FAILED:', e);
    process.exit(1);
  });
}
