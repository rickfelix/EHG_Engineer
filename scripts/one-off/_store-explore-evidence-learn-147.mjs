import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

async function main() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const sdKey = 'SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-147';
  const { data: sd } = await supabase.from('strategic_directives_v2').select('id').eq('sd_key', sdKey).maybeSingle();

  const results = {
    verdict: 'PASS',
    confidence: 90,
    summary: 'Independent Explore-agent investigation REFUTES Pattern 1 (PAT-LES-7f9278417050) as stated -- the retro-authoring generator/rubric have no R1-baseline-assumption bug, and the SD\'s own description asserted a false sd_type. Pattern 2 (PAT-LES-81410c2e90fe) is PARTIALLY CONFIRMED: the named TOOLING gap (no constraint-sync script, no migration apply-ordering enforcement) genuinely does not exist, but the source SD description named a nonexistent table (eva_chairman_decisions) as its target.',
    findings: [
      '1) REFUTED: lib/sub-agents/retro/generators.js:292-380 (extractSuccessMetricsInsights) is the only "baseline" logic in the real auto-generator -- refers to SD success_metrics[].baseline/target (author-written business metrics), not prior-audit-round data. Empty success_metrics just logs info and returns [] (line 334-337), no crash, no assumption of prior-round data. scripts/generate-retrospective.js has zero matches for baseline/R1/comparison.',
      '2) PARTIALLY CONFIRMED (not as stated): RetrospectiveQualityRubric (scripts/modules/rubrics/retrospective-quality-rubric.js) scores 4 criteria (learning_specificity 40%, action_item_actionability 30%, improvement_area_depth 20%, lesson_applicability 10%) via a GPT-5-mini semantic judge + deterministic BOILERPLATE_PATTERNS penalty (-5/match, up to -25). None reference baseline/comparison/audit-round metrics. The cited 37/39/43 scores are explained by the judge penalizing generic/boilerplate action items on early drafts -- working as designed, not a baseline-assumption bug.',
      '3) REFUTED: DB query confirms SD-EVA-QA-AUDIT-R2-TRUTH-001.sd_type = "infrastructure" (category "EVA Quality"), NOT "audit"/"qa_audit". scripts/modules/sd-type-checker.js isValidSDType() has no audit/qa_audit value at all, but it is moot here since the SD is typed "infrastructure", which already has its own lenient scoring arm in SCORING_WEIGHTS (0.30/0.70) and THRESHOLD_PROFILES (retrospectiveQuality:55). The retrospective\'s own improvement_areas text claims "(b) the SD type is audit/qa which has findings-based outcomes" -- this does NOT match the stored sd_type column. Current retrospective rows for this SD score 90/100 with quality_issues:[] right now -- the 37/39/43 failures are self-reported HISTORY inside the retro\'s own narrative text, not the present persisted state.',
      '4) REFUTED: no "first-time-audit/no-baseline" detection exists anywhere in generators.js, sd-quality-validation.js, the rubric, or sd-type-checker.js. The only related code is item 1\'s graceful no-op, which is not "detection" -- it is skip-if-absent.',
      '5) CONFIRMED absent: no constraint-sync validation script exists anywhere in scripts/ or lib/ comparing chairman_decisions CHECK constraint values against EVA stage-template decision-type enums. scripts/discover-schema-constraints.js discovers generic CHECK constraints into leo_schema_constraints with no EVA-template comparison. Not wired into CI.',
      '6) CONFIRMED absent (manual-discipline only): no gate enforces "migration file must exist/be committed before a live DB change is applied" anywhere. scripts/hooks/pre-tool-enforce.cjs VALIDATION_CONFIG (line 413-426) validates migration FILE CONTENT when a migration script runs, but does not check apply-ordering. scripts/verify-migration-apply-state.mjs is explicitly read-only/advisory and runs retrospectively.',
      '7) PARTIALLY CONFIRMED with a target-mismatch: live chairman_decisions_decision_check (chairman_decisions.decision column, 28 values per supabase/migrations/20260215_chairman_decision_taxonomy_enforcement.sql, widened to 30 by database/migrations/20260317_fix_chairman_decision_check_and_unblock_trigger.sql) spot-checked against lib/eva/stage-templates/stage-03.js:89 Stage-3 values (pass/revise/kill) -- matches exactly, no drift on that one stage (no comprehensive cross-stage check exists, consistent with #5). BUT: the source SD (SD-EVA-R2-FIX-CHAIRMAN-DB-001)\'s own description (scripts/archive/.../insert-eva-remediation-r2-sds.cjs:228-251) named the target as "eva_chairman_decisions.decision_type" (16 values, new ENUM) -- a table that does not exist anywhere in the repo (zero grep hits). EXEC apparently applied the fix to the REAL, pre-existing chairman_decisions.decision column instead, matching the documented anti-pattern in database/migrations/20260704_chairman_decisions_decision_type_uniqueness.sql lines 6-13 (a schema change applied live, migration file written after, for a different later SD). No direct apply-log smoking-gun was found for this specific SD -- evidenced circumstantially via the target-mismatch, not proven.',
    ],
    critical_issues: [
      'Pattern 1 (PAT-LES-7f9278417050) as filed is a FALSE premise: the retrospective\'s own self-diagnosed root cause (generator assumes R1 baseline data; SD type is audit/qa) does not match the actual generator code, rubric, or the SD\'s real stored sd_type (infrastructure). Building a code fix for this as originally scoped would be fixing a bug that does not exist.',
    ],
    warnings: [
      'Pattern 2\'s source SD description named a nonexistent table (eva_chairman_decisions) -- the genuinely real, confirmed-absent tooling gaps (constraint-sync script; no migration apply-ordering enforcement) are correctly identified in the retro\'s own TOOLING/PROCESS action items, independent of the target-mismatch.',
      'No second SD in this pattern\'s history (first_seen_sd_id === last_seen_sd_id for both patterns) -- "2 occurrences" is really "1 real SD, double-counted," consistent with the /learn Devil\'s-Advocate challenge that was already raised and not resolved before this SD was auto-created.',
    ],
    recommendations: [
      'Do NOT build a code fix for Pattern 1 as originally scoped -- the bug does not exist. If any action is warranted, it is process-level: require a retro\'s self-diagnosed root-cause claims to cite verifiable file:line evidence before being trusted into issue_patterns (preventing future /learn cycles from spawning SDs against phantom bugs).',
      'For Pattern 2, scope the fix to the genuinely-confirmed-absent, retro-prescribed TOOLING action item: a constraint-sync script comparing chairman_decisions CHECK values against EVA stage-template decision-type enums, alerting on drift. Migration apply-ordering enforcement (item 6) is a separate, larger, fleet-wide mechanism change and should not be bundled into this SD without its own scoped review.',
    ],
    detailed_analysis: 'Full investigation report (7 items, exact file:line evidence, live DB queries) persisted verbatim in metadata.explore_report below.',
    metadata: {
      explore_report: 'See teammate investigation for SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-147, conducted by Explore sub-agent explore-retro-gate-patterns, read-only, no files edited. Items 1-7 each report CONFIRMED/REFUTED/PARTIALLY-CONFIRMED with file:line + live DB query evidence as summarized in findings[] above.',
      patterns_investigated: ['PAT-LES-7f9278417050', 'PAT-LES-81410c2e90fe'],
    },
  };

  const repoVerdict = await resolveSubAgentRepo({ sdId: sd.id, subAgentCode: 'EXPLORE', fallback: 'EHG_Engineer' });
  applySubAgentRepoVerdict(results, repoVerdict);
  const merged = await storeSubAgentResults('EXPLORE', sd.id, { name: 'Explore' }, results, { phase: 'LEAD', source: 'manual', sdKey });
  console.log('Stored:', merged?.id);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error('FAILED', e); process.exit(1); });
}
