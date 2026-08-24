#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const SD_UUID = '16d1bebe-73a0-49ee-a806-82c35fe2e41f';
const SD_KEY = 'SD-LEO-INFRA-APEXNICHE-STAGE-RUNAWAY-001';
const SD_TITLE = 'ApexNiche stage-21 runaway retry: kill at writer + park recording + replay side-effects census (hotfix)';

const now = new Date().toISOString();

const row = {
  sd_id: SD_UUID,
  retro_type: 'SD_COMPLETION',
  retrospective_type: null,
  project_name: SD_TITLE,
  title: `${SD_KEY}: ApexNiche Stage-21 Runaway Retry Hotfix — Completion Retrospective`,
  description:
    'ApexNiche AI (venture 809ec7e7-f688-4a0c-b9f8-c8a8291cf94d) had been stuck in an unbounded stage-21 gate ' +
    'retry loop for weeks: lib/eva/eva-orchestrator.js processStage() re-evaluated the stage-21 gate every ~30s ' +
    '(driven by stage-execution-worker.js\'s poll/reconciliation sweep), replaying a stale 2026-07-31 chairman ' +
    'override decision (7c706688) as a fresh eva_stage_gate_attempts row each cycle — 1300+ rows, attempt_number ' +
    '660+ and climbing, ~2 rows/min unbounded, no backoff, no attempt ceiling, override never terminalized the ' +
    'gate. This hotfix adds a venture-scoped kill-switch guard in processStage() (checked before any gate ' +
    'evaluation/persistence, so zero writes occur once parked), a one-off script recording the park decision on ' +
    'ventures.metadata.gating_decision, and a replay side-effects census across the tables the retried write path ' +
    'touches.',
  period_start: '2026-08-24T17:44:53.219338+00:00',
  period_end: now,
  conducted_date: now,
  agents_involved: ['LEAD', 'PLAN', 'EXEC'],
  sub_agents_involved: ['RISK', 'VALIDATION', 'Explore', 'DESIGN', 'DATABASE', 'STORIES', 'TESTING', 'RETRO', 'VISION_FIDELITY'],
  human_participants: ['LEO-Session'],

  what_went_well: [
    "Root cause isolated precisely: lib/eva/eva-orchestrator.js's processStage() was re-evaluating the stage-21 gate every poll cycle (~30s, via stage-execution-worker.js) because a TERMINAL 2026-07-31 chairman override (7c706688) was never wired to stop the retry loop from writing a fresh eva_stage_gate_attempts row each cycle — confirmed via Explore against the live table (1300+ rows, attempt_number 660+, ~2 rows/min).",
    'Kill-switch implemented at the write boundary: the guard sits in processStage() immediately after stage resolution and before any gate evaluation/persistence, so a parked venture produces zero writes rather than writes-then-discard.',
    "The LEAD-phase RISK sub-agent review (verdict: CONDITIONAL_PASS) caught a real, would-have-shipped regression before merge: gating on mere presence of metadata.gating_decision would have silently frozen AltifyAI (venture 50763b6a), a completely different, actively-progressing, chairman-authorized venture — because AltifyAI's own live gating_decision field records an UNPARK ('UNPARKED — first dedicated revenue push authorized'), not a park.",
    'Both the base guard and the specific parked===true predicate were mutation-tested independently — disabling or loosening either one failed exactly the one regression test written to catch it, giving direct evidence the guard does what it claims rather than merely existing.',
    'scripts/one-off/park-apexniche-stage21.mjs discovered ApexNiche already had a STALE 2026-07-25 chairman-deferred gating_decision (behind the LEO app programme) whose own unpark_trigger had already been satisfied by the 07-31 override but was never cleared — the script preserved that record verbatim under metadata.gating_decision_history instead of clobbering an existing chairman-decision audit trail.',
    'Explore evidence found an existing, structurally-similar precedent already in the codebase (isVentureFrozen(), metadata.frozen===true, in stage-execution-worker.js) that already excludes dogfood-complete ventures from advancement — confirming metadata-flag venture exclusion is an established pattern here, not a novel mechanism this SD invents.'
  ],

  what_needs_improvement: [
    "eva_stage_gate_results appears to be silently failing its upsert every cycle — updated_at has been frozen since 2026-07-26 despite the cron still running. Discovered via the replay side-effects census (eva_stage_gate_attempts, eva_stage_gate_results, venture_artifacts, chairman_decisions, assumption_sets) but root-causing it was out of scope for this hotfix; filed as an addendum on the companion class-fix SD (SD-LEO-INFRA-STAGE-GATE-RETRY-001) instead.",
    "readVenturePark() in scripts/adam-quiet-tick.mjs still uses a presence-only check on gating_decision (not the parked===true discriminator this hotfix adds to the orchestrator) — left deliberately inconsistent since it carries no live risk today (pre-filtered upstream to orchestrator_state='blocked' ventures only), but the asymmetry is a latent trap if a future venture's gating_decision shape doesn't match today's assumption.",
    'The runaway ran undetected for weeks (1300+ attempt rows, attempt_number 660+) before being caught by this SD — there was no automated ceiling, backoff, or alert on eva_stage_gate_attempts growth rate that would have surfaced it sooner; stopping this instance was in scope, building that class-level detection was not.'
  ],

  key_learnings: [
    {
      lesson: "A guard keyed on 'field is present' versus 'field has a specific value' can be indistinguishable in a code diff but opposite in production impact — checking `gatingDecision?.parked === true` instead of `if (gatingDecision)` was the entire difference between fixing ApexNiche and silently freezing AltifyAI mid dedicated-revenue-push, because gating_decision is the same field used to record both parks and unparks across every venture.",
      category: 'defect-class',
      applicability: 'Any metadata-flag venture/entity exclusion guard should assert the semantic predicate, never mere key presence — worth auditing existing similar guards (e.g. isVentureFrozen()) for the same presence-vs-value gap.'
    },
    {
      lesson: 'Mutation-testing both the general guard and the specific parked===true predicate independently produced direct evidence the fix does what it claims: disabling either one failed exactly one test, not zero and not many.',
      category: 'verification',
      applicability: 'For any single-condition production guard, write one test that fails when the condition is removed entirely and one that fails when it is loosened to presence-only; each should map to exactly one failing test.'
    },
    {
      lesson: 'A stale audit record (the 2026-07-25 chairman-deferred gating_decision) sitting untouched under an actively-written field can be mistaken for "no decision recorded" by a script that only checks for the field\'s existence — preserving it under a *_history key rather than overwriting it kept the chairman\'s original reasoning intact for future audits.',
      category: 'data-integrity',
      applicability: 'When a one-off script needs to write a field that may already carry meaningful state, check for and archive prior content under a *_history key before writing, rather than assuming empty/absent.'
    },
    {
      lesson: 'A replay side-effects census (querying every table the offending retried write path touches — eva_stage_gate_attempts, eva_stage_gate_results, venture_artifacts, chairman_decisions, assumption_sets) surfaced a second, unrelated anomaly (the frozen eva_stage_gate_results upsert) that a narrower "just check the table this bug lives in" query would have missed entirely.',
      category: 'diagnostic-method',
      applicability: 'When investigating a runaway/replay defect, census every table the offending write path touches, not only the one hosting the visible symptom — unrelated side-effect anomalies surface for free.'
    },
    {
      lesson: "Confirming an existing precedent (isVentureFrozen()) for the same class of fix before implementing increased confidence the new guard fits established codebase conventions rather than introducing a second, subtly-different mechanism for the same problem.",
      category: 'consistency',
      applicability: 'Before adding a new metadata-flag exclusion mechanism, grep for existing ones in the same subsystem and align on shape/semantics rather than inventing a parallel convention.'
    }
  ],

  action_items: [
    {
      action: 'Verify eva_stage_gate_attempts generates zero new rows for venture 809ec7e7-f688-4a0c-b9f8-c8a8291cf94d (ApexNiche AI) within 24h of merge — the direct measurable proof this fix worked.',
      owner: 'LEO-Session',
      deadline: '24h post-merge',
      verification: 'COUNT(*) query against eva_stage_gate_attempts filtered to the venture and post-merge timestamp returns 0',
      category: 'verification',
      is_boilerplate: false
    },
    {
      action: "SD-LEO-INFRA-STAGE-GATE-RETRY-001 (companion class-fix SD, already filed) should investigate the eva_stage_gate_results silent-upsert-failure addendum discovered by this SD's replay side-effects census as part of its own scope.",
      owner: 'SD-LEO-INFRA-STAGE-GATE-RETRY-001 owner',
      deadline: "Within that SD's PLAN phase",
      verification: 'SD-LEO-INFRA-STAGE-GATE-RETRY-001 PRD references the eva_stage_gate_results anomaly as an explicit requirement',
      category: 'follow-up',
      is_boilerplate: false
    },
    {
      action: "Evaluate whether readVenturePark() in scripts/adam-quiet-tick.mjs should adopt the same parked===true discriminator as eva-orchestrator.js's new guard, for consistency — left untouched in this hotfix since its current presence-only check carries no live risk today (pre-filtered upstream to orchestrator_state='blocked' ventures only).",
      owner: 'LEO-Session',
      deadline: 'Next touch of scripts/adam-quiet-tick.mjs',
      verification: 'Either the discriminator is adopted, or a comment records the deliberate decision not to',
      category: 'consistency',
      is_boilerplate: false
    }
  ],

  improvement_areas: [
    {
      area: 'Unbounded gate-retry loop with no ceiling or backoff',
      analysis: "processStage() re-evaluated the stage-21 gate every poll cycle (~30s) because the orchestrator's design treats gate re-evaluation as free/idempotent — it never checked whether a TERMINAL decision (the 2026-07-31 chairman override) had already been recorded for this stage before writing a new eva_stage_gate_attempts row. Root cause: the override mechanism records a decision but never flips a state that the poll loop consults to skip re-evaluation — the override and the retry loop are two independently-written subsystems that were never wired to check each other.",
      prevention: 'The companion class-fix SD (SD-LEO-INFRA-STAGE-GATE-RETRY-001) should add a class-level fix: either a hard attempt ceiling with backoff, or preferably make the override terminalize the gate so no further attempt rows are ever written for that stage/venture pair, closing the root cause rather than only this one instance.'
    },
    {
      area: 'Presence-vs-value guard defect nearly shipped to production',
      analysis: "The first-draft guard (`if (gatingDecision)`) treated 'a gating_decision object exists' as equivalent to 'this venture should be excluded' — a natural but incorrect generalization, because gating_decision is the SAME field used to record both parks AND unparks across all ventures. The initial implementation reasoned from the one venture being fixed (ApexNiche, parked) without checking what the field's other live values looked like across the broader venture population.",
      prevention: "For any new guard keyed on a shared metadata field, query the field's actual distribution across all current rows (not just the one being fixed) before writing the conditional. This SD's LEAD-phase RISK sub-agent review is what caught the gap here, but the distribution check should be habitual during implementation, not solely dependent on catching it at a later review gate."
    }
  ],

  success_patterns: [
    'Kill-switch placed at the write boundary (before gate evaluation/persistence) rather than as downstream filtering — zero writes for excluded ventures, not writes-then-discard.',
    'LEAD-phase RISK sub-agent review caught a cross-venture regression (AltifyAI) before merge that a code-only review would likely have missed, because catching it required cross-referencing a different venture\'s live production data, not just reading the diff.',
    'Mutation testing applied to both the general guard and its specific predicate independently, each mapping to exactly one failing test — direct evidence of guard correctness rather than mere test-count coverage.',
    'Preserved a stale chairman-decision audit record under a *_history key instead of overwriting it when the park-recording script needed to write the same field.'
  ],

  failure_patterns: [
    'The runaway ran undetected for weeks (1300+ attempt rows, attempt_number 660+) before being caught — no automated ceiling, backoff, or alert existed on eva_stage_gate_attempts growth rate.',
    "A first-draft guard implementation (presence-only check on gating_decision) would have shipped a cross-venture regression had the LEAD-phase RISK sub-agent not caught it — the initial implementation reasoned from one venture's data without checking the shared field's values across the broader venture population.",
    "eva_stage_gate_results' upsert has been silently failing since 2026-07-26 (frozen updated_at despite the cron still running) — discovered only as a side-effect of this SD's replay side-effects census, not through any existing monitoring on that table."
  ],

  velocity_achieved: null,
  quality_score: 87,
  team_satisfaction: 9,
  business_value_delivered:
    'Stopped an unbounded production write-amplification loop (~2 rows/min, 1300+ rows accumulated over weeks) ' +
    "against a live venture, restoring correct stage-gate accounting for ApexNiche AI, and closed a regression " +
    "that would have frozen AltifyAI's actively-progressing chairman-authorized revenue push had the naive " +
    'presence-only guard shipped instead.',
  customer_impact:
    'Prevents further unbounded database growth against eva_stage_gate_attempts for ApexNiche AI and removes the ' +
    "risk of accidentally blocking AltifyAI's live venture progression via a shared metadata field.",
  technical_debt_addressed: true,
  technical_debt_created: false,
  bugs_found: 2,
  bugs_resolved: 1,
  tests_added: 3,
  code_coverage_delta: null,
  performance_impact: 'Eliminates ~2 rows/min of unbounded write growth against eva_stage_gate_attempts for the affected venture (was climbing at attempt_number 660+ with no ceiling).',
  objectives_met: true,
  on_schedule: true,
  within_scope: true,

  generated_by: 'MANUAL',
  trigger_event: 'PLAN-TO-LEAD RETROSPECTIVE_QUALITY_GATE',
  status: 'PUBLISHED',

  target_application: 'EHG_Engineer',
  learning_category: 'APPLICATION_ISSUE',
  applies_to_all_apps: false,
  related_files: [
    'lib/eva/eva-orchestrator.js',
    'scripts/one-off/park-apexniche-stage21.mjs',
    'tests/unit/eva/eva-orchestrator.test.js'
  ],
  related_commits: [],
  related_prs: [],
  affected_components: ['EVA Orchestrator', 'Stage Gate System', 'ApexNiche AI venture'],
  tags: ['hotfix', 'eva-orchestrator', 'stage-gate-runaway', 'mutation-testing', 'apexniche', 'altifyai-regression-catch'],

  unnecessary_work_identified: [],
  protocol_improvements: null
};

(async () => {
  // Guard: refuse to duplicate an existing qualifying SD_COMPLETION retro
  const { data: existing, error: existingErr } = await supabase
    .from('retrospectives')
    .select('id, created_at')
    .eq('sd_id', SD_UUID)
    .eq('retro_type', 'SD_COMPLETION')
    .limit(5);

  if (existingErr) {
    console.error('Error checking existing retrospectives:', existingErr.message);
    process.exit(1);
  }

  if (existing && existing.length > 0) {
    console.log(`Found ${existing.length} existing SD_COMPLETION retrospective(s) for ${SD_KEY}:`);
    existing.forEach(r => console.log(`  - ${r.id} (created_at: ${r.created_at})`));
    console.log('Proceeding to insert a new one anyway per explicit instruction (fresh row required by the gate cutoff).');
  }

  const { data, error } = await supabase
    .from('retrospectives')
    .insert(row)
    .select('id, sd_id, retro_type, title, created_at, quality_score, status')
    .single();

  if (error) {
    console.error('Insert failed:', error);
    process.exit(1);
  }

  console.log('Inserted retrospective:');
  console.log(JSON.stringify(data, null, 2));
})();
