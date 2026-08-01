/**
 * LEAD-phase evidence for SD-FDBK-FIX-COMPLETION-FLAG-HARNESS-001.
 *
 * Writes (a) the Explore sub-agent row -- Explore is a read-only Claude Code built-in that
 * cannot self-write, and `execute-subagent.js --code EXPLORE` resolves against leo_sub_agents
 * where no Explore row exists, so the designed path is Task-tool invocation with the worker
 * persisting the result -- and (b) mechanism_verifications on the SD.
 *
 * The verification record deliberately carries the claims that REFUTED my own readings. A
 * verification record that omits what corrected it is the same failure the gate exists to catch.
 *
 * Idempotent on both writes.
 */
import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';

const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_UUID = '222e317f-926c-4d5c-99eb-b98ee8d24f53';
const SD_KEY = 'SD-FDBK-FIX-COMPLETION-FLAG-HARNESS-001';
// process.cwd(), never a hand-typed literal: Windows path literals get mangled by JS
// string-escape parsing, which the reject_control_chars_in_subagent_evidence guard catches.
const CWD = process.cwd();

// ---------- (a) Explore evidence row ----------
const existing = await s
  .from('sub_agent_execution_results')
  .select('id')
  .eq('sd_id', SD_UUID)
  .eq('sub_agent_code', 'Explore')
  .limit(1);

if (existing.data && existing.data.length) {
  console.log('EXPLORE ROW ALREADY PRESENT:', existing.data[0].id);
} else {
  const { data, error } = await s
    .from('sub_agent_execution_results')
    .insert({
      sd_id: SD_UUID,
      sub_agent_code: 'Explore',
      sub_agent_name: 'Explore (read-only search agent)',
      verdict: 'CONDITIONAL_PASS',
      confidence: 88,
      phase: 'LEAD',
      source: 'task_tool',
      validation_mode: 'prospective',
      executed_from_cwd: CWD,
      justification:
        'Exploration was thorough and load-bearing: it mapped the story-to-FR linkage question to a definite answer (no fr_id column exists on user_stories; all 40 columns and every ALTER TABLE checked), enumerated SIX further completion checks beyond the two known, and produced the exact score-aggregation arithmetic. CONDITIONAL rather than PASS because its central positive finding -- a deterministic positional story_key linkage -- was subsequently FALSIFIED as a delivery signal by a variance measurement, and because its aggregation arithmetic (~23 equal-weight gates) was later measured wrong (rosters are 29-43, mean 39.6). Exploration located the code correctly; the conclusions drawn from reading it needed measurement to correct.',
      conditions: [
        'Do NOT adopt the positional story_key linkage as a delivery signal -- falsified by execution: it yields 6/6 delivered on the specimen whose own metadata records 2 FRs as not delivered.',
        'Re-measure the gate-roster size before using any per-gate blast-radius number; the ~23-gate estimate was wrong (actual 29-43, mean 39.6).',
        'Treat the six rival completion checks as OUT of scope for this SD but record them -- three mutually-unaware representations of scope-delivered is a separate single-representation defect.',
      ],
      critical_issues: [
        'user_stories has NO fr_id/fr_ref column and no join table records which FR a story implements; the only FR-id-bearing artifact is the descope path (strategic_directives_v2.metadata.descoped_frs), which fired 0 times across all 55 SDs measured.',
        'FR ids are LLM-authored and never normalised (prd-llm-service.mjs:156-164 hands the model a literal "FR-1" example; no post-parse validation), so dialects FR-1 / FR-001 / FR-3a coexist and an exact word-boundary text match cannot span them.',
        'SIX further completion checks can each return a passing score with no evidence: SCOPE_COMPLETION_VERIFICATION (4 pass-without-evidence paths), DELIVERABLES_COMPLETENESS (reads a status column the harness self-writes at 50% confidence), deliverable-canary (conservative by design, never false-fails), PCVP light tier (sole check is that the SD wrote its own handoff row), USER_STORIES_COMPLETE (the any-status proxy the FR classifier was built to REPLACE, still running in the same LEAD-FINAL gate list at gates.js:1363), ACCEPTANCE_CRITERIA_TRACEABILITY (keyword-matches vision markdown to test filenames).',
      ],
      warnings: [
        'lib/sub-agents/modules/stories/execute.js:371 carries a comment asserting user_stories has no metadata column. That comment is factually wrong -- the column exists -- and it is why the primary story writer routes provenance into technical_notes as a JSON blob instead.',
        'required:false excludes a gate from BLOCKING but NOT from the score average (ValidationOrchestrator.js:348-359 accumulates before :368 consults required), and SKIPPED gates also contribute their score.',
        'SD-SD-COMPLETION-DELIVERABLE-VERIFICATION-ORCH, named in this SD as an already-shipped gate, does not exist anywhere in the tree.',
      ],
      recommendations: [
        'Repair projectGateResult in place -- both consumers already call it, so a state added there propagates to both by construction; adding a gate would be the single-representation violation.',
      ],
      metadata: {
        repo_path: CWD,
        executed_from_cwd: CWD,
        invocation: 'Task tool - Explore is read-only and cannot self-write; worker persists per established pattern',
      },
    })
    .select('id,verdict');
  if (error) { console.log('EXPLORE INSERT ERR:', error.message); process.exit(1); }
  console.log('EXPLORE ROW WROTE:', JSON.stringify(data[0]));
}

