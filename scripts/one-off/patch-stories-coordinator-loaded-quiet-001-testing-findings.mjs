import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_UUID = 'e6db824d-e5e2-4f77-9e22-052f64f98db2';
const PRD_ID = 'PRD-e6db824d-e5e2-4f77-9e22-052f64f98db2';
const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const US003_NOTE =
  '\n\nTESTING FINDING F4 (PLAN phase, evidence d5e8a6ac): rawUnclaimed is the raw-unclaimed STRATEGIC DIRECTIVE count (scripts/lib/capacity-inputs.mjs:~338), NOT a quick_fixes count. Predicate (b) is rawUnclaimed===0 AND openQfCount===0 (quick_fixes count, :~308) — an earlier draft mislabeling rawUnclaimed as the QF count would have silently dropped the QF dimension, re-creating the QF-20260830-283 miss the predicate exists to prevent.';

const US006_REWRITE = {
  title: 'FR-6 (SHIP-BLOCKING): Measure whether a directive can hard-wake an already-parked seat — predicted FAIL',
  user_want:
    'measure, via the actual session_coordination delivery lane, whether a coordinator directive reaches and hard-wakes a currently-parked worker seat within the existing 15-45s hard-wake window',
  user_benefit:
    'so the loaded-and-quiet band ships only if its safety argument (directives always hard-wake within 15-45s) is actually true, rather than assumed',
  acceptance_criteria: [
    'AC-6-1: The measurement uses the session_coordination directive lane specifically (the lane the band is priced on) — not SendMessage/task-notification, which is a different delivery channel',
    'AC-6-2: A decideCadence-level fixture alone (hasUnactionedDirective=true still yields 15-45s) is NOT sufficient evidence — it is byte-equivalent to the existing test at tests/unit/coordinator/quiet-tick.test.js:123-128 and proves nothing about delivery',
    'AC-6-3: TESTING sub-agent (evidence d5e8a6ac) found NO preemption path exists anywhere in scripts/ or lib/ for an armed ScheduleWakeup, and a parked seat runs no tools so no PostToolUse hook (.claude/settings.json:110, scripts/hooks/coordination-inbox.cjs) ever observes the directive INSERT until natural park expiry. The predicted outcome — the directive does NOT reach the parked seat within 15-45s — is pre-registered here BEFORE the live measurement runs, so the result cannot be laundered into an unexpected PASS',
    'AC-6-4: Per the predicted (and expected-to-be-confirmed) FAIL: this SD ships FR-1/FR-7 only in this PR, documents the FR-6 finding with measurement evidence, and defers FR-2/FR-3/FR-4/FR-5 (the band-widening change) to a follow-up SD/QF pending a parked-seat preemption mechanism or explicit coordinator/chairman acceptance of the full-band exposure (amendment_2\'s own gate)',
  ],
  technical_notes:
    'Discriminate directive-caused wake from natural park expiry using lib/hooks/wake-metadata-patch.cjs\'s wake_armed_at/wake_delay_seconds/expected_wake_at, snapshotted verbatim at T0 BEFORE sending the directive (the wake itself re-arms and overwrites these fields, erasing the evidence if not captured first). Use the directive row\'s read_at/acknowledged_at (or last_tool_at) as the check-in stamp, NOT heartbeat_at — released/cleared shells keep heartbeating via the clear-survivor daemon, so a heartbeat alone is not proof of a genuine wake. Do NOT rely on wake_trigger_reason — its own docstring (QF-20260830-556) states it is a hardcoded prospective literal ("wakeup-timer") written at arm time, never revisited, and cannot discriminate timer-caused from message-caused re-invocation.',
};

