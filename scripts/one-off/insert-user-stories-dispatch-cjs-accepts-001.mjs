#!/usr/bin/env node
/**
 * One-off: insert user stories for SD-LEO-FIX-DISPATCH-CJS-ACCEPTS-001 (bugfix, stories required).
 * Work is already implemented/tested/pushed (PR #8721) before PLAN phase paperwork, per the
 * QF-to-SD escalation workflow -- stories are marked completed, mirroring the shipped FRs.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-FIX-DISPATCH-CJS-ACCEPTS-001';
const PRD_ID = `PRD-${SD_KEY}`;

async function main() {
  const { data: sd, error: sdErr } = await supabase
    .from('strategic_directives_v2')
    .select('id')
    .eq('sd_key', SD_KEY)
    .single();
  if (sdErr || !sd) {
    console.error('SD_FETCH_FAILED', sdErr);
    process.exit(1);
  }

  const stories = [
    {
      story_key: `${SD_KEY}:US-001`,
      sd_id: sd.id,
      prd_id: PRD_ID,
      title: "Retire the bare 'broadcast' sentinel from dispatch.cjs",
      user_role: 'a session_coordination writer',
      user_want: "an insert to target_session='broadcast' to be refused instead of silently accepted",
      user_benefit: 'so my directive is never dead-lettered without any signal that it went nowhere',
      acceptance_criteria: [
        "SENTINEL_TARGETS in lib/coordinator/dispatch.cjs no longer contains 'broadcast'",
        "insertCoordinationRow({target_session:'broadcast', ...}) rejects with code DISPATCH_TARGET_INVALID",
      ],
      test_scenarios: [
        { id: 'TS-1', scenario: "insertCoordinationRow refuses target_session='broadcast'" },
      ],
      implementation_context: 'lib/coordinator/dispatch.cjs:197 (SENTINEL_TARGETS), :220-232 (assertValidTarget), :1563 (insertCoordinationRow call site)',
      priority: 'high',
      status: 'completed',
      implementation_status: 'complete',
      validation_status: 'validated',
    },
    {
      story_key: `${SD_KEY}:US-002`,
      sd_id: sd.id,
      prd_id: PRD_ID,
      title: 'Stop the dominant raw-insert writer from re-creating dead-lettered rows',
      user_role: 'the npm-install-lock mutex',
      user_want: 'my lock/unlock notices to stop targeting the retired broadcast sentinel',
      user_benefit: 'so my lock rows carry addressing metadata that reflects reality (no addressee), matching this repo\'s own convention for informational rows',
      acceptance_criteria: [
        "lib/npm-install-lock.cjs writes target_session:null instead of target_session:'broadcast'",
        'findActiveLock/acquireLock/releaseLock behavior is unchanged (keyed only on payload.lock_type/status)',
      ],
      test_scenarios: [
        { id: 'TS-3', scenario: 'npm-install-lock lock lifecycle unaffected by the target_session change' },
      ],
      implementation_context: 'lib/npm-install-lock.cjs:71-88 (acquireLock), :29-49 (findActiveLock)',
      priority: 'high',
      status: 'completed',
      implementation_status: 'complete',
      validation_status: 'validated',
    },
    {
      story_key: `${SD_KEY}:US-003`,
      sd_id: sd.id,
      prd_id: PRD_ID,
      title: 'Keep the fallback-path writers working after the sentinel is removed',
      user_role: 'coordinator-revive.cjs and dispatch-suggestion-override.mjs',
      user_want: 'my fallback broadcast target to still be valid once bare broadcast is retired',
      user_benefit: "so my notification still lands (on the coordinator) instead of silently failing on every run that hits the fallback branch",
      acceptance_criteria: [
        "coordinator-revive.cjs's unknown-requester expiry signal targets broadcast-coordinator, not broadcast",
        'dispatch-suggestion-override.mjs recordOverride() targets broadcast-coordinator, not broadcast',
      ],
      test_scenarios: [
        { id: 'TS-4', scenario: 'coordinator-revive.cjs emits a working fallback signal for an unknown requester' },
      ],
      implementation_context: 'scripts/coordinator-revive.cjs:103-109, scripts/dispatch-suggestion-override.mjs:58-70',
      priority: 'medium',
      status: 'completed',
      implementation_status: 'complete',
      validation_status: 'validated',
    },
    {
      story_key: `${SD_KEY}:US-004`,
      sd_id: sd.id,
      prd_id: PRD_ID,
      title: "Correct inbox-readonly.cjs's misleading documentation about bare broadcast",
      user_role: 'an operator reading inbox-readonly.cjs to understand fleet addressing paths',
      user_want: 'the header comment to state the true, measured status of bare broadcast',
      user_benefit: 'so I never mistake a dead-lettered sentinel for a live delivery path when debugging',
      acceptance_criteria: [
        'inbox-readonly.cjs header no longer calls bare broadcast "live and heavily used"',
        'inbox-readonly.cjs header cites the 0-of-91-ever-acknowledged measurement',
      ],
      test_scenarios: [],
      implementation_context: 'scripts/inbox-readonly.cjs:37-44',
      priority: 'low',
      status: 'completed',
      implementation_status: 'complete',
      validation_status: 'validated',
    },
    {
      story_key: `${SD_KEY}:US-005`,
      sd_id: sd.id,
      prd_id: PRD_ID,
      title: 'Non-destructively disposition the 91 pre-existing dead-lettered rows',
      user_role: 'a fleet operator auditing session_coordination for orphaned directives',
      user_want: 'the legacy bare-broadcast rows to be enumerable and markable as dead-lettered',
      user_benefit: 'so I can tell a genuinely-stuck-but-live directive apart from a row that predates the fix and will never be acted on',
      acceptance_criteria: [
        'scripts/one-off/dead-letter-bare-broadcast-rows-qf-20260911-753.mjs dry-run enumerates every row with zero writes',
        '--execute merge-patches payload with dead_lettered_by/at/reason, never deletes a row or sets acknowledged_at',
      ],
      test_scenarios: [
        { id: 'TS-5', scenario: 'Full unit suite shows zero new regressions from any of the above' },
      ],
      implementation_context: 'scripts/one-off/dead-letter-bare-broadcast-rows-qf-20260911-753.mjs',
      priority: 'medium',
      status: 'completed',
      implementation_status: 'complete',
      validation_status: 'validated',
    },
  ];

  const { error: insertErr } = await supabase.from('user_stories').insert(stories);
  if (insertErr) {
    console.error('STORIES_INSERT_FAILED', insertErr);
    process.exit(1);
  }
  console.log(`OK: ${stories.length} user stories inserted for`, SD_KEY);
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
