// QF-20260905-745 claimed, then VERIFIED against current main before implementing: the exact
// defect described (scripts/hooks/stop-loop-wakeup-reminder.cjs's hasActiveClaim reads only
// strategic_directives_v2.claiming_session_id, so a QF-only holder reads claimless and gets a
// false SAME-TURN NEXT-CLAIM block at Stop) was ALREADY FIXED on main by QF-20260907-596
// (escalated to SD-LEO-FIX-STOP-HOOK-INFINITE-001), commits b2d6c40fedd (PR #8435, merged) and
// 75d5b0f2805 (fail-closed-on-read-error hardening). Confirmed by reading the current
// computeHasActiveClaim() implementation: it now uses lib/claim/get-my-claims.cjs's canonical
// both-kinds (SD+QF) ownership predicate, exactly the fix this ticket describes.
//
// Closing as duplicate_of QF-20260907-596 via the canonical setQuickFixStatus writer rather than
// re-implementing an already-shipped fix.
//
// Run once: node scripts/one-off/close-qf-20260905-745-duplicate.mjs
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { createRequire } from 'module';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const require = createRequire(import.meta.url);
const { setQuickFixStatus } = require('../../lib/quick-fix/status-writer.cjs');

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const ACTOR = 'Golf-4 (autonomous fleet worker, session 62fe20c7-2b5a-4ba2-a8d5-ea7b6a7add00)';

async function main() {
  const now = new Date().toISOString();
  const result = await setQuickFixStatus(supabase, 'QF-20260905-745', {
    status: 'closed',
    disposition: 'duplicate_of',
    duplicate_of_id: 'QF-20260907-596',
    disposition_reason_code: 'duplicate_of',
    disposed_at: now,
    disposed_by: ACTOR,
    verification_notes: 'Claimed, then verified against current main before implementing: computeHasActiveClaim() '
      + '(scripts/hooks/stop-loop-wakeup-reminder.cjs) already uses lib/claim/get-my-claims.cjs\'s both-kinds '
      + '(SD+QF) ownership predicate -- the exact fix this ticket asks for. Shipped via QF-20260907-596 '
      + '(escalated to SD-LEO-FIX-STOP-HOOK-INFINITE-001), commits b2d6c40fedd (PR #8435, merged) + 75d5b0f2805 '
      + '(fail-closed-on-read-error hardening). No new code needed; closing as duplicate rather than '
      + 're-implementing a shipped fix.',
  }, { logger: console });
  console.log('CLOSED:', JSON.stringify(result));
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => {
    console.error('FAILED:', e);
    process.exit(1);
  });
}
