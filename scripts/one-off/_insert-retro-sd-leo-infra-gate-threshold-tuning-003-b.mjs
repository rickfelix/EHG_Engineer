#!/usr/bin/env node
/**
 * One-off UPDATE: replace the auto-generated (preflight_autogen) boilerplate
 * SD_COMPLETION retrospective for SD-LEO-INFRA-GATE-THRESHOLD-TUNING-003-B
 * ("Apply the three zero-flip threshold increases: bugfix x prd, feature x
 * prd, security x user_story") with the genuine retrospective, required
 * evidence for the PLAN-TO-LEAD RETROSPECTIVE_QUALITY gate.
 *
 * The preflight_autogen row (id 0593db50-65bf-41d5-9696-afc1b12808ea,
 * created 2026-09-05T15:20:21Z) is pure boilerplate -- it does not mention
 * the vacuous shadow-rescore finding, the scope correction, or the
 * fleet-wide escalation. We UPDATE it in place rather than insert a second
 * SD_COMPLETION row, since dedup logic (generate-comprehensive-retrospective.js)
 * only checks for row existence, not quality.
 *
 * Run from repo root: node <this-file>
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const SD_UUID = 'c5cb3972-4f60-4cfe-a845-912bf435a60a';
const EXISTING_RETRO_ID = '0593db50-65bf-41d5-9696-afc1b12808ea';

async function main() {
  const { data: existing, error: fetchError } = await supabase
    .from('retrospectives')
    .select('id, sd_id, retro_type, generated_by')
    .eq('id', EXISTING_RETRO_ID)
    .eq('sd_id', SD_UUID)
    .eq('retro_type', 'SD_COMPLETION')
    .single();

  if (fetchError || !existing) {
    console.error('Expected boilerplate retrospective row not found — refusing to guess a target row.', fetchError);
    process.exit(1);
  }

  const retrospective = {
    project_name: 'Apply the three zero-flip threshold increases (bugfix x prd, feature x prd, security x user_story)',
    title: 'SD-LEO-INFRA-GATE-THRESHOLD-TUNING-003-B: three "apply" targets were already live -- the real defect was in the measurement, not the config',
    description: 'Child B of parent SD-LEO-INFRA-GATE-THRESHOLD-TUNING-003, assigned FR-1/FR-2/FR-3: apply three gate-threshold increases (bugfix x prd 60->65, feature x prd 60->65, security x user_story 65->70) in scripts/modules/ai-quality-evaluator/config.js, citing the parent\'s 2026-09-04 shadow-rescore instrument\'s "0 PASS-to-FAIL flips" as the acceptance basis. LEAD-phase discovery (this session, independently confirmed by an Explore sub-agent, evidence bc236f00, and a VALIDATION sub-agent, evidence 0fae5eb5): all three target values were ALREADY live, applied weeks earlier by two unrelated, already-completed quick-fixes -- QF-20260817-837 (bugfix.prd=65, feature.prd=65; commits 95c47ad70bb, 882a789bf85; landed 2026-08-28) and QF-20260807-698 (security.default=70, covering user_story; commit 3f285a83e9b; landed 2026-08-16) -- both predating this SD\'s 2026-09-05 creation AND the parent\'s own 2026-09-04 shadow-rescore measurement. The VALIDATION sub-agent then traced a deeper root cause: the parent\'s shadow-rescore evidence was VACUOUS for these three pairs, not merely stale. gate-threshold-shadow-rescore.mjs:59 filters its re-score population by `.eq(\'pass_threshold\', c.current_threshold)` using the recommendation view\'s historical current_threshold value -- for a pair that was already raised, the view emits a live row and a stale "ghost" row for the pre-raise historical group, and the shadow instrument re-scores ONLY the ghost/pre-raise population. Confirmed empirically: each shadow row\'s n exactly matches its pre-raise group\'s size (e.g. feature x prd shadow n=33 = the historical 60-group\'s exact size). The "0 flips" evidence the parent SD\'s acceptance criteria organizes around never touched a single post-raise assessment. Ironically, config.js\'s own top-of-file comment (added earlier by QF-20260830-735) already documents this exact historical-vs-live trap in general terms -- the shadow-rescore script\'s own read site still fell into the trap the codebase had already named. Scope was corrected via scripts/one-off/lead-correct-scope-tuning-003-b.mjs and plan-correct-prd-tuning-003-b.mjs (commit edb9db2e8c3) from "apply a threshold change" (none needed) to "durably document the already-applied thresholds with real post-raise evidence": commit 9b949fda7db computed live-population pass rates directly against ai_quality_assessments at the actual live pass_threshold (bugfix x prd n=46 pass=97.8%, feature x prd n=10 pass=90.0%, security x user_story n=31 pass=87.1%, all clearing the >=10 sample floor established by TUNING-001\'s guards), cited those in config.js comments explicitly flagging the vacuous shadow rows as do-not-cite by UUID, and added one missing direct unit test pin (getPassThreshold(\'user_story\', {sd_type:\'security\'}) === 70) that was previously only covered indirectly. The finding was escalated to the coordinator (signals 4594b2fc and 512f6118, both high severity) because it extends to all eight of the parent\'s FRs, not just this child\'s three: sibling -C\'s pairs (infrastructure x prd/retrospective, security x retrospective) and -D\'s pairs (bugfix x retrospective, feature x retrospective) are also already-applied no-ops. -D\'s case is more serious -- Solomon\'s own ruling had explicitly HELD those two 3-flip pairs pending hand-inspection of the flipped rows before any raise, but QF-20260817-837 already applied that exact raise on 2026-08-28, seemingly without that inspection happening -- flagged for the coordinator to route, not this child\'s job to resolve.',
    conducted_date: new Date().toISOString(),
    agents_involved: ['LEAD', 'PLAN', 'EXEC'],
    sub_agents_involved: ['Explore', 'VALIDATION', 'DESIGN', 'SECURITY', 'RISK', 'DATABASE', 'STORIES', 'TESTING', 'REGRESSION'],
    human_participants: ['LEAD'],

    what_went_well: [
      'Multi-source independent verification before committing to a scope correction: the LEAD-phase discovery that all three FR targets were already live was cross-checked by a spawned Explore sub-agent (evidence bc236f00, confidence 98, PASS) AND a VALIDATION sub-agent (evidence 0fae5eb5, confidence 96, PASS) before the PRD or config.js were touched -- no single source was trusted to justify rewriting the SD\'s scope.',
      'The investigation did not stop at "the acceptance evidence is stale" -- it kept going to find the acceptance evidence was structurally VACUOUS: gate-threshold-shadow-rescore.mjs:59 filters its re-score population by the recommendation view\'s historical current_threshold, so for an already-raised pair it re-scores only the pre-raise "ghost" population and never touches a single post-raise assessment. This was confirmed empirically (each shadow row\'s n exactly matches its pre-raise group\'s size), not just inferred from reading the code.',
      'A genuine instrument defect was distinguished from a mere stale-data problem: the parent\'s "0 flips" claim wasn\'t wrong data that would self-correct on a rerun -- rerunning the same buggy read site against the same ghost population would always report 0 flips, regardless of whether the live threshold is actually safe.',
      'Scope was corrected honestly rather than rubber-stamped: the PRD\'s original framing (cite the parent\'s shadow-rescore rows as safety evidence) was rejected even though it would have been the path of least resistance, in favor of independently re-querying ai_quality_assessments directly at the live pass_threshold for real post-raise numbers (bugfix x prd n=46/97.8%, feature x prd n=10/90.0%, security x user_story n=31/87.1%).',
      'The finding was escalated to the coordinator (signals 4594b2fc, 512f6118) as a fleet-wide-relevant defect rather than silently fixed only for this child\'s three-pair slice -- the same vacuous-shadow-row bug affects sibling -C\'s and -D\'s FR pairs, and -D\'s case surfaces a more serious concern (a raise that bypassed Solomon\'s explicit hand-inspection hold). Routing that upward instead of scope-creeping into fixing -C/-D\'s work was the correct boundary to hold.',
      'The fix left a durable, specific paper trail: config.js\'s comments now name the exact vacuous shadow-row UUIDs (1cdcaecd-bb34-4dc9-82ba-7c5270dace77, 22cbb767-741c-44d0-a669-e8cb62448bbd, d9ad5522-654c-4fc2-81e1-ee92ea05c16f) as do-not-cite, so a future reader hitting the same rows does not repeat the mistake.'
    ],

    what_needs_improvement: [
      'The parent orchestrator\'s FR-1/FR-2/FR-3 acceptance criteria were written around a shadow-rescore instrument whose read-site bug (filtering by historical current_threshold rather than the live getPassThreshold() value) was never caught before being cited as the basis for assigning "apply" work to three children -- the bug should have been caught when the shadow-rescore script was first written, not three SDs downstream.',
      'config.js\'s own top-of-file comment (added earlier by QF-20260830-735) already documented the exact historical-vs-live divergence trap in general terms, yet the shadow-rescore script\'s own read site fell into that exact trap -- the warning existed in the codebase but was not consulted (or not connected) when gate-threshold-shadow-rescore.mjs was authored.',
      'Two of the three "apply" targets in this child, plus at least four more across siblings -C and -D, turned out to be no-ops because the parent SD was created without first checking current config.js state against already-landed QFs -- a live-state check before decomposing the parent into per-pair children would have caught most of this at parent-LEAD time instead of at each child\'s LEAD phase individually.',
      'The -D sibling\'s exposure is more serious than a stale measurement: QF-20260817-837 appears to have applied a raise that Solomon\'s own ruling had explicitly HELD pending hand-inspection of flipped rows -- this needs the coordinator\'s routing and is not confirmed resolved as of this retrospective.'
    ],

    action_items: [
      {
        owner: 'Coordinator (routing signals 4594b2fc, 512f6118)',
        action: 'Confirm gate-threshold-shadow-rescore.mjs:59\'s root read-site bug is tracked under sibling -E\'s FR-10 scope and fixed to compare against live getPassThreshold() output rather than the recommendation view\'s historical current_threshold column, so future shadow-rescore runs cannot silently vacuous-measure an already-raised pair.',
        status: 'proposed',
        deadline: 'Before sibling -E EXEC phase begins',
        verification: 'gate-threshold-shadow-rescore.mjs diff shows the population filter keyed on getPassThreshold(content_type, {sd_type}) rather than c.current_threshold, and a regression test asserts an already-raised pair is re-scored against its live population'
      },
      {
        owner: 'Coordinator / LEAD on sibling -D',
        action: 'Verify whether QF-20260817-837\'s 2026-08-28 raise of the bugfix x retrospective / feature x retrospective pairs actually satisfied Solomon\'s prior hand-inspection hold on those two 3-flip pairs, or whether the hold was bypassed -- this is flagged, not resolved, by this child.',
        status: 'proposed',
        deadline: 'Before sibling -D reaches PLAN-TO-LEAD',
        verification: 'A dated record (signal reply, ruling, or retrospective note) confirms the hand-inspection occurred before or as part of QF-20260817-837, or documents remediation if it did not'
      },
      {
        owner: 'PLAN (parent SD-LEO-INFRA-GATE-THRESHOLD-TUNING-003 owner)',
        action: 'Audit sibling -C\'s remaining FR pairs (infrastructure x prd/retrospective, security x retrospective) for the same already-applied-no-op pattern found in this child and in -D, before -C reaches its own PLAN-TO-LEAD gate.',
        status: 'proposed',
        deadline: 'Before sibling -C PLAN-TO-LEAD handoff',
        verification: '-C\'s retrospective or PRD explicitly states current live config.js values for each of its FR pairs, cross-checked against git blame/QF history'
      }
    ],

    key_learnings: [
      {
        lesson: 'A "0 flips" shadow-rescore result is not automatically trustworthy safety evidence -- it must be checked against which population was actually re-scored, not just accepted at face value. gate-threshold-shadow-rescore.mjs:59\'s `.eq(\'pass_threshold\', c.current_threshold)` filter used the recommendation view\'s HISTORICAL current_threshold, so for an already-raised pair it silently re-scored only the pre-raise "ghost" group and reported zero flips regardless of whether the live threshold was ever tested.',
        category: 'testing',
        applicability: 'Any shadow/canary re-measurement instrument that compares against a threshold or config value pulled from a view or snapshot (rather than the live config module directly) should be audited for this class of divergence before its output is cited as acceptance evidence.'
      },
      {
        lesson: 'A recommendation view keyed on historical per-assessment values can silently diverge from live config even when the config module\'s own top-of-file comment already warns about exactly this trap in general terms -- documentation proximity does not guarantee the warning was read or connected at the point where a new script (gate-threshold-shadow-rescore.mjs) independently re-derives the same class of comparison.',
        category: 'architecture',
        applicability: 'When writing a new measurement script against a config value that already has a documented historical-drift hazard, explicitly cross-reference and test against that hazard rather than re-deriving the comparison logic from scratch.'
      },
      {
        lesson: 'When an orchestrator parent decomposes into per-pair children based on a single shared measurement, a defect in that measurement is not local to one child -- it was confirmed to extend to all eight of the parent\'s FRs across three children (this SD plus siblings -C and -D). Fixing only the child currently in hand and staying silent about the others would have left five more no-ops undiscovered.',
        category: 'process',
        applicability: 'When a child SD finds its assigned scope was already satisfied due to an upstream measurement or planning defect, check whether the same defect could affect sibling children before closing the finding as local.'
      },
      {
        lesson: 'Independent verification via two different mechanisms (a spawned Explore sub-agent AND a VALIDATION sub-agent, each producing its own DB evidence row) before rewriting a PRD\'s scope gave the scope correction a stronger evidentiary basis than a single source would have, and made the subsequent deeper VALIDATION-agent finding (the vacuous shadow rows) credible enough to escalate as a fleet-wide signal rather than treated as one child\'s idiosyncratic reading.',
        category: 'process',
        applicability: 'Before correcting an SD\'s scope based on a "the target is already done" finding, seek at least one independent confirmation via a different sub-agent or mechanism rather than acting on a single observation.'
      },
      {
        lesson: 'Distinguishing "the evidence is stale" from "the evidence is structurally incapable of proving the claim" changes the correct response: stale evidence just needs a rerun, but gate-threshold-shadow-rescore.mjs\'s read-site bug means rerunning it against the same live config would STILL report 0 flips forever, because it can never reach the post-raise population. The fix had to be a direct independent query against ai_quality_assessments at the live threshold, not a request to "rerun the shadow-rescore."',
        category: 'testing',
        applicability: 'When evidence looks suspiciously convenient (e.g. always 0 flips), check whether the instrument is even measuring the population it claims to, before assuming a rerun would produce different numbers.'
      }
    ],

    quality_score: 90,
    team_satisfaction: 9,
    business_value_delivered: 'Prevented false acceptance-criteria closure across a chairman-ratified gate-threshold tuning initiative: instead of stamping "applied" on three no-op config changes based on vacuous shadow-rescore evidence, this child produced real post-raise safety numbers for all three pairs and surfaced a measurement-instrument defect that was silently invalidating the parent orchestrator\'s entire acceptance basis across all eight FRs, including a more serious possible hold-bypass in sibling -D.',
    customer_impact: 'No direct end-user surface (internal gate-tuning config); indirect impact is trustworthy gate-threshold safety evidence for the AI quality evaluator that gates PRD/bugfix/feature/security content across the LEO pipeline.',
    technical_debt_addressed: true,
    technical_debt_created: false,
    bugs_found: 1,
    bugs_resolved: 0,
    tests_added: 1,
    code_coverage_delta: null,
    performance_impact: 'None -- comments-only config.js diff plus one direct unit test pin; no runtime threshold values changed',
    objectives_met: true,
    on_schedule: true,
    within_scope: false,

    success_patterns: [
      'Multi-source independent verification (Explore evidence bc236f00 + VALIDATION evidence 0fae5eb5) before rewriting SD scope, rather than acting on a single LEAD-phase observation',
      'Root-cause tracing continued past "the data is stale" to find the shadow-rescore instrument was structurally vacuous for already-raised pairs, not merely outdated',
      'Fleet-wide-relevant finding escalated to the coordinator (signals 4594b2fc, 512f6118) rather than silently patched only for this child\'s three-pair slice',
      'Vacuous evidence rows named by UUID directly in config.js comments as do-not-cite, leaving a durable trail for future readers'
    ],
    failure_patterns: [
      'Parent orchestrator decomposed into per-pair children based on a shared shadow-rescore measurement whose read-site bug was never caught before being cited as acceptance-criteria evidence for FR-1 through FR-8',
      'config.js\'s own documented historical-vs-live divergence warning (from QF-20260830-735) was not connected when gate-threshold-shadow-rescore.mjs was authored, letting a new script re-fall into an already-named trap',
      'Sibling -D\'s QF-20260817-837 raise appears to have bypassed Solomon\'s explicit prior hold on hand-inspecting flipped rows before that raise -- unresolved as of this retrospective, routed to the coordinator'
    ],
    improvement_areas: [
      'Fix gate-threshold-shadow-rescore.mjs:59 to compare against live getPassThreshold() output instead of the recommendation view\'s historical current_threshold (tracked under sibling -E FR-10)',
      'Confirm or remediate whether sibling -D\'s QF-20260817-837 raise bypassed Solomon\'s hand-inspection hold',
      'Audit sibling -C\'s remaining FR pairs for the same already-applied-no-op pattern before its own PLAN-TO-LEAD gate'
    ],

    generated_by: 'MANUAL',
    trigger_event: 'PLAN_TO_LEAD_HANDOFF_PREP',
    status: 'PUBLISHED',
    target_application: 'EHG_Engineer',
    learning_category: 'PROCESS_IMPROVEMENT',
    related_files: [
      'scripts/modules/ai-quality-evaluator/config.js',
      'tests/unit/quality/ai-quality-evaluator-config.test.js',
      'scripts/gate-threshold-shadow-rescore.mjs',
      'scripts/one-off/lead-correct-scope-tuning-003-b.mjs',
      'scripts/one-off/plan-correct-prd-tuning-003-b.mjs'
    ],
    related_commits: ['edb9db2e8c3', '9b949fda7db'],
    related_prs: [],
    affected_components: [
      'scripts/modules/ai-quality-evaluator/config.js (SD_TYPE_PASS_THRESHOLDS)',
      'scripts/gate-threshold-shadow-rescore.mjs (root read-site defect, not fixed by this child)',
      'ai_quality_assessments (queried directly for real post-raise pass rates)'
    ],
    tags: ['gate-threshold-tuning', 'shadow-rescore-defect', 'orchestrator-child', 'scope-correction', 'measurement-integrity'],
    auto_generated: false,
    metadata: { updated_by: 'manual-retro-replacement', replaced_preflight_autogen: true, updated_at: new Date().toISOString() }
  };

  const { data: updated, error } = await supabase
    .from('retrospectives')
    .update(retrospective)
    .eq('id', EXISTING_RETRO_ID)
    .select();

  if (error) {
    console.error('UPDATE FAILED:', error);
    process.exit(1);
  }

  console.log('Retrospective replaced.');
  console.log('  id:', updated[0].id);
  console.log('  sd_id:', updated[0].sd_id);
  console.log('  retro_type:', updated[0].retro_type);
  console.log('  status:', updated[0].status);
  console.log('  quality_score:', updated[0].quality_score);
  console.log('  updated_at:', updated[0].updated_at);
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
