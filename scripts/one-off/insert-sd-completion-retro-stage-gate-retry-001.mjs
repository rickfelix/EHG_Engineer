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

const SD_UUID = '8077da1b-7888-4a91-aba8-bfe459e61334';
const SD_KEY = 'SD-LEO-INFRA-STAGE-GATE-RETRY-001';
const SD_TITLE = 'Stage-gate retry class fix: bounded retries + override terminalization (family, not one venture)';

const now = new Date().toISOString();

const row = {
  sd_id: SD_UUID,
  retro_type: 'SD_COMPLETION',
  retrospective_type: null,
  project_name: SD_TITLE,
  title: `${SD_KEY}: Bounded Gate Retries + Override Idempotency — Completion Retrospective`,
  description:
    "Class-level fix for the incident class that produced the ApexNiche stage-21 runaway (companion hotfix " +
    "SD-LEO-INFRA-APEXNICHE-STAGE-RUNAWAY-001, already shipped as a narrow point-fix). The chairman-override " +
    "re-evaluation path in EVA's stage-gate orchestrator (lib/eva/eva-orchestrator.js, " +
    "lib/eva/stage-execution-worker.js, lib/eva/artifact-persistence-service.js) had no idempotency check, " +
    "producing 1900+ unbounded eva_stage_gate_attempts rows for ApexNiche stage 21 over the poll loop's ~30s " +
    "cadence -- and no venture/stage anywhere in the system ever had a retry ceiling at all. This SD adds an " +
    "idempotent short-circuit in recordGateOverride keyed on gate_criteria.override.decision_id, a new " +
    "lib/eva/gate-retry-guard.js module (bounded ceiling, backoff, terminal MANUAL_REQUIRED state) wired into " +
    "the poll loop, and a paginated census script. A retrospective adversarial TESTING+SECURITY re-review of " +
    "the first EXEC diff found three more real defects -- most notably a backoff schedule keyed on attemptCount " +
    "that silently froze forever because the worker skips evaluation while backing off, so the counter it was " +
    "gated on never advanced. All three were fixed and mutation-verified in a second EXEC pass.",
  period_start: '2026-08-24T17:44:54.256647+00:00',
  period_end: now,
  conducted_date: now,
  agents_involved: ['LEAD', 'PLAN', 'EXEC'],
  sub_agents_involved: ['RISK', 'TESTING', 'SECURITY', 'DATABASE', 'VALIDATION'],
  human_participants: ['LEO-Session'],

  what_went_well: [
    'The class-fix vs point-fix distinction was made explicit from the start: the companion hotfix ' +
      'SD-LEO-INFRA-APEXNICHE-STAGE-RUNAWAY-001 stopped the one visible instance (ApexNiche stage 21) with a ' +
      'kill-switch; this SD closed the underlying defect class (no idempotency check on override re-evaluation, ' +
      'no retry ceiling anywhere in the system) so the same failure mode cannot recur against a different ' +
      'venture/stage pair.',
    "A prospective TESTING sub-agent review (evidence 136b3c0e) falsified two LEAD-phase premises by reading " +
      "the actual code and git history directly rather than trusting the ventures.metadata.gating_decision_history " +
      "narrative that had named this SD as the unpark condition: the eva_stage_gate_results write path was never " +
      "actually broken (recordGateOverride reliably writes gate_criteria.override every time), and the ~2h gap " +
      "between the park flag and the runaway stopping was fully explained by two sequential fix commits landing " +
      "at different times -- not a caching defect. Both corrections were made to the PRD (FR-3/TR-2/TR-3/TS-3/TS-6) " +
      "before EXEC began, so implementation targeted the real defect (stage-execution-worker.js:867 never checked " +
      "for an already-recorded override) instead of a plausible-sounding but wrong one.",
    'A retrospective adversarial TESTING+SECURITY re-review of the completed EXEC diff (not just the PLAN-phase ' +
      'premise) caught three further real, non-obvious defects the first implementation introduced -- a CRITICAL ' +
      'silent-freeze regression, a PostgREST 1000-row cap silently truncating the census script, and a permanent ' +
      'audit-suppression edge case in the idempotency short-circuit. All three were independently re-verified via ' +
      'mutation testing (reverting each fix individually and confirming the corresponding new test failed).',
    'The mutation-testing discipline applied twice in this SD (once implicitly via the round-2 adversarial pass, ' +
      'and explicitly by reverting each of the three round-2 fixes and confirming exactly the expected test broke) ' +
      'gives direct evidence the fixes do what they claim, not merely that new tests exist and pass.'
  ],

  what_needs_improvement: [
    'The first EXEC implementation shipped a backoff design (attemptCount-based) that was WORSE than the bug it ' +
      'replaced: the original unbounded-write bug was at least visible (rows kept accumulating in the DB); the ' +
      'first-draft fix produced a silent, permanent freeze once backoff engaged, because the worker skips gate ' +
      'evaluation during backoff and attemptCount is only incremented by evaluation. This was not caught until a ' +
      'dedicated retrospective adversarial review pass -- the original EXEC implementer reasoned about the backoff ' +
      'schedule in isolation without tracing what advances its own trigger variable.',
    "The census script's unbounded .select() silently returning a PostgREST-capped 1000 rows (against a real " +
      '1902-row ApexNiche specimen) went undetected through the first implementation and its own test suite -- ' +
      'the test fixture apparently never exercised a specimen large enough to hit the cap, so a positive-control ' +
      'test against a realistic row count should have been part of FR-4 from the start rather than added in the ' +
      'round-2 correction.',
    'The idempotency short-circuit (SEC-2) initially keyed on gate_criteria.override.decision_id alone, which ' +
      'would have permanently suppressed retries after a transient attempt-write failure -- the pre-fix code ' +
      'accidentally self-healed this exact failure mode by retrying both writes every cycle, so the fix had to be ' +
      'careful not to trade an unbounded-write bug for a silently-stuck-forever bug on a different axis; this ' +
      'ordering hazard (state written before the operation it gates has confirmed success) was only caught by an ' +
      'independent SECURITY review, not by the original implementer.'
  ],

  key_learnings: [
    {
      lesson: 'A backoff/retry mechanism that gates its own delay schedule on a counter which is only advanced by ' +
        'the very action the backoff is suppressing is a self-referential fixed point: once backoff engages, the ' +
        'counter freezes, the delay condition therefore never resolves, and the mechanism becomes permanently and ' +
        'silently stuck instead of eventually reaching its ceiling. attemptCount-based backoff on ' +
        'gate-retry-guard.js hit exactly this trap because the worker skips gate evaluation while backing off. ' +
        'The fix -- wall-clock-time-based backoff (elapsed time since the last recorded attempt) -- always ' +
        'advances every poll tick regardless of whether evaluation runs, so a stuck venture genuinely reaches the ' +
        'ceiling instead of freezing at a fixed count.',
      category: 'defect-class',
      applicability: 'Any future retry/backoff mechanism in this codebase should default to wall-clock-time ' +
        'gating, not attempt-count gating, per this SD\'s round-1 self-freeze defect -- audit gate-retry-guard.js ' +
        'as the canonical reference implementation, and treat any new backoff counter keyed on an action the ' +
        'backoff itself can suppress as a design smell worth an explicit trace before shipping.'
    },
    {
      lesson: 'Trusting a DB-recorded narrative (ventures.metadata.gating_decision_history naming this SD as the ' +
        'unpark condition, with an implied causal story about a caching defect) instead of reading the actual code ' +
        'and git log directly would have carried a wrong PLAN-phase premise all the way into EXEC. The prospective ' +
        'TESTING review that falsified it did so by tracing recordGateOverride\'s real write behavior and by lining ' +
        'up the actual commit timestamps against the ~2h gap, not by re-reading the DB row a second time.',
      category: 'verification',
      applicability: 'When a defect narrative originates from a DB record written during a prior incident (park ' +
        'flags, gating_decision_history, postmortem notes), treat it as a hypothesis to falsify against direct ' +
        'code + git evidence during PLAN, not as an established premise to build a PRD around.'
    },
    {
      lesson: 'PostgREST silently caps unbounded .select() queries at 1000 rows -- a census/audit script written ' +
        'and tested against a small fixture will pass every test while silently under-reporting on any real ' +
        'specimen past that cap (verified live: 1902 real ApexNiche rows, only 1000 returned pre-fix).',
      category: 'defect-class',
      applicability: 'Any script reading a table that can plausibly exceed 1000 rows (retry/attempt logs, audit ' +
        'trails, event streams) must paginate via .range() and should carry a regression test seeded with a ' +
        'row count past the cap, not just a handful of fixture rows.'
    },
    {
      lesson: 'An idempotency short-circuit keyed on a flag written BEFORE the operation it is meant to guard has ' +
        'confirmed success can convert a transient failure into a permanent one -- the pre-fix code\'s apparent bug ' +
        '(re-recording on every poll) was incidentally also its safety net against write failures. The fix had to ' +
        'add a distinct attempt_recorded=true stamp, set only after the guarded write actually succeeds, rather ' +
        'than reusing the decision-identity field that was already being written earlier in the same code path.',
      category: 'defect-class',
      applicability: 'When adding an idempotency/short-circuit check, verify the flag it reads is set strictly ' +
        'after the operation it is meant to make idempotent has confirmed success -- never reuse a field that is ' +
        'written earlier in the same function for a different purpose.'
    }
  ],

  action_items: [
    {
      action: 'Audit other retry/backoff mechanisms in the EVA orchestrator subsystem (and elsewhere in the ' +
        'codebase) for the same attemptCount-vs-wall-clock-time self-freeze pattern found and fixed in ' +
        'lib/eva/gate-retry-guard.js by this SD.',
      owner: 'LEO-Session',
      deadline: 'Next EVA orchestrator touch',
      verification: 'A grep for backoff/retry logic gated on an in-loop counter that the same loop can skip ' +
        'incrementing, cross-referenced against SD-LEO-INFRA-STAGE-GATE-RETRY-001\'s round-1 defect as the known ' +
        'pattern to check for',
      category: 'follow-up',
      is_boilerplate: false
    },
    {
      action: 'Any census/audit script added in this codebase reading eva_stage_gate_attempts, ' +
        'eva_stage_gate_results, or similarly unbounded event/log tables should default to .range()-based ' +
        'pagination and carry a positive-control test seeded above 1000 rows, per the PostgREST cap defect found ' +
        'in scripts/eva/census-unbounded-retry.mjs.',
      owner: 'LEO-Session',
      deadline: 'Code review standard, effective immediately',
      verification: 'New census/audit scripts include a .range() call and a >1000-row regression test',
      category: 'process',
      is_boilerplate: false
    },
    {
      action: 'Verify eva_stage_gate_attempts growth for the ApexNiche stage-21 venture and any other ' +
        'venture/stage pair approaching GATE_RETRY_CEILING stays bounded and reaches MANUAL_REQUIRED terminal ' +
        'state (never a silent freeze) within 7 days of merge, using scripts/eva/census-unbounded-retry.mjs.',
      owner: 'LEO-Session',
      deadline: '7d post-merge',
      verification: 'census-unbounded-retry.mjs run against production returns zero ventures stuck past the ' +
        'ceiling without a MANUAL_REQUIRED terminal state',
      category: 'verification',
      is_boilerplate: false
    }
  ],

  improvement_areas: [
    {
      area: 'Retry/backoff counter coupled to its own gating condition',
      analysis: 'gate-retry-guard.js\'s first implementation keyed the backoff delay on attemptCount, but ' +
        'stage-execution-worker.js\'s poll loop skips gate evaluation entirely while backing off -- and ' +
        'attemptCount is only incremented as a side effect of evaluation running. The two facts compose into a ' +
        'fixed point: once backoff engages, the condition that would end backoff (attemptCount advancing) can ' +
        'never occur, because evaluation (the only thing that advances it) is exactly what backoff is suppressing.',
      prevention: 'Redesigned backoff to be wall-clock-time-based (elapsed time since the last recorded attempt), ' +
        'which advances on every poll tick independent of whether evaluation runs. Generalize: any retry counter ' +
        'used inside a backoff/suppression condition must be independent of the action the backoff suppresses.'
    },
    {
      area: 'Unbounded .select() silently truncated by PostgREST\'s default 1000-row cap',
      analysis: 'scripts/eva/census-unbounded-retry.mjs\'s original query had no explicit range/limit, and its ' +
        'test suite never seeded a specimen large enough to exercise the cap -- so a script whose entire purpose ' +
        'is detecting runaway growth would itself under-report once the runaway it was built to detect grew past ' +
        '1000 rows (as ApexNiche\'s real 1902-row case did).',
      prevention: 'Paginated via .range(); added a regression test seeding a 1902-row specimen against a ' +
        '1000-row page. Any future table-scanning script in this codebase should assume PostgREST\'s cap applies ' +
        'and test against a specimen sized past it.'
    }
  ],

  success_patterns: [
    'Class-fix scoped explicitly against a companion point-fix SD (SD-LEO-INFRA-APEXNICHE-STAGE-RUNAWAY-001) -- ' +
      'the point-fix stopped the one visible instance, this SD closed the defect class so it cannot recur ' +
      'elsewhere.',
    'PLAN-phase premise falsification via direct code + git evidence (not trusting the DB\'s own incident ' +
      'narrative) corrected two wrong assumptions (broken write path, caching defect) before EXEC began, avoiding ' +
      'implementation effort spent fixing the wrong root cause.',
    'A dedicated retrospective adversarial TESTING+SECURITY re-review of the completed EXEC diff (beyond the ' +
      'PLAN-phase review) caught a CRITICAL regression the first implementation had introduced, before it shipped.',
    'Every round-2 fix was mutation-tested by reverting it individually and confirming the corresponding new test ' +
      'failed -- direct evidence the fixes do what they claim rather than merely existing alongside passing tests.'
  ],

  failure_patterns: [
    'The first EXEC implementation\'s backoff design was silently WORSE than the bug it replaced: an ' +
      'attemptCount-gated backoff froze permanently and invisibly once triggered, versus the original bug\'s ' +
      'unbounded-but-at-least-visible DB row growth.',
    'A census script built specifically to detect runaway row growth silently under-reported once growth passed ' +
      'PostgREST\'s 1000-row default cap -- undetected by its own test suite because no test seeded a specimen ' +
      'past that threshold.',
    'An idempotency short-circuit added to fix one bug (unbounded override re-recording) nearly introduced a ' +
      'different one (permanent suppression after a transient write failure) by keying on a flag written before ' +
      'the operation it was meant to guard had confirmed success.'
  ],

  velocity_achieved: null,
  quality_score: 88,
  team_satisfaction: 9,
  business_value_delivered:
    'Closed the defect CLASS behind the ApexNiche stage-21 runaway incident (1900+ unbounded ' +
    'eva_stage_gate_attempts rows) so the same failure mode -- override re-evaluation with no idempotency check, ' +
    'no retry ceiling anywhere in the orchestrator -- cannot recur against a different venture/stage pair. Also ' +
    'caught and fixed a CRITICAL regression (permanent silent freeze) that the first implementation would have ' +
    'introduced, before it reached production.',
  customer_impact:
    'Prevents unbounded database write growth against eva_stage_gate_attempts for any venture/stage whose gate ' +
    'is chairman-overridden, and guarantees any venture that does hit persistent gate failures reaches an ' +
    'explicit MANUAL_REQUIRED terminal state instead of retrying forever or freezing silently.',
  technical_debt_addressed: true,
  technical_debt_created: false,
  bugs_found: 5,
  bugs_resolved: 5,
  tests_added: 7,
  code_coverage_delta: null,
  performance_impact:
    'Eliminates unbounded eva_stage_gate_attempts write growth from override re-evaluation across the entire ' +
    'orchestrator (not just the one previously-hotfixed venture), and bounds every venture/stage gate re-try to ' +
    'GATE_RETRY_CEILING with wall-clock-time-based backoff.',
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
    'lib/eva/stage-execution-worker.js',
    'lib/eva/artifact-persistence-service.js',
    'lib/eva/gate-retry-guard.js',
    'scripts/eva/census-unbounded-retry.mjs',
    'tests/unit/eva/gate-retry-guard.test.js',
    'tests/unit/eva/census-unbounded-retry.test.js',
    'tests/unit/eva/stage-execution-worker-gate-retry-ceiling-guard.test.js'
  ],
  related_commits: ['6ff545594c2', '2ec8fe49164', '8430fe45560', '7179a668d61'],
  related_prs: [],
  affected_components: ['EVA Orchestrator', 'Stage Gate System', 'gate-retry-guard'],
  tags: ['class-fix', 'eva-orchestrator', 'stage-gate-retry', 'mutation-testing', 'backoff-self-freeze', 'apexniche'],

  unnecessary_work_identified: [],
  protocol_improvements: null
};

(async () => {
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
