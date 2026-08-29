#!/usr/bin/env node
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-FDBK-ENH-HANDOFF-PIPELINE-NEVER-001';
const SD_UUID = '658bf75d-4f6d-4ff2-b58e-c5444f1cc397';
const PRD_ID = `PRD-${SD_KEY}`;

const stories = [
  {
    title: 'BaseExecutor normalizes both SD ID forms at the handoff boundary',
    user_role: 'a downstream gate/executor consuming validationContext',
    user_want: 'validationContext to always carry both sdKey and sdUuid, populated once from the already-fetched SD row',
    user_benefit: 'I never have to guess which ID form I received, eliminating a class of silent 0-row / null lookups',
    acceptance_criteria: [
      'validationContext object literal in BaseExecutor.js contains sdKey and sdUuid keys',
      'Both are populated from the already-fetched sd row (no extra DB query)',
      'A grep for `ctx.sdKey` across scripts/modules/handoff/ shows every consumer now reads a populated value, not a permanently-undefined one',
    ],
    implementation_context: 'scripts/modules/handoff/executors/BaseExecutor.js:429-437 (validationContext object literal construction). Add sdKey: sd?.sd_key || null and sdUuid: sd?.id || null alongside the existing sdId/sd_id/sd/prd/prdId/options/supabase/gitContext/handoffType keys.',
  },
  {
    title: 'Orchestrator-child detection resolves correctly regardless of sd_key/UUID invocation form',
    user_role: 'a LEO fleet worker running PLAN-TO-LEAD on an orchestrator SD',
    user_want: 'the parent_sd_id child-detection query to use the normalized UUID, matching the sd?.id || sdId idiom already used elsewhere in the same function',
    user_benefit: 'invoking the handoff with an sd_key argument no longer falls through to the STANDARD/NO_PRD path when the SD is actually an orchestrator with completed children',
    acceptance_criteria: [
      "Line 389 of plan-to-lead/index.js reads `.eq('parent_sd_id', sd?.id || sdId)`",
      "Invoking `handoff.js execute PLAN-TO-LEAD SD-ALTIFYAI-LEO-ORCH-SPRINT-2026-002-F` (sd_key form) correctly detects 1 child and fires the ORCHESTRATOR path instead of STANDARD/NO_PRD",
      'A unit test with a mid-tier orchestrator fixture reproduces the pre-fix misclassification and passes post-fix',
    ],
    implementation_context: "scripts/modules/handoff/executors/plan-to-lead/index.js:389, inside executeSpecific()'s fallback child-detection query. Sibling calls at lines 431/453/480 already use the sd?.id || sdId idiom.",
  },
  {
    title: 'DB_CONTENT_PARITY gate resolves sd_key from the SD row already in context',
    user_role: 'the DB_CONTENT_PARITY validation gate',
    user_want: 'to prefer ctx.sd.sd_key over the raw, unnormalized ctx.sdId when resolving which SD to re-look-up',
    user_benefit: 'a UUID-form ctx.sdId no longer causes a silent zero-row lookup that masks real db_content_assertions',
    acceptance_criteria: [
      'Line 157 (or its post-normalization equivalent) resolves ctx.sd?.sd_key first, before ctx.sdKey/ctx.sdId',
      "Calling the gate with a UUID-form ctx.sdId and a populated ctx.sd still resolves the correct sd_key and finds the SD's db_content_assertions",
      'Existing sd_key-invoked callers are unaffected (byte-identical resolved value)',
    ],
    implementation_context: "scripts/modules/handoff/gates/db-content-parity-gate.js:157 (createDbContentParityGate().validator). ctx.sd is already a full cloned SD row present in scope via BaseExecutor's validationContext.",
  },
  {
    title: 'ID-resolution failures are distinguishable from genuine DB content drift',
    user_role: 'a reader of validation_audit_log (including bypass-rubric.js)',
    user_want: 'a failure_category distinct from db_content_drift when the DB_CONTENT_PARITY gate could not even resolve the SD row',
    user_benefit: 'I can tell an infrastructure/ID-form bug apart from a genuine code/DB content mismatch without manually re-deriving it',
    acceptance_criteria: [
      'The lookup-failure branch in db-content-parity-gate.js emits a failure_category distinct from db_content_drift',
      'validation_audit_log rows for a genuine ID-resolution failure are queryable separately from genuine drift rows',
      'tests/integration/plan-to-lead-db-content-parity-audit.test.js is updated to assert the NEW category for the lookup-failure branch, not the old pinned db_content_drift value',
    ],
    implementation_context: 'scripts/modules/handoff/gates/db-content-parity-gate.js (the `if (error || !sd)` branch near the top of validateDbContentParity, and the failure_category:\'db_content_drift\' literal at line ~176).',
  },
  {
    title: 'skip-and-continue.js writes a persistable status and surfaces genuine write failures',
    user_role: 'the LEO handoff pipeline\'s skip-and-continue mechanism',
    user_want: 'to write a status value permitted by the live strategic_directives_v2_status_check CHECK constraint, and to fail loudly (not warn-and-continue) when the write does not land',
    user_benefit: 'the blocked-SD tracking feature (blocked_reason/blocked_at/blocked_by_gate/can_unblock/correlation_id) actually persists instead of being silently dropped on every call',
    acceptance_criteria: [
      "skip-and-continue.js never writes status:'blocked' to strategic_directives_v2",
      'The blocked_reason/blocked_at/blocked_by_gate/can_unblock/correlation_id metadata fields are written successfully and are readable post-write (verified by an assertion, not a swallowed warning)',
      "A genuine write failure (any cause) is surfaced as a hard failure to the caller, not silently converted to {success:false} behind a console.warn",
      "lib/handoff/HandoffRecorder.js:665 (the OTHER, valid status='blocked' writer, targeting sd_phase_handoffs with its own permissive CHECK constraint) is explicitly left untouched",
    ],
    implementation_context: "scripts/modules/handoff/skip-and-continue.js:~120-165 (the blockedMetadata construction and the .update({status:'blocked', ...}) call, plus the updateError.message.includes('0 rows') branch).",
  },
];

async function main() {
  let created = 0;
  for (let i = 0; i < stories.length; i++) {
    const s = stories[i];
    const storyKey = `${SD_KEY}:US-${String(i + 1).padStart(3, '0')}`;

    const { data: existing } = await supabase
      .from('user_stories')
      .select('id')
      .eq('story_key', storyKey)
      .maybeSingle();

    const row = {
      id: existing?.id || randomUUID(),
      story_key: storyKey,
      sd_id: SD_UUID,
      prd_id: PRD_ID,
      title: s.title,
      user_role: s.user_role,
      user_want: s.user_want,
      user_benefit: s.user_benefit,
      story_points: 3,
      priority: i < 2 ? 'critical' : (i < 4 ? 'high' : 'medium'),
      status: 'ready',
      acceptance_criteria: s.acceptance_criteria,
      implementation_context: s.implementation_context,
      created_by: 'PLAN',
      technical_notes: JSON.stringify({ generated_by: 'PLAN_MANUAL', source_fr: `FR-${i + 1}` }),
    };

    const result = existing
      ? await supabase.from('user_stories').update(row).eq('id', existing.id).select('id')
      : await supabase.from('user_stories').insert(row).select('id');

    if (result.error) {
      console.error(`Story ${storyKey} write failed:`, result.error);
      process.exit(1);
    }
    created++;
    console.log(`✓ ${storyKey}: ${result.data?.[0]?.id}`);
  }
  console.log(`\n${created} user stories written OK`);
}

main().catch((e) => { console.error(e); process.exit(1); });
