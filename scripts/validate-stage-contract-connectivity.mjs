#!/usr/bin/env node
/**
 * scripts/validate-stage-contract-connectivity.mjs
 *
 * SD-LEO-INFRA-STAGE-CONTRACT-REGISTRY-001 FR-3: stage-contract connectivity
 * solver. Extends the validate-boundary-config-coherence.mjs recipe (pure
 * exported check functions + thin main) to the full stage I/O contract estate:
 *
 *   C1 REQUIRED_HAS_PRODUCER  (hard)     every venture_stages.required_artifacts[N]
 *                                        type has a declared producer at some stage
 *                                        <= N in ARTIFACT_TYPE_BY_STAGE (or is a
 *                                        cross-cutting gate artifact).
 *   C2 BOUNDARY_COHERENCE     (hard)     every gate_boundary_config required type
 *                                        is producible at some stage <= from_stage.
 *   C3 CONSUMES_SATISFIABLE   (hard)     S18 UPSTREAM_ARTIFACT_TYPES/STAGE_MAP are
 *                                        internally consistent and each consumed type
 *                                        has a declared producer at its mapped stage.
 *                             (advisory) STAGE_CONTRACTS consumes + CROSS_STAGE_DEPS
 *                                        reference only earlier stages.
 *   C4 RENAME_ATOMICITY       (hard)     no deprecated/legacy artifact_type alias
 *                                        appears in a live-enforced DB registry
 *                                        (venture_stages, gate_boundary_config).
 *   C5 LEGACY_PARITY          (hard)     stage_artifact_requirements (legacy table,
 *                                        still the fn_advance fallback) matches
 *                                        venture_stages.required_artifacts per stage.
 *                                        Expected RED until the FR-2 sync migration
 *                                        (20260610_sync_stage_artifact_requirements_
 *                                        to_ssot.sql) is applied.
 *   C6 OBSERVED_PRODUCER      (advisory) required types never observed in
 *                                        venture_artifacts despite ventures having
 *                                        traversed that stage.
 *   C7 CONTRACT_MAP_LINT      (hard)     no duplicate stage keys in the
 *                                        STAGE_CONTRACTS Map source (a duplicate key
 *                                        silently discards the first entry).
 *
 * Exit codes (bracket-tokenized markers per LEO convention):
 *   0 + [STAGE_CONTRACT_OK]          — all hard checks green
 *   1 + [STAGE_CONTRACT_DRIFT]       — at least one hard failure
 *   2 + [STAGE_CONTRACT_INFRA_ERROR] — missing env vars / DB unreachable
 *
 * --json: machine-readable JSON on stdout; markers go to stderr so the JSON
 * stream stays parseable (stderr-marker pattern).
 *
 * Failure shape: { check, stage, artifact_type, expected, got, nearest_match }
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import * as artifactTypesMod from '../lib/eva/artifact-types.js';
import { UPSTREAM_ARTIFACT_TYPES, STAGE_MAP } from '../lib/eva/stage-templates/upstream-artifact-types.js';
import { STAGE_CONTRACTS, CROSS_STAGE_DEPS } from '../lib/eva/contracts/stage-contracts.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STAGE_CONTRACTS_SOURCE_PATH = path.resolve(__dirname, '..', 'lib', 'eva', 'contracts', 'stage-contracts.js');

// Local-run convenience: load repo .env when present (no-op in CI, where env
// comes from workflow secrets). Same precedent as scripts/generate-stage-config.cjs.
try {
  const { default: dotenv } = await import('dotenv');
  dotenv.config({ path: path.resolve(__dirname, '..', '.env') });
} catch { /* dotenv unavailable — rely on process env */ }

const { ARTIFACT_TYPES, ARTIFACT_TYPE_BY_STAGE, OLD_TO_NEW_MAP } = artifactTypesMod;

// Defensive: DEPRECATED_ARTIFACT_TYPES is added by FR-1 of this SD; fall back to
// the known alias list so the solver also runs against pre-FR-1 trees (used to
// capture the pre-fix evidence run).
const FALLBACK_DEPRECATED = Object.freeze([
  'engine_risk_assessment',
  'engine_revenue_model',
  'launch_marketing_checklist',
  'launch_optimization_roadmap',
  'launch_launch_metrics',
]);
const DEPRECATED_TYPES = artifactTypesMod.DEPRECATED_ARTIFACT_TYPES ?? FALLBACK_DEPRECATED;

