#!/usr/bin/env node
// Marks SD-LEO-FIX-GATE-PLAN-EXEC-001's 6 user stories completed/validated now that EXEC has
// genuinely delivered them: gate-1-plan-to-exec.js implements FR-1..FR-5 (US-001..US-005),
// and the full-population regression measurement (US-006) has been run with 0 regressions,
// 76 newly-passing PRDs, committed at 6f25879da8b, PR #8263.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_UUID = '37ec760d-256a-4ad3-bf4d-6d59be31b8da';
const COMMIT_SHA = '6f25879da8b5f5b51a8d5f82e7f43efc23c9fd3a';
const PR_URL = 'https://github.com/rickfelix/EHG_Engineer/pull/8263';

const { data: stories, error } = await supabase
  .from('user_stories')
  .select('id, story_key, title, metadata')
  .eq('sd_id', SD_UUID);

if (error) { console.error('❌ Fetch failed:', error.message); process.exit(1); }
if (!stories || stories.length === 0) { console.error('❌ No stories found'); process.exit(1); }

const evidenceText = `Implemented in gate-1-plan-to-exec.js + PlanToExecVerifier.js (commit ${COMMIT_SHA}), verified by 10 unit tests (tests/unit/plan-to-exec/gate1-prd-quality-leniency.test.js, all passing) and a full-population regression measurement (0 regressions, 76 newly-passing / 4678 live PRDs). PR: ${PR_URL}`;

for (const s of stories) {
  const { error: updErr } = await supabase
    .from('user_stories')
    .update({
      status: 'completed',
      validation_status: 'validated',
      completed_at: new Date().toISOString(),
      completed_by: 'EXEC',
      metadata: { ...(s.metadata || {}), completion_evidence: evidenceText },
    })
    .eq('id', s.id);
  if (updErr) { console.error(`❌ Update failed for ${s.story_key}:`, updErr.message); process.exit(1); }
  console.log(`✅ ${s.story_key}: ${s.title} -> completed/validated`);
}

console.log(`\n✅ All ${stories.length} user stories marked completed/validated.`);
