#!/usr/bin/env node
/**
 * vision-evidence-scorer.js — Deterministic Vision Evidence Scorer
 *
 * Replaces LLM-based vision scoring with deterministic evidence checks.
 * Each dimension (V01-V11, A01-A07) has 3-5 binary checkpoints verified
 * programmatically. Same codebase = same score, guaranteed.
 *
 * Usage:
 *   node scripts/eva/vision-evidence-scorer.js                              # Score EHG self (default)
 *   node scripts/eva/vision-evidence-scorer.js --persist                     # ...and persist to DB
 *   node scripts/eva/vision-evidence-scorer.js --verbose                     # Show per-check evidence
 *   node scripts/eva/vision-evidence-scorer.js --vision-key VISION-FOO-L2-001 --target-path /path/to/venture-repo
 *                                                                            # Score a venture codebase
 *                                                                            # (arch-key auto-derives to ARCH-FOO-001;
 *                                                                            #  pass --arch-key explicitly to override)
 *
 * SD-CRONGENIUS-LEO-INFRA-MAKE-HEAL-VISION-001: --target-path flag enables venture-codebase
 * scoring (instead of always evaluating EHG_Engineer). Non-EHG vision-keys auto-derive the
 * arch-key and refuse silent fallback to ARCH-EHG-L1-001 if the derived arch plan is missing.
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { loadAllRubrics } from './evidence-rubrics/index.js';
import { runRubricChecks, computeDimensionScore, generateReasoning, generateGaps } from './evidence-checks/check-runner.js';
import { ensureFresh, getGitMeta, warnIfWorktree } from './git-freshness.js';
// SD-LEO-INFRA-VENTURE-RUBRIC-SEMANTIC-001 (FR-1/FR-2/FR-3): venture-aware rubric path
import { computeCacheKey, getCachedRubrics, setCachedRubrics } from '../../lib/eva/rubric-cache.js';
import { generateVentureRubrics } from '../../lib/eva/rubric-generator.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '../../.env') });

const ACCEPT_THRESHOLD = 93;
const DEFAULT_VISION_KEY = 'VISION-EHG-L1-001';
const DEFAULT_ARCH_KEY = 'ARCH-EHG-L1-001';

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, key);
}

/**
 * SD-CRONGENIUS-LEO-INFRA-MAKE-HEAL-VISION-001 (FR-3):
 *   Derive an arch-key from a non-EHG vision-key. Pattern:
 *     VISION-<CTX>-<...>-L<N>-<NNN>  →  ARCH-<CTX>-001
 *   Examples:
 *     VISION-CRONGENIUS-API-L2-001 → ARCH-CRONGENIUS-001
 *     VISION-FOO-L1-001            → ARCH-FOO-001
 *
 * Pure + exportable for unit testing. Returns null if the vision-key shape
 * does not yield a derivable context segment.
 */
export function deriveArchKeyFromVisionKey(visionKey) {
  if (!visionKey || typeof visionKey !== 'string') return null;
  if (!visionKey.startsWith('VISION-')) return null;
  // Strip VISION- prefix, then walk segments until we hit a level marker (L<digit>) or numeric suffix.
  const rest = visionKey.slice('VISION-'.length);
  const parts = rest.split('-');
  const ctxParts = [];
  for (const p of parts) {
    if (/^L\d+$/i.test(p)) break;
    if (/^\d+$/.test(p)) break;
    ctxParts.push(p);
  }
  if (ctxParts.length === 0) return null;
  return `ARCH-${ctxParts[0].toUpperCase()}-001`;
}

function parseArgs(argv) {
  const args = {
    persist: false,
    verbose: false,
    visionKey: DEFAULT_VISION_KEY,
    archKey: null,             // null = derive/default at main() time so non-EHG visions can fail loudly
    explicitArchKey: false,    // tracks whether --arch-key was explicitly supplied
    targetPath: null,          // FR-3: optional absolute dir for venture-codebase scoring
  };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--persist') args.persist = true;
    if (argv[i] === '--verbose') args.verbose = true;
    if (argv[i] === '--vision-key' && argv[i + 1]) args.visionKey = argv[++i];
    if (argv[i] === '--arch-key' && argv[i + 1]) { args.archKey = argv[++i]; args.explicitArchKey = true; }
    if (argv[i] === '--target-path' && argv[i + 1]) args.targetPath = argv[++i];
  }
  return args;
}