// ---------- (b) mechanism_verifications ----------
const { data: sd, error: readErr } = await s
  .from('strategic_directives_v2')
  .select('id, metadata')
  .eq('sd_key', SD_KEY)
  .single();
if (readErr) { console.log('SD READ ERR:', readErr.message); process.exit(1); }

if (Array.isArray(sd.metadata?.mechanism_verifications) && sd.metadata.mechanism_verifications.length) {
  console.log('MECHANISM_VERIFICATIONS ALREADY PRESENT');
  process.exit(0);
}

const verifications = [
  {
    verified_by: 'Alpha (worker session e7c92ad8)',
    verified_at: 'scripts/modules/handoff/gates/fr-delivery-classifier.js:150-158',
    claim: 'In warn-only mode (the default) projectGateResult returns score:100 regardless of the true delivery ratio; the real number is stashed in details.raw_score.',
    method:
      'Ran the real classifier against the real specimen row (SD-FDBK-INFRA-WORKER-LOOP-DIRECTIVE-001) rather than reading it: 0 delivered / 0 descoped / 6 undelivered, details.raw_score 0, gate result passed=true score=100 required=false. Executed, not inferred.',
  },
  {
    verified_by: 'Alpha (worker session e7c92ad8)',
    verified_at: 'user_stories population, 275 rows across the 60 most-recent completed SDs',
    claim: 'isValidatedStory() is a tautology on the population the gate actually runs against -- status=completed 275/275 and validation_status=validated 275/275 -- so it discriminates nothing.',
    method:
      'Variance measurement over every story belonging to those SDs. CORRECTED BY VALIDATION: the tautology is NOT global (a 1000-row sample of 15,290 gives completed 814 / validated 752), it is CONDITIONAL on reaching EXEC-TO-PLAN and it is MANUFACTURED -- four bulk writers flip every story unconditionally (exec-to-plan/state-transitions.js:19-67, plan-to-lead/state-transitions.js:81-139, auto-validate-user-stories-on-exec-complete.js:238-242, RPC fn_atomic_exec_to_plan_transition). The specimen s six stories were flipped at 19:42:44, ten seconds before its PLAN-TO-LEAD row. plan-to-lead/index.js:225 flips the data BEFORE the gate that reads it. The cause is the argument; my sample was only the symptom.',
  },
  {
    verified_by: 'Alpha (worker session e7c92ad8), falsified by execution',
    verified_at: 'story_key population measurement + validation-agent re-execution',
    claim: 'REJECTED CANDIDATE FIX: reading the positional story_key ordinal (US-00n <-> functional_requirements[n-1]) as a delivery signal.',
    method:
      'The linkage is real and I confirmed it in DATA, not code: 49/49 SDs-with-stories have every key matching US-NNN, ordinals contiguous 1..N, zero gaps or dupes, 46/55 count-matched. It still must NOT be adopted. Executed on the specimen it returns 6/6 DELIVERED score 100 -- including FR-5 and FR-6, which that SD s own metadata.scope_completion_annotation lists under not_delivered. Population-wide it flips 45/55 SDs from 0% to 100%. It converts a false 0 into a false 100: equally blind, opposite direction. Its only live discriminant is whether the generator minted a story at that ordinal, decided at PLAN time before any code exists, so it would measure GENERATOR OUTPUT COMPLETENESS and report it as delivery.',
  },
  {
    verified_by: 'validation-agent (row 5fb913a0), correcting Alpha',
    verified_at: 'scripts/modules/handoff/executors/... story writers; grep over user_stories.title',
    claim: 'CORRECTION TO MY OWN CLAIM: I wrote that no writer ever emits an FR id into story text. That is false and falsifiable by grep.',
    method:
      '146 stories repo-wide carry an FR id in title; 21 of 123 sampled match frReferencesId; 34 FRs across 10 of 55 SDs actually classify DELIVERED on text match and 4 SDs reach 100% that way. Both generators DO interpolate the id on a degenerate fallback branch (auto-trigger-stories.mjs:1112 fr.requirement || Implement ${fr.id}; lib/sub-agents/modules/stories/execute.js:69-70). Correct statement: the healthy path never emits it, so it appears in roughly a fifth of rows by accident. UNRELIABLE, NOT DEAD.',
  },
  {
    verified_by: 'validation-agent (row 5fb913a0), correcting the SD premise itself',
    verified_at: 'sd_phase_handoffs rows for the specimen; PLAN-TO-LEAD gate roster',
    claim: 'PREMISE CORRECTION: the SD says PLAN-TO-LEAD passed at 93 and blames FR_DELIVERY_VERIFICATION. That 29-gate PLAN-TO-LEAD roster contains NO FR gate at all.',
    method:
      'The fabricated 100 is real but it landed in EXEC-TO-PLAN, from FR_DELIVERY_TRACEABILITY (100/100) -- the sibling wrapper, not the LEAD-FINAL gate the SD names. Also measured: the specimen is sd_type=infrastructure (threshold 75), not the 85 I assumed. Both corrections were made before this record was written so the PRD does not inherit the wrong target.',
  },
  {
    verified_by: 'validation-agent (row 5fb913a0), defect Alpha missed',
    verified_at: 'sd_phase_handoffs, 62 LEAD-FINAL rows',
    claim: 'SCOPE-CHANGING GAP: 0 of 62 LEAD-FINAL handoff rows contain metadata.gate_results, so FR_DELIVERY_VERIFICATION has no persisted execution record for any of the 60 most recent completed SDs.',
    method:
      'Enumerated the rows. The specimen s carries only sd_ref, heal_invoked, heal_invoked_at, canonical_pre_completion_write. Consequence: repairing this gate alone would fix a verdict no auditor can observe, and the seeded-defect acceptance would be demonstrable only in a unit test, never in production. LEAD-FINAL gate-result persistence must be in scope or explicitly deferred.',
  },
];

const { error } = await s
  .from('strategic_directives_v2')
  .update({ metadata: { ...(sd.metadata || {}), mechanism_verifications: verifications } })
  .eq('id', sd.id);
if (error) { console.log('UPDATE ERR:', error.message); process.exit(1); }
console.log('WROTE', verifications.length, 'mechanism verification(s)');
