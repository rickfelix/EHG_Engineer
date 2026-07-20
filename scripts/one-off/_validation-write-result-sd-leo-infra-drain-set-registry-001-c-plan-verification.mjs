#!/usr/bin/env node
/**
 * One-off: Write VALIDATION sub-agent PLAN_VERIFICATION-phase verdict for
 * SD-LEO-INFRA-DRAIN-SET-REGISTRY-001-C (Child B — "repoint the 3 remaining fleet
 * inbox readers onto Child A's fail-open registry-reader").
 *
 * PRD fidelity check: does the actually-shipped code match what the PRD promised
 * across all 5 functional requirements (FR-1..FR-5)? Evidence gathered by reading
 * git diff main...HEAD for each touched file + running the SD's 5 new test files.
 *
 * Uses the canonical repo-evidence pattern (lib/sub-agents/resolve-repo.js
 * applySubAgentRepoVerdict) + canonical storage (lib/sub-agent-executor/results-storage.js
 * storeSubAgentResults) rather than a hand-rolled INSERT, per CLAUDE.md prologue rule 11
 * (metadata.repo_path + executed_from_cwd; NO top-level repo_path/local_path columns).
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';

const SD_ID = '0c361819-7827-43c1-95ae-c089f14b9dd0';
const SD_KEY = 'SD-LEO-INFRA-DRAIN-SET-REGISTRY-001-C';

const findings = [
  {
    id: 'FR-1-drain-sets-adam-reconciliation',
    severity: 'INFO',
    summary: 'FR-1 DELIVERED. lib/fleet/worker-status.cjs adds all 8 new PAYLOAD_KINDS constants (CHAIRMAN_HEADS_UP, CHAIRMAN_HANDOFF, COORDINATOR_ADVISORY, COORDINATOR_ADAM_FEEDBACK, ASSIST_REQUEST, RECONCILE_CONSULT, COORDINATOR_SOURCE_REQUEST, COORDINATOR_REVIEW) with a Child-B FR-1 provenance comment, and references them in DRAIN_SETS.adam via constant references (not raw strings). Runtime check: DRAIN_SETS.adam.length=22 (was 14), solomon=12/coordinator=16/worker=17 UNCHANGED. git diff main...HEAD confirms only PAYLOAD_KINDS + DRAIN_SETS.adam changed. Migration database/migrations/20260720_role_drain_sets_STAGED.sql adds 8 matching seed INSERT rows for role=adam (lines 96-103) and updates the row_count ASSERT 61->69 (line 163), math 14 solomon + 22 adam + 16 coordinator + 17 worker = 69. A vocabulary CHECK constraint was added to the kind column (line 32): CHECK (kind ~ \'^[A-Za-z][A-Za-z0-9_]*$\') — permissive/mixed-case so existing uppercase seeds CLAIM_RELEASED/SET_IDENTITY still pass, while blocking commas/parens/quotes/dots that could break out of a PostgREST filter clause.'
  },
  {
    id: 'FR-2-adam-inbox-repoint',
    severity: 'INFO',
    summary: 'FR-2 DELIVERED. scripts/adam-advisory.cjs: the old hand-authored ADAM_INBOX_KINDS array literal (Object.freeze([...DIRECTIVE_KINDS, \'chairman_heads_up\', ...])) is GONE, replaced by ADAM_INBOX_KINDS = Object.freeze(DRAIN_SETS.adam.filter((k) => !ADAM_EXCLUDED_KINDS.includes(k))) at :453-area (module load, synchronous). isAdamInboxRow(r, recognizedKinds = ADAM_INBOX_KINDS) and isOrphanedAdamRow(r, recognizedKinds = ADAM_INBOX_KINDS) now take an optional recognizedKinds param defaulting to ADAM_INBOX_KINDS. External zero-arg call site lib/coordinator/dispatch.cjs:736 (isAdamInboxRow(row)) STILL WORKS unmodified — dispatch.cjs has ZERO diff vs main (confirmed git diff --stat empty). Inside drainInbox (:596-area) it dynamically imports resolveRecognizedKinds from lib/fleet/drain-set-registry.js, resolves role:\'adam\', and SUBTRACTS ADAM_EXCLUDED_KINDS via .filter((k) => !ADAM_EXCLUDED_KINDS.includes(k)) before threading resolvedAdamKinds into isAdamInboxRow/isOrphanedAdamRow. Matches the CRITICAL DESIGN REQUIREMENT exactly.'
  },
  {
    id: 'FR-3-solomon-drain-repoint',
    severity: 'INFO',
    summary: 'FR-3 DELIVERED. scripts/solomon-advisory.cjs: old hand-authored SOLOMON_INBOX_KINDS literal (Object.freeze([...DIRECTIVE_KINDS, SOLOMON_CONSULT_KIND, \'solomon_duty_reminder\'])) is GONE, replaced by SOLOMON_INBOX_KINDS = Object.freeze(DRAIN_SETS.solomon.filter((k) => k !== \'comms_check\')) — subtracts comms_check SPECIFICALLY (not a full excluded-kinds list, per FR-3). isSolomonInboxRow / isOrphanedSolomonRow take an optional recognizedKinds param defaulting to SOLOMON_INBOX_KINDS. drainInbox (:316-320) dynamically imports resolveRecognizedKinds, resolves role:\'solomon\', subtracts comms_check via .filter((k) => k !== \'comms_check\'), threads resolvedSolomonKinds into the predicates. The dedicated comms_check first-class branch (lines 326-335, the commsChecks filter + "radio check" console block) is UNTOUCHED and remains the only lane that surfaces comms_check rows.'
  },
  {
    id: 'FR-4-coordinator-tick-salience-generalization',
    severity: 'INFO',
    summary: 'FR-4 DELIVERED. scripts/coordinator-quiet-tick.mjs: readSalientState is now `export async function readSalientState(sb)` (was file-private). It resolves coordinator-recognized kinds via resolveRecognizedKinds({supabase: sb, role: \'coordinator\'}), subtracts PAYLOAD_KINDS.CROSS_PARTY_PING, and applies a SAFE_KIND_TOKEN = /^[A-Za-z][A-Za-z0-9_]*$/ regex filter (.filter((k) => k !== PAYLOAD_KINDS.CROSS_PARTY_PING && SAFE_KIND_TOKEN.test(k))) BEFORE interpolating tokens into a PostgREST .or() filter string (payload->>signal_type.not.is.null,payload->>kind.in.(...)). This is an OR-IN of a new salience term, not a replacement — the existing signal_type term is preserved. lib/coordinator/adam-advisory-store.cjs (selectUnactionedAdvisories / ADAM_ADVISORY_KIND) has ZERO diff vs main (confirmed git diff empty) — selectUnactionedAdvisories\'s actioned_at-coupled retirement logic is left untouched, per TR-5/SCOPE CORRECTION.'
  },
  {
    id: 'FR-5-static-guard-content-shape',
    severity: 'INFO',
    summary: 'FR-5 DELIVERED. tests/static-guards/drain-set-registry-readers.test.js exists and implements CONTENT-SHAPE detection: extractArrayLiterals() spans each top-level [ ... ] array literal, countKnownKindHits() counts string tokens drawn from KNOWN_KIND_VOCAB (DIRECTIVE_KINDS + PAYLOAD_KINDS values), and any file outside the allowlist with an array literal containing 3+ known-kind tokens FAILS the guard. It explicitly documents that an identifier-name regex (e.g. /_?INBOX_KINDS$/i) is insufficient/evadable and is NOT the detection mechanism. Allowlist (lines 36-53) includes the sanctioned pair lib/fleet/worker-status.cjs + lib/fleet/drain-set-registry.js, plus tests/, docs/, database/migrations/, .prd-payloads/, *.md, and lib/coordination/lane-lint-gauge.cjs. A non-vacuity test asserts the sanctioned worker-status.cjs itself contains a >=3-hit array (guard is not a no-op).'
  },
  {
    id: 'FR-tests-all-green',
    severity: 'INFO',
    summary: 'Full SD test suite GREEN. npx vitest run over the 5 SD test files (drain-sets-adam-reconciliation.test.js, drain-sets-adam-excluded-kinds.test.js, drain-sets-solomon-comms-check-exclusion.test.js, quiet-tick-salient-state-generalization.test.js, drain-set-registry-readers.test.js) => Test Files 5 passed (5), Tests 23 passed (23), 0 failed. These exercise the positive parity + negative subtraction assertions (TS-1..TS-6) that would fail on a naive non-subtracting repoint.'
  },
  {
    id: 'OBS-migration-solomon-seed-vs-js-fallback-divergence',
    severity: 'INFO',
    summary: 'OBSERVATION (out of Child B scope, no action needed). The STAGED migration seeds 14 solomon rows (incl. R2 reconciliation kinds adam_advisory, solomon_systemic_finding, solomon_duty_reminder) while the JS fallback DRAIN_SETS.solomon has 12 entries. This is a pre-existing Child A design artifact (the migration table is a superset of the JS fail-open fallback), NOT introduced by Child B — Child B only touched the adam rows. Because role_drain_sets remains STAGED/unapplied throughout this SD, all 3 readers run on the JS fail-open path, so Child B\'s zero-behavior-change requirement (TR-1) holds. Noted for completeness; the applied-vs-unapplied solomon divergence is a Child A concern, tracked separately.'
  }
];

const warnings = [
  'role_drain_sets migration remains STAGED/unapplied (chairman-gated). All PRD acceptance criteria are satisfied on the JS fail-open path (DRAIN_SETS constant); the applied-table behavior is not exercised by this SD by design (TR-1: zero behavior change while unapplied).',
  'Follow-on (already flagged in PRD risks, out of scope): selectUnactionedAdvisories\'s single-kind + actioned_at-coupled retirement logic still does not generalize to other coordinator drain-set kinds — should be captured as a completion-flags finding at SD close, not silently dropped.'
];

const recommendations = [
  'Proceed with PLAN-TO-LEAD handoff — all 5 FRs DELIVERED with test evidence, no scope creep, no blocking gaps.',
  'At SD close, capture the selectUnactionedAdvisories per-kind-retirement-generalization follow-on via scripts/capture-completion-flags.js (PRD risk #5) so it is tracked, not dropped.'
];

const summary = 'PLAN_VERIFICATION VALIDATION PASS (confidence 97) for Child B (repoint the 3 remaining fleet inbox readers onto the fail-open registry-reader). PRD fidelity verified across all 5 FRs against actually-shipped code (git diff main...HEAD + runtime checks + 23-test suite). FR-1: DELIVERED — 8 new PAYLOAD_KINDS added + referenced in DRAIN_SETS.adam (now 22, others unchanged 12/16/17); migration adds 8 adam seed rows, ASSERT 61->69 (14+22+16+17), + kind CHECK ~ ^[A-Za-z][A-Za-z0-9_]*$ (mixed-case, allows CLAIM_RELEASED/SET_IDENTITY). FR-2: DELIVERED — ADAM_INBOX_KINDS array literal GONE, replaced by Object.freeze(DRAIN_SETS.adam.filter(!ADAM_EXCLUDED_KINDS)); isAdamInboxRow/isOrphanedAdamRow take optional recognizedKinds defaulting to it; dispatch.cjs:736 zero-arg call site works unmodified (dispatch.cjs ZERO diff); drainInbox dynamically imports resolveRecognizedKinds, resolves adam, subtracts ADAM_EXCLUDED_KINDS. FR-3: DELIVERED — SOLOMON_INBOX_KINDS literal GONE, replaced by DRAIN_SETS.solomon.filter(k!==comms_check); dedicated comms_check first-class branch (326-335) untouched. FR-4: DELIVERED — readSalientState EXPORTED, resolves coordinator kinds, subtracts CROSS_PARTY_PING, applies SAFE_KIND_TOKEN regex before .or() interpolation (OR-in, not replacement); adam-advisory-store.cjs ZERO diff (selectUnactionedAdvisories untouched). FR-5: DELIVERED — content-shape guard (3+ known-kind tokens in an array literal) with correct allowlist incl. the sanctioned worker-status.cjs+drain-set-registry.js pair and lane-lint-gauge.cjs. Tests: 5 files / 23 tests pass, 0 fail. One INFO observation (migration solomon seed=14 vs JS fallback=12) is a pre-existing Child A artifact, out of Child B scope, non-blocking. No scope creep, no PRD infidelity — recommend PLAN-TO-LEAD.';

async function main() {
  const supabase = await getSupabaseClient();

  const resolution = await resolveSubAgentRepo({
    sdId: SD_KEY,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'VALIDATION',
    supabase,
  });

  let results = {
    verdict: 'PASS',
    confidence: 97,
    findings,
    warnings,
    recommendations,
    summary,
    detailed_analysis: {
      sd_key: SD_KEY,
      parent_sd_key: 'SD-LEO-INFRA-DRAIN-SET-REGISTRY-001',
      validation_type: 'PRD_FIDELITY_CHECK',
      branch: 'feat/SD-LEO-INFRA-DRAIN-SET-REGISTRY-001-C',
      fr_verdicts: {
        'FR-1': 'DELIVERED — DRAIN_SETS.adam=22 (+8 new PAYLOAD_KINDS), others unchanged; migration +8 adam seeds, ASSERT 61->69, kind CHECK constraint added',
        'FR-2': 'DELIVERED — ADAM_INBOX_KINDS literal removed -> Object.freeze(DRAIN_SETS.adam.filter(!ADAM_EXCLUDED_KINDS)); recognizedKinds param default; dispatch.cjs:736 zero-arg site unmodified; drainInbox dynamic-imports resolveRecognizedKinds + subtracts ADAM_EXCLUDED_KINDS',
        'FR-3': 'DELIVERED — SOLOMON_INBOX_KINDS literal removed -> DRAIN_SETS.solomon.filter(k!==comms_check); comms_check first-class branch (326-335) untouched',
        'FR-4': 'DELIVERED — readSalientState exported; resolves coordinator kinds; subtracts CROSS_PARTY_PING; SAFE_KIND_TOKEN /^[A-Za-z][A-Za-z0-9_]*$/ regex before .or() interpolation (OR-in); adam-advisory-store.cjs ZERO diff',
        'FR-5': 'DELIVERED — content-shape detection (3+ known-kind tokens in array literal), NOT identifier-name regex; allowlist incl. worker-status.cjs + drain-set-registry.js + lane-lint-gauge.cjs'
      },
      runtime_checks: {
        'DRAIN_SETS.adam.length': 22,
        'DRAIN_SETS.solomon.length': 12,
        'DRAIN_SETS.coordinator.length': 16,
        'DRAIN_SETS.worker.length': 17,
        'migration_row_count_assert': 69,
        'migration_kind_check': 'CHECK (kind ~ \'^[A-Za-z][A-Za-z0-9_]*$\')'
      },
      untouched_files_confirmed_zero_diff: [
        'lib/coordinator/dispatch.cjs (FR-2 zero-arg call site preserved)',
        'lib/coordinator/adam-advisory-store.cjs (FR-4 / TR-5 selectUnactionedAdvisories retirement logic out of scope)'
      ],
      test_evidence: {
        command: 'npx vitest run tests/unit/fleet/drain-sets-adam-reconciliation.test.js tests/unit/fleet/drain-sets-adam-excluded-kinds.test.js tests/unit/fleet/drain-sets-solomon-comms-check-exclusion.test.js tests/unit/coordinator/quiet-tick-salient-state-generalization.test.js tests/static-guards/drain-set-registry-readers.test.js',
        test_files_passed: 5,
        test_files_total: 5,
        tests_passed: 23,
        tests_total: 23,
        tests_failed: 0
      },
      observations: [
        'Migration seeds 14 solomon rows vs JS DRAIN_SETS.solomon=12 — pre-existing Child A superset artifact, out of Child B scope, non-blocking (readers run on JS fail-open path while migration STAGED).'
      ]
    },
    phase: 'PLAN_VERIFICATION',
    validation_mode: 'retrospective',
  };

  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'VALIDATION',
    SD_ID,
    { name: 'Principal Systems Analyst (validation-agent)' },
    results,
    { sdKey: SD_KEY, phase: 'PLAN_VERIFICATION' }
  );

  console.log('VERDICT WRITTEN:');
  console.log('  ID:', stored.id);
  console.log('  verdict:', stored.verdict, '@ confidence', stored.confidence);
  console.log('  phase:', stored.phase);
  console.log('  repo_path:', stored.metadata?.repo_path);
  console.log('  repo_resolved:', stored.metadata?.repo_resolved);
  console.log('  executed_from_cwd:', stored.metadata?.executed_from_cwd);
  process.exit(0);
}

main().catch(e => { console.error('FAILED:', e.message); console.error(e.stack); process.exit(1); });