/**
 * SD-CRONGENIUS-LEO-INFRA-MAKE-HEAL-VISION-001 (FR-3):
 *   Resolve the effective arch-key for a given vision-key + explicit-arch-key
 *   contract. Pure for unit testing. Returns { archKey, derived, error }.
 *
 *   - EHG vision-keys (VISION-EHG-*) without explicit --arch-key → default to ARCH-EHG-L1-001 (legacy).
 *   - Non-EHG vision-keys without explicit --arch-key → auto-derive (e.g.,
 *     VISION-CRONGENIUS-API-L2-001 → ARCH-CRONGENIUS-001). If derivation fails,
 *     return error so caller can fail loudly (no silent EHG fallback).
 *   - Explicit --arch-key always wins.
 */
/**
 * SD-LEO-INFRA-VENTURE-RUBRIC-SEMANTIC-001 (FR-1):
 *   Pure predicate; identifies EHG self-scoring vision-keys for the
 *   early-return path that preserves the deterministic rubric library.
 *   Accepts `VISION-EHG-...` and `VISION-EHG_...` (case-insensitive).
 */
export function isEhgVisionKey(visionKey) {
  return typeof visionKey === 'string' && /^VISION-EHG[-_]/i.test(visionKey);
}

/**
 * SD-LEO-INFRA-VENTURE-RUBRIC-SEMANTIC-001 (FR-1):
 *   Resolve which rubric Map to use for a given vision-key, with optional
 *   dependency injection for testing (cache/generator/loader can be replaced).
 *
 * @param {object} args
 * @param {string} args.visionKey
 * @param {string} args.planKey
 * @param {object} args.vision - eva_vision_documents row (must include extracted_dimensions; content_hash optional)
 * @param {object} args.arch - eva_architecture_plans row (must include extracted_dimensions; content_hash optional)
 * @param {object} args.supabase - service client (used by cache get/set)
 * @param {string} [args.targetPath]
 * @param {object} [args.deps] - injection hatch: { loadAllRubrics, computeCacheKey, getCachedRubrics, setCachedRubrics, generateVentureRubrics }
 * @returns {Promise<{ rubrics: Map<string, object>, source: string }>}
 */
export async function selectRubricMap({ visionKey, planKey, vision, arch, supabase, targetPath, deps = {} }) {
  const loaders = {
    loadAllRubrics: deps.loadAllRubrics ?? loadAllRubrics,
    computeCacheKey: deps.computeCacheKey ?? computeCacheKey,
    getCachedRubrics: deps.getCachedRubrics ?? getCachedRubrics,
    setCachedRubrics: deps.setCachedRubrics ?? setCachedRubrics,
    generateVentureRubrics: deps.generateVentureRubrics ?? generateVentureRubrics,
  };
  if (isEhgVisionKey(visionKey)) {
    const rubrics = await loaders.loadAllRubrics();
    return { rubrics, source: 'Loaded EHG deterministic rubrics (static library)' };
  }
  const cacheKey = loaders.computeCacheKey({
    vision_key: visionKey,
    plan_key: planKey,
    vision_content_hash: vision?.content_hash,
    plan_content_hash: arch?.content_hash,
  });
  const cached = await loaders.getCachedRubrics(supabase, cacheKey);
  if (cached) {
    return {
      rubrics: cached,
      source: `Loaded venture-aware rubrics from cache (cache_key=${cacheKey.slice(0, 12)}…)`,
    };
  }
  const { rubrics: generated, meta } = await loaders.generateVentureRubrics({
    vision, arch, targetPath, retries: 1,
  });
  await loaders.setCachedRubrics(
    supabase, cacheKey, generated,
    {
      vision_key: visionKey, plan_key: planKey,
      vision_content_hash: vision?.content_hash,
      plan_content_hash: arch?.content_hash,
    },
    { generator_model: meta.generator_model, generator_cost_usd: null }
  );
  return {
    rubrics: generated,
    source: `Generated ${generated.size} venture-aware rubrics (model=${meta.generator_model || 'unknown'}, persisted to eva_vision_rubric_cache)`,
  };
}

