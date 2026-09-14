#!/usr/bin/env node
/**
 * LEAD-phase Explore evidence for SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-E (LEAD-TO-PLAN gate).
 *
 * Canonical repo-evidence pattern (lib/sub-agents/resolve-repo.js applySubAgentRepoVerdict +
 * lib/sub-agent-executor/results-storage.js storeSubAgentResults) — no hand-rolled INSERT,
 * per CLAUDE.md prologue rule 11.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_ID = 'bedf5ed9-9b17-4c15-93d7-4c59e25a8939';
const SD_KEY = 'SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-E';

async function writeExplore(supabase) {
  const resolution = await resolveSubAgentRepo({
    sdId: SD_KEY, targetApplication: 'EHG_Engineer', subAgentCode: 'Explore', supabase,
  });

  let results = {
    verdict: 'CONDITIONAL_PASS',
    confidence: 88,
    findings: [
      {
        id: 'E1-two-of-four-named-mechanisms-are-hardcoded-constants-not-flags',
        severity: 'CRITICAL',
        summary: 'WARN_CAPPED_CATEGORIES (lib/eva/quality-findings/finding-shape.js:78-82, enforced at stage-20-code-quality.js:694-699) and VISION_ABSENCE_SEVERITY (stage-20-code-quality.js:246-249) are hardcoded JS constants with NO on/off state at all -- not toggleable mechanisms. Registering them as ordinary leo_feature_flags rows with is_enabled would misrepresent them and (per VALIDATION finding C3) feed the digest classifier into never-reviewed/disabled-aging/stale-off-pending nagging, the exact defect SD-LEO-FEAT-FLAG-GOVERNANCE-KILL-001 was cancelled over.',
      },
      {
        id: 'E2-the-other-two-are-env-var-only-and-absent-from-the-live-registry',
        severity: 'CRITICAL',
        summary: 'DESIGN_FIDELITY_GATE_MODE (lib/eva/bridge/customer-facing-design-detector.js:87-89, read off an injected env param, compared to literal \'bind\') and LEO_THESIS_KILL_GATE (lib/eva/lifecycle/thesis-kill-gate.js:37-42, read via process.env[FLAG_NAME] bracket notation) are genuinely non-binding (observe/log-only) but zero rows exist for either in the live leo_feature_flags table (queried directly: 0 matches for %DESIGN_FIDELITY% and %THESIS_KILL%).',
      },
      {
        id: 'E3-other-non-binding-modes-not-named-in-the-SD-but-same-class',
        severity: 'WARNING',
        summary: 'LEO_SYNTHETIC_ACTOR_FENCE_ENFORCE (database/migrations/20260821_register_synthetic_actor_fence_enforce_flag.sql:27) and PATH_INTEGRITY_EXIT_GATE_ENFORCE (20260823_register_path_integrity_flags.sql:42) ALREADY exist as leo_feature_flags rows (is_enabled=false) and already carry enablement_criteria + last_reviewed_at -- live proof the target registry shape already works for part of this class. Both have owner_type/owner_id NULL, which is the actual gap, not the registry shape itself. LEO_UAT_ROBUSTNESS_GATE_ENFORCE has a migration file (20260825_register_uat_robustness_gate_enforce_flag.sql:23) that was NEVER applied to the live DB -- an unrelated pre-existing defect, out of this SD\'s scope, worth a separate QF.',
      },
      {
        id: 'E4-flag-governance-digest-is-real-live-and-enabled',
        severity: 'INFO',
        summary: 'scripts/flag-governance-review.mjs + lib/feature-flags/governance-review.js (classifyFlag(), lines 44-168) is a real, scheduled-hourly (gauge-runner-cron.yml) digest. Its own flag FLAG_GOVERNANCE_REVIEW_V1 is live, is_enabled=true, owner_type=team/owner_id=coordinator, last_reviewed_at populated -- this is the ONE flag in the whole table that already carries every field P3.1 wants, making it the reference template. Its real verb vocabulary is graduate|kill|extend|keep|review|reconcile|enable|graduated -- there is no "retire" verb; "kill" is the closest semantic match and should be reused rather than adding a new verb.',
      },
      {
        id: 'E5-existing-CI-lint-is-advisory-only-and-structurally-blind-to-this-SDs-own-mechanisms',
        severity: 'CRITICAL',
        summary: 'scripts/lint/process-env-feature-flag-lint.mjs (wired via .github/workflows/process-env-feature-flag-lint.yml:38) runs in CI today with no --enforce flag -- exits 0 regardless of findings (confirmed: a fresh local run found 40 ungoverned env flags, exit code 0). Its extractEnvFlags() regex (/process\\.env\\.([A-Z][A-Z0-9_]*)/g, gated on a NAME_SHAPE suffix filter or boolish on/off comparison) misses DESIGN_FIDELITY_GATE_MODE (indirected env param + _MODE suffix + \'bind\' comparison -- three independent misses) and LEO_THESIS_KILL_GATE (bracket notation + _GATE suffix -- two misses) entirely. It also reads ONLY a 52-entry JSON allowlist (process-env-feature-flag-allowlist.json), never the leo_feature_flags table -- 3 grep hits for supabase/leo_feature_flags/createClient in the file are all comments, confirmed zero real DB reads.',
      },
      {
        id: 'E6-no-working-precedent-for-the-two-consecutive-weekly-zero-readings-closure-pattern',
        severity: 'WARNING',
        summary: 'Ratification 49656c8c ("every preventive child ships its CI-asserted exit predicate... closes on two consecutive weekly zero readings, never on a merge") is extensively documented as INTENT (CLAUDE_SOLOMON.md:364, docs/michael/05-SOLOMON-ADJUDICATION.md:139, 15+ other citations) but has NO built, automated precedent anywhere. Sibling -D\'s own gauge header (lib/governance/experience-review-coverage-guard.js:1-6, gauge-registry.js:406) explicitly states the two-consecutive-weekly-clear-readings tracking belongs to the PARENT SD\'s own tracking, not to any child gauge\'s pass/fail contract. The nearest phrase match anywhere (SD-LEO-INFRA-LANE-HYGIENE-MACHINE-WRITERS-001 FR-7c, lib/governance/orphan-writers-registry.js:366-367) self-declares as "operational, not code-level," and its underlying cron actually runs DAILY (lane-lint-gauge-cron.yml:32, \'20 6 * * *\'), not weekly. No weekly-cadence cron exists anywhere for gauge re-evaluation (gauge-runner-cron.yml runs hourly). periodic_process_registry.consecutive_miss_count (20260711 migration) is the closest reusable primitive but counts consecutive MISSES for escalation, not consecutive CLEAR readings for graduation -- nobody has built the inverse-polarity counterpart. CONCLUSION: SD-E should be scoped to ship the registry + CI-asserted lint + digest wiring in its own PR and STOP THERE, matching sibling -D precedent exactly -- the weekly-tracking obligation is the parent programme\'s, not this child\'s.',
      },
      {
        id: 'E7-dedup-match-confirmed-spurious',
        severity: 'INFO',
        summary: 'metadata.dedup_match_sd_key: "route-audit-stage-09" traces to docs/reference/vision/route-audit-sd-structure.md:1376-1399 (SD-ROUTE-AUDIT-STAGE-09, an unrelated dormant venture exit-strategy/valuation audit SD). Keyword-similarity false positive (Jaccard overlap on "venture"/"stage"/"assessment") via lib/sourcing-engine/router.js + lib/intake/triage-classifier.js -- not a real duplicate, nothing further to check against it. No non_binding_mode_registry table/script exists anywhere (repo-wide grep + schema-reference-snapshot.json both confirm absence).',
      },
    ],
    detailed_analysis: JSON.stringify({
      gate: 'GATE 1 - LEAD Pre-Approval (Explore pass)',
      verdict_rationale: 'Explore independently re-verified every mechanism the SD names against live code and the live leo_feature_flags table (not trusting the SD\'s own prose, per its own "re-grep at claim time" instruction), corroborating and extending VALIDATION\'s C1/C2/C3 findings with direct file:line citations and a live-DB query. Two of four named mechanisms are not flag-governable at all (hardcoded constants); the other two are real but unregistered. The existing CI lint is advisory-only and structurally blind to this SD\'s own two env-var mechanisms. The "two consecutive weekly zero readings" closure framing in the SD\'s inherited description has no working precedent and, per sibling -D\'s own gauge header, is explicitly the PARENT SD\'s tracking obligation, not this child\'s -- de-scoping it from SD-E\'s own completion gate.',
      duplicate_check: 'NEGATIVE -- corroborates VALIDATION\'s 159-candidate sweep; dedup_match_sd_key confirmed spurious by direct trace to an unrelated document.',
      infrastructure_check: 'MIXED -- flag-governance digest (scripts/flag-governance-review.mjs) and leo_feature_flags schema (enablement_criteria/last_reviewed_at/owner_type/owner_id) already exist and need no migration; process-env-feature-flag-lint.mjs is real prior art but advisory-only with detection gaps that miss this SD\'s own named mechanisms -- extend or explicitly supersede, never assume it already enforces anything.',
      files_reviewed: [
        'lib/eva/quality-findings/finding-shape.js',
        'lib/eva/stage-templates/analysis-steps/stage-20-code-quality.js',
        'lib/eva/bridge/customer-facing-design-detector.js',
        'lib/eva/bridge/design-fidelity-observe.js',
        'lib/eva/lifecycle/thesis-kill-gate.js',
        'lib/eva/lifecycle/exit-gate-enforcer.js',
        'lib/eva/lifecycle/bind-criterion-checker.js',
        'scripts/eva/check-bind-criteria.mjs',
        'docs/guides/workflow/cli-venture-lifecycle/reference/kill-gates.md',
        'docs/01_architecture/venture-design-fidelity-gate.md',
        'docs/reference/bind-criterion-checker-guide.md',
        'scripts/flag-governance-review.mjs',
        'lib/feature-flags/governance-review.js',
        'scripts/lint/process-env-feature-flag-lint.mjs',
        'scripts/lint/process-env-feature-flag-allowlist.json',
        '.github/workflows/process-env-feature-flag-lint.yml',
        'database/migrations/20260607_leo_feature_flags_pending_enablement_registry.sql',
        'database/migrations/20260201_feature_flag_governance.sql',
        'database/migrations/20260821_register_synthetic_actor_fence_enforce_flag.sql',
        'database/migrations/20260823_register_path_integrity_flags.sql',
        'database/migrations/20260825_register_uat_robustness_gate_enforce_flag.sql',
        'docs/reference/schema/engineer/tables/leo_feature_flags.md',
        'lib/governance/gauge-registry.js',
        'lib/governance/experience-review-coverage-guard.js',
        'scripts/gauges/experience-review-coverage-check.mjs',
        'lib/governance/orphan-writers-registry.js',
        '.github/workflows/lane-lint-gauge-cron.yml',
        '.github/workflows/gauge-runner-cron.yml',
        'database/migrations/20260711_periodic_process_registry_consecutive_miss_count.sql',
        'docs/reference/vision/route-audit-sd-structure.md',
        'scripts/enroll-env-var-feature-flags.mjs',
      ],
    }),
    metadata: {
      sd_key: SD_KEY,
      gate: 'GATE_1_LEAD_PRE_APPROVAL',
      duplicate_found: false,
      no_new_machinery_host_found: 'leo_feature_flags (existing schema) + scripts/flag-governance-review.mjs (existing digest) + scripts/enroll-env-var-feature-flags.mjs (existing enrollment pattern to extend)',
      exploration_mode: 'codebase_and_live_db_verification',
    },
    phase: 'LEAD',
    summary: 'CONDITIONAL_PASS (confidence 88). Independently re-verified all four named non-binding mechanisms against live code + the live leo_feature_flags table: two (WARN cap, VISION_ABSENCE_SEVERITY) are hardcoded constants with no toggle at all; the other two (DESIGN_FIDELITY_GATE_MODE, LEO_THESIS_KILL_GATE) are env-var-only and unregistered. The leo_feature_flags schema and the flag-governance digest already exist and need no migration. The existing CI lint (process-env-feature-flag-lint.mjs) is advisory-only and structurally blind to this SD\'s own two env-var mechanisms -- P3.1 must build the registry-aware check, not assume one exists. The "two consecutive weekly zero readings" closure language in the inherited parent description has no built precedent anywhere and is, per sibling -D\'s own gauge header, explicitly the PARENT programme\'s tracking obligation -- SD-E should ship registry + CI-asserted lint + digest wiring in one PR and stop there. No duplicate implementation found; dedup_match_sd_key confirmed spurious.',
  };

  results = applySubAgentRepoVerdict(results, resolution);
  return storeSubAgentResults('Explore', SD_ID, { name: 'Explore (codebase search)' }, results, { sdKey: SD_KEY, phase: 'LEAD' });
}

async function main() {
  const supabase = await getSupabaseClient();
  const row = await writeExplore(supabase);
  console.log('Explore row:', row.id, '| verdict:', row.verdict, '| confidence:', row.confidence, '| phase:', row.phase);
  console.log('repo_path:', row.metadata?.repo_path, '| executed_from_cwd:', row.metadata?.executed_from_cwd);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error('FAILED:', e.message); console.error(e.stack); process.exit(1); });
}