// Cross-cutting gate artifacts: produced by gate machinery (Devil's Advocate,
// value-multiplier, lifecycle bridge) at multiple stages, not by a single stage
// analyzer — treated as universally producible.
export const CROSS_CUTTING_TYPES = Object.freeze(new Set([
  ARTIFACT_TYPES.SYSTEM_DEVILS_ADVOCATE_REVIEW,
  ARTIFACT_TYPES.VALUE_MULTIPLIER_ASSESSMENT,
  ARTIFACT_TYPES.ECONOMIC_LENS,
  ARTIFACT_TYPES.LIFECYCLE_SD_BRIDGE,
  ARTIFACT_TYPES.POST_LIFECYCLE_DECISION,
]));

export const CHECK_IDS = Object.freeze({
  C1: 'REQUIRED_HAS_PRODUCER',
  C2: 'BOUNDARY_COHERENCE',
  C3: 'CONSUMES_SATISFIABLE',
  C4: 'RENAME_ATOMICITY',
  C5: 'LEGACY_PARITY',
  C6: 'OBSERVED_PRODUCER',
  C7: 'CONTRACT_MAP_LINT',
});

// ── shared helpers ───────────────────────────────────────────────────

/** Plain dynamic-programming Levenshtein distance. */
export function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = curr;
  }
  return prev[b.length];
}

/** Nearest candidate by Levenshtein distance. Returns null for empty candidates. */
export function nearestType(name, candidates) {
  let best = null;
  for (const c of candidates) {
    if (c === name) continue;
    const d = levenshtein(name, c);
    if (!best || d < best.distance) best = { match: c, distance: d };
  }
  return best;
}

function failure({ check, stage = null, artifact_type = null, expected = null, got = null, nearest_match = null }) {
  return { check, stage, artifact_type, expected, got, nearest_match };
}

/** Set of types declared producible at any stage <= maxStage. */
export function producibleAtOrBefore(maxStage, artifactTypeByStage, extraByStage = null) {
  const set = new Set();
  for (const [stage, types] of Object.entries(artifactTypeByStage)) {
    if (Number(stage) > maxStage) continue;
    for (const t of types || []) set.add(t);
  }
  if (extraByStage) {
    for (const row of extraByStage) {
      if (row.stage_number > maxStage) continue;
      for (const t of row.required_artifacts || []) set.add(t);
    }
  }
  return set;
}

// ── C1 REQUIRED_HAS_PRODUCER ─────────────────────────────────────────

export function checkRequiredHasProducer(ventureStages, artifactTypeByStage, { crossCutting = CROSS_CUTTING_TYPES } = {}) {
  const failures = [];
  const allDeclared = producibleAtOrBefore(Infinity, artifactTypeByStage);
  for (const row of ventureStages) {
    const producible = producibleAtOrBefore(row.stage_number, artifactTypeByStage);
    for (const t of row.required_artifacts || []) {
      if (producible.has(t) || crossCutting.has(t)) continue;
      failures.push(failure({
        check: CHECK_IDS.C1,
        stage: row.stage_number,
        artifact_type: t,
        expected: `declared producer at stage <= ${row.stage_number} in ARTIFACT_TYPE_BY_STAGE`,
        got: allDeclared.has(t) ? 'declared only at a LATER stage' : 'no declared producer at any stage',
        nearest_match: nearestType(t, [...allDeclared])?.match ?? null,
      }));
    }
  }
  return failures;
}

// ── C2 BOUNDARY_COHERENCE ────────────────────────────────────────────

export function checkBoundaryCoherence(boundaries, ventureStages, artifactTypeByStage, { crossCutting = CROSS_CUTTING_TYPES } = {}) {
  const failures = [];
  for (const b of boundaries) {
    const producible = producibleAtOrBefore(b.from_stage, artifactTypeByStage, ventureStages);
    for (const t of b.required_artifacts || []) {
      if (producible.has(t) || crossCutting.has(t)) continue;
      failures.push(failure({
        check: CHECK_IDS.C2,
        stage: b.from_stage,
        artifact_type: t,
        expected: `producer at stage <= ${b.from_stage} (boundary ${b.from_stage}->${b.to_stage})`,
        got: 'no upstream producer',
        nearest_match: nearestType(t, [...producible])?.match ?? null,
      }));
    }
  }
  return failures;
}

// ── C3 CONSUMES_SATISFIABLE ──────────────────────────────────────────