export function resolveArchKey({ visionKey, archKey, explicitArchKey }) {
  if (explicitArchKey && archKey) {
    return { archKey, derived: false, error: null };
  }
  const isEhgVision = typeof visionKey === 'string' && /^VISION-EHG[-_]/i.test(visionKey);
  if (isEhgVision) {
    return { archKey: DEFAULT_ARCH_KEY, derived: false, error: null };
  }
  // Non-EHG vision-key without explicit arch-key → derive.
  const derivedKey = deriveArchKeyFromVisionKey(visionKey);
  if (!derivedKey) {
    return {
      archKey: null,
      derived: false,
      error: `Non-EHG vision-key '${visionKey}' did not yield a derivable arch-key. Pass --arch-key explicitly.`,
    };
  }
  return { archKey: derivedKey, derived: true, error: null };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const supabase = getSupabase();

  // SD-CRONGENIUS-LEO-INFRA-MAKE-HEAL-VISION-001 (FR-3): resolve arch-key with non-EHG handling.
  const archResolution = resolveArchKey(args);
  if (archResolution.error) {
    console.error(`❌ ${archResolution.error}`);
    process.exit(1);
  }
  args.archKey = archResolution.archKey;
  if (archResolution.derived) {
    console.log(`   Derived arch-key '${args.archKey}' from vision-key '${args.visionKey}' (no --arch-key supplied)`);
  }

  // SD-CRONGENIUS-LEO-INFRA-MAKE-HEAL-VISION-001 (FR-3): validate --target-path if supplied.
  let resolvedTargetPath = null;
  if (args.targetPath) {
    const { resolve: pResolve } = await import('path');
    const { existsSync, statSync } = await import('fs');
    resolvedTargetPath = pResolve(args.targetPath);
    if (!existsSync(resolvedTargetPath)) {
      console.error(`❌ --target-path '${args.targetPath}' (resolved to '${resolvedTargetPath}') does not exist.`);
      process.exit(1);
    }
    if (!statSync(resolvedTargetPath).isDirectory()) {
      console.error(`❌ --target-path '${args.targetPath}' (resolved to '${resolvedTargetPath}') is not a directory.`);
      process.exit(1);
    }
    console.log(`   Target path: ${resolvedTargetPath} (venture-scoring mode)`);
  }

  // Git freshness check
  const gitMeta = getGitMeta();
  warnIfWorktree(gitMeta);
  const freshness = ensureFresh();
  if (freshness.pulled) {
    console.log('   Git state refreshed before evidence scoring.');
  }
  if (!freshness.fresh && !freshness.pulled) {
    console.warn('   STALE WARNING: Scores may not reflect latest merged work.');
  }
  console.log(`   Scoring codebase at: ${gitMeta.shortSha} (${gitMeta.branch})\n`);

  // 1. Load dimension metadata (vision + arch) FIRST — needed before rubric branch.
  //    SD-LEO-INFRA-VENTURE-RUBRIC-SEMANTIC-001 (FR-1): includes content + content_hash
  //    (GENERATED STORED via 20260527_eva_vision_rubric_cache_and_content_hash.sql) so the
  //    venture branch can compute a stable cache key without re-hashing content in JS.
  const { data: vision } = await supabase
    .from('eva_vision_documents')
    .select('id, extracted_dimensions, content, content_hash')
    .eq('vision_key', args.visionKey)
    .single();

  const { data: arch } = await supabase
    .from('eva_architecture_plans')
    .select('id, extracted_dimensions, content, content_hash')
    .eq('plan_key', args.archKey)
    .single();

  if (!vision?.extracted_dimensions) {
    console.error(`Vision document not found for key: ${args.visionKey}`);
    process.exit(1);
  }

  // SD-CRONGENIUS-LEO-INFRA-MAKE-HEAL-VISION-001 (FR-3): fail loudly if derived arch-key not found.
  if (archResolution.derived && !arch) {
    console.error(`❌ Derived arch-key '${args.archKey}' not found in eva_architecture_plans. Create the arch plan first via 'archplan-command.mjs upsert --plan-key ${args.archKey} --vision-key ${args.visionKey}' OR pass --arch-key explicitly. Refusing silent fallback to EHG architecture.`);
    process.exit(1);
  }

  // 2. Load rubrics — branch on vision-key.
  //    SD-LEO-INFRA-VENTURE-RUBRIC-SEMANTIC-001 (FR-1):
  //    - EHG vision-key (matches /^VISION-EHG[-_]/i): static deterministic rubrics (unchanged).
  //    - Non-EHG vision-key: LLM-generated venture-aware rubrics, content-hash cached.
  //    Refuses silent fallback to EHG rubrics when the venture branch fails (TR-6).
  const { rubrics, source: rubricSource } = await selectRubricMap({
    visionKey: args.visionKey,
    planKey: args.archKey,
    vision, arch, supabase,
    targetPath: resolvedTargetPath || process.cwd(),
  });
  console.log(`   ${rubricSource}: ${rubrics.size} rubrics`);

  // 3. Build dimension weight map from DB metadata
  const dbDimensions = [
    ...(vision.extracted_dimensions || []).map((d, i) => ({
      id: `V${String(i + 1).padStart(2, '0')}`,
      name: d.key || d.name,
      weight: d.weight || 0,
      source: 'vision',
    })),
    ...((arch?.extracted_dimensions || []).map((d, i) => ({
      id: `A${String(i + 1).padStart(2, '0')}`,
      name: d.key || d.name,
      weight: d.weight || 0,
      source: 'architecture',
    }))),
  ];

  const weightMap = new Map(dbDimensions.map(d => [d.id, d]));

  // 4. Run checks for each rubric
  const dimensionResults = [];
  for (const [dimId, rubric] of rubrics) {
    const dbDim = weightMap.get(dimId);
    if (!dbDim) {
      console.warn(`   Rubric ${dimId} has no matching DB dimension — skipping`);
      continue;
    }

    // FR-2: thread targetPath through context so rubrics evaluate the venture codebase when supplied.
    const checkResults = await runRubricChecks(rubric, { supabase, ...(resolvedTargetPath ? { targetPath: resolvedTargetPath } : {}) });
    const score = computeDimensionScore(checkResults);
    const reasoning = generateReasoning(checkResults);
    const gaps = generateGaps(checkResults);

    dimensionResults.push({
      id: dimId,
      name: dbDim.name,
      score,
      weight: dbDim.weight,
      source: dbDim.source,
      reasoning,
      gaps,
      checks: checkResults,
    });

    // Display progress
    const bar = '\u2588'.repeat(Math.round(score / 10)) + '\u2591'.repeat(10 - Math.round(score / 10));
    const status = score >= ACCEPT_THRESHOLD ? 'PASS' : score >= 70 ? 'WARN' : 'FAIL';
    const src = dimId.startsWith('V') ? 'V' : 'A';
    console.log(`   ${dimId} [${src}] ${bar} ${String(score).padStart(3)}/100 ${status} ${dbDim.name}`);

    if (args.verbose) {
      for (const c of checkResults) {
        const icon = c.passed ? '+' : '-';
        console.log(`      [${icon}] ${c.label}: ${c.evidence}`);
      }
    }
  }

  // 5. Compute total_score as weighted average
  const totalWeight = dimensionResults.reduce((s, d) => s + d.weight, 0);
  const totalScore = totalWeight > 0
    ? Math.round(dimensionResults.reduce((s, d) => s + d.score * d.weight, 0) / totalWeight)
    : 0;

  // 6. Build output JSON matching cmdPersist() format
  const output = {
    dimensions: dimensionResults.map(d => ({
      id: d.id,
      name: d.name,
      score: d.score,
      reasoning: d.reasoning,
      gaps: d.gaps,
    })),
    total_score: totalScore,
    summary: `Evidence-based scoring: ${dimensionResults.filter(d => d.score >= ACCEPT_THRESHOLD).length}/${dimensionResults.length} dimensions pass (>= ${ACCEPT_THRESHOLD}). Total: ${totalScore}/100.`,
  };

  // Threshold classification
  let thresholdAction = 'accept';
  if (totalScore < 70) thresholdAction = 'escalate';
  else if (totalScore < 83) thresholdAction = 'gap_closure_sd';
  else if (totalScore < 93) thresholdAction = 'minor_sd';

  console.log(`\n   Total Score: ${totalScore}/100 (${thresholdAction.toUpperCase()})`);
  console.log('   Scorer: evidence-scorer (deterministic)');

  const weak = dimensionResults.filter(d => d.score < ACCEPT_THRESHOLD).sort((a, b) => a.score - b.score);
  if (weak.length > 0) {
    console.log(`\n   ${weak.length} dimension(s) below threshold (${ACCEPT_THRESHOLD}):`);
    for (const d of weak) {
      console.log(`      ${d.id} ${d.name}: ${d.score}/100 (gap: ${ACCEPT_THRESHOLD - d.score}pts)`);
    }
  }

  // 7. Persist to DB if --persist
  if (args.persist) {
    const dimensionScores = {};
    for (const dim of dimensionResults) {
      dimensionScores[dim.id] = {
        name: dim.name,
        score: dim.score,
        weight: dim.weight,
        reasoning: dim.reasoning,
        gaps: dim.gaps,
        source: dim.source,
      };
    }

    const { data: inserted, error } = await supabase
      .from('eva_vision_scores')
      .insert({
        vision_id: vision.id,
        arch_plan_id: arch?.id || null,
        sd_id: null, // portfolio-level score
        total_score: totalScore,
        dimension_scores: dimensionScores,
        threshold_action: thresholdAction,
        rubric_snapshot: {
          vision_key: args.visionKey,
          arch_key: args.archKey,
          criteria_count: dimensionResults.length,
          summary: output.summary,
          scored_by: 'evidence-scorer',
          git_sha: gitMeta.sha,
          git_branch: gitMeta.branch,
          git_short_sha: gitMeta.shortSha,
          is_worktree: gitMeta.isWorktree,
          check_details: dimensionResults.map(d => ({
            id: d.id,
            checks: d.checks.map(c => ({ id: c.id, passed: c.passed, evidence: c.evidence })),
          })),
        },
      })
      .select('id')
      .single();

    if (error) {
      console.error(`\n   Failed to persist: ${error.message}`);
      process.exit(1);
    }

    console.log(`\n   Score persisted: ${totalScore}/100`);
    console.log(`   Score ID: ${inserted.id}`);
    console.log('   Scored by: evidence-scorer');

    // Machine-readable output for heal loop
    console.log(`\nHEAL_STATUS=${thresholdAction === 'accept' ? 'PASS' : 'NEEDS_CORRECTION'}`);
    console.log(`HEAL_SCORE_ID=${inserted.id}`);
    if (thresholdAction !== 'accept') {
      console.log(`HEAL_NEXT_CMD=node scripts/eva/vision-heal.js generate ${inserted.id}`);
    }
  } else {
    // Output JSON to stdout for piping
    console.log('\n===EVIDENCE_SCORE_JSON===');
    console.log(JSON.stringify(output, null, 2));
    console.log('===END_JSON===');
  }
}

// CLI entrypoint
const argv1 = process.argv[1];
const isMain = argv1 && (
  import.meta.url === `file://${argv1}` ||
  import.meta.url === `file:///${argv1.replace(/\\/g, '/')}`
);

if (isMain) {
  main().catch(err => {
    console.error(`Evidence scorer error: ${err.message}`);
    process.exit(1);
  });
}
