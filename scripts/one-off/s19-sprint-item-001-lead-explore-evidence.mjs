#!/usr/bin/env node
/**
 * One-off: Explore sub-agent evidence for SD-LEO-INFRA-S19-SPRINT-ITEM-001, LEAD-TO-PLAN phase.
 *
 * Records the discovery work performed via the Explore agent before LEAD authored the PRD:
 * checked whether a generic "validate LLM enum field + bounded re-ask" helper already existed
 * that the new findArchitectureLayerViolations() + re-ask loop should have reused, and confirmed
 * whether any other stage-template analysis-step already had a similar bounded re-ask pattern.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-INFRA-S19-SPRINT-ITEM-001';

const findings = [
  {
    id: 'reusable-enum-validator-found-and-adopted',
    severity: 'INFO',
    summary: 'lib/eva/stage-templates/validation.js exports validateEnum(value, fieldName, allowed) — a generic single-field enum validator that already existed but was not initially used by findArchitectureLayerViolations() (which reimplemented equivalent .includes() logic per-item). Adopted: findArchitectureLayerViolations() now calls validateEnum(item.architectureLayer, "architectureLayer", ARCHITECTURE_LAYERS).valid instead of a bespoke ARCHITECTURE_LAYERS.includes(...) check. The pre-existing per-item normalization map (line ~466, unrelated to this SD\'s new code) intentionally left untouched to minimize risk to tested, pre-existing logic.',
  },
  {
    id: 'no-generic-bounded-reask-helper-exists',
    severity: 'INFO',
    summary: 'No generic "bounded re-ask loop" helper exists anywhere in lib/eva or lib/llm — retry/backoff helpers in lib/eva/stage-zero/data-pollers/retry.js and lib/llm/client-factory.js are network-retry, not LLM-response-validation-retry. stage-15-wireframe-generator.js (lines ~484-527) has a similar-shaped for-loop, but it only retries on JSON parse failure / schema shape / empty screens, not on an enum-violation predicate. Confirmed via grep across lib/eva and lib/llm for re-ask/reask patterns: stage-19-sprint-planning.js is the only analysis-step with an enum-violation-triggered re-ask loop. The loop itself (not just the per-field check) is genuinely novel — no prior helper combines LLM-response validation with a retry loop.',
  },
  {
    id: 'response-format-json-object-precedent-confirmed',
    severity: 'INFO',
    summary: 'stage-15-wireframe-generator.js:495-497 already sets response_format:{type:"json_object"} on its client.complete() call, with an explicit code comment stating "A structural responseSchema is a deferred follow-up". This SD\'s stage-19 change follows the identical precedent rather than inventing a new pattern. Confirmed no completeWithSchema/response_format json_schema plumbing exists across lib/llm/client-factory.js or the 4 provider adapters in lib/sub-agents/vetting/provider-adapters.js for a true per-field enum schema — matches the LEAD-phase validation-agent pass\'s independent finding (evidence row 89e08ab3-3620-4d9f-a472-8e8af8dc50fa).',
  },
];

const warnings = [];

const recommendations = [
  'A follow-up SD could generalize the bounded-validate-and-reask loop pattern (now present in both stage-15 for JSON-syntax retries and stage-19 for enum-violation retries) into a shared helper in lib/eva/stage-templates/ if a third analysis-step needs the same shape — not warranted yet with only 2 call sites.',
  'A follow-up SD (flagged separately by the LEAD-phase validation-agent pass) should address stage-14-technical-architecture.js:293, which silently defaults an unrecognized layer to the literal string "api" — the same token that leaked into the walk specimen one stage downstream — as the plausible upstream source of the vocabulary drift.',
];

const summary = 'Explore-phase discovery for SD-LEO-INFRA-S19-SPRINT-ITEM-001 confirmed a reusable single-field enum validator (validateEnum in lib/eva/stage-templates/validation.js) existed and was not initially used by the new findArchitectureLayerViolations() helper — adopted during LEAD phase before PRD authoring. Confirmed no generic bounded-reask-loop helper exists anywhere in the codebase (the loop itself is genuinely novel, not a duplicate of stage-15\'s JSON-parse-only retry loop), and confirmed the response_format:json_object choice follows stage-15\'s own explicit precedent/deferral rather than inventing new LLM-client plumbing.';

async function main() {
  const supabase = await getSupabaseClient();

  const resolution = await resolveSubAgentRepo({
    sdId: SD_KEY,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'Explore',
    supabase,
  });

  let results = {
    verdict: 'PASS',
    confidence_score: 92,
    findings,
    warnings,
    recommendations,
    summary,
    detailed_analysis: {
      sd_key: SD_KEY,
      phase: 'LEAD_TO_PLAN',
      artifacts_read: [
        'lib/eva/stage-templates/validation.js',
        'lib/eva/stage-templates/analysis-steps/stage-15-wireframe-generator.js',
        'lib/eva/stage-zero/data-pollers/retry.js',
        'lib/llm/client-factory.js',
        'lib/sub-agents/vetting/provider-adapters.js',
      ],
    },
    phase: 'LEAD_TO_PLAN',
  };

  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'Explore',
    SD_KEY,
    { name: 'Explore' },
    results,
    { sdKey: SD_KEY, phase: 'LEAD_TO_PLAN', source: 'manual' },
  );

  console.log('EXPLORE EVIDENCE WRITTEN:');
  console.log('  ID:', stored.id);
  console.log('  verdict:', stored.verdict, '@ confidence', stored.confidence);
  console.log('  repo_path:', stored.metadata?.repo_path);
  process.exit(0);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => {
    console.error('FAILED:', e.message);
    console.error(e.stack);
    process.exit(1);
  });
}