async function main() {
  const { data: us003, error: e1 } = await supabase.from('user_stories').select('technical_notes').eq('id', 'c225411b-55d0-491c-98a8-97db8ce24cfb').single();
  if (e1) throw e1;
  const { error: e2 } = await supabase
    .from('user_stories')
    .update({ technical_notes: (us003.technical_notes || '') + US003_NOTE })
    .eq('id', 'c225411b-55d0-491c-98a8-97db8ce24cfb');
  if (e2) throw e2;

  const { error: e3 } = await supabase
    .from('user_stories')
    .update(US006_REWRITE)
    .eq('id', 'aad71326-0537-48a7-a9d3-fb2a665ffdda');
  if (e3) throw e3;

  const us007 = {
    story_key: 'SD-LEO-INFRA-COORDINATOR-LOADED-QUIET-001:US-007',
    prd_id: PRD_ID,
    sd_id: SD_UUID,
    title: 'FR-7: Extract the loaded-and-quiet predicate as a standalone, independently-testable pure function',
    user_role: 'Coordinator Maintainer',
    user_want: 'the loaded-and-quiet predicate to exist as its own pure exported function, computeLoadedAndQuiet(), separate from decideCadence()',
    user_benefit:
      'so the predicate itself has a unit-test seam — TESTING finding F1 (evidence d5e8a6ac) found that testing decideCadence() with a pre-computed boolean only re-tests the pre-existing else-branch, never the predicate logic that currently has no test seam at all',
    story_points: 3,
    priority: 'critical',
    status: 'draft',
    acceptance_criteria: [
      'computeLoadedAndQuiet({idleNow, rawUnclaimed, openQfCount, claimableWithVerifyQfCount, unactionedDirective, undeliveredEscalation}) is a pure, independently-importable/exported function with no DB/IO side effects',
      'Forcing each of the four input dimensions individually is tested to force the overall predicate false, as its own test case per dimension',
      'coordinator-quiet-tick.mjs main() calls computeLoadedAndQuiet() immediately before decideCadence(), satisfying FR-3\'s ARM-time-freshness requirement',
    ],
    technical_notes:
      'Given-when-then: given idleNow>0 (or rawUnclaimed>0, or openQfCount>0, or claimableWithVerifyQfCount>0, or unactionedDirective=true, or undeliveredEscalation=true) with every other input at its loaded-and-quiet-true value, when computeLoadedAndQuiet() is called, then it returns false. Files to create/modify: lib/coordinator/quiet-tick.cjs (add and export computeLoadedAndQuiet), scripts/coordinator-quiet-tick.mjs (call it), tests/unit/coordinator/quiet-tick.test.js (new direct unit tests). Dependencies: none (this precedes FR-2/FR-3). Estimated effort: 1-2 hours.',
    implementation_context:
      'Technical Approach: export a new pure function computeLoadedAndQuiet from lib/coordinator/quiet-tick.cjs alongside decideCadence, taking the six named boolean/count inputs and returning a single boolean via AND-composition of the four predicate clauses (idleNow===0, rawUnclaimed===0 && openQfCount===0, claimableWithVerifyQfCount===0, !unactionedDirective && !undeliveredEscalation). Files To Create: none. Files To Modify: lib/coordinator/quiet-tick.cjs, scripts/coordinator-quiet-tick.mjs, tests/unit/coordinator/quiet-tick.test.js. Dependencies: precedes FR-2 (US-002) and FR-3 (US-003), which both consume this function. Estimated Effort: 1-2 hours. Key Risk: composing the four clauses incorrectly (e.g. OR instead of AND) would silently widen the predicate\'s true-conditions, defeating the regression guard FR-4 tests for.',
    depends_on: [],
  };

  const { data: existing } = await supabase.from('user_stories').select('id').eq('story_key', us007.story_key).maybeSingle();
  if (existing) {
    await supabase.from('user_stories').update(us007).eq('id', existing.id);
    console.log('Updated US-007:', existing.id);
  } else {
    const { data: inserted, error: e4 } = await supabase.from('user_stories').insert(us007).select('id').single();
    if (e4) throw e4;
    console.log('Inserted US-007:', inserted.id);
  }

  console.log('Patched US-003 (F4 note), rewrote US-006 (F2/F3), inserted/updated US-007.');
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