export function checkConsumesSatisfiable({
  upstreamTypes = UPSTREAM_ARTIFACT_TYPES,
  stageMap = STAGE_MAP,
  consumerStage = 18,
  artifactTypeByStage = ARTIFACT_TYPE_BY_STAGE,
  stageContracts = STAGE_CONTRACTS,
  crossStageDeps = CROSS_STAGE_DEPS,
  crossCutting = CROSS_CUTTING_TYPES,
} = {}) {
  const failures = [];
  const advisories = [];

  // Hard: STAGE_MAP and UPSTREAM_ARTIFACT_TYPES must be the same set.
  const upstreamSet = new Set(upstreamTypes);
  for (const t of upstreamTypes) {
    if (!(t in stageMap)) {
      failures.push(failure({
        check: CHECK_IDS.C3, stage: consumerStage, artifact_type: t,
        expected: 'entry in STAGE_MAP', got: 'missing',
        nearest_match: nearestType(t, Object.keys(stageMap))?.match ?? null,
      }));
    }
  }
  for (const t of Object.keys(stageMap)) {
    if (!upstreamSet.has(t)) {
      failures.push(failure({
        check: CHECK_IDS.C3, stage: consumerStage, artifact_type: t,
        expected: 'entry in UPSTREAM_ARTIFACT_TYPES', got: 'STAGE_MAP-only entry',
        nearest_match: null,
      }));
    }
  }

  // Hard: each consumed type producible at its mapped stage, which must precede the consumer.
  for (const t of upstreamTypes) {
    const srcStage = stageMap[t];
    if (srcStage === undefined) continue; // already failed above
    if (!(srcStage < consumerStage)) {
      failures.push(failure({
        check: CHECK_IDS.C3, stage: srcStage, artifact_type: t,
        expected: `source stage < ${consumerStage}`, got: `source stage ${srcStage}`,
        nearest_match: null,
      }));
      continue;
    }
    const producible = producibleAtOrBefore(srcStage, artifactTypeByStage);
    if (!producible.has(t) && !crossCutting.has(t)) {
      failures.push(failure({
        check: CHECK_IDS.C3, stage: srcStage, artifact_type: t,
        expected: `declared producer at stage <= ${srcStage}`, got: 'no declared producer',
        nearest_match: nearestType(t, [...producibleAtOrBefore(Infinity, artifactTypeByStage)])?.match ?? null,
      }));
    }
  }

  // Advisory: STAGE_CONTRACTS consumes must reference earlier stages only.
  for (const [stageNum, contract] of stageContracts.entries()) {
    for (const dep of contract.consumes || []) {
      if (!(dep.stage < stageNum)) {
        advisories.push(failure({
          check: CHECK_IDS.C3, stage: stageNum, artifact_type: null,
          expected: `consumes stage < ${stageNum}`, got: `consumes stage ${dep.stage}`,
          nearest_match: null,
        }));
      }
    }
  }

  // Advisory: CROSS_STAGE_DEPS must reference earlier stages only.
  for (const [stage, deps] of Object.entries(crossStageDeps)) {
    for (const d of deps || []) {
      if (!(d < Number(stage))) {
        advisories.push(failure({
          check: CHECK_IDS.C3, stage: Number(stage), artifact_type: null,
          expected: `dependency stage < ${stage}`, got: `dependency stage ${d}`,
          nearest_match: null,
        }));
      }
    }
  }

  return { failures, advisories };
}

// ── C4 RENAME_ATOMICITY ──────────────────────────────────────────────

/**
 * Live-enforced registries must not reference deprecated aliases or legacy
 * (pre-rename) names. The legacy stage_artifact_requirements table is NOT
 * checked here — its entire content is compared by C5 (single-owner reporting).
 */
export function checkRenameAtomicity({
  deprecatedTypes = DEPRECATED_TYPES,
  oldToNewMap = OLD_TO_NEW_MAP,
  canonicalValues = new Set(Object.values(ARTIFACT_TYPES)),
  registries,
}) {
  const failures = [];
  const deprecatedSet = new Set(deprecatedTypes);
  const deprecatedToCanonical = artifactTypesMod.DEPRECATED_TO_CANONICAL ?? {};
  for (const reg of registries) {
    for (const entry of reg.entries) {
      for (const t of entry.types || []) {
        const isDeprecated = deprecatedSet.has(t);
        const isLegacyKey = (t in oldToNewMap) && !canonicalValues.has(t);
        if (!isDeprecated && !isLegacyKey) continue;
        const canonical = deprecatedToCanonical[t] ?? oldToNewMap[t] ?? null;
        failures.push(failure({
          check: CHECK_IDS.C4,
          stage: entry.stage ?? null,
          artifact_type: t,
          expected: canonical ? `canonical type '${canonical}'` : 'a canonical (non-deprecated) type',
          got: `${isDeprecated ? 'deprecated alias' : 'legacy pre-rename name'} in ${reg.name}`,
          nearest_match: canonical,
        }));
      }
    }
  }
  return failures;
}

