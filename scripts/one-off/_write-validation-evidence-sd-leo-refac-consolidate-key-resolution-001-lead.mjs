#!/usr/bin/env node
/**
 * Write VALIDATION sub-agent execution evidence for SD-LEO-REFAC-CONSOLIDATE-KEY-RESOLUTION-001
 * Phase: LEAD (for LEAD-TO-PLAN handoff — satisfies SUBAGENT_EVIDENCE_MISSING gate)
 *
 * Audit performed 2026-05-03 by validation-agent (Opus 4.7 1M):
 *   - Verified user-cited count of 15 exact `.eq('id', sd_id)` snake_case sites in scripts/modules/
 *   - Surveyed broader sibling pattern (sdId/sdUuid camelCase variants — separate categories)
 *   - Identified 3 existing helpers + 17 ad-hoc inlined .or() callsites already encoding QF-515 pattern
 *   - Reviewed QF-515 reference fix in workflow-roi-validation.js:55-70 + line 322-329
 *   - Sampled gate-2-implementation-fidelity.js:264-271, additional-validators.js:67-75,
 *     implementation-fidelity/index.js:60-127, and design-database-gates-validation.js:64
 */
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: 'C:/Users/rickf/Projects/_EHG/EHG_Engineer/.env', quiet: true });

const SD_UUID = '6b9f5205-6476-4428-8159-32447ddd2486';
const PHASE = 'LEAD';
const SUB_AGENT_CODE = 'VALIDATION';
const SUB_AGENT_NAME = 'Principal Systems Analyst';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const payload = {
  sd_id: SD_UUID,
  sub_agent_code: SUB_AGENT_CODE,
  sub_agent_name: SUB_AGENT_NAME,
  verdict: 'PASS',
  confidence: 88,
  phase: PHASE,
  source: 'manual-claude-code',
  validation_mode: 'prospective',
  summary: 'LEAD-TO-PLAN validation: scope estimate of 15 exact-match sd_id sites VERIFIED; broader pattern audit reveals 3 existing helpers + 17 inlined .or() callsites in scripts/lib & scripts/modules — confirms refactor is necessary AND that proposed resolveSdInput() is a valid superset. PASS with PLAN contingencies for (a) need to migrate existing 17 ad-hoc .or() callsites in same sweep to avoid two-helper schism, (b) UPDATE-call risk class needs explicit Phase-1 spec, and (c) decomposition regrouping recommended.',
  detailed_analysis: [
    '== Q1 SCOPE VALIDATION (CONFIRMED + EXPANDED) ==',
    'Exact `.eq(\'id\', sd_id)` snake_case sites in scripts/modules/: 15 — matches user count exactly. Files: bmad-validation.js (1), design-database-gates-validation.js (2), handoff/gates/tdd-pre-implementation-gate.js (1), handoff/validation/validator-registry/gates/additional-validators.js (2), handoff/validation/validator-registry/gates/gate-2-implementation-fidelity.js (1), implementation-fidelity/index.js (3), implementation-fidelity/sections/{data-flow-alignment.js, design-fidelity.js} (1 each), implementation-fidelity/utils/git-helpers.js (1), qa/test-plan-generator.js (1), traceability-validation/index.js (1).',
    'BROADER FOOTPRINT (not in user spec but in same defect class): `.eq(\'id\', sdId)` camelCase = 33 occurrences across handoff/, orchestrator/, leo-orchestrator/, sd-creation/, prd-database-service.mjs, etc. Of these, sd-creation/sd-operations.js, prd-database-service.mjs, and handoff/db/SDRepository.js are SELECT-then-UPDATE chains where the input is from CLI argv → high QF-515 risk. The remainder receive an already-resolved UUID upstream — those are not bugs but are SAFE migration candidates that would simplify auditability.',
    '`.eq(\'id\', sdUuid)` = 14 occurrences — these are explicitly post-resolution and are NOT bugs; recommend treating as REUSE TARGETS (call resolveSdInput() upstream, drop the bespoke resolution dance).',
    'EXISTING HELPER INVENTORY (must not be ignored): (1) scripts/modules/sd-id-normalizer.js exports normalizeSDId() returning canonical id only (no full row); (2) scripts/modules/auto-trigger-stories.mjs:727 exports lookupSdIdForFk() returning {id, sd_key} (no full row); (3) sd-key-generator.js:634 inlines the .or() pattern. Plus 17 ad-hoc inlined `.or(\\`sd_key.eq.${sd_id},id.eq.${sd_id}\\`)` callsites in scripts/lib/{governance-policy-checker.js, leo-checkpoint.js (3x), root-cause-resolver.js (2x), sd-hierarchy-mapper.js (2x)} and scripts/modules/{auto-proceed/, sd-next/display/recommendations.js (3x), shipping/ShippingContextBuilder.js, traceability-validation/utils.js, implementation-fidelity/utils/repo-detection.js}. The proposed resolveSdInput → {sdId, sdKey, sd} is a valid SUPERSET — returns full row so callers stop re-fetching. RECOMMENDATION: PLAN must explicitly enumerate disposition for each existing helper (deprecate-with-shim vs delete vs leave) and add the 17 ad-hoc inlined callsites to the migration list (otherwise two-helper schism perpetuates).',
    'POSSIBLE MISSES (broader patterns NOT captured by `.eq(\'id\', X)` exact match): UPDATE chains that go .from().update().eq() — e.g., handoff/blocker-resolution.js:356,373 update SD then read back; if input arrives as sd_key, update silently matches zero rows (sd-id-normalizer.js JSDoc explicitly warns of this class). Recommend PLAN add UPDATE-vs-SELECT classification to migration spec — UPDATE class needs the canonical UUID, not just any-match resolution.',
    '',
    '== Q2 PATTERN CORRECTNESS (PASS WITH CAVEAT) ==',
    'QF-515 fix uses .or(`sd_key.eq.${sd_id},id.eq.${sd_id}`). Supabase PostgREST `.or()` filter parameter does template-literal interpolation client-side then sends as URL query string; PostgREST parses .or() values per the FilterDelimiter grammar. Inputs containing commas, parens, dots, or quotes break the filter syntax. Internal CLI sources all SD IDs from process.argv or DB rows where sd_key matches /^SD-[A-Z0-9-]+$/i and id is UUIDv4 — no shell metacharacters reach this path. INJECTION RISK = LOW for current attack surface.',
    'However: DEFENSIVE NOTE — if any caller ever passes user-controlled (e.g., from env, webhook payload, or LLM-generated) input through resolveSdInput(), the .or() string interpolation IS injectable (e.g., input "x,id.eq.bypass" mutates the filter). Recommend PLAN add: (a) input validation — reject inputs not matching UUID_REGEX || SD_KEY_REGEX before interpolation (sd-id-normalizer.js:31-37 already exports both regexes — REUSE); (b) two sequential .eq() lookups (id-first, sd_key-fallback) instead of .or() — avoids interpolation-into-filter-string entirely. Either approach is acceptable; explicit regex gate is the smaller change.',
    '',
    '== Q3 MIGRATION RISK (RANKED BY BLAST RADIUS) ==',
    'TIER A (HARD CRASH — high blast): implementation-fidelity/index.js (3 sites), data-flow-alignment.js, design-fidelity.js, git-helpers.js — these dereference sd.id, sd.title, sd.scope, sd.target_application. If migration sets resolvedSdUuid wrong → null deref → Gate 2 PLAN-VERIFICATION crashes mid-handoff (same class as QF-515). Worst case = handoff blocks, requires bypass.',
    'TIER A (HARD CRASH): workflow-roi-validation.js:325 (already QF-515 fixed) feeds calculateAdaptiveThreshold which dereferences sd.risk_level — null deref crash. Migration must preserve the prefetched-pattern (`options.prefetched?.sd || ...`) to keep dedup gate working.',
    'TIER B (SILENT FALSE-PASS — highest insidious blast): bmad-validation.js, design-database-gates-validation.js, additional-validators.js, gate-2-implementation-fidelity.js, tdd-pre-implementation-gate.js — these gate-handler functions return PASS-by-default if sd lookup fails or returns wrong row. If migration produces wrong canonical id, gate stamps PASS for an SD that should fail → false-pass propagates to LEAD-FINAL. WORST CASE here, because failures are invisible until retro/audit.',
    'TIER C (MISSING DATA / DOWNSTREAM EMPTY): qa/test-plan-generator.js, traceability-validation/index.js — these populate downstream artifacts. Migration error → empty test plan, empty traceability. Visible failure but graceful (no crash).',
    'BLAST RADIUS RANK: B > A > C. Tier B (silent false-pass in gates) is highest priority for test-coverage in Phase 1 because Tier A crashes self-announce; Tier B does not. RECOMMEND PLAN spec: Phase-1 helper test suite MUST include "missing SD returns null AND callers throw" + "wrong-format input returns null AND callers throw" cases — propagating-error contract, not silent-default contract. Don\'t replicate the silent-zero-row failure mode of sd-id-normalizer.js JSDoc warning.',
    '',
    '== Q4 DECOMPOSITION VALIDATION (REGROUPING RECOMMENDED) ==',
    'Proposed 5-phase grouping has dependency inversion: Phase 4 "orchestrator*" runs after Phase 2 "handoff/*" but handoff/executors/lead-to-plan/gates/lead-evaluation-check.js IMPORTS from leo-orchestrator/. Migrating handoff first will leave one foot in old pattern, one in new. RECOMMEND REGROUP:',
    '  Phase 1: lib/sd-id-resolver.js helper + unit tests (standalone, no callers migrated yet) — UNCHANGED.',
    '  Phase 2: scripts/modules/sd-id-normalizer.js + scripts/modules/auto-trigger-stories.mjs:lookupSdIdForFk → migrate to call resolveSdInput() internally (preserves backward-compat shim). This first ensures existing callers of those helpers are transparently routed through the new code path. Test by running existing prerequisite-preflight.js + sd-id-normalizer test suite (PR #3382 + SD-LEO-ID-NORMALIZE-001 tests).',
    '  Phase 3: implementation-fidelity/* (5 sites) + traceability-validation/index.js + qa/test-plan-generator.js — these are leaf modules, low import-fanout, lowest-risk migration to validate helper API is sound.',
    '  Phase 4: handoff/validation/validator-registry/gates/* + handoff/gates/tdd-pre-implementation-gate.js + bmad-validation.js + design-database-gates-validation.js — Tier-B silent false-pass class; needs E2E run of full handoff pipeline against an SD-key input to prove no regression (e.g., `node scripts/handoff.js execute LEAD-TO-PLAN SD-EVA-MEETING-001` smoke).',
    '  Phase 5: workflow-roi-validation.js (already QF-515-fixed — refactor to USE the helper instead of inline .or()) + sweep of 17 ad-hoc inlined .or() callsites in scripts/lib + scripts/modules/sd-next/. Optional: eslint rule.',
    'KEY CHANGE FROM PROPOSED: existing helpers come BEFORE leaf-fidelity modules (order phase 2 vs 3). Rationale: if normalizeSDId() is internally re-routed to resolveSdInput(), callers of normalizeSDId (auto-trigger-stories, prerequisite-preflight, etc.) get fixed for free without per-callsite touch — material LOC reduction. Sequence Phase 4 (handoff gates) AFTER Phase 3 because gates have highest blast radius and benefit from leaf-module shakedown first.',
    '',
    '== Q5 SCOPE REDUCTION DEFERRAL (FR-3 ESLINT — RECOMMEND PROMOTING TO PHASE 5 / FR-1 PER-PROCESS CACHE — DEFER OK) ==',
    'FR-3 eslint rule deferral: REGRESSION RISK. Without a lint guard, the next session will inevitably reintroduce `.eq(\'id\', sd_id)` (this is exactly what happened across 18 months that produced 32+ callsites). Sd-id-normalizer.js exists since 2025 and DID NOT prevent regression. If we ship resolveSdInput() without a syntactic guard, the same drift will happen — defeats the SD\'s strategic purpose. RECOMMEND: (a) include a lightweight no-restricted-syntax eslint rule in Phase 5 (~10 LOC config), OR (b) include a one-shot `node scripts/check-sd-id-eq-regressions.js` invoked from a husky pre-commit hook (~30 LOC) that greps for `.eq(\'id\', sd_id|sdId|sdUuid)` outside of approved files (the helper itself + one-off scripts). Either is small enough to keep in scope. Strict deferral leaves drift surface open.',
    'FR-1 per-process cache deferral: ACCEPTABLE. Caching is a perf-optimization not a correctness concern. resolveSdInput() will hit the DB once per call → ~30ms per gate-handler entry. Even at 15 callsites in a single handoff = ~450ms additive — within budget. Defer to follow-up SD if profiling shows hotspot.',
    '',
    '== ADDITIONAL OBSERVATIONS (non-blocking) ==',
    'OBS-1: scripts/modules/handoff/db/SDRepository.js already exists as a getById() abstraction layer — recommend resolveSdInput() be added there as a method (or SDRepository internally consume resolveSdInput) so the canonical access path is "use SDRepository". Avoids parallel `import { resolveSdInput }` proliferation.',
    'OBS-2: Repository naming: lib/sd-id-resolver.js per SD title is fine, but consider scripts/lib/sd-id-resolver.js (matches existing scripts/lib/ helpers like leo-checkpoint.js, root-cause-resolver.js) rather than top-level lib/. PLAN to confirm path.',
    'OBS-3: target_application=EHG_Engineer is correct (refactor scope is harness-side scripts/modules). No EHG repo touched.'
  ].join('\n'),
  critical_issues: [],
  warnings: [
    'PASS — PLAN contingencies recommended: (1) extend migration scope to include 17 ad-hoc inlined .or() callsites + 2 existing helpers (sd-id-normalizer.js, lookupSdIdForFk) with backward-compat shim — otherwise two-helper schism. (2) regroup phases per Q4 (existing helpers before leaf modules). (3) reconsider eslint/regression-guard deferral — recommend ~10 LOC lint rule OR husky grep guard kept in scope.',
    'Tier-B silent false-pass risk class: 5 gate-handler files will silently stamp PASS if migration is incorrect — Phase-1 helper unit tests MUST enforce throw-on-not-found contract (reject silent-zero-row pattern that sd-id-normalizer.js currently has).',
    'Defensive note on .or() injection: input not matching UUID_REGEX || SD_KEY_REGEX must be rejected before interpolation. Reuse regexes already exported from sd-id-normalizer.js.',
    'UPDATE-call class (e.g., handoff/blocker-resolution.js:356,373) needs explicit canonical-UUID resolution (not any-match) — PLAN spec must classify SELECT-vs-UPDATE migration semantics.'
  ],
  recommendations: [
    'PLAN: lock scope at 15 sd_id snake-case sites + 17 ad-hoc .or() sites + 2 existing helper updates = ~34 callsite touches. Estimated LOC: helper ~100 LOC, migration ~150 LOC, tests ~250 LOC, lint guard ~30 LOC = ~530 LOC total (Tier 3 SD justified).',
    'PLAN: regroup phases — Phase 2 = existing helpers (normalizeSDId, lookupSdIdForFk shimming) BEFORE Phase 3 leaf modules; Phase 4 = handoff gates (Tier-B); Phase 5 = workflow-roi-validation + scripts/lib sweep + lint guard.',
    'PLAN: include FR for "throw-on-not-found contract" in helper spec — explicit error propagation; do not replicate silent-default of normalizeSDId().',
    'PLAN: include UUID_REGEX/SD_KEY_REGEX input validation in helper (reuse from sd-id-normalizer.js) before .or() interpolation — addresses defensive injection note.',
    'PLAN: classify each migration site as SELECT-only vs SELECT+UPDATE — UPDATE class needs canonical UUID assertion (sdId from helper return), SELECT class can use either resolved id.',
    'PLAN: add Phase-1 acceptance test "resolveSdInput rejects malformed input" + "resolveSdInput throws on not-found" + "resolveSdInput is idempotent across UUID and sd_key inputs for same SD".',
    'PLAN: smoke test in Phase 4 gate — run `node scripts/handoff.js execute LEAD-TO-PLAN <existing-SD>` with sd_key (not UUID) input as regression check; PASS == migration sound.',
    'PLAN: confirm helper path scripts/lib/sd-id-resolver.js (matches existing scripts/lib/ convention) not lib/.',
    'PLAN: consider co-locating helper as method on SDRepository (scripts/modules/handoff/db/SDRepository.js) so canonical access path is "use SDRepository". Defer or accept; either is workable.',
    'PLAN: keep regression guard (lint rule OR husky grep) in Phase 5 — strict deferral perpetuates drift surface that produced this SD in the first place.'
  ],
  metadata: {
    sd_key: 'SD-LEO-REFAC-CONSOLIDATE-KEY-RESOLUTION-001',
    target_application: 'EHG_Engineer',
    phase_at_audit: 'LEAD',
    audit_methodology: 'grep-based exact-match enumeration across scripts/modules/ + scripts/lib/, sample-read of 4 representative callsites, dependency-import inspection for phase-grouping validation, existing-helper inventory cross-check',
    callsite_inventory: {
      sd_id_snake_case_exact: 15,
      sdId_camelcase_broader: 33,
      sdUuid_already_resolved: 14,
      ad_hoc_inlined_or_pattern: 17,
      existing_helpers: ['sd-id-normalizer.js:normalizeSDId', 'auto-trigger-stories.mjs:lookupSdIdForFk', 'sd-key-generator.js:inline'],
      total_migration_surface_recommended: 34
    },
    risk_classification: {
      tier_a_hard_crash: ['implementation-fidelity/index.js (3 sites)', 'data-flow-alignment.js', 'design-fidelity.js', 'git-helpers.js', 'workflow-roi-validation.js (already-fixed reference)'],
      tier_b_silent_false_pass: ['bmad-validation.js', 'design-database-gates-validation.js', 'additional-validators.js (2 sites)', 'gate-2-implementation-fidelity.js', 'tdd-pre-implementation-gate.js'],
      tier_c_missing_data: ['qa/test-plan-generator.js', 'traceability-validation/index.js']
    },
    decomposition_recommendation: {
      phase_1: 'lib helper standalone + unit tests',
      phase_2: 'existing helpers (normalizeSDId, lookupSdIdForFk) shim through resolveSdInput',
      phase_3: 'leaf modules: implementation-fidelity/*, traceability-validation, qa/test-plan-generator',
      phase_4: 'handoff gates (Tier-B silent-false-pass class)',
      phase_5: 'workflow-roi-validation refactor + scripts/lib sweep + regression guard (lint OR husky)'
    },
    qf_515_pr: 3512,
    qf_515_canonical_pattern_at: 'scripts/modules/workflow-roi-validation.js:55-70 + 322-329',
    audit_memory_referenced: 'reference_sd_id_eq_query_audit_2026_05_03.md',
    sql_injection_assessment: 'LOW for current attack surface (internal CLI only); recommend regex pre-validation in helper for defense-in-depth'
  },
  retro_contribution: {}
};

const { data, error } = await supabase
  .from('sub_agent_execution_results')
  .insert(payload)
  .select('id, sd_id, sub_agent_code, phase, verdict, confidence, source, created_at')
  .single();

if (error) {
  console.error('INSERT FAILED:', error);
  process.exit(1);
}

console.log('VALIDATION evidence written successfully:');
console.log(JSON.stringify(data, null, 2));