// ── C5 LEGACY_PARITY ─────────────────────────────────────────────────

export function checkLegacyParity(legacyRows, ventureStages) {
  const failures = [];
  const legacyByStage = new Map();
  for (const r of legacyRows) {
    if (!legacyByStage.has(r.stage_number)) legacyByStage.set(r.stage_number, new Set());
    legacyByStage.get(r.stage_number).add(r.artifact_type);
  }
  for (const row of ventureStages) {
    const ssot = new Set(row.required_artifacts || []);
    const legacy = legacyByStage.get(row.stage_number) || new Set();
    for (const t of ssot) {
      if (!legacy.has(t)) {
        failures.push(failure({
          check: CHECK_IDS.C5, stage: row.stage_number, artifact_type: t,
          expected: `row in stage_artifact_requirements (SSOT requires '${t}')`,
          got: 'missing from legacy table',
          nearest_match: nearestType(t, [...legacy])?.match ?? null,
        }));
      }
    }
    for (const t of legacy) {
      if (!ssot.has(t)) {
        failures.push(failure({
          check: CHECK_IDS.C5, stage: row.stage_number, artifact_type: t,
          expected: `absent (SSOT requires: ${[...ssot].join(', ') || 'none'})`,
          got: 'stale legacy row',
          nearest_match: nearestType(t, [...ssot])?.match ?? null,
        }));
      }
    }
  }
  return failures;
}

// ── C6 OBSERVED_PRODUCER (advisory) ──────────────────────────────────

export function checkObservedProducer(ventureStages, observedTypes, maxTraversedStage) {
  const advisories = [];
  for (const row of ventureStages) {
    if (row.stage_number > maxTraversedStage) continue;
    for (const t of row.required_artifacts || []) {
      if (observedTypes.has(t)) continue;
      advisories.push(failure({
        check: CHECK_IDS.C6, stage: row.stage_number, artifact_type: t,
        expected: 'at least one venture_artifacts row of this type',
        got: `never observed (ventures have reached stage ${maxTraversedStage})`,
        nearest_match: nearestType(t, [...observedTypes])?.match ?? null,
      }));
    }
  }
  return advisories;
}

// ── C7 CONTRACT_MAP_LINT ─────────────────────────────────────────────

export function checkContractMapLint(sourceText) {
  const failures = [];
  const counts = new Map();
  for (const line of sourceText.split('\n')) {
    const m = line.match(/^\s*\[\s*(\d+)\s*,\s*\{/);
    if (m) counts.set(Number(m[1]), (counts.get(Number(m[1])) || 0) + 1);
  }
  for (const [stage, n] of counts) {
    if (n > 1) {
      failures.push(failure({
        check: CHECK_IDS.C7, stage, artifact_type: null,
        expected: 'unique STAGE_CONTRACTS Map key',
        got: `${n} entries for stage ${stage} (Map silently keeps only the last)`,
        nearest_match: null,
      }));
    }
  }
  return failures;
}

// ── aggregation ──────────────────────────────────────────────────────

export function runAllChecks({ ventureStages, boundaries, legacyRows, observedTypes, maxTraversedStage, stageContractsSource }) {
  const failures = [];
  const advisories = [];

  failures.push(...checkRequiredHasProducer(ventureStages, ARTIFACT_TYPE_BY_STAGE));
  failures.push(...checkBoundaryCoherence(boundaries, ventureStages, ARTIFACT_TYPE_BY_STAGE));

  const c3 = checkConsumesSatisfiable({});
  failures.push(...c3.failures);
  advisories.push(...c3.advisories);

  failures.push(...checkRenameAtomicity({
    registries: [
      { name: 'venture_stages.required_artifacts', entries: ventureStages.map(r => ({ stage: r.stage_number, types: r.required_artifacts })) },
      { name: 'gate_boundary_config.required_artifacts', entries: boundaries.map(b => ({ stage: b.from_stage, types: b.required_artifacts })) },
    ],
  }));

  failures.push(...checkLegacyParity(legacyRows, ventureStages));
  advisories.push(...checkObservedProducer(ventureStages, observedTypes, maxTraversedStage));
  failures.push(...checkContractMapLint(stageContractsSource));

  const perCheck = {};
  for (const f of failures) perCheck[f.check] = (perCheck[f.check] || 0) + 1;
  const perAdvisory = {};
  for (const a of advisories) perAdvisory[a.check] = (perAdvisory[a.check] || 0) + 1;

  return {
    ok: failures.length === 0,
    failures,
    advisories,
    summary: failures.length === 0
      ? `OK: ${ventureStages.length} stages, ${boundaries.length} boundaries, ${legacyRows.length} legacy rows — all hard checks green (${advisories.length} advisories)`
      : `DRIFT: ${failures.length} hard failure(s) [${Object.entries(perCheck).map(([k, v]) => `${k}:${v}`).join(', ')}], ${advisories.length} advisory(ies)${Object.keys(perAdvisory).length ? ` [${Object.entries(perAdvisory).map(([k, v]) => `${k}:${v}`).join(', ')}]` : ''}`,
  };
}

// ── thin main ────────────────────────────────────────────────────────

function renderFailureLine(f) {
  const nm = f.nearest_match ? ` (nearest: ${f.nearest_match})` : '';
  const st = f.stage !== null && f.stage !== undefined ? `stage ${f.stage}` : 'global';
  const at = f.artifact_type ? ` '${f.artifact_type}'` : '';
  return `  - [${f.check}] ${st}${at}: expected ${f.expected}; got ${f.got}${nm}`;
}

async function loadObserved(supabase) {
  const observedTypes = new Set();
  let maxTraversedStage = -1;
  const PAGE = 1000;
  for (let page = 0; page < 60; page++) {
    const { data, error } = await supabase
      .from('venture_artifacts')
      .select('lifecycle_stage, artifact_type')
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) throw error;
    for (const r of data || []) {
      if (r.artifact_type) observedTypes.add(r.artifact_type);
      if (typeof r.lifecycle_stage === 'number' && r.lifecycle_stage > maxTraversedStage) {
        maxTraversedStage = r.lifecycle_stage;
      }
    }
    if (!data || data.length < PAGE) break;
  }
  return { observedTypes, maxTraversedStage };
}

async function main() {
  const jsonMode = process.argv.includes('--json');
  const out = jsonMode ? console.error : console.log; // human lines; in --json mode everything human goes to stderr

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('[STAGE_CONTRACT_INFRA_ERROR] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(2);
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  let ventureStages;
  let boundaries;
  let legacyRows;
  let observed;
  let stageContractsSource;
  try {
    const [vsRes, gbRes, legacyRes] = await Promise.all([
      supabase.from('venture_stages').select('stage_number, stage_name, required_artifacts').order('stage_number'),
      supabase.from('gate_boundary_config').select('from_stage, to_stage, required_artifacts'),
      supabase.from('stage_artifact_requirements').select('stage_number, artifact_type'),
    ]);
    for (const r of [vsRes, gbRes, legacyRes]) {
      if (r.error) throw r.error;
    }
    ventureStages = vsRes.data || [];
    boundaries = gbRes.data || [];
    legacyRows = legacyRes.data || [];
    observed = await loadObserved(supabase);
    stageContractsSource = fs.readFileSync(STAGE_CONTRACTS_SOURCE_PATH, 'utf8');
  } catch (err) {
    console.error(`[STAGE_CONTRACT_INFRA_ERROR] data load failed: ${err.message || err}`);
    process.exit(2);
  }

  const result = runAllChecks({
    ventureStages,
    boundaries,
    legacyRows,
    observedTypes: observed.observedTypes,
    maxTraversedStage: observed.maxTraversedStage,
    stageContractsSource,
  });

  if (jsonMode) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } else {
    if (result.failures.length > 0) {
      out('Hard failures:');
      for (const f of result.failures) out(renderFailureLine(f));
    }
    if (result.advisories.length > 0) {
      out('Advisories (non-blocking):');
      for (const a of result.advisories) out(renderFailureLine(a));
    }
  }

  if (!result.ok) {
    console.error('[STAGE_CONTRACT_DRIFT]', result.summary);
    process.exit(1);
  }
  // OK marker: stdout normally (boundary-script parity); stderr in --json mode
  // so stdout stays pure JSON.
  (jsonMode ? console.error : console.log)('[STAGE_CONTRACT_OK]', result.summary);
  process.exit(0);
}

// Only run main when executed directly (not when imported by tests).
const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  // libuv-safe exit pattern (QF-20260511-469): await main, catch unhandled,
  // then explicit exit.
  main().catch((err) => {
    console.error(`[STAGE_CONTRACT_INFRA_ERROR] Unhandled: ${err?.message || err}`);
    process.exit(2);
  });
}
