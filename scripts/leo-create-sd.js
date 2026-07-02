#!/usr/bin/env node

/**
 * LEO Create SD - Helper script for /leo create command
 *
 * Handles flag-based SD creation from various sources:
 * - --from-uat <test-id>: Create from UAT finding
 * - --from-learn <pattern-id>: Create from /learn pattern
 * - --from-feedback <id>: Create from /inbox feedback item
 * - --from-roadmap-item <id>: Promote a roadmap_wave_items row to an SD (register-first two-way stamp)
 * - --from-qf <QF-ID>: Escalate open quick-fix to SD (Tier 3 routing)
 * - --child <parent-key> <index>: Create child SD
 * - --vision-key <key>: Link to EVA vision document
 * - --arch-key <key>: Link to EVA architecture plan
 *
 * Part of SD-LEO-SDKEY-001: Centralize SD Creation Through /leo
 */

import { randomUUID, createHash } from 'crypto';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, basename, join as joinPath } from 'node:path';
import { createSupabaseServiceClient } from '../lib/supabase-client.js';
import {
  generateSDKey,
  generateChildKey,
  deriveChildIndex,
  keyExists,
  SD_SOURCES,
  SD_TYPES,
  normalizeVenturePrefix
} from './modules/sd-key-generator.js';
import { VentureContextManager } from '../lib/eva/venture-context-manager.js';
import { checkPremiseLiveness } from '../lib/eva/premise-liveness.js';
import { getCurrentVenture, getVentureConfig } from '../lib/venture-resolver.js';
import {
  checkGate,
  getArtifacts,
  getStatus as getPhase0Status
} from './modules/phase-0/leo-integration.js';
import { routeWorkItem } from '../lib/utils/work-item-router.js';
import { scanMetadataForMisplacedDependencies } from './modules/sd-next/dependency-resolver.js';
import {
  parsePlanFile,
  formatFilesAsScope,
  formatStepsAsCriteria
} from './modules/plan-parser.js';
import {
  findMostRecentPlan,
  archivePlanFile,
  readPlanFile,
  getDisplayPath
} from './modules/plan-archiver.js';
import { runTriageGate } from './modules/triage-gate.js';
import { evaluateVisionReadiness, formatRubricResult } from './modules/vision-readiness-rubric.js';
import { withRetry } from '../lib/eva/stage-zero/data-pollers/retry.js';
import { scoreSD } from './eva/vision-scorer.js';
import { trackWriteSource } from '../lib/eva/cli-write-gate.js';
// SD-LEO-INFRA-RECONCILE-VENTURE-BUILD-001 (FR-5) + SD-FDBK-INFRA-KEY-GENERATOR-LEAKS-001:
// shared no-venture classifier — guards the applications auto-register AND the venture-prefix
// resolver so engineering/governance work never inherits a spurious venture prefix.
import { isLegitimateNoVenture } from '../lib/eva/bridge/sd-router.js';
import { deriveSdFunctionalRequirements } from '../lib/sd/derive-functional-requirements.js';
import { validateSDFields } from './modules/validate-sd-fields.js';
import { isMainModule } from '../lib/utils/is-main-module.js';
// SD-LEO-INFRA-SOURCING-ENGINE-REGISTER-FIRST-001: pure register-first helpers (FR-1 roadmap-item
// derivation, FR-3 two-way stamp payload, FR-2 warn-only decision, FR-4 lane via the shipped router).
import {
  deriveSdFieldsFromRoadmapItem,
  buildTwoWayStamp,
  shouldWarnRegisterFirst,
  laneForRoadmapItem,
} from '../lib/sourcing-engine/register-first.js';
// SD-LEO-INFRA-SD-AUTHORING-TARGET-AUTODETECT-001: path-based target detector
import { detectFromKeyChanges } from './modules/handoff/executors/lead-to-plan/gates/target-application.js';
import { assertValidSdType } from '../lib/sd-type-enum.js';

const supabase = createSupabaseServiceClient();

// ============================================================================
// Cross-Repo Target Repos Parsing (SD-LEO-INFRA-LEO-CREATE-CROSS-001)
// ============================================================================

/**
 * Allowed platform repo names for the --target-repos flag.
 * Writer/consumer parity with computeReposForSD() in
 * scripts/modules/handoff/executors/lead-final-approval/gates.js (SD-LEO-INFRA-CROSS-REPO-MERGE-001).
 * Canonical casing: 'EHG' and 'EHG_Engineer'.
 */
export const ALLOWED_REPOS = new Set(['EHG', 'EHG_Engineer']);

/**
 * Parse the --target-repos comma-separated list, validate against ALLOWED_REPOS,
 * normalize case (ehg → EHG, ehg_engineer → EHG_Engineer), dedup, return array.
 *
 * @param {string|null|undefined} raw - Comma-separated repo list (e.g., "EHG,EHG_Engineer")
 * @returns {string[]|null} Normalized array; null if raw is empty/missing
 *
 * On invalid repo: console.error with `[INVALID_TARGET_REPOS]` bracket-tokenized
 * message and process.exit(1). Pure function otherwise (no side effects).
 */
export function parseTargetReposArg(raw) {
  if (raw == null || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed === '') return null;

  const parts = trimmed.split(',').map(s => s.trim()).filter(Boolean);
  if (parts.length === 0) return null;

  const normalized = [];
  const seen = new Set();
  for (const part of parts) {
    const lower = part.toLowerCase();
    let canonical = null;
    if (lower === 'ehg_engineer') canonical = 'EHG_Engineer';
    else if (lower === 'ehg') canonical = 'EHG';

    if (canonical === null || !ALLOWED_REPOS.has(canonical)) {
      console.error(`\n❌ [INVALID_TARGET_REPOS] Invalid --target-repos value: "${part}". Valid: ${[...ALLOWED_REPOS].join(', ')}.`);
      process.exit(1);
    }

    if (!seen.has(canonical)) {
      seen.add(canonical);
      normalized.push(canonical);
    }
  }

  return normalized;
}

/**
 * Build the create-orchestrator-from-plan.js exec command for the auto-route path,
 * forwarding --target-repos for cross-repo orchestrator SDs (QF-20260524-566 /
 * feedback 0ee3c3b8 Bug 2). Pure + exported for unit testing. `targetRepos` is the
 * normalized array from parseTargetReposArg (or null for single-repo SDs).
 */
export function buildOrchestratorCmd({ visionKey, archKey, title, targetRepos } = {}) {
  let cmd = `node scripts/create-orchestrator-from-plan.js --vision-key ${visionKey} --arch-key ${archKey} --title "${title}" --auto-children`;
  if (Array.isArray(targetRepos) && targetRepos.length > 0) {
    cmd += ` --target-repos ${targetRepos.join(',')}`;
  }
  return cmd;
}

// ============================================================================
// Venture Context Resolution (SD-LEO-INFRA-SD-NAMESPACING-001)
// ============================================================================

/**
 * Resolve venture prefix from CLI flag, env var, or active session.
 * Precedence: --venture CLI flag > VENTURE env var > session context
 *
 * @param {string|null} cliVenture - Venture name from --venture flag
 * @returns {Promise<string|null>} Normalized venture prefix or null
 */
// Quick-fix QF-20260312-516: Extract SD fields from registered vision/arch documents
// QF-20260509-171 (closes feedback 92ff36a1): return {enriched, missing} so the
// caller can fail-fast when a supplied --vision-key/--arch-key resolves to no
// row. Previously the function silently returned null on missing rows and the
// caller still wrote the unresolved key into sdData.metadata, producing an
// orphan FK-by-string (e.g. VISION-EVA-SUPPORT-CLI-L2-001 in
// SD-EVA-SUPPORT-CLI-SKILL-ORCH-001 metadata with no source row).
export async function enrichFromVisionArch(visionKey, archKey, sb) {
  const missing = { vision: false, arch: false };
  if (!visionKey && !archKey) return { enriched: null, missing };
  const result = {};
  try {
    if (visionKey) {
      const { data: vision } = await sb
        .from('eva_vision_documents')
        .select('sections')
        .eq('vision_key', visionKey)
        .maybeSingle();
      if (!vision) {
        missing.vision = true;
      } else if (vision.sections) {
        const s = vision.sections;
        // QF-20260527-904: skip description enrichment for program-level visions.
        // executive_summary > 2000 chars signals a mega-program vision (e.g.
        // VISION-LEO-WRITER-CONSUMER-ASYMMETRY-L2-001) whose multi-child plan
        // and 10-week scope text is wrong for any narrow follow-up SD that
        // references it. 3rd witness logged 2026-05-27.
        const PROGRAM_VISION_SUMMARY_CHARS = 2000;
        if (s.executive_summary) {
          if (s.executive_summary.length > PROGRAM_VISION_SUMMARY_CHARS) {
            console.warn(`[enrichFromVisionArch] Skipping description enrichment: vision ${visionKey} executive_summary is ${s.executive_summary.length} chars (>${PROGRAM_VISION_SUMMARY_CHARS} — program-level). Author SD-specific description manually at LEAD.`);
          } else {
            result.description = s.executive_summary;
          }
        }
        if (s.problem_statement) result.rationale = s.problem_statement;
        if (s.success_criteria) {
          result.success_criteria = (Array.isArray(s.success_criteria)
            ? s.success_criteria
            : s.success_criteria.split(/\n/).filter(l => l.trim())
          ).map(c => typeof c === 'string' ? { criterion: c.replace(/^[-•*]\s*/, ''), target: 'See vision doc' } : c);
        }
      }
    }
    if (archKey) {
      const { data: arch } = await sb
        .from('eva_architecture_plans')
        .select('sections')
        .eq('plan_key', archKey)
        .maybeSingle();
      if (!arch) {
        missing.arch = true;
      } else if (arch.sections) {
        const s = arch.sections;
        if (s.route_component_structure || s.route_and_component_structure) {
          const routes = s.route_component_structure || s.route_and_component_structure;
          result.key_changes = (Array.isArray(routes)
            ? routes
            : (typeof routes === 'string' ? routes.split(/\n/).filter(l => l.trim()) : [])
          ).map(c => typeof c === 'string' ? { file: '', change: c.replace(/^[-•*]\s*/, '') } : c);
        }
        if (s.implementation_phases) {
          result.scope = Array.isArray(s.implementation_phases)
            ? s.implementation_phases.map(p => p.title || p).join('; ')
            : String(s.implementation_phases);
        }
      }
    }
  } catch (err) {
    console.warn(`[enrichFromVisionArch] Non-fatal: ${err.message}`);
  }
  return {
    enriched: Object.keys(result).length > 0 ? result : null,
    missing
  };
}

/**
 * Non-throwing alias→canonical normalizer for the venture-suppression decision ONLY.
 * SD-FDBK-INFRA-KEY-GENERATOR-LEAKS-001: must NOT route through mapToDbType/assertValidSdType
 * (those throw on non-canonical input such as 'governance'); classifying for a cosmetic prefix
 * must never throw. Unknown input is returned lowercased so an unmapped type simply fails the
 * no-venture membership check (default 'stamp' behavior preserved).
 * @param {string|null} rawType
 * @returns {string} canonical-ish type for the membership check (never throws)
 */
function normalizeTypeForVentureCheck(rawType) {
  if (!rawType || typeof rawType !== 'string') return '';
  const t = rawType.trim().toLowerCase();
  const alias = {
    infra: 'infrastructure',
    doc: 'documentation',
    docs: 'documentation',
    qa: 'infrastructure',
    testing: 'infrastructure',
    gov: 'governance'
  };
  return alias[t] || t;
}

/**
 * Resolve the venture prefix for an SD key.
 *
 * SD-FDBK-INFRA-KEY-GENERATOR-LEAKS-001: sd_type-aware. Legitimate-no-venture types
 * (infrastructure/governance/leo/documentation/refactor + metadata.engineering_only) must NEVER
 * inherit an AMBIENT venture (the VENTURE env var OR the active session's active_venture_id).
 * Only an explicit per-invocation --venture flag stamps a prefix on such SDs. Genuine venture
 * types and unknown types are unaffected (env → session → null, exactly as before).
 *
 * @param {string|null} cliVenture - explicit --venture flag value (highest priority, ALL types)
 * @param {string|null} sdType - the SD type (raw alias accepted; normalized internally)
 * @param {object} [deps] - test seam: { getActiveVenture } overrides the live session lookup
 * @returns {Promise<string|null>} normalized venture prefix or null
 */
export async function resolveVenturePrefix(cliVenture = null, sdType = null, deps = {}) {
  // 1. CLI flag (highest priority — explicit intent wins for ALL types, including no-venture)
  if (cliVenture) {
    const prefix = normalizeVenturePrefix(cliVenture);
    if (prefix) {
      console.log(`   🏢 Venture context: ${cliVenture} (from --venture flag)`);
      return prefix;
    }
  }

  // SD-FDBK-INFRA-KEY-GENERATOR-LEAKS-001: suppress AMBIENT venture (env + session) for
  // legitimate-no-venture SD types. Classification uses a non-throwing normalize, then the
  // shared isLegitimateNoVenture helper (no metadata at resolve time → sd_type-only check).
  // Gating BOTH ambient sources is load-bearing: leaving step 2 (env) ungated leaks in CI/cron.
  const canonicalType = normalizeTypeForVentureCheck(sdType);
  if (isLegitimateNoVenture(canonicalType)) {
    console.log(`   🚫 [VENTURE-SUPPRESS] sd_type=${sdType ?? '(none)'} is no-venture — ambient venture prefix suppressed (use --venture to override)`);
    return null;
  }

  // 2. Environment variable (ambient)
  const envVenture = process.env.VENTURE;
  if (envVenture) {
    const prefix = normalizeVenturePrefix(envVenture);
    if (prefix) {
      console.log(`   🏢 Venture context: ${envVenture} (from VENTURE env var)`);
      return prefix;
    }
  }

  // 3. Active session context (ambient)
  try {
    const getActiveVenture = deps.getActiveVenture
      || (async () => {
        const vcm = new VentureContextManager({ supabaseClient: supabase });
        return vcm.getActiveVenture();
      });
    const venture = await getActiveVenture();
    if (venture) {
      const prefix = normalizeVenturePrefix(venture.name);
      if (prefix) {
        console.log(`   🏢 Venture context: ${venture.name} (from session)`);
        return prefix;
      }
    }
  } catch {
    // Non-fatal - proceed without venture prefix
  }

  return null;
}

// ============================================================================
// Source Handlers
// ============================================================================

/**
 * Create SD from UAT finding
 */
async function createFromUAT(testId) {
  console.log(`\n📋 Creating SD from UAT finding: ${testId}`);

  // Fetch UAT test result
  const { data: uatResult, error } = await supabase
    .from('uat_test_results')
    .select('*')
    .eq('id', testId)
    .single();

  if (error || !uatResult) {
    console.error('UAT result not found:', testId);
    process.exit(1);
  }

  // Determine type from UAT result
  const type = uatResult.status === 'failed' ? 'fix' : 'feature';

  // Triage Gate: soft recommendation for UAT-sourced items
  try {
    const triageResult = await runTriageGate({
      title: uatResult.test_name || uatResult.title || 'UAT Finding',
      description: uatResult.notes || uatResult.description || '',
      type,
      source: 'uat'
    }, supabase);
    if (triageResult.tier <= 2) {
      console.log(`   ℹ️  Triage suggests Quick Fix (Tier ${triageResult.tier}, ~${triageResult.estimatedLoc} LOC). Consider QF workflow for smaller scope.`);
    }
  } catch { /* non-fatal */ }

  // Resolve venture context (SD-LEO-INFRA-SD-NAMESPACING-001)
  const venturePrefix = await resolveVenturePrefix(null, type);

  // Generate key
  const sdKey = await generateSDKey({
    source: 'UAT',
    type,
    title: uatResult.test_name || uatResult.title || 'UAT Finding',
    venturePrefix
  });

  // Create SD
  const sd = await createSD({
    sdKey,
    title: uatResult.test_name || uatResult.title,
    description: uatResult.notes || uatResult.description || 'Created from UAT finding',
    type,
    rationale: `Created from UAT test result ${testId}`,
    metadata: {
      source: 'uat',
      source_id: testId,
      uat_status: uatResult.status
    }
  });

  return sd;
}

/**
 * Create SD from /learn pattern
 */
async function createFromLearn(patternId) {
  console.log(`\n📋 Creating SD from /learn pattern: ${patternId}`);

  // Fetch pattern from retrospectives or learning table
  const { data: pattern, error } = await supabase
    .from('retrospectives')
    .select('*')
    .eq('id', patternId)
    .single();

  if (error || !pattern) {
    console.error('Pattern not found:', patternId);
    process.exit(1);
  }

  // Determine type
  const type = pattern.lesson_type === 'bug' ? 'fix' : 'enhancement';

  // Resolve venture context (SD-LEO-INFRA-SD-NAMESPACING-001)
  const venturePrefix = await resolveVenturePrefix(null, type);

  // Generate key
  const sdKey = await generateSDKey({
    source: 'LEARN',
    type,
    title: pattern.key_lesson || pattern.title || 'Learning Pattern',
    venturePrefix
  });

  // Create SD
  const sd = await createSD({
    sdKey,
    title: pattern.key_lesson || pattern.title,
    description: pattern.actionable_improvements?.join('\n') || pattern.description || 'Created from learning pattern',
    type,
    rationale: `Created from retrospective pattern ${patternId}`,
    metadata: {
      source: 'learn',
      source_id: patternId,
      lesson_type: pattern.lesson_type
    }
  });

  return sd;
}

/**
 * Create SD from /inbox feedback item
 */
async function createFromFeedback(feedbackId, options = {}) {
  // QF-20260509-LEO-CREATE-FLAGS (closes 8a640d32 sibling-parity gap):
  // honor --migration-reviewed / --security-reviewed in --from-feedback path
  // (mirrors --from-plan / --child handling). Without this, the GR-MIGRATION-REVIEW
  // / GR-SECURITY-BASELINE guardrails block SD creation from feedback rows whose
  // description mentions migration or schema even with the flags set.
  const { migrationReviewed = false, securityReviewed = false } = options;
  console.log(`\n📋 Creating SD from feedback: ${feedbackId}`);

  // Fetch feedback item (support full or partial UUID)
  let feedback;
  // Try exact match first (full UUID)
  const { data: exactMatch } = await supabase
    .from('feedback')
    .select('*')
    .eq('id', feedbackId)
    .maybeSingle();

  if (exactMatch) {
    feedback = exactMatch;
  } else {
    // Partial UUID: validate format then use text cast via RPC
    if (!/^[0-9a-f-]+$/i.test(feedbackId)) {
      console.error('Invalid feedback ID format (must be UUID hex characters):', feedbackId);
      process.exit(1);
    }
    const { data: partialResult } = await supabase
      .rpc('exec_sql', { sql_text: `SELECT id FROM feedback WHERE id::text LIKE '${feedbackId}%' LIMIT 1` });
    const partialId = partialResult?.[0]?.result?.[0]?.id;
    if (partialId) {
      const { data } = await supabase.from('feedback').select('*').eq('id', partialId).single();
      feedback = data;
    }
  }

  if (!feedback) {
    console.error('Feedback not found:', feedbackId);
    process.exit(1);
  }

  // GAP-008: Check if feedback already has a linked SD (duplicate guard)
  if (feedback.strategic_directive_id || feedback.resolution_sd_id) {
    const linkedId = feedback.strategic_directive_id || feedback.resolution_sd_id;
    console.log(`\n⚠️  Feedback already linked to SD: ${linkedId}`);
    console.log('   Skipping SD creation to prevent duplicates.\n');
    process.exit(0);
  }

  // Map feedback type to SD type. --type flag (options.typeOverride) wins
  // when supplied (mirrors --from-plan / --child override semantics).
  const typeMap = { issue: 'fix', enhancement: 'enhancement', bug: 'bugfix' };
  const type = options.typeOverride || typeMap[feedback.type] || 'feature';
  // --title override (options.titleOverride) wins over feedback.title for the SD.
  const sdTitle = options.titleOverride || feedback.title;

  // Triage Gate: soft recommendation for feedback-sourced items
  try {
    const triageResult = await runTriageGate({
      title: sdTitle,
      description: feedback.description || sdTitle,
      type,
      source: 'feedback'
    }, supabase);
    if (triageResult.tier <= 2) {
      console.log(`   ℹ️  Triage suggests Quick Fix (Tier ${triageResult.tier}, ~${triageResult.estimatedLoc} LOC). Consider QF workflow for smaller scope.`);
    }
  } catch { /* non-fatal */ }

  // Resolve venture context (SD-LEO-INFRA-SD-NAMESPACING-001)
  const venturePrefix = await resolveVenturePrefix(null, type);

  // Generate key
  const sdKey = await generateSDKey({
    source: 'FEEDBACK',
    type,
    title: sdTitle,
    venturePrefix
  });

  // Create SD
  const sd = await createSD({
    sdKey,
    title: sdTitle,
    description: feedback.description || sdTitle,
    type,
    priority: mapPriority(feedback.priority),
    rationale: `Created from feedback item. Source: ${feedback.source_type || 'manual'}`,
    metadata: {
      source: 'feedback',
      source_id: feedback.id,
      feedback_type: feedback.type,
      feedback_priority: feedback.priority,
      // QF-20260509-LEO-CREATE-FLAGS: propagate guardrail review flags
      ...(migrationReviewed ? { migration_reviewed: true } : {}),
      ...(securityReviewed ? { security_reviewed: true } : {})
    }
  });

  // GAP-001: Set strategic_directive_id FK on feedback (not just metadata)
  // GAP-009: Update feedback status to in_progress with proper linkage
  await supabase
    .from('feedback')
    .update({
      status: 'in_progress',
      strategic_directive_id: sd.id
    })
    .eq('id', feedback.id);

  return sd;
}

// SD-LEO-INFRA-SOURCING-ENGINE-REGISTER-FIRST-001 (FR-4): persist the routed lane, FAIL-SOFT against
// the DORMANT lane column. The PostgREST client reports an unknown/unapplied column as PGRST204
// ("Could not find the 'lane' column ... in the schema cache") — NOT the raw Postgres 42703 — so detect
// both, plus a "lane … column … exist" message fallback. Skip silently until the migration is applied.
async function persistLaneFailSoft(sb, item, lane) {
  if (!lane) return;
  const tryUpdate = async (table, match) => {
    const { error } = await sb.from(table).update({ lane }).match(match);
    if (error) {
      const msg = error.message || '';
      const absent = error.code === 'PGRST204' || error.code === '42703'
        || (/lane/i.test(msg) && /(column|exist)/i.test(msg));
      if (absent) { console.log(`   ℹ️  lane column not yet applied (dormant) — lane='${lane}' not persisted to ${table}`); return; }
      throw error;
    }
  };
  await tryUpdate('roadmap_wave_items', { id: item.id });
  if (item.source_type === 'conversion_ledger' && item.source_id) {
    await tryUpdate('conversion_ledger', { id: item.source_id });
  }
}

/**
 * Create an SD from a roadmap_wave_items row (FR-1, --from-roadmap-item). Promotes the item: creates
 * the SD, then atomically two-way stamps the linkage (FR-3) and persists the routed lane fail-soft
 * (FR-4). FR-5 hard guard: an already-promoted item never double-promotes. Mirrors the createFromFeedback
 * contract (--type / --title overrides, guardrail review flags).
 */
/**
 * SD-LEO-INFRA-PRODUCT-PROMOTION-TARGET-REPO-001: compute the repo-routing overrides for a
 * promoted roadmap SD from a (already-validated, normalized) --target-repos list. Pure + exported.
 * The first repo is the primary target_application (drives EXEC/gate/branch repo resolution); the
 * full list is stamped to metadata.target_repos. Empty/missing → {} (createSD keeps its default).
 * @param {string[]|null|undefined} targetRepos
 * @returns {{ target_application?: string, target_repos?: string[] }}
 */
export function buildPromotionRepoOverrides(targetRepos) {
  if (!Array.isArray(targetRepos) || targetRepos.length === 0) return {};
  return { target_application: targetRepos[0], target_repos: targetRepos };
}

async function createFromRoadmapItem(itemId, options = {}) {
  const { migrationReviewed = false, securityReviewed = false } = options;
  console.log(`\n🗺️  Creating SD from roadmap item: ${itemId}`);

  let item;
  const { data: exact } = await supabase
    .from('roadmap_wave_items').select('*').eq('id', itemId).maybeSingle();
  if (exact) {
    item = exact;
  } else {
    if (!/^[0-9a-f-]+$/i.test(itemId)) {
      console.error('Invalid roadmap item id (must be UUID hex characters):', itemId);
      process.exit(1);
    }
    const { data: partial } = await supabase
      .rpc('exec_sql', { sql_text: `SELECT id FROM roadmap_wave_items WHERE id::text LIKE '${itemId}%' LIMIT 1` });
    const pid = partial?.[0]?.result?.[0]?.id;
    if (pid) {
      const { data } = await supabase.from('roadmap_wave_items').select('*').eq('id', pid).single();
      item = data;
    }
  }
  if (!item) {
    console.error('Roadmap item not found:', itemId);
    process.exit(1);
  }

  // FR-5 hard guard: an already-promoted item never double-promotes.
  if (item.promoted_to_sd_key) {
    console.log(`\n⚠️  Roadmap item already promoted to SD: ${item.promoted_to_sd_key}`);
    console.log('   Skipping to prevent a double-SD.\n');
    process.exit(0);
  }

  const fields = deriveSdFieldsFromRoadmapItem(item);
  const type = options.typeOverride || fields.type;
  const sdTitle = options.titleOverride || fields.title;
  const sdKey = await generateSDKey({ source: SD_SOURCES.LEO, type, title: sdTitle, venturePrefix: null });

  // SD-LEO-INFRA-PRODUCT-PROMOTION-TARGET-REPO-001: route the promoted SD to a product repo when
  // --target-repos is given (the PRIMARY repo → top-level target_application that branch-resolver/
  // repo-paths read to resolve EXEC/gates/branch onto rickfelix/ehg; the full list → metadata.target_repos).
  const repoOverrides = buildPromotionRepoOverrides(options.targetRepos);

  const sd = await createSD({
    sdKey,
    title: sdTitle,
    // SD-LEO-INFRA-PROMOTION-THIN-STUB-FIX-001: use the deriver's DISTINCT description/scope/intent
    // instead of cloning item.title into description (which produced title===description===scope stubs
    // the bare-shell detector flagged). A title-only item is now flagged via metadata.needs_enrichment.
    description: fields.description || item.title || sdTitle,
    scope: fields.scope,
    strategic_intent: fields.strategic_intent,
    type,
    priority: 'medium',
    rationale: `Promoted from roadmap_wave_items ${item.id} (register-first path).`,
    ...(repoOverrides.target_application ? { target_application: repoOverrides.target_application } : {}),
    metadata: {
      ...fields.metadata,
      ...(migrationReviewed ? { migration_reviewed: true } : {}),
      ...(securityReviewed ? { security_reviewed: true } : {}),
      ...(repoOverrides.target_repos ? { target_repos: repoOverrides.target_repos } : {}),
    },
  });

  // FR-3: atomic two-way stamp (written together so the linkage cannot drift). Fail-soft.
  try {
    const stamp = buildTwoWayStamp(item, sd.sd_key, null);
    await supabase.from('roadmap_wave_items').update(stamp.roadmap).eq('id', item.id);
    if (stamp.ledger) {
      await supabase.from('conversion_ledger').update(stamp.ledger).eq('id', item.source_id);
    }
    console.log(`   🔗 Two-way stamp: roadmap_wave_items.promoted_to_sd_key=${sd.sd_key}${stamp.ledger ? ' + conversion_ledger.linked_sd_key' : ''}`);
  } catch (e) {
    console.warn(`   ⚠️  Two-way stamp skipped (non-blocking): ${e.message}`);
  }

  // FR-4: route the lane via the shipped router, persist fail-soft (lane column ships DORMANT).
  try {
    const routed = laneForRoadmapItem(item);
    await persistLaneFailSoft(supabase, item, routed.lane);
  } catch (e) {
    console.warn(`   ⚠️  Lane persist skipped (non-blocking): ${e.message}`);
  }

  return sd;
}

/**
 * Create SD from open quick-fix (QF-* row).
 * Used when sd:next escalates a QF to Tier 3 (risk-keyword or LOC threshold).
 * Mirrors createFromFeedback contract; updates the source quick_fixes row with
 * status='escalated' + escalated_to_sd_id so the queue stops recommending it.
 */
async function createFromQF(qfId, opts = {}) {
  console.log(`\n📋 Creating SD from quick-fix: ${qfId}`);

  if (!qfId) {
    console.error('❌ Missing QF-ID. Usage: node scripts/leo-create-sd.js --from-qf <QF-ID>');
    process.exit(1);
  }

  const { data: qf, error } = await supabase
    .from('quick_fixes')
    .select('*')
    .eq('id', qfId)
    .maybeSingle();

  if (error || !qf) {
    console.error('Quick-fix not found:', qfId, error?.message || '');
    process.exit(1);
  }

  // Duplicate guard: already escalated or already shipped
  if (qf.escalated_to_sd_id) {
    console.log(`\n⚠️  Quick-fix already escalated to SD: ${qf.escalated_to_sd_id}\n`);
    process.exit(0);
  }
  if (qf.status === 'completed') {
    console.log(`\n⚠️  Quick-fix is already completed (status=${qf.status}). Refusing to escalate.\n`);
    process.exit(0);
  }

  // Map QF type → SD type. Unknown QF types fall through to 'fix'.
  const typeMap = { bug: 'fix', polish: 'enhancement', documentation: 'documentation', enhancement: 'enhancement' };
  const type = typeMap[qf.type] || 'fix';

  // Map QF severity → SD priority (1:1 enum overlap).
  const priority = ['critical', 'high', 'medium', 'low'].includes(qf.severity) ? qf.severity : 'medium';

  const venturePrefix = await resolveVenturePrefix(null, type);
  const sdKey = await generateSDKey({ source: 'LEO', type, title: qf.title, venturePrefix });

  const sd = await createSD({
    sdKey,
    title: qf.title,
    description: qf.description || qf.title,
    type,
    priority,
    rationale: `Escalated from quick-fix ${qf.id} (Tier 3 routing). Original LOC estimate: ${qf.estimated_loc ?? 'n/a'}.`,
    metadata: {
      source: 'quick_fix',
      source_qf_id: qf.id,
      escalated_from_qf: qf.id,
      qf_type: qf.type,
      qf_severity: qf.severity,
      qf_estimated_loc: qf.estimated_loc,
      qf_target_application: qf.target_application,
      ...(opts.securityReviewed ? { security_reviewed: true } : {})
    }
  });

  // Retire the QF so it stops being independently claimable now that the SD is the
  // canonical track. supabase-js does not throw on a write error, so the wrapped fn
  // must throw explicitly for withRetry's catch to see it. A transient failure here
  // (after the SD already exists) would otherwise leave the QF silently claimable
  // alongside an unlinked SD — fail loud with recovery instructions instead.
  try {
    await withRetry(async () => {
      const { error: updErr } = await supabase
        .from('quick_fixes')
        .update({
          status: 'escalated',
          escalated_to_sd_id: sd.id,
          escalation_reason: `Escalated to ${sdKey} via leo-create-sd.js --from-qf`,
          claiming_session_id: null
        })
        .eq('id', qf.id);
      if (updErr) throw new Error(updErr.message);
    }, { maxRetries: 2, baseDelayMs: 250, timeoutMs: 5000, label: `retire QF ${qf.id}` });

    console.log(`   ✓ Quick-fix ${qf.id} → status='escalated', escalated_to_sd_id=${sd.id}`);
  } catch (updErr) {
    throw new Error(
      `SD ${sdKey} (${sd.id}) was created, but retiring quick-fix ${qf.id} failed after 3 attempts: ${updErr.message}\n` +
      'The QF is still claimable and NOT linked back to the SD. Manual recovery — run:\n' +
      `  UPDATE quick_fixes SET status='escalated', escalated_to_sd_id='${sd.id}', escalation_reason='Escalated to ${sdKey} via leo-create-sd.js --from-qf (manual recovery)', claiming_session_id=NULL WHERE id='${qf.id}';`
    );
  }

  return sd;
}

/**
 * Create child SD
 * @param {string} parentKey - Parent SD key or UUID
 * @param {number} index - Child index (A=0, B=1, etc.)
 * @param {Object} overrides - Optional overrides for child fields
 * @param {string} overrides.type - Child SD type (default: 'feature', never inherits 'orchestrator')
 * @param {string} overrides.title - Child title override
 */
async function createChild(parentKey, index = null, overrides = {}) {
  console.log(`\n📋 Creating child SD for: ${parentKey}`);

  // Fetch parent SD
  const { data: parent, error } = await supabase
    .from('strategic_directives_v2')
    .select('*')
    .or(`sd_key.eq.${parentKey},id.eq.${parentKey}`)
    .single();

  if (error || !parent) {
    console.error('Parent SD not found:', parentKey);
    process.exit(1);
  }

  // QF-20260610-473: derive index from MAX existing suffix (not count — count
  // collides forever on non-contiguous children: {-B} -> count=1 -> proposes -B),
  // honor an explicit index of 0 (nullish check, not ||), and self-heal residual
  // collisions by bumping to the next free letter. Policy: derived default is
  // max(taken)+1, so {-B} -> -C and {-A,-C} -> -D.
  const { data: existingChildren } = await supabase
    .from('strategic_directives_v2')
    .select('sd_key')
    .eq('parent_sd_id', parent.id);

  const parentSdKey = parent.sd_key || parentKey;
  const derivation = deriveChildIndex(
    parentSdKey,
    (existingChildren || []).map((c) => c.sd_key),
    Number.isInteger(index) ? index : null
  );
  const childIndex = derivation.index;
  if (derivation.bumped) {
    console.log(`   ℹ️  Suffix collision — bumped to next free index ${childIndex} (taken: ${derivation.takenIndexes.join(',')})`);
  }

  // Generate child key
  const sdKey = generateChildKey(parentSdKey, childIndex);

  // Inherit strategic fields from parent (SD-LEO-FIX-METADATA-001)
  const inheritedFields = inheritStrategicFields(parent);

  // Resolve child type: explicit override > parent type (but NEVER inherit 'orchestrator')
  // Orchestrator is a coordination pattern, not a child work type.
  // Children are independent SDs with their own types (feature, infrastructure, etc.)
  let childType = overrides.type || parent.sd_type || 'feature';
  if (childType === 'orchestrator') {
    childType = 'feature';
    console.log('   ℹ️  Parent type \'orchestrator\' not inherited — child defaults to \'feature\'');
    console.log('      Use --type <type> to specify: infrastructure, feature, fix, etc.');
  }

  // Create child SD with inherited fields
  const childTitle = overrides.title || `Child of ${parent.title}`;
  const sd = await createSD({
    sdKey,
    title: childTitle,
    description: overrides.title
      ? `Child SD of ${parent.sd_key}: ${overrides.title}`
      : `Child SD of ${parent.sd_key}. Implement specific deliverable.`,
    type: childType,
    priority: parent.priority || 'medium',
    rationale: `Child of ${parent.sd_key}`,
    parentId: parent.id,
    // Pass inherited category to maintain alignment (RCA from SD-LEO-ENH-AUTO-PROCEED-001-12)
    category: inheritedFields.category || null,
    // Pass inherited fields to createSD (SD-LEO-FIX-METADATA-001)
    success_metrics: inheritedFields.success_metrics || null,
    strategic_objectives: inheritedFields.strategic_objectives || null,
    key_principles: inheritedFields.key_principles || null,
    metadata: {
      source: 'leo',
      parent_sd_key: parent.sd_key,
      child_index: childIndex,
      inherited_from_parent: Object.keys(inheritedFields),
      ...(overrides.migrationReviewed ? { migration_reviewed: true } : {}),
      ...(overrides.securityReviewed ? { security_reviewed: true } : {}),
      ...(overrides.visionKey ? { vision_key: overrides.visionKey } : {}),
      ...(overrides.archKey ? { arch_key: overrides.archKey } : {}),
      ...(overrides.targetRepos ? { target_repos: overrides.targetRepos } : {}),
    }
  });

  // SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-101: Inherit parent worktree_path
  // Children share the parent's worktree — prevents wrong_worktree gate failures
  if (parent.worktree_path) {
    await supabase
      .from('strategic_directives_v2')
      .update({ worktree_path: parent.worktree_path })
      .eq('sd_key', sdKey);
  }

  // SD-LEO-PROTOCOL-INFRASTRUCTURE-RELATIONSHIPAWARE-ORCH-001-A (US-001):
  // Persist scope_slice when provided via --scope-slice flag.
  // Note: separate UPDATE to avoid changing createSD signature; schema added 2026-04-23.
  // Persistence failure is FATAL — silent fallback would invert the safety direction
  // (caller requested strictness; undo on failure to avoid surprise soft-pass behavior).
  // Review finding (PR #3232 adversarial review).
  if (overrides.scopeSlice) {
    const { error: sliceErr } = await supabase
      .from('strategic_directives_v2')
      .update({ scope_slice: overrides.scopeSlice })
      .eq('sd_key', sdKey);
    if (sliceErr) {
      console.error(`[createChild] ❌ Failed to persist scope_slice: ${sliceErr.message}`);
      // Roll back the child SD row so the caller can retry from a clean state.
      await supabase.from('strategic_directives_v2').delete().eq('sd_key', sdKey);
      throw new Error(`scope_slice persistence failed for ${sdKey}: ${sliceErr.message}. Child SD row rolled back.`);
    }
    console.log(`   scope_slice set: ${JSON.stringify(overrides.scopeSlice)}`);
  }

  // SD-LEO-INFRA-CLAIM-DEFAULT-LEO-001: Assert parent claim before returning child
  // Verifies the creating session holds the parent SD claim
  try {
    const { claimGuard } = await import('../lib/claim-guard.mjs');
    const claimResult = await claimGuard(parent.sd_key, null, { autoFallback: true });
    if (!claimResult.success && !claimResult.fallback) {
      console.error(`[createChild] ⛔ Parent SD ${parent.sd_key} is claimed by another session — child creation blocked`);
      console.error(`   Owner: ${claimResult.owner?.session_id} (${claimResult.owner?.heartbeat_age_human})`);
      throw new Error(`Parent SD ${parent.sd_key} is claimed by another active session`);
    }
  } catch (e) {
    if (e.message?.includes('claimed by another')) throw e;
    // Fail-open: DB errors don't block child creation
    console.warn(`[createChild] ⚠️  Parent claim check failed (fail-open): ${e.message}`);
  }

  // SD-LEO-INFRA-ADAM-CREATION-PROCESS-001 (FR-3): one-step child linkage. createSD set
  // parent_sd_id, but NOT relationship_type='child' (children then failed
  // validate-child-sd-completeness) and NOT the parent-registry registration (previously
  // manual DB surgery during sourcing). linkChild does both idempotently in one call.
  try {
    const { linkChild } = await import('../lib/sd/child-linkage.js');
    const linkRes = await linkChild(supabase, parent, sdKey, {
      role: overrides.role ?? overrides.title ?? null,
      childUuid: sd?.uuid_id ?? null,
      registeredBy: 'leo-create-sd',
      today: new Date().toISOString().slice(0, 10),
      registryOptional: true,
    });
    console.log(
      '   🔗 Child linkage: relationship_type=\'child\'' +
      (linkRes.registered
        ? `; registered in parent ${parent.sd_key} (${linkRes.registryKind})`
        : (linkRes.alreadyRegistered ? '; already registered in parent' : ''))
    );
  } catch (e) {
    console.warn(`[createChild] ⚠️  Child-linkage step failed (non-fatal): ${e.message}`);
  }

  return sd;
}

/**
 * Compute a deterministic SHA256 hash of plan content for duplicate detection.
 * Normalizes line endings (CRLF→LF) and trims trailing whitespace per line so
 * that benign editor save-formatting changes don't bypass the guard.
 *
 * @param {string} content
 * @returns {string} 64-char hex digest
 */
export function computePlanContentHash(content) {
  if (!content) return createHash('sha256').update('').digest('hex');
  const normalized = String(content).replace(/\r\n/g, '\n').split('\n').map(l => l.replace(/\s+$/, '')).join('\n').trimEnd();
  return createHash('sha256').update(normalized).digest('hex');
}

/**
 * Look up a non-cancelled SD created within the last 24h whose metadata
 * carries the same plan_content_hash. Used to refuse duplicate INSERTs from
 * back-to-back --from-plan runs.
 *
 * @param {string} hash - SHA256 hex digest from computePlanContentHash()
 * @returns {Promise<{sd_key:string,title:string,status:string,id:string}|null>}
 */
export async function findRecentSDByPlanHash(hash) {
  if (!hash) return null;
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, title, status, created_at')
    .eq('metadata->>plan_content_hash', hash)
    .gte('created_at', cutoff)
    .not('status', 'in', '(cancelled,archived)')
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) {
    console.warn(`   ⚠️  duplicate-guard query failed: ${error.message} — proceeding without guard`);
    return null;
  }
  return (data && data.length > 0) ? data[0] : null;
}

/**
 * Create SD from Claude Code plan file
 *
 * When called without a path, auto-detects the most recent plan and shows
 * confirmation prompt. For automated/non-interactive use, pass explicit path.
 *
 * @param {string|null} planPath - Optional explicit path to plan file
 * @param {boolean} skipConfirmation - Skip confirmation for auto-detected plans (CLI flag: --yes)
 */
async function createFromPlan(planPath = null, skipConfirmation = false, overrides = {}) {
  console.log('\n📋 Creating SD from Claude Code plan file');

  // Step 1: Find plan file (auto-detect if no path provided)
  let targetPath = planPath;
  let originalPath = planPath;
  let wasAutoDetected = false;

  if (!targetPath) {
    console.log('   Auto-detecting most recent plan...');
    const recentPlan = await findMostRecentPlan();

    if (!recentPlan) {
      console.error('\n❌ No plan file found');
      console.error('   Expected location: ~/.claude/plans/');
      console.error('   Make sure you have an active plan in Claude Code plan mode.');
      process.exit(1);
    }

    targetPath = recentPlan.path;
    originalPath = recentPlan.path;
    wasAutoDetected = true;

    // Show what was found
    console.log(`\n   📄 Found plan: ${recentPlan.name}`);
    console.log(`   📍 Path: ${getDisplayPath(targetPath)}`);
    console.log(`   🕐 Modified: ${recentPlan.mtime.toLocaleString()}`);
  }

  // Step 2: Read and parse plan file
  const content = readPlanFile(targetPath);
  if (!content) {
    console.error(`\n❌ Failed to read plan file: ${targetPath}`);
    process.exit(1);
  }

  const parsed = parsePlanFile(content);

  // Apply overrides from --type, --title, --priority flags. Explicit plan-file ## Type header
  // (parsed.type) already won over inferSDType in parsePlanFile; --type overrides that further.
  const priorityFromPlan = parsed.priority;
  if (overrides.typeOverride) {
    console.log(`   Type override: ${overrides.typeOverride} (was: ${parsed.type})`);
    parsed.type = overrides.typeOverride;
  }
  if (overrides.titleOverride) {
    console.log(`   Title override: ${overrides.titleOverride} (was: ${parsed.title})`);
    parsed.title = overrides.titleOverride;
  }
  if (overrides.priorityOverride) {
    console.log(`   Priority override: ${overrides.priorityOverride} (was: ${parsed.priority ?? 'default/medium'})`);
    parsed.priority = overrides.priorityOverride;
  }

  // Determine priority source label for display. priorityFromPlan is the raw plan-file value
  // (before any --priority override). parsed.priority is the final value that will be passed to createSD.
  const prioritySource = overrides.priorityOverride ? 'override' : (priorityFromPlan ? 'from plan' : 'default');
  const priorityDisplay = parsed.priority ?? 'medium';

  // Show parsed summary
  console.log('\n   ═══════════════════════════════════════════');
  console.log('   PLAN SUMMARY');
  console.log('   ═══════════════════════════════════════════');
  console.log(`   Title: ${parsed.title || '(untitled)'}`);
  // Type source is independent — re-derive to avoid coupling with priority detection.
  const typeLabel = overrides.typeOverride ? ' (override)' : (parsed.type && priorityFromPlan !== undefined ? ' (from plan or inferred)' : ' (inferred)');
  console.log(`   Type${typeLabel}: ${parsed.type}`);
  console.log(`   Priority (${prioritySource}): ${priorityDisplay}`);
  console.log(`   Goal: ${parsed.summary ? parsed.summary.substring(0, 80) + '...' : '(none found)'}`);
  console.log(`   Checklist items: ${parsed.steps.length}`);
  console.log(`   Files to modify: ${parsed.files.length}`);
  console.log(`   Key changes: ${parsed.keyChanges?.length || 0}`);
  console.log(`   Risks identified: ${parsed.risks?.length || 0}`);
  console.log('   ═══════════════════════════════════════════');

  // Step 3: Confirmation for auto-detected plans
  // NOTE: In CLI context, we output a message. Claude (the AI) should use
  // AskUserQuestion to confirm before running --from-plan without explicit path.
  if (wasAutoDetected && !skipConfirmation) {
    console.log('\n   ⚠️  AUTO-DETECTED PLAN');
    console.log('   This script found the most recent plan file automatically.');
    console.log('   If this is NOT the correct plan, re-run with explicit path:');
    console.log('   node scripts/leo-create-sd.js --from-plan <path-to-plan.md>');
    console.log('\n   To proceed without confirmation, add --yes flag:');
    console.log('   node scripts/leo-create-sd.js --from-plan --yes');
    console.log('\n   Proceeding with auto-detected plan...\n');
  }

  // Step 4: Validate we have enough content
  if (!parsed.title) {
    console.error('\n❌ Plan file must have a title (# Plan: Title or # Title)');
    console.error('   The parser looks for:');
    console.error('   - "# Plan: Your Title Here"');
    console.error('   - "# Your Title Here" (first H1 heading)');
    process.exit(1);
  }

  // Step 5: Generate SD key
  // Protocol files (CLAUDE_CORE.md, CLAUDE_LEAD.md) must be read before SD creation
  // Resolve venture context (SD-LEO-INFRA-SD-NAMESPACING-001)
  const venturePrefix = await resolveVenturePrefix(null, parsed.type);

  const sdKey = await generateSDKey({
    source: 'LEO',
    type: parsed.type,
    title: parsed.title,
    venturePrefix
  });

  console.log(`   Generated SD Key: ${sdKey}`);

  // Step 6: Archive plan file
  const archiveResult = await archivePlanFile(targetPath, sdKey);
  if (!archiveResult.success) {
    console.warn(`   ⚠️  Could not archive plan: ${archiveResult.error}`);
  } else {
    console.log(`   Archived to: ${getDisplayPath(archiveResult.archivedPath)}`);
  }

  // Step 7: Build scope from files
  const scope = formatFilesAsScope(parsed.files) || parsed.summary || parsed.title;

  // Step 8: Build success criteria — prefer ## Acceptance/## Success bullets (FR-1) over step-derived
  // SD-LEO-INFRA-AUTO-GENERATED-PRD-001: track which plan sections were absent so FR-3
  // ENRICHMENT_WARNING can name the fields that will be default-filled downstream.
  const planFieldsAbsent = [];
  let successCriteria;
  if (parsed.successCriteria && parsed.successCriteria.length > 0) {
    successCriteria = parsed.successCriteria.map(c => typeof c === 'string' ? c : c.criterion);
  } else {
    if (parsed.successCriteria === null) planFieldsAbsent.push('success_criteria');
    successCriteria = formatStepsAsCriteria(parsed.steps, 10);
    if (successCriteria.length === 0) {
      // Use default if no steps found
      successCriteria.push('All implementation items from plan are complete');
      successCriteria.push('Code passes lint and type checks');
      successCriteria.push('PR reviewed and approved');
    }
  }

  // Step 9: Build key_changes from parsed data (null = plan silent, [] = present-but-empty)
  if (parsed.keyChanges === null) planFieldsAbsent.push('key_changes');
  const keyChanges = (parsed.keyChanges ?? []).map(kc => ({
    change: kc.change,
    impact: kc.impact
  }));

  // Step 10: Build strategic_objectives from parsed data
  if (parsed.strategicObjectives === null) planFieldsAbsent.push('strategic_objectives');
  const strategicObjectives = (parsed.strategicObjectives ?? []).map(obj => ({
    objective: obj.objective,
    metric: obj.metric
  }));

  // Step 11: Build risks from parsed data
  if (parsed.risks === null) planFieldsAbsent.push('risks');
  const risks = (parsed.risks ?? []).map(r => ({
    risk: r.risk,
    severity: r.severity || 'medium',
    mitigation: r.mitigation || 'Address during implementation'
  }));

  // SD-FDBK-INFRA-LEO-CREATE-PLAN-001 (FR-2): build the four newly-extractable fields
  // from parsed.* and pass them through createOptions. Each is null when the plan omitted
  // the section, so createSD's fallthrough applies buildDefault*/inline-default (and warns,
  // FR-4) — preserving current behavior for plans that lack these sections.
  // success_metrics + smoke_test_steps are gate-relevant (SUCCESS_METRICS_PLACEHOLDER_VALUE /
  // SMOKE_TEST_SPECIFICATION); key_principles + scope are non-gating enrichment.
  const successMetrics = (parsed.successMetrics ?? []);
  const smokeTestSteps = (parsed.smokeTestSteps ?? []);
  const keyPrinciples = (parsed.keyPrinciples ?? []);
  const planScope = parsed.planScope || null;

  // QF-20260509-LEO-CREATE-PLAN-DUP-GUARD (closes feedback 082b421c).
  // Compute SHA256 of the (whitespace-normalized) plan content. We use the
  // hash for both (i) provenance metadata and (ii) the duplicate-detection
  // query a few lines down — same plan run twice within 24h ⇒ refuse, unless
  // --force-create overrides. Catches the LEO-FEAT-* / LEO-FIX-* duplicate
  // pair that landed when the auto-classifier picked different sd_types on
  // back-to-back runs of the same plan file.
  const planContentHash = computePlanContentHash(parsed.fullContent);

  // Step 12: Create SD with all extracted fields.
  // Pass priority through so plan authored `## Priority` and --priority CLI overrides reach the DB.
  // When parsed.priority is null (no header, no override), omit the field so createSD's default ('medium') applies.
  const createOptions = {
    sdKey,
    title: parsed.title,
    description: parsed.summary || parsed.title,
    type: parsed.type,
    rationale: 'Created from Claude Code plan file',
    success_criteria: successCriteria,
    strategic_objectives: strategicObjectives.length > 0 ? strategicObjectives : null,
    // SD-LEO-INFRA-BUILDDEFAULTSMOKETESTSTEPS-KEYWORD-DETECTOR-001 (FR-3): pass scope and key_changes through createOptions
    // so createSD INSERTs them atomically — no UPDATE-after-INSERT race, and detector at the buildDefault* call site sees rich content.
    // SD-FDBK-INFRA-LEO-CREATE-PLAN-001 (FR-2): an explicit `## Scope` section wins over the
    // file-table/summary-derived scope; falls back to the prior value when the plan omits it.
    scope: planScope || scope || null,
    key_changes: keyChanges.length > 0 ? keyChanges : null,
    // SD-FDBK-INFRA-LEO-CREATE-PLAN-001 (FR-2): newly-extractable fields — null when absent so
    // createSD applies buildDefault*/inline-default and emits the FR-4 section-named warning.
    success_metrics: successMetrics.length > 0 ? successMetrics : null,
    smoke_test_steps: smokeTestSteps.length > 0 ? smokeTestSteps : null,
    key_principles: keyPrinciples.length > 0 ? keyPrinciples : null,
    metadata: {
      source: 'plan',
      plan_content: parsed.fullContent,
      plan_content_hash: planContentHash,
      plan_file_path: archiveResult.archivedPath || null,
      original_plan_path: originalPath,
      files_to_modify: parsed.files,
      steps_count: parsed.steps.length,
      files_count: parsed.files.length,
      auto_detected: wasAutoDetected,
      // SD-LEO-INFRA-AUTO-GENERATED-PRD-001 (FR-3): provenance for createSD's
      // ENRICHMENT_WARNING composer; pruned before DB insert.
      _planFieldsAbsent: planFieldsAbsent,
      ...(overrides.visionKey ? { vision_key: overrides.visionKey } : {}),
      ...(overrides.archKey ? { arch_key: overrides.archKey } : {}),
      ...(overrides.migrationReviewed ? { migration_reviewed: true } : {}),
      ...(overrides.securityReviewed ? { security_reviewed: true } : {}),
      ...(overrides.targetRepos ? { target_repos: overrides.targetRepos } : {}),
    }
  };
  if (parsed.priority) createOptions.priority = parsed.priority;
  // 7f0a4f54: explicit `## Target Application` plan header takes precedence
  // over detectFromKeyChanges file-path inference. Without this, plans that
  // literally name the target still landed under the path-detector's default.
  // CLI --target-application override (if added later) would slot in via
  // overrides.targetApplicationOverride above this line, before parsed.
  if (parsed.targetApplication) {
    createOptions.target_application = parsed.targetApplication;
  }

  // Pre-INSERT duplicate guard (QF-20260509-LEO-CREATE-PLAN-DUP-GUARD).
  // Same plan content within last 24h ⇒ refuse unless --force-create.
  if (!overrides.forceCreate) {
    const dup = await findRecentSDByPlanHash(planContentHash);
    if (dup) {
      console.error(`\n❌ Duplicate plan detected: SD ${dup.sd_key} (${dup.status}) was created from the same plan content within the last 24h.`);
      console.error(`   Title: ${dup.title}`);
      console.error('   To create another SD anyway, re-run with --force-create.');
      console.error('   Otherwise, edit the existing SD or cancel it first (npm run sd:cancel).');
      process.exit(1);
    }
  }

  const sd = await createSD(createOptions);

  // Step 13: Update additional fields that aren't in createSD signature.
  // SD-LEO-INFRA-BUILDDEFAULTSMOKETESTSTEPS-KEYWORD-DETECTOR-001 (FR-3): scope and key_changes now flow through createOptions
  // so they're INSERTed atomically — only `risks` remains for post-INSERT UPDATE.
  const additionalUpdates = {};
  if (risks.length > 0) additionalUpdates.risks = risks;

  if (Object.keys(additionalUpdates).length > 0) {
    const { error: updateError } = await supabase
      .from('strategic_directives_v2')
      .update(additionalUpdates)
      .eq('id', sd.id);

    if (updateError) {
      console.warn(`   ⚠️  Could not update additional fields: ${updateError.message}`);
    } else {
      console.log('   ✅ Updated: risks');
    }
  }

  return sd;
}

// ============================================================================
// Vision Pre-Screen (SD-LEO-INFRA-VISION-SD-CONCEPTION-GATE-001)
// ============================================================================

/** Timeout for vision LLM call at SD conception (ms). */
export const VISION_PRESCREEN_TIMEOUT_MS = 15000;

/**
 * Score a newly-created SD against the EHG-2028 vision at conception time.
 *
 * Non-blocking: errors and timeouts emit a console warning and return null.
 * The score is persisted to eva_vision_scores so the LEAD-TO-PLAN gate can
 * read it without requiring a separate manual scoring run.
 *
 * @param {string} sdKey  - The sd_key of the just-created SD
 * @param {string} title  - SD title
 * @param {string} description - SD description
 * @param {Object} supabase   - Supabase client (passed to scoreSD to reuse connection)
 * @returns {Promise<Object|null>} scoreResult or null on failure
 */
export async function scoreSDAtConception(sdKey, title, description, supabase, { visionKey, archKey } = {}) {
  const ACTION_LABELS = {
    accept:         '✅ ACCEPT',
    minor_sd:       '🟡 MINOR GAP',
    gap_closure_sd: '🟠 GAP',
    escalate:       '🔴 ESCALATION',
  };

  try {
    const visionScope = `Title: ${title}\nDescription: ${description}`;
    const scorerOpts = { sdKey, scope: visionScope, dryRun: false, supabase };
    if (visionKey) scorerOpts.visionKey = visionKey;
    if (archKey) scorerOpts.archKey = archKey;
    let timeoutId;
    const scoreResult = await Promise.race([
      scoreSD(scorerOpts),
      new Promise((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error(`Vision scoring timeout (${VISION_PRESCREEN_TIMEOUT_MS / 1000}s)`)),
          VISION_PRESCREEN_TIMEOUT_MS
        );
        // Unref so this timer doesn't keep Node alive after main work completes
        if (timeoutId.unref) timeoutId.unref();
      }),
    ]);
    clearTimeout(timeoutId);

    const actionLabel = ACTION_LABELS[scoreResult.threshold_action]
      || scoreResult.threshold_action?.toUpperCase()
      || 'SCORED';
    console.log(`\n   🔍 Vision alignment: ${scoreResult.total_score}/100 — ${actionLabel}`);
    if (scoreResult.total_score < 50) {
      console.log('   ⚠️  Score below 50 (ESCALATION tier). Consider revising SD scope before LEAD phase.');
    }
    return scoreResult;
  } catch (err) {
    console.log(`\n   ⚠️  Vision pre-screen skipped: ${err.message}`);
    return null;
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Inherit strategic fields from parent SD
 * Part of SD-LEO-FIX-METADATA-001 fix
 *
 * @param {Object} parent - Parent SD data
 * @returns {Object} Inherited fields object
 */
function inheritStrategicFields(parent) {
  const inherited = {};

  // CRITICAL: Inherit category from parent to maintain alignment (RCA from SD-LEO-ENH-AUTO-PROCEED-001-12)
  // This prevents the sd_type/category mismatch that causes progress calculation issues
  if (parent.category) {
    inherited.category = parent.category;
  }

  // Inherit strategic_objectives if parent has them
  if (parent.strategic_objectives && Array.isArray(parent.strategic_objectives) && parent.strategic_objectives.length > 0) {
    inherited.strategic_objectives = parent.strategic_objectives;
  }

  // DO NOT inherit success_metrics from parent
  // Reason: Each child SD has unique deliverables and should have its own success metrics
  // Parent metrics like "all children complete" don't apply to individual children
  // Child success_metrics will be generated by buildDefaultSuccessMetrics() based on child's title/type

  // Inherit key_principles if parent has them
  if (parent.key_principles && Array.isArray(parent.key_principles) && parent.key_principles.length > 0) {
    inherited.key_principles = parent.key_principles;
  }

  return inherited;
}

/**
 * Map feedback priority to SD priority
 */
function mapPriority(feedbackPriority) {
  const map = {
    P0: 'critical',
    P1: 'high',
    P2: 'medium',
    P3: 'low'
  };
  return map[feedbackPriority] || 'medium';
}

/**
 * Map user-friendly type to valid database sd_type
 * Valid sd_types: bugfix, database, docs, documentation, feature, infrastructure,
 * orchestrator, qa, refactor, security, implementation, strategic_observation,
 * architectural_review, discovery_spike, ux_debt, product_decision
 */
function mapToDbType(userType) {
  const map = {
    // User-friendly -> Database type
    fix: 'bugfix',
    bugfix: 'bugfix',
    feature: 'feature',
    feat: 'feature',
    infrastructure: 'infrastructure',
    infra: 'infrastructure',
    refactor: 'refactor',
    documentation: 'documentation',
    doc: 'documentation',
    docs: 'docs',
    database: 'database',
    db: 'database',
    security: 'security',
    orchestrator: 'orchestrator',
    orch: 'orchestrator',
    qa: 'infrastructure',       // QF-251: 'qa' rejected by DB → infrastructure
    testing: 'infrastructure',  // QF-251: was 'qa', same rejection class
    spike: 'discovery_spike',
    discovery_spike: 'discovery_spike',
    ux_debt: 'ux_debt',
    implementation: 'implementation',
    enhancement: 'feature'  // Map enhancement to feature
  };
  // SD-FDBK-INFRA-TYPE-SOURCE-TRUTH-001 FR-4: fail-loud on unknown sd_type.
  // Synonym map above handles user-friendly aliases (fix → bugfix, feat → feature, etc.).
  // Anything that does not resolve to a canonical sd_type after mapping must throw,
  // not silently default to 'feature'. The previous warn-and-default fallback masked
  // typos like `--type fyx` and let phantom values propagate to downstream gates.
  const mapped = map[userType?.toLowerCase()];
  if (!mapped) {
    assertValidSdType(userType, `unknown --type value: no synonym match in mapToDbType for ${JSON.stringify(userType)}`);
  }
  // assertValidSdType is the contract anchor: throws unless `mapped` is in
  // CANONICAL_SD_TYPES (lib/sd-type-enum.js), which mirrors the DB CHECK constraint
  // and is the single validator of record.
  assertValidSdType(mapped, `mapToDbType produced non-canonical sd_type from input ${JSON.stringify(userType)}`);
  return mapped;
}

/**
 * SD-LEO-INFRA-AUTOTYPE-INFRA-KEYS-001 (FR-1): infer the DEFAULT sd_type from the SD key prefix.
 * The key prefixes SD-LEO-*, SD-MAN-INFRA-* and SD-LEARN-FIX-* are infrastructure by definition
 * (harness/governance work), so a typeless SD with one of those keys should default to
 * 'infrastructure' rather than 'feature' — removing the per-SD feature->infra reclassify tax.
 * Returns 'infrastructure' for those prefixes, otherwise null (no opinion → caller falls back to
 * its own default). Pure; exported for unit test.
 * @param {string} sdKey
 * @returns {('infrastructure'|null)}
 */
function inferDefaultSdTypeFromKey(sdKey) {
  if (typeof sdKey !== 'string') return null;
  // Anchored, case-insensitive; \b/hyphen boundary so SD-LEONARDO-* does NOT match SD-LEO-.
  if (/^SD-(LEO|MAN-INFRA|LEARN-FIX)-/i.test(sdKey)) return 'infrastructure';
  return null;
}

/**
 * SD-LEO-INFRA-AUTOTYPE-INFRA-KEYS-001 (FR-1/FR-2/FR-3): resolve the effective sd_type for createSD.
 * Precedence: an explicit (truthy) rawType ALWAYS wins (FR-2 — --type / proposal sd_type / child
 * override never overridden); otherwise the key-prefix default applies (FR-1); otherwise 'feature'
 * (FR-3 — SD-EHG-* and other product keys are unchanged). Pure; exported for unit test.
 * @param {string|null|undefined} rawType  the caller-supplied type (may be unset)
 * @param {string} sdKey
 * @returns {string}
 */
function resolveSdType(rawType, sdKey) {
  return rawType || inferDefaultSdTypeFromKey(sdKey) || 'feature';
}

/**
 * Build default success_metrics based on SD type and title
 * Ensures validator requirements (3+ items with {metric, target}) are met
 */
function buildDefaultSuccessMetrics(type, _title) {
  const baseMetrics = [
    {
      metric: 'Implementation completeness',
      target: '100% of scope items implemented'
    },
    {
      metric: 'Test coverage',
      target: '≥80% code coverage for new code'
    },
    {
      metric: 'Zero regressions',
      target: '0 existing tests broken'
    }
  ];

  // Add type-specific metrics
  if (type === 'fix' || type === 'bugfix') {
    baseMetrics.push({
      metric: 'Issue recurrence',
      target: '0 recurrences after fix deployed'
    });
  } else if (type === 'feature' || type === 'feat') {
    baseMetrics.push({
      metric: 'User story completion',
      target: '100% acceptance criteria met'
    });
  }

  return baseMetrics;
}

/**
 * Build default strategic_objectives based on SD type and title
 * Ensures SD objectives validator requirement (≥2 objectives) is met
 * PAT-SDCREATE-001: Prevents LEAD-TO-PLAN gate failure for empty objectives
 */
function buildDefaultStrategicObjectives(type, title) {
  const baseObjectives = [
    `Implement ${title} as specified in the SD scope`,
    'Maintain backward compatibility with existing functionality'
  ];

  if (type === 'feature' || type === 'feat') {
    baseObjectives.push('Deliver user-facing value with clear acceptance criteria');
    baseObjectives.push('Ensure comprehensive test coverage for new functionality');
  } else if (type === 'fix' || type === 'bugfix') {
    baseObjectives.push('Address root cause to prevent recurrence');
  } else if (type === 'refactor') {
    baseObjectives.push('Improve code quality without changing external behavior');
  } else if (type === 'security') {
    baseObjectives.push('Eliminate identified security vulnerabilities');
  }

  return baseObjectives;
}

/**
 * Build default key_changes based on SD type and title
 * Provides initial scope outline for LEAD review
 * PAT-SDCREATE-001: Prevents empty key_changes field
 */
function buildDefaultKeyChanges(type, title) {
  const changes = [
    `Implement core changes for: ${title}`
  ];

  if (type === 'feature' || type === 'feat') {
    changes.push('Add UI components or API endpoints as required');
    changes.push('Add tests for new functionality');
    changes.push('Update documentation for new feature');
  } else if (type === 'fix' || type === 'bugfix') {
    changes.push('Fix identified defect and add regression test');
    changes.push('Update related documentation if needed');
  } else if (type === 'infrastructure') {
    changes.push('Update infrastructure components');
    changes.push('Verify deployment and operational readiness');
  } else if (type === 'refactor') {
    changes.push('Restructure code while preserving behavior');
    changes.push('Add or update tests to verify no regressions');
  }

  return changes;
}

/**
 * Build default smoke_test_steps for feature SDs
 * Required by SMOKE_TEST_SPECIFICATION gate for LEAD-TO-PLAN
 * PAT-SDCREATE-001: Prevents gate failure for feature SDs missing smoke tests
 *
 * Only generates for non-lightweight SD types (feature, bugfix, security, etc.)
 * Lightweight types (infrastructure, documentation, orchestrator) are exempt
 */
function buildDefaultSmokeTestSteps(type, title, scope) {
  // Lightweight SD types are exempt from smoke tests per sd-type-applicability-policy.js
  // EXCEPTION: infrastructure SDs that produce code changes need smoke_test_steps
  // because SMOKE_TEST_SPECIFICATION gate checks for code keywords in key_changes.
  // SD: SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-120
  const lightweightTypes = ['documentation', 'docs', 'orchestrator'];
  if (lightweightTypes.includes((type || '').toLowerCase())) {
    return [];
  }

  // Infrastructure SDs: only generate if scope suggests code changes
  if ((type || '').toLowerCase() === 'infrastructure') {
    const scopeStr = (scope || title || '').toLowerCase();
    // SD-LEO-INFRA-BUILDDEFAULTSMOKETESTSTEPS-KEYWORD-DETECTOR-001 (FR-1): expand to cover CLI / operator-experience / harness vocab.
    // Kept lowercase only (line above lowercases input). "gates" omitted as substring-redundant with "gate".
    const codeKeywords = [
      'script', 'fix', 'gate', 'module', 'function', 'class', 'endpoint', 'api', '.js', '.ts',
      'flag', 'cli', 'wizard', 'detector', 'parser', 'helper', 'validator', 'hook', 'sub-agent',
      'refactor', 'sweep', 'audit', 'normalizer',
    ];
    const hasCodeScope = codeKeywords.some(kw => scopeStr.includes(kw));
    if (!hasCodeScope) return [];
    return [
      { step_number: 1, instruction: `Run the modified script/gate for: ${title}`, expected_outcome: 'Script executes without errors' },
      { step_number: 2, instruction: 'Verify output matches expected behavior', expected_outcome: 'Output is correct and complete' },
      { step_number: 3, instruction: 'Confirm no regressions in related workflows', expected_outcome: 'Existing functionality unchanged' },
    ];
  }

  return [
    {
      step_number: 1,
      instruction: `Navigate to the relevant page/area for: ${title}`,
      expected_outcome: 'Page loads without errors'
    },
    {
      step_number: 2,
      instruction: 'Verify the primary functionality works as expected',
      expected_outcome: 'Core feature operates correctly with expected behavior'
    },
    {
      step_number: 3,
      instruction: 'Test an edge case or error scenario',
      expected_outcome: 'Appropriate error handling or graceful degradation'
    }
  ];
}

/**
 * Build default success_criteria based on SD type
 * Returns array of strings (qualitative acceptance criteria)
 */
function buildDefaultSuccessCriteria(type, _title) {
  const baseCriteria = [
    'All implementation items from scope are complete',
    'Code passes lint and type checks',
    'PR reviewed and approved'
  ];

  if (type === 'fix' || type === 'bugfix') {
    baseCriteria.push('Root cause addressed, not just symptoms');
  } else if (type === 'feature' || type === 'feat') {
    baseCriteria.push('Feature accessible to target users');
  }

  return baseCriteria;
}

/**
 * Create SD in database
 */
async function createSD(options) {
  const {
    sdKey,
    title,
    description,
    // SD-LEO-INFRA-AUTOTYPE-INFRA-KEYS-001: capture the caller-supplied type as rawType; the
    // effective `type` is resolved below via resolveSdType so a typeless infra-prefixed key
    // (SD-LEO-*/SD-MAN-INFRA-*/SD-LEARN-FIX-) defaults to infrastructure. Explicit type still wins.
    type: rawType,
    priority = 'medium',
    rationale,
    parentId = null,
    metadata = {},
    // Allow passing explicit category (for child SDs inheriting from parent)
    category: explicitCategory = null,
    // Allow passing explicit success fields (for sources like UAT, learn, or inherited from parent)
    success_metrics = null,
    success_criteria = null,
    strategic_objectives = null,
    key_principles = null,
    // PAT-SDCREATE-001: Allow passing key_changes and smoke_test_steps
    key_changes = null,
    smoke_test_steps = null,
    // SD-LEO-INFRA-BUILDDEFAULTSMOKETESTSTEPS-KEYWORD-DETECTOR-001 (FR-3): accept scope so the plan-file path becomes atomic INSERT.
    // Default null preserves behavior for callers that omit it (5 internal callers + /leo create path).
    scope = null,
    // SD-LEO-INFRA-PROMOTION-THIN-STUB-FIX-001: accept strategic_intent so the from-roadmap-item path can
    // populate it (was always empty for promoted SDs). Default null preserves behavior for other callers.
    strategic_intent = null,
    // SD-LEO-INFRA-MULTI-REPO-ROUTING-001: Allow explicit target_application
    target_application: explicitTargetApp = null,
    // SD-FDBK-INFRA-LEO-CREATE-PROPOSAL-001 (FR-3): accept dependencies so the
    // canonical-column write below (~line 1915) is reachable. Previously `dependencies`
    // was never destructured, so its typeof guard always resolved to [] — the column
    // could not be populated by ANY caller. Default null preserves behavior for the
    // direct/--from-feedback/--child callers that omit it.
    dependencies = null,
  } = options;

  // SD-LEO-INFRA-AUTOTYPE-INFRA-KEYS-001 (FR-1/FR-2/FR-3): resolve the effective sd_type. An explicit
  // caller type wins; otherwise an infra-prefixed key (SD-LEO-*/SD-MAN-INFRA-*/SD-LEARN-FIX-) defaults
  // to infrastructure; otherwise 'feature'. Always a string, so downstream type.charAt/mapToDbType are safe.
  const type = resolveSdType(rawType, sdKey);

  // QF-CLAIM-CONFLICT-UX-001 + SD-LEO-ENH-IMPLEMENT-TIERED-QUICK-001:
  // Detect Quick-Fix prefix and redirect via Unified Work-Item Router
  if (sdKey && sdKey.startsWith('QF-')) {
    // Use router to determine if this should be a QF or SD
    const routingDecision = await routeWorkItem({
      estimatedLoc: 0, // Unknown at SD creation time - use type/description signals
      type: type || 'bug',
      description: title,
      entryPoint: 'leo-create-sd',
    }, supabase);

    console.log('\n' + '═'.repeat(60));
    console.log('⚠️  QUICK-FIX PREFIX DETECTED');
    console.log('═'.repeat(60));
    console.log(`   SD Key: ${sdKey}`);
    console.log(`   Router Decision: ${routingDecision.tierLabel}`);
    console.log('');

    if (routingDecision.tier <= 2) {
      console.log('   This SD key has a QF- prefix and the router confirms Quick-Fix scope.');
      console.log('   Quick-Fixes should use the streamlined workflow:');
      console.log('');
      console.log('   node scripts/create-quick-fix.js --title "' + title + '" --type ' + (type || 'bug'));
      console.log('');
      console.log(`   Tier ${routingDecision.tier} benefits:`);
      console.log('   • No LEAD approval required');
      console.log('   • No PRD creation');
      if (routingDecision.tier === 1) {
        console.log('   • Auto-approve (skip compliance rubric)');
        console.log(`   • Ideal for changes ≤${routingDecision.tier1MaxLoc} LOC`);
      } else {
        console.log('   • Compliance rubric required (min score: 70)');
        console.log(`   • Ideal for changes ≤${routingDecision.tier2MaxLoc} LOC`);
      }
    } else {
      console.log('   This SD key has a QF- prefix but risk keywords detected:');
      console.log(`   Escalation: ${routingDecision.escalationReason}`);
      console.log('   Consider using a full SD workflow instead.');
    }

    console.log('');
    console.log('   Use a non-QF key prefix for full Strategic Directive workflow.');
    console.log('═'.repeat(60));
    process.exit(0);
  }

  // Map user-friendly type to valid database sd_type
  const dbType = mapToDbType(type);

  // PREVENTIVE CONTROL: Validate sd_type/category alignment (RCA from SD-LEO-ENH-AUTO-PROCEED-001-12)
  // sd_type controls validation profiles, category controls gate overrides - misalignment causes issues
  // Use explicit category if provided (e.g., inherited from parent), otherwise derive from type
  const categoryValue = explicitCategory || (type.charAt(0).toUpperCase() + type.slice(1));
  const normalizedCategory = categoryValue.toLowerCase();
  const normalizedDbType = dbType.toLowerCase();

  // Check for common misalignments that cause progress calculation issues
  if (normalizedDbType !== normalizedCategory) {
    // Some misalignments are acceptable (documentation vs docs, bugfix vs bug)
    const acceptableMappings = {
      'documentation': ['docs', 'documentation'],
      'bugfix': ['bug', 'bugfix'],
      'infrastructure': ['infrastructure', 'infra'],
      'feature': ['feature', 'enhancement']
    };

    const isAcceptable = acceptableMappings[normalizedDbType]?.includes(normalizedCategory) ||
                         acceptableMappings[normalizedCategory]?.includes(normalizedDbType);

    if (!isAcceptable && !explicitCategory) {
      // Only warn if category wasn't explicitly provided (inherited categories are intentional)
      console.log('\n⚠️  SD TYPE/CATEGORY ALIGNMENT WARNING');
      console.log(`   sd_type: '${dbType}' (controls validation profile)`);
      console.log(`   category: '${categoryValue}' (controls gate overrides)`);
      console.log('   These fields should generally align to avoid progress calculation issues.');
      console.log('   Consider using consistent values or update after creation.\n');
    }
  }

  // Build success fields - use provided values or generate defaults
  // IMPORTANT: Do NOT use JSON.stringify() - Supabase handles JSONB natively
  // FIX: Check for empty arrays, not just falsy values (empty arrays are truthy in JS)
  const finalSuccessMetrics = (Array.isArray(success_metrics) && success_metrics.length > 0)
    ? success_metrics
    : buildDefaultSuccessMetrics(type, title);
  const finalSuccessCriteria = (Array.isArray(success_criteria) && success_criteria.length > 0)
    ? success_criteria
    : buildDefaultSuccessCriteria(type, title);

  // PAT-SDCREATE-001: Build required fields with defaults to prevent LEAD-TO-PLAN gate failures
  // Previously, child SDs were created with empty strategic_objectives/key_changes/smoke_test_steps
  // which caused repeated gate validation failures requiring manual database population
  const finalStrategicObjectives = (Array.isArray(strategic_objectives) && strategic_objectives.length > 0)
    ? strategic_objectives
    : buildDefaultStrategicObjectives(type, title);
  const finalKeyChanges = (Array.isArray(key_changes) && key_changes.length > 0)
    ? key_changes
    : buildDefaultKeyChanges(type, title);
  const finalSmokeTestSteps = (Array.isArray(smoke_test_steps) && smoke_test_steps.length > 0)
    ? smoke_test_steps
    // SD-LEO-INFRA-BUILDDEFAULTSMOKETESTSTEPS-KEYWORD-DETECTOR-001 (FR-2): three-step fallback so detector sees scope from BOTH caller paths
    // (plan-file passes options.scope after FR-3 atomic-INSERT refactor; /leo create stores it in options.metadata.scope).
    : buildDefaultSmokeTestSteps(type, title, options.scope ?? options.metadata?.scope ?? description);

  // SD-FDBK-INFRA-LEO-CREATE-PLAN-001 (FR-4): when a --from-plan SD falls back to a
  // buildDefault*() generic for a gate-relevant field, surface the gap at creation time
  // (naming the field and the plan section it expected) instead of letting a placeholder
  // slip through to a downstream handoff gate. Non-blocking; creation continues. Only
  // fires for plan-sourced SDs — interactive /leo create and inherited child SDs use
  // defaults intentionally. No warning is emitted when the field was extracted from the plan.
  if (metadata?.source === 'plan') {
    const extractedSuccessMetrics = Array.isArray(success_metrics) && success_metrics.length > 0;
    const extractedSmokeTestSteps = Array.isArray(smoke_test_steps) && smoke_test_steps.length > 0;
    if (!extractedSuccessMetrics) {
      process.stderr.write('⚠️  --from-plan: success_metrics not found in plan; using generic default. Add a "## Success Metrics" section to avoid placeholder gate failures.\n');
    }
    // buildDefaultSmokeTestSteps returns [] for lightweight types (no placeholder substituted),
    // so only warn when a default was actually produced.
    if (!extractedSmokeTestSteps && Array.isArray(finalSmokeTestSteps) && finalSmokeTestSteps.length > 0) {
      process.stderr.write('⚠️  --from-plan: smoke_test_steps not found in plan; using generic default. Add a "## Smoke Test Steps" section to avoid placeholder gate failures.\n');
    }
  }

  // ========================================================================
  // GOVERNANCE GUARDRAILS (SD-MAN-FEAT-CORRECTIVE-VISION-GAP-007)
  // ========================================================================


  // Guardrail 1: Brainstorm Intent Validation
  // Warn when feature/enhancement SDs are created without a prior brainstorm session
  const brainstormTypes = ['feature', 'enhancement'];
  if (brainstormTypes.includes(dbType) && !parentId && !metadata?.source?.includes('brainstorm')) {
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data: recentSessions } = await supabase
        .from('brainstorm_sessions')
        .select('id, topic, created_sd_id, crystallization_score')
        .gte('created_at', thirtyDaysAgo)
        .is('created_sd_id', null) // Sessions not yet linked to an SD
        .order('created_at', { ascending: false })
        .limit(5);

      if (!recentSessions || recentSessions.length === 0) {
        console.log('\n' + '💡'.repeat(15));
        console.log('💡 BRAINSTORM INTENT CHECK (Guardrail V11)');
        console.log('💡'.repeat(15));
        console.log(`   Creating a "${type}" SD without a prior brainstorm session.`);
        console.log('   Brainstorming helps crystallize requirements and reduce scope creep.');
        console.log('');
        console.log('   To start a brainstorm: /brainstorm');
        console.log('   Proceeding with SD creation...');
        console.log('💡'.repeat(15));
      }
    } catch {
      // Non-fatal: brainstorm check should not block SD creation
    }
  }

  // Guardrail 3: Bulk SD Draft Limit
  // Warn when too many draft SDs already exist (prevents backlog sprawl)
  const DRAFT_LIMIT = 10;
  try {
    const { count: draftCount } = await supabase
      .from('strategic_directives_v2')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'draft')
      .eq('is_active', true);

    if (draftCount >= DRAFT_LIMIT) {
      console.log('\n' + '🚧'.repeat(15));
      console.log('🚧 DRAFT BACKLOG WARNING (Guardrail V06)');
      console.log('🚧'.repeat(15));
      console.log(`   ${draftCount} draft SDs already exist (limit: ${DRAFT_LIMIT}).`);
      console.log('   Consider completing existing drafts before creating new ones.');
      console.log('');
      console.log('   View queue: npm run sd:next');
      console.log('   Proceeding with SD creation...');
      console.log('🚧'.repeat(15));
    }
  } catch {
    // Non-fatal: draft count check should not block SD creation
  }

  // ========================================================================

  // Guardrail 4: Vision Delta Watch Points (SD-LEO-INFRA-HEAL-VISION-DELTA-002)
  // Surface architecture dimensions that historically have the largest gaps
  // between first-pass and corrected vision scores. Advisory only — does not block.
  try {
    const { getVisionWatchPoints } = await import('./vision-delta-aggregator.js');
    const watchPoints = await getVisionWatchPoints(supabase, 3);
    if (watchPoints.length > 0) {
      console.log('\n' + '🔭'.repeat(15));
      console.log('🔭 ARCHITECTURE WATCH POINTS (from vision delta analysis)');
      console.log('🔭'.repeat(15));
      console.log('   These dimensions commonly have large gaps on first-pass scoring.');
      console.log('   Consider addressing them in your SD description and objectives:\n');
      for (const wp of watchPoints) {
        const sev = wp.severity === 'high' ? '🔴' : '🟡';
        console.log(`   ${sev} ${wp.dimension} (${wp.key}): avg +${wp.mean_delta} gap across ${wp.sd_count} SDs`);
      }
      console.log('\n   These are advisory — not blocking SD creation.');
      console.log('🔭'.repeat(15));
    }
  } catch {
    // Non-fatal: watch points are advisory
  }

  // ========================================================================

  // Guardrail Registry Check (V11: governance_guardrail_enforcement)
  // Blocking guardrails can prevent SD creation. Advisory guardrails log warnings.
  try {
    const guardrailRegistry = await import('../lib/governance/guardrail-registry.js');
    const guardrailInput = {
      sd_type: dbType,
      scope: description,
      priority,
      visionScore: null, // Will be populated by scoreSDAtConception later
      strategic_objectives: finalStrategicObjectives,
      risks: [],
      metadata,
    };
    const guardrailResult = guardrailRegistry.check(guardrailInput);

    if (guardrailResult.warnings.length > 0) {
      console.log('\n   ⚠️  GUARDRAIL ADVISORY WARNINGS:');
      for (const w of guardrailResult.warnings) {
        console.log(`      [${w.guardrail}] ${w.message}`);
      }
    }

    if (!guardrailResult.passed) {
      console.log('\n' + '🛑'.repeat(30));
      console.log('🛑 GUARDRAIL VIOLATION — SD CREATION BLOCKED');
      console.log('🛑'.repeat(30));
      for (const v of guardrailResult.violations) {
        console.log(`   [${v.severity.toUpperCase()}] ${v.name}: ${v.message}`);
      }
      console.log('\n   Resolve the above violations before creating this SD.');
      console.log('   Guardrails are enforced at both CLI and database level — no bypass available.');
      console.log('🛑'.repeat(30));
      process.exit(1);
    }
  } catch (err) {
    // Graceful degradation: if guardrail module fails, log warning and proceed
    if (err.code !== 'MODULE_NOT_FOUND') {
      console.log(`\n   ⚠️  Guardrail check error: ${err.message}. Proceeding with SD creation.`);
    }
  }

  // Cascade Validator Check (V09: strategic_governance_cascade)
  // Validates 6-layer governance hierarchy: Mission → Constitution → Vision → Strategy → OKR → SD
  try {
    const { validateCascade } = await import('./modules/governance/cascade-validator.js');
    const cascadeResult = await validateCascade({
      sd: {
        title,
        description,
        strategic_objectives: finalStrategicObjectives,
        key_changes: (typeof keyChanges !== 'undefined' ? keyChanges : []),
        vision_key: metadata?.vision_key || null,
        venture_id: metadata?.venture_id || null,
        metadata,
      },
      logger: console,
      dryRun: false,
    });

    if (cascadeResult.warnings.length > 0) {
      console.log('\n   ⚠️  CASCADE ADVISORY WARNINGS:');
      for (const w of cascadeResult.warnings) {
        console.log(`      [${w.layer || 'general'}] ${w.reason}`);
      }
    }

    if (!cascadeResult.passed) {
      console.log('\n' + '🛑'.repeat(30));
      console.log('🛑 CASCADE VIOLATION — SD CREATION BLOCKED');
      console.log('🛑'.repeat(30));
      for (const v of cascadeResult.violations) {
        console.log(`   [${v.enforcementLevel || 'blocking'}] ${v.layer || 'rule'}: ${v.reason || v.ruleText}`);
      }
      console.log(`\n   ${cascadeResult.rulesChecked} rules checked.`);
      console.log('   Resolve violations or request chairman override.');
      console.log('   Cascade rules are enforced at both CLI and database level — no bypass available.');
      console.log('🛑'.repeat(30));
      process.exit(1);
    }
  } catch (err) {
    // Graceful degradation: if cascade validator fails, log and proceed
    if (err.code !== 'MODULE_NOT_FOUND') {
      console.log(`\n   ⚠️  Cascade validation error: ${err.message}. Proceeding with SD creation.`);
    }
  }

  // SD-LEO-INFRA-MULTI-REPO-ROUTING-001: Resolve target_application from venture context
  // SD-LEO-INFRA-SD-AUTHORING-TARGET-AUTODETECT-001: insert key_changes path detector
  //   between VENTURE env var and getCurrentVenture() fallback (line 1446 below).
  // Precedence: explicit param > VENTURE env var > path detect from key_changes > getCurrentVenture() > 'EHG_Engineer'
  const resolvedTargetApplication = explicitTargetApp
    || (process.env.VENTURE && (getVentureConfig(process.env.VENTURE)?.name || process.env.VENTURE))
    || detectFromKeyChanges(finalKeyChanges)
    || null;

  const sdData = {
    id: randomUUID(),
    sd_key: sdKey,
    // SD-LEO-INFRA-ADAM-CREATION-PROCESS-001 (FR-2): set the human-readable key at
    // creation so sd_code_user_facing is the SD key, NOT the UUID (the prior default
    // left it equal to id=randomUUID(), forcing a governance-gated re-key). Both id and
    // sd_code_user_facing are non-null at INSERT, so the sync trigger
    // (sync_sd_code_user_facing, BEFORE INSERT) no-ops — id is NOT mutated.
    sd_code_user_facing: sdKey,
    title,
    description,
    scope: scope || description,  // SD-LEO-INFRA-BUILDDEFAULTSMOKETESTSTEPS-KEYWORD-DETECTOR-001 (FR-3): prefer atomic-INSERT scope, fall back to description.
    // SD-LEO-INFRA-PROMOTION-THIN-STUB-FIX-001: persist strategic_intent when a caller provides it
    // (the from-roadmap-item path now derives one); null preserves the column default for other callers.
    ...(strategic_intent ? { strategic_intent } : {}),
    rationale,
    sd_type: dbType,
    status: 'draft',
    priority,
    category: categoryValue,  // Use calculated value (may be inherited from parent)
    current_phase: 'LEAD',
    target_application: resolvedTargetApplication || getCurrentVenture() || 'EHG_Engineer',
    created_by: 'Claude',
    parent_sd_id: parentId,
    success_criteria: finalSuccessCriteria,  // Array, NOT JSON.stringify()
    success_metrics: finalSuccessMetrics,    // Array with {metric, target}, NOT JSON.stringify()
    strategic_objectives: finalStrategicObjectives,  // PAT-SDCREATE-001: defaults prevent empty field
    key_changes: finalKeyChanges,                    // PAT-SDCREATE-001: now populated at creation
    smoke_test_steps: finalSmokeTestSteps,           // PAT-SDCREATE-001: now populated for feature SDs
    key_principles: key_principles || [
      'Follow LEO Protocol for all changes',
      'Ensure backward compatibility'
    ],
    risks: (typeof risks !== 'undefined' && risks && risks.length > 0) ? risks : [
      { risk: 'Implementation may not fully address root cause', likelihood: 'low', impact: 'low', mitigation: 'Verify against original evidence; re-queue via /learn if pattern recurs' }
    ],
    // QF-20260525-542: write an empty array when there are no real deps. The prior
    // { dependency: 'none', status: 'available' } placeholder is not an SD-key, so the
    // coordinator's canonical blocker rule ignores it anyway — but an empty array keeps
    // the column honest and avoids confusing any consumer that inspects raw entries.
    dependencies: (typeof dependencies !== 'undefined' && dependencies && dependencies.length > 0) ? dependencies : [],
    implementation_guidelines: (typeof implementation_guidelines !== 'undefined' && implementation_guidelines && implementation_guidelines.length > 0) ? implementation_guidelines : [
      `Implement changes for: ${title}`,
      'Verify no regressions in existing functionality'
    ],
    metadata: {
      ...metadata,
      created_via: 'leo-create-sd',
      created_at: new Date().toISOString(),
      // QF-20260509-986 (closes feedback ccc82ea6): provenance flag so the
      // LEAD-TO-PLAN target-application validation gate can respect operator
      // intent and skip auto-correction when target_application was set
      // explicitly (CLI override or `## Target Application` plan header).
      // Inferred-from-key_changes is NOT considered explicit.
      target_application_explicit: Boolean(explicitTargetApp || process.env.VENTURE)
    }
  };

  // SD-LEO-INFRA-STRUCTURED-SD-FR-FIELD-001 (FR-2): populate the structured FR source at the
  // single createSD convergence point (covers --from-proposal, --from-plan, --child, interactive).
  // Gap-fill ONLY: an already-supplied structured array (proposal-carried / child-inherited) is
  // preserved verbatim — never overwritten. Derivation parses FR-N prose from description+scope
  // into the {id,title,description} shape the PRD-writer (FR-3) and drift gate's extractSdFrs read.
  try {
    const existingFrs = sdData.metadata?.functional_requirements;
    const hasStructured = Array.isArray(existingFrs) && existingFrs.length > 0;
    if (!hasStructured) {
      const derived = deriveSdFunctionalRequirements(sdData);
      if (derived.length > 0) {
        sdData.metadata = { ...sdData.metadata, functional_requirements: derived };
      }
    }
  } catch (frErr) {
    // Non-fatal: structured-FR derivation must never block SD creation (FR-4 graceful fallback).
    console.warn(`   ⚠️  structured FR derivation skipped (non-blocking): ${frErr.message}`);
  }

  // SD-LEO-INFRA-TIER-RANK-STARVATION-DURABLE-FIX-001 (FR-3): stamp metadata.min_tier_rank at CREATION so
  // every new SD is born tiered. Previously new SDs came out UNDEFINED (the creation path never stamped),
  // depending on the out-of-band stamp-sd-tier-rank.mjs — and when that stamper broke (estimated_loc
  // phantom column), the whole fleet starved on "unclaimable" unstamped work. GAP-FILL only: never
  // overwrite an Adam-sourced / child-inherited finite rank. Non-fatal (mirrors the FR derivation guard).
  try {
    if (!Number.isFinite(Number(sdData.metadata?.min_tier_rank))) {
      const { stampPayload } = await import('../lib/fleet/sd-tier-rank.mjs');
      sdData.metadata = { ...sdData.metadata, ...stampPayload(sdData) };
    }
  } catch (tierErr) {
    console.warn(`   ⚠️  min_tier_rank stamp skipped (non-blocking): ${tierErr.message}`);
  }

  // CONST-014 Enforcement: Decomposition check at creation time
  // SDs with 3+ phases or 8+ FRs must use orchestrator pattern
  if (!parentId) {
    try {
      const scopeText = `${title} ${description || ''} ${(finalStrategicObjectives || []).join(' ')} ${(finalKeyChanges || []).join(' ')}`;
      const phaseSignals = ['phase 1', 'phase 2', 'phase 3', 'step 1', 'step 2', 'step 3', 'layer 1', 'layer 2', 'layer 3', 'first,', 'second,', 'third,', 'finally,'];
      const phaseCount = phaseSignals.filter(s => scopeText.toLowerCase().includes(s)).length;
      const frCount = (finalSuccessCriteria || []).length + (finalKeyChanges || []).length;

      if (phaseCount >= 3 || frCount >= 8) {
        console.log('\n' + '⚠️'.repeat(20));
        console.log('📐 CONST-014 DECOMPOSITION RECOMMENDATION');
        console.log('─'.repeat(50));
        console.log(`   Phase signals detected: ${phaseCount} (threshold: 3)`);
        console.log(`   Scope items (FRs + changes): ${frCount} (threshold: 8)`);
        console.log('');
        console.log('   This SD may benefit from orchestrator decomposition.');
        console.log('   Consider creating child SDs for focused scope.');
        console.log('   Proceeding with creation — decompose after LEAD approval.');
        console.log('─'.repeat(50));

        // Tag in metadata for downstream enforcement
        sdData.metadata = { ...sdData.metadata, decomposition_recommended: true, scope_signals: { phaseCount, frCount } };
      }
    } catch {
      // Non-fatal: decomposition check should not block creation
    }
  }

  // SD-LEARN-FIX-ADDRESS-PAT-AUTO-069: GATE_SD_QUALITY-aligned validation with auto-enrichment
  // SD-LEARN-FIX-ADDRESS-PAT-AUTO-078: Now populates missing fields AND applies enriched data to insert
  // SD-LEO-INFRA-AUTO-GENERATED-PRD-001 (FR-3): Compose ENRICHMENT_WARNING naming every field
  // the SD inherits from a default (from plan-parser null-sections AND autoPopulateMissingFields).
  try {
    const gateResult = validateSDFields(sdData, { enrich: true, quiet: false });
    if (gateResult.enrichments.length > 0) {
      console.log(`   ✅ Auto-enrichment applied ${gateResult.enrichments.length} fix(es) (score: ${gateResult.score}/${gateResult.threshold})`);
    }

    // Fields defaulted at creation — union of plan-parser absences and auto-populated field names.
    const planAbsent = Array.isArray(sdData.metadata?._planFieldsAbsent) ? sdData.metadata._planFieldsAbsent : [];
    const needsEnrichment = Array.from(new Set([...(gateResult.fieldsWritten || []), ...planAbsent]));
    if (needsEnrichment.length > 0) {
      process.stderr.write(`⚠️  FIELDS NEEDING ENRICHMENT: ${needsEnrichment.join(', ')}\n`);
      sdData.metadata = { ...sdData.metadata, needs_enrichment: needsEnrichment };
    }
    // Prune internal provenance key before DB insert (additive-only contract).
    if (sdData.metadata && '_planFieldsAbsent' in sdData.metadata) {
      const { _planFieldsAbsent, ...rest } = sdData.metadata;
      sdData.metadata = rest;
    }
  } catch (vErr) {
    console.warn(`   ⚠️  GATE_SD_QUALITY pre-check skipped: ${vErr.message}`);
  }

  // SD-LEO-INFRA-RECONCILE-VENTURE-BUILD-001 (FR-5): auto-register target_application in the
  // `applications` registry BEFORE the SD insert, so the (deferred) fail-closed routing trigger
  // never blocks legitimate SD creation on an unregistered name. Fail-soft: a registry write
  // error must NOT block SD creation — the registry is a precondition, not a gate, and the
  // enforcing trigger is not yet active.
  try {
    const appName = sdData.target_application;
    if (appName) {
      const PLATFORM_REPOS = new Set(['ehg', 'ehg_engineer']);
      const isPlatform = PLATFORM_REPOS.has(String(appName).toLowerCase());
      // FR-5 NO-VENTURE GUARD (uses the shared lib/eva/bridge/sd-router.js isLegitimateNoVenture
      // helper — SD-FDBK-INFRA-KEY-GENERATOR-LEAKS-001 replaced the inline re-implementation):
      // engineering/governance LEO work (sd_type in LEGITIMATE_NO_VENTURE_SD_TYPES, or
      // metadata.engineering_only=true) must NOT mint a NEW 'venture' registry entry. Such an SD
      // legitimately targets a platform repo (default EHG_Engineer); a NON-platform target on it
      // is a misroute, so we skip registration (surfaced loudly) rather than polluting the registry
      // with a phantom venture the deferred fail-closed trigger would then accept.
      const isNoVentureWork = isLegitimateNoVenture(sdData.sd_type, sdData.metadata);
      if (!isPlatform && isNoVentureWork) {
        console.warn(
          `   ⚠️  Skipping applications auto-register: engineering SD (sd_type=${sdData.sd_type}) has a `
          + `non-platform target_application '${appName}'. Engineering/governance work should target a `
          + 'platform repo (EHG/EHG_Engineer) — refusing to mint a phantom venture (FR-5 no-venture guard).'
        );
      } else {
        const { data: existing } = await supabase
          .from('applications').select('id').ilike('name', appName).limit(1);
        if (!existing || existing.length === 0) {
          const kind = isPlatform ? 'platform' : 'venture';
          const normalized = String(appName).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
          const { error: regErr } = await supabase
            .from('applications').insert({ name: appName, normalized_name: normalized, kind, status: 'active' });
          if (!regErr) console.log(`   📇 Registered target_application '${appName}' (${kind}) in applications registry`);
        }
      }
    }
  } catch (regErr) {
    console.warn(`   ⚠️  applications registry auto-register skipped (non-blocking): ${regErr.message}`);
  }

  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .insert(sdData)
    .select('id, uuid_id, sd_key, sd_code_user_facing, title, sd_type, status, priority, current_phase')
    .single();

  if (error) {
    const msg = `Failed to create SD: ${error.message}`;
    console.error(msg);
    // Throw instead of process.exit — callers (EVA, corrective-sd-generator) must not be killed
    if (typeof globalThis.__LEO_CLI_MODE !== 'undefined') process.exit(1);
    throw new Error(msg);
  }

  // SD-MAN-GEN-CORRECTIVE-VISION-GAP-009: Track CLI authority for SD creation
  try {
    await trackWriteSource(supabase, {
      table: 'strategic_directives_v2',
      operation: 'insert',
      source: 'cli',
      command: 'create',
      sdKey: data.sd_key,
    });
  } catch { /* CLI tracking is fire-and-forget */ }

  // SD-LEO-INFRA-GUARANTEE-CLAIMABLE-SD-RANKED-001-C (FR-1): trigger an event-driven rank pass so
  // this freshly-created SD gets metadata.dispatch_rank within seconds instead of waiting for the
  // next 15-min coordinator-backlog-rank.mjs cron tick. Mirrors the min_tier_rank stamp above —
  // fire-and-forget, never blocks SD creation.
  try {
    const { triggerRankPass } = await import('../lib/coordinator/trigger-rank-pass.mjs');
    triggerRankPass({ reason: 'sd_created', sdKey: data.sd_key });
  } catch (rankTriggerErr) {
    console.warn(`   ⚠️  rank-pass trigger skipped (non-blocking): ${rankTriggerErr.message}`);
  }

  // FR-005 (SD-LEO-INFRA-BRAINSTORM-SD-PIPELINE-001): Backfill brainstorm_sessions.created_sd_id
  // When an SD is created with a vision_key from a brainstorm, link it back to the originating session
  if (metadata?.vision_key) {
    try {
      const { data: visionDoc } = await supabase
        .from('eva_vision_documents')
        .select('source_brainstorm_id')
        .eq('vision_key', metadata.vision_key)
        .single();

      if (visionDoc?.source_brainstorm_id) {
        await supabase
          .from('brainstorm_sessions')
          .update({ created_sd_id: data.sd_key })
          .eq('id', visionDoc.source_brainstorm_id)
          .is('created_sd_id', null); // Only backfill if not already linked
      }
    } catch { /* Non-fatal: brainstorm backfill should not block SD creation */ }
  }

  // SD-LEO-INFRA-SOURCING-ENGINE-REGISTER-FIRST-001 (FR-2, PATH_A warn-only): nudge when an SD is
  // created without a preceding roadmap registration. NEVER blocks, NEVER auto-registers — the
  // default-wave / source-id minting convention is owned by the deferred parent engine and must not be
  // invented on this universal create path. One lightweight check, fully fail-soft; disable via
  // REGISTER_FIRST_WARN=off. shouldWarnRegisterFirst skips children/fixtures/roadmap-sourced SDs.
  if (process.env.REGISTER_FIRST_WARN !== 'off') {
    try {
      const { data: reg } = await supabase
        .from('roadmap_wave_items').select('id').eq('promoted_to_sd_key', data.sd_key).limit(1);
      const hasRegistration = Array.isArray(reg) && reg.length > 0;
      if (shouldWarnRegisterFirst({ sd_key: data.sd_key, metadata }, hasRegistration, parentId)) {
        console.warn(`   ⚠️  register-first: ${data.sd_key} created without a preceding roadmap registration (warn-only; auto-register awaits the roadmap-engine convention).`);
      }
    } catch { /* warn-only must never block SD creation */ }
  }

  // Vision pre-screen at SD conception (SD-LEO-INFRA-VISION-SD-CONCEPTION-GATE-001)
  // Fire-and-forget: vision scoring is advisory and should not block SD creation.
  // Blocking here caused duplicate SDs when the script timed out after DB insert.
  scoreSDAtConception(data.sd_key, title, description, supabase, {
    visionKey: metadata?.vision_key,
    archKey: metadata?.arch_key
  }).catch(err => console.log(`\n   ⚠️  Vision pre-screen failed (non-blocking): ${err.message}`));

  // Scope complexity advisory for orchestrator SDs (SD-MAN-ORCH-SCOPE-COMPLEXITY-ANALYSIS-001-A)
  if (dbType === 'orchestrator') {
    import('../lib/analysis/scope-complexity-scorer.js')
      .then(({ scoreComplexity, formatAdvisory }) =>
        scoreComplexity(data.sd_key, { supabase }).then(result => {
          if (result) console.log(formatAdvisory(result));
        })
      )
      .catch(err => console.log(`\n   ⚠️  Scope complexity advisory failed (non-blocking): ${err.message}`));
  }


  console.log('\n' + '═'.repeat(60));
  console.log('✅ SD CREATED');
  console.log('═'.repeat(60));
  console.log(`   SD Key:   ${data.sd_key}`);
  console.log(`   Title:    ${data.title}`);
  console.log(`   Type:     ${data.sd_type}`);
  console.log(`   Priority: ${data.priority}`);
  console.log(`   Status:   ${data.status}`);
  console.log(`   Phase:    ${data.current_phase}`);
  console.log(`   Dependencies: ${sdData.dependencies?.length ? sdData.dependencies.map(formatDependencyForDisplay).join(', ') : '(none)'}`);
  console.log('═'.repeat(60));

  // QA CHECK: Detect dependency info misplaced in metadata
  const depScan = scanMetadataForMisplacedDependencies(sdData.metadata);
  if (depScan.hasMisplacedDeps) {
    console.log('\n' + '⚠'.repeat(30));
    console.log('⚠️  DEPENDENCY QA WARNING');
    console.log('⚠'.repeat(30));
    console.log('   The dependencies column is empty, but dependency-like');
    console.log('   information was found in the metadata field:');
    for (const finding of depScan.findings) {
      console.log(`\n   metadata.${finding.key}:`);
      if (Array.isArray(finding.value)) {
        finding.value.forEach(v => console.log(`     - ${typeof v === 'string' ? v : JSON.stringify(v)}`));
      } else {
        console.log(`     ${typeof finding.value === 'string' ? finding.value : JSON.stringify(finding.value)}`);
      }
      if (finding.sdKeys.length > 0) {
        console.log(`   → SD keys detected: ${finding.sdKeys.join(', ')}`);
      }
    }
    console.log('\n   ℹ️  The "dependencies" column is the correct place for SD');
    console.log('   dependencies. It controls blocking/readiness in sd:next.');
    console.log('   Metadata dependencies are NOT enforced by the queue system.');
    console.log('\n   To fix, update the SD:');
    console.log('   UPDATE strategic_directives_v2');
    console.log(`   SET dependencies = '[${depScan.findings.flatMap(f => f.sdKeys).map(k => `{"sd_id":"${k}"}`).join(',')}]'`);
    console.log(`   WHERE sd_key = '${data.sd_key}';`);
    console.log('⚠'.repeat(30));
  }

  console.log('\n📋 Next Steps:');
  console.log('   1. Review SD details');
  console.log('   2. Run LEAD-TO-PLAN handoff when ready:');
  console.log(`      node scripts/handoff.js execute LEAD-TO-PLAN ${data.sd_key}`);

  return data;
}

/**
 * Format a dependency entry for human-readable console display.
 * Returns a string via fallback chain: dep.dependency → dep.sd_key → dep.sd_id → dep.id → JSON.stringify.
 * Avoids `[object Object]` output when the shape is {type, dependency, dependency_id} (canonical) or malformed.
 *
 * @param {Object|string} dep - Dependency entry (object or bare string key).
 * @returns {string} Human-readable identifier (never "[object Object]").
 */
export function formatDependencyForDisplay(dep) {
  if (dep == null) return 'null';
  if (typeof dep === 'string') return dep;
  if (typeof dep !== 'object') return String(dep);
  return dep.dependency ?? dep.sd_key ?? dep.sd_id ?? dep.id ?? JSON.stringify(dep);
}

// ============================================================================
// --from-proposal ingest (SD-LEO-INFRA-FROM-PROPOSAL-INGEST-001)
// Materialize .prd-payloads/PROPOSAL-*.json into DRAFT SDs via the EXISTING
// createSD() path. Critical divergence from --from-plan: the key is taken
// VERBATIM from proposed_sd_key (no generateSDKey / archive / content-hash).
// validateProposalShape + mapProposalToCreateArgs are PURE + exported so unit
// tests exercise them with zero DB access; createFromProposal accepts injected
// deps {keyExists, createSD, readFile, resolveFiles} so dry-run + idempotency
// are testable without the (non-injectable, module-singleton) live supabase.
// ============================================================================

const VALID_PROPOSAL_PRIORITIES = ['critical', 'high', 'medium', 'low'];

/**
 * Validate a parsed proposal object fail-loud. Required: proposed_sd_key, title,
 * sd_type, priority (+ PROPOSAL===true, status_intended==='draft' when present).
 * sd_type is validated by reusing mapToDbType() (canonical 15-value enum, throws);
 * priority is lowercased + checked against the 4-value set. On any failure: a
 * bracket-tokenized console.error + process.exit(1). Returns the normalized core.
 * @param {object} proposal
 * @param {string} filePath
 * @returns {{sdKey:string,title:string,type:string,priority:string,rawType:string}}
 */
export function validateProposalShape(proposal, filePath) {
  const where = filePath || '<proposal>';
  if (!proposal || typeof proposal !== 'object' || Array.isArray(proposal)) {
    console.error(`[INVALID_PROPOSAL] ${where}: payload must be a JSON object`);
    process.exit(1);
  }
  if (proposal.PROPOSAL !== true) {
    console.error(`[INVALID_PROPOSAL] ${where}: not a proposal (expected "PROPOSAL": true)`);
    process.exit(1);
  }
  if (proposal.status_intended != null && proposal.status_intended !== 'draft') {
    console.error(`[INVALID_PROPOSAL] ${where}: status_intended must be "draft" (got ${JSON.stringify(proposal.status_intended)})`);
    process.exit(1);
  }
  // Required fields must be non-empty STRINGS. The typeof check is load-bearing:
  // without it a number/boolean/array/object (e.g. title:[] or proposed_sd_key:42)
  // would pass and flow verbatim into createSD -> a corrupt INSERT or an uncaught
  // TypeError at sdKey.startsWith. (adversarial review w2b0qjnoa, 2 HIGH findings)
  for (const field of ['proposed_sd_key', 'title', 'sd_type', 'priority']) {
    const v = proposal[field];
    if (v === undefined || v === null || typeof v !== 'string' || v.trim() === '') {
      console.error(`[INVALID_PROPOSAL] ${where}: required field "${field}" must be a non-empty string`);
      process.exit(1);
    }
  }
  let type;
  try {
    type = mapToDbType(proposal.sd_type); // reuses canonical enum; throws on invalid (now guaranteed a string)
  } catch (e) {
    console.error(`[INVALID_PROPOSAL_SD_TYPE] ${where}: ${e.message}`);
    process.exit(1);
  }
  // priority is guaranteed a non-empty string by the loop above, so a single-element
  // array like ['high'] can no longer String()-coerce through this check.
  const priority = proposal.priority.toLowerCase();
  if (!VALID_PROPOSAL_PRIORITIES.includes(priority)) {
    console.error(`[INVALID_PROPOSAL_PRIORITY] ${where}: "${proposal.priority}". Valid: ${VALID_PROPOSAL_PRIORITIES.join(', ')}`);
    process.exit(1);
  }
  return { sdKey: proposal.proposed_sd_key, title: proposal.title, type, priority, rawType: proposal.sd_type };
}

/**
 * Map a validated proposal to createSD() args. Key is verbatim; description falls
 * back rationale -> scope -> title; metadata.source='proposal' + provenance.
 * No vision_key/arch_key (avoids enrichFromVisionArch orphan-FK), no parentId,
 * no orchestrator auto-routing. PURE.
 *
 * SD-LEO-INFRA-ADAM-SELF-AUDIT-RESOLVERS-001 (FR-1a, load-bearing): stamp the CANONICAL
 * Adam-sourced marker `metadata.sourced_by='adam'` ONLY when the proposal carries the
 * explicit, opt-in `sourced_by: 'adam'` field. This is the durable attribution the
 * sourcing-cadence probe counts (resolveFacts.sourcedInWindow). The marker is opt-in by
 * design: a non-Adam proposal (e.g. drain-intake, which sets provenance.source='drain-intake'
 * but never sourced_by) is left UN-stamped, so non-Adam creation paths are unchanged.
 * The closed-whitelist metadata invariant is preserved — the key only appears when the
 * proposal explicitly declares Adam origin.
 *
 * WHERE THIS FIRES (canonical Adam sourcing path — NOT a no-op): mapProposalToCreateArgs is the
 * single mapper for ingestProposalObject(), which is the shared core of Adam's FILE-FREE DB-direct
 * sourcing routes `--proposal-b64` and `--proposal-stdin` (SD-LEO-INFRA-OPERATOR-SOURCING-DBDIRECT-001),
 * plus `--from-proposal`. Those routes ARE the intended forward producer of Adam's sourcing: an Adam
 * session emits a proposal JSON carrying `sourced_by:'adam'`, and this line is the ONLY code path
 * that stamps the canonical marker. So FR-1b's consumer count (resolveFacts.sourcedInWindow) relies
 * on a real producer, not a phantom one.
 *
 * Live-state note (verified 2026-06-15): the ~31 existing strategic_directives_v2 rows already
 * carrying metadata.sourced_by='adam' have source=leo|plan|feedback (NOT proposal) and were stamped
 * by Adam's earlier DB-direct sourcing (manual metadata write), since no other CODE producer stamps
 * sourced_by. Those historical rows are still counted by FR-1b as-is; this stamp makes the
 * proposal-based routes the durable, code-enforced producer going forward. No retroactive change.
 */
// SD-LEO-INFRA-FROM-PROPOSAL-METADATA-PRESERVE-001 (FR-1): keys DELIBERATELY excluded from the
// preserved proposal metadata, for two reasons:
//   (a) LEAK-GUARD — arch_key/vision_key drive enrichFromVisionArch's orphan-FK re-activation
//       (see mapProposalToCreateArgs header + the createSD vision/arch enrichment path).
//   (b) CANONICAL-AUTHORITATIVE — these keys have dedicated, guarded handling below that must
//       stay the single source of truth. The review-attestation flags (migration_reviewed /
//       security_reviewed) are security-sensitive: they may appear ONLY on an explicit `=== true`,
//       so a preserved raw `false`/`null`/object value must NOT leak through. target_repos is
//       translated to target_application + a normalized list; depends_on is normalized into the
//       canonical dependencies column + a back-compat metadata copy.
const PROPOSAL_META_DROP_KEYS = new Set([
  'arch_key', 'vision_key',
  'migration_reviewed', 'security_reviewed',
  'target_repos', 'depends_on',
]);

export function mapProposalToCreateArgs(normalized, proposal, filePath, opts = {}) {
  // FR-1: preserve the proposal's full metadata object (merge with canonical defaults rather than
  // replacing), MINUS the leak-guard keys. This carries Adam-sourcing keys (min_tier_rank,
  // requires_human_action, deferred/deferred_until, etc.) that the old closed whitelist dropped.
  const preservedProposalMeta = {};
  if (proposal.metadata && typeof proposal.metadata === 'object' && !Array.isArray(proposal.metadata)) {
    for (const [k, v] of Object.entries(proposal.metadata)) {
      if (!PROPOSAL_META_DROP_KEYS.has(k)) preservedProposalMeta[k] = v;
    }
  }

  // FR-2/FR-4: translate metadata.target_repos -> canonical target_application (first repo is the
  // primary; the full list stays in metadata.target_repos). Reuse the --target-repos validator
  // (parseTargetReposArg validates against ALLOWED_REPOS and exits(1) on an invalid value).
  const proposalTargetRepos = Array.isArray(proposal.metadata?.target_repos) && proposal.metadata.target_repos.length > 0
    ? parseTargetReposArg(proposal.metadata.target_repos.join(','))
    : null;

  return {
    sdKey: normalized.sdKey,
    title: normalized.title,
    type: normalized.type,
    priority: normalized.priority,
    // SD-REFILL-00229BH8: lead the DESCRIPTION with the OBJECTIVE (scope), not the rationale.
    // proposal.rationale frequently carries provenance boilerplate ("Materialized from coordinator
    // proposal (idle-fleet vision-aligned design work)") whose purpose is the LEAD evaluator, NOT a
    // description — when it led the description, the substantive ~1500ch scope was buried and workers
    // mis-flagged the SD as an 8-word stub. scope (the objective) is preferred; rationale is the
    // fallback only when scope is absent. Provenance still lives in `rationale` + metadata below.
    description: proposal.scope || proposal.rationale || proposal.title,
    // Sibling parity: UAT/learn/feedback/QF/plan/child all set an explicit rationale
    // (used by the LEAD evaluator). Fall back to a provenance line when absent.
    rationale: proposal.rationale || `Materialized from proposal ${filePath || 'unknown'}`,
    scope: proposal.scope || null,
    success_criteria: Array.isArray(proposal.success_criteria) ? proposal.success_criteria : null,
    // SD-FDBK-INFRA-LEO-CREATE-PROPOSAL-001 (FR-1): a proposal that declares
    // metadata.depends_on must populate the CANONICAL `dependencies` column — that is
    // what lib/coordinator/claimable-work.cjs and scripts/modules/sd-next/dependency-resolver.js
    // gate BLOCKED/READY on. metadata.depends_on alone is documented (Dependency Field Guide)
    // as ignored by the resolver, so the prior closed whitelist silently dropped child
    // sequencing — forcing manual ordering of the sourcing-engine children. Only set the
    // key when there is at least one normalized dep (preserves dependencies=[] otherwise).
    ...(normalizeDependsOn(proposal.metadata?.depends_on).length > 0
      ? { dependencies: normalizeDependsOn(proposal.metadata?.depends_on) }
      : {}),
    // FR-2: the primary target repo becomes the canonical top-level target_application that the
    // branch-resolver / gate / repo-path resolution read (mirrors the --target-repos flag path).
    ...(proposalTargetRepos ? { target_application: proposalTargetRepos[0] } : {}),
    metadata: {
      // FR-1: full proposal metadata preserved (minus leak-guard keys), then canonical defaults
      // below WIN over any same-named proposal key (source, provenance, validated target_repos, …).
      ...preservedProposalMeta,
      source: 'proposal',
      proposal_file_path: filePath || null,
      proposal_provenance: proposal.provenance || null,
      roadmap_phase: proposal.roadmap_phase || null,
      tier_hint: proposal.tier_hint || null,
      gold_origin: proposal.gold_origin || null,
      necessity: proposal.necessity || null,
      dedup_note: proposal.dedup_note || null,
      // SD-FDBK-INFRA-LEO-CREATE-PROPOSAL-001 (FR-2): carry the proposal's informational
      // dependency/provenance keys through the closed whitelist. engine_child_index and
      // parent_sd_key are ordering/lineage hints the coordinator + reporting consume;
      // depends_on is retained in metadata for back-compat with any reader that still
      // inspects it (the ENFORCED copy lives in the dependencies column above). Each key
      // appears ONLY when the proposal declares it (no coercion/defaulting), preserving
      // the closed-whitelist metadata invariant.
      ...(proposal.metadata?.engine_child_index !== undefined && proposal.metadata?.engine_child_index !== null
        ? { engine_child_index: proposal.metadata.engine_child_index }
        : {}),
      ...(proposal.metadata?.parent_sd_key ? { parent_sd_key: proposal.metadata.parent_sd_key } : {}),
      ...(normalizeDependsOn(proposal.metadata?.depends_on).length > 0
        ? { depends_on: proposal.metadata.depends_on }
        : {}),
      // FR-1a: canonical Adam-origin attribution (the code-enforced producer for FR-1b's
      // sourcing-cadence consumer; see this function's doc comment). Only stamped for an explicit
      // Adam-origin proposal — never coerced/defaulted, so a non-Adam proposal stays unattributed.
      ...(proposal.sourced_by === 'adam' ? { sourced_by: 'adam' } : {}),
      // SD-LEO-INFRA-PROPOSAL-INGEST-REVIEW-FLAGS-001 (FR-1/FR-3): bring the proposal-ingest
      // route to PARITY with the direct-args route (~line 2989) for the review-attestation
      // flags. The attestation is stamped ONLY on an explicit `=== true` — from the proposal's
      // own metadata OR the threaded CLI flag (opts). NEVER coerced/defaulted: a 'true' string,
      // 1, false, or absence all leave the flag UNSET, so a genuinely-unreviewed governed
      // proposal is STILL blocked by GR-MIGRATION-REVIEW / GR-SECURITY-BASELINE. This removes a
      // FALSE block (an already-reviewed proposal), it does NOT weaken the review gate.
      ...(proposal.metadata?.migration_reviewed === true || opts.migrationReviewed === true ? { migration_reviewed: true } : {}),
      ...(proposal.metadata?.security_reviewed === true || opts.securityReviewed === true ? { security_reviewed: true } : {}),
      // SD-LEO-INFRA-PROPOSAL-INGEST-ARCHPLAN-WHITELIST-001: propagate the orchestrator arch-plan
      // PRESENCE keys so GR-ORCHESTRATOR-ARCH-PLAN (a presence check on architecture_plan_ref ||
      // arch_plan_key || arch_key, guardrail-registry.js) passes for an orchestrator proposal that
      // carries a real plan. Without this the closed whitelist stripped them and the guardrail read
      // undefined → BLOCKED, so NO orchestrator proposal could materialize via --from-proposal (parity
      // gap vs the direct-args route + the review flags above). architecture_plan_ref / arch_plan_key /
      // architecture_plan are PURE metadata consumed by the guardrail + reporting — NOT routing keys.
      // CRITICAL: arch_key (and vision_key) are still DELIBERATELY dropped — they drive
      // enrichFromVisionArch's orphan-FK re-activation (see this fn's header + line ~2169); the two
      // ref/plan keys already satisfy the guardrail WITHOUT that risk, so the leak guard is preserved.
      // Each key appears ONLY when the proposal declares it (no coercion/defaulting).
      ...(proposal.metadata?.architecture_plan_ref ? { architecture_plan_ref: proposal.metadata.architecture_plan_ref } : {}),
      ...(proposal.metadata?.arch_plan_key ? { arch_plan_key: proposal.metadata.arch_plan_key } : {}),
      ...(proposal.metadata?.architecture_plan ? { architecture_plan: proposal.metadata.architecture_plan } : {}),
      // FR-2: keep the NORMALIZED/validated target_repos in metadata (overrides the raw preserved
      // value), parallel to the --target-repos flag path which stamps metadata.target_repos.
      ...(proposalTargetRepos ? { target_repos: proposalTargetRepos } : {}),
    },
  };
}

/**
 * SD-FDBK-INFRA-LEO-CREATE-PROPOSAL-001 (FR-1): normalize a proposal's declared
 * depends_on into the CANONICAL dependencies-column shape [{ sd_id: <key> }].
 * Accepts the same loose entry forms the dispatcher's depsArray() tolerates:
 *   - bare SD-key string            "SD-FOO-001"        -> { sd_id: "SD-FOO-001" }
 *   - { sd_id: "SD-FOO-001" }       (canonical)          -> passed through
 *   - { sd_key: "SD-FOO-001" }      (alias)              -> { sd_id: "SD-FOO-001" }
 * Non-string / empty / malformed entries are dropped (fail-soft — a bad dep entry
 * must never crash SD creation). Returns [] for any non-array / nullish input, so a
 * proposal without depends_on yields dependencies=[] (no behavior change). PURE.
 */
export function normalizeDependsOn(dependsOn) {
  if (!Array.isArray(dependsOn)) return [];
  const out = [];
  for (const entry of dependsOn) {
    let key = null;
    if (typeof entry === 'string') key = entry.trim();
    else if (entry && typeof entry === 'object') key = (entry.sd_id || entry.sd_key || '').trim();
    if (key) out.push({ sd_id: key });
  }
  return out;
}

/**
 * Resolve a path or simple glob (basename may contain '*') to a sorted file list.
 * Fail-loud if nothing matches / the file is missing.
 */
function resolveProposalFiles(pathOrGlob) {
  if (!pathOrGlob || typeof pathOrGlob !== 'string') {
    console.error('[INVALID_PROPOSAL] --from-proposal requires a file path or glob (e.g. .prd-payloads/PROPOSAL-*.json)');
    process.exit(1);
  }
  if (pathOrGlob.includes('*')) {
    const dir = dirname(pathOrGlob);
    const pat = basename(pathOrGlob);
    const rx = new RegExp('^' + pat.split('*').map(s => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
    let entries;
    try { entries = readdirSync(dir); } catch (e) {
      console.error(`[INVALID_PROPOSAL] cannot read directory "${dir}": ${e.message}`);
      process.exit(1);
    }
    const matched = entries.filter(f => rx.test(f)).sort().map(f => joinPath(dir, f));
    if (matched.length === 0) {
      console.error(`[INVALID_PROPOSAL] no files match glob "${pathOrGlob}"`);
      process.exit(1);
    }
    return matched;
  }
  if (!existsSync(pathOrGlob)) {
    console.error(`[INVALID_PROPOSAL] file not found: "${pathOrGlob}"`);
    process.exit(1);
  }
  return [pathOrGlob];
}

/**
 * Per-proposal ingest CORE (SD-LEO-INFRA-OPERATOR-SOURCING-DBDIRECT-001): given an
 * already-parsed proposal OBJECT and a string `source` label, run validateProposalShape
 * -> keyExists -> mapProposalToCreateArgs -> (dryRun ? report : createSD). Returns a
 * {sdKey, file, action} row. This is the SINGLE shared path for every ingest route
 * (file, --proposal-b64, --proposal-stdin) so they cannot drift. No FS/argv access here —
 * callers are responsible for materializing the proposal object.
 * @param {object} proposal — parsed proposal object
 * @param {string} source — provenance label (file path, '<proposal-b64>', '<proposal-stdin>')
 * @param {{dryRun?:boolean, deps?:{keyExists?:Function, createSD?:Function}}} options
 */
export async function ingestProposalObject(proposal, source, options = {}) {
  const { dryRun = false, deps = {}, migrationReviewed = false, securityReviewed = false } = options;
  const _keyExists = deps.keyExists || keyExists;
  const _createSD = deps.createSD || createSD;
  // SD-LEO-INFRA-PREMISE-LIVENESS-GATE-SOURCING-001 FR-2: injectable premise-liveness
  // stale-guard (defaults to the real checker; tests inject a stub).
  const _checkPremise = deps.checkPremiseLiveness || checkPremiseLiveness;

  const normalized = validateProposalShape(proposal, source);
  const exists = await _keyExists(normalized.sdKey);
  if (exists) {
    console.log(`⏭️  ${normalized.sdKey} already exists, skipping (${source})`);
    return { sdKey: normalized.sdKey, file: source, action: 'skipped' };
  }

  // SD-LEO-INFRA-PREMISE-LIVENESS-GATE-SOURCING-001 FR-2: re-verify diagnostic /
  // retro-mined premises at SOURCE so a premise already killed by a shipped fix does
  // not materialize (then get cancelled 4 stages later at worker verify-premise). The
  // guard runs ONLY when the proposal opts in via `premise_descriptor`; non-diagnostic
  // proposals are untouched. FAIL-SOFT: any checker error falls through to creation —
  // only a PROVABLY STALE premise is skipped (the checker itself defaults LIVE on doubt).
  if (proposal.premise_descriptor && typeof proposal.premise_descriptor === 'object') {
    try {
      const descriptor = { source, ...proposal.premise_descriptor };
      const verdict = await _checkPremise(descriptor, { supabase: deps.supabase });
      if (verdict && verdict.status === 'STALE') {
        console.log(`⏭️  ${normalized.sdKey} skipped — premise STALE (${verdict.recommendation}) (${source})`);
        for (const e of verdict.evidence || []) console.log(`      • ${e}`);
        return { sdKey: normalized.sdKey, file: source, action: 'skipped-stale', verdict };
      }
    } catch (e) {
      console.warn(`   ⚠️  Premise-liveness check skipped (non-blocking, fail-open): ${e?.message || e}`);
    }
  }
  // FR-2: forward the threaded review-attestation flags (from --migration-reviewed /
  // --security-reviewed on the proposal-ingest CLI routes) to the mapper, which honors them
  // ONLY on an explicit `=== true` (FR-3 guard lives in mapProposalToCreateArgs).
  const args = mapProposalToCreateArgs(normalized, proposal, source, { migrationReviewed, securityReviewed });
  if (dryRun) {
    console.log(`🔎 [dry-run] would create ${args.sdKey} (${args.type}/${args.priority}) — ${args.title}`);
    return { sdKey: normalized.sdKey, file: source, action: 'dry-run' };
  }
  await _createSD(args);
  console.log(`✅ Created DRAFT SD ${args.sdKey} from ${source}`);
  return { sdKey: normalized.sdKey, file: source, action: 'created' };
}

/**
 * --from-proposal ingest: read PROPOSAL-*.json file(s), validate, and create a
 * DRAFT SD per file via the shared ingestProposalObject() core (verbatim key).
 * Idempotent (skips an already-materialized key). --dry-run validates + reports,
 * zero writes.
 * @param {string} pathOrGlob
 * @param {{dryRun?:boolean, deps?:{keyExists?:Function, createSD?:Function, readFile?:Function, resolveFiles?:Function}}} options
 */
export async function createFromProposal(pathOrGlob, options = {}) {
  const { deps = {} } = options;
  const _readFile = deps.readFile || readFileSync;
  const _resolveFiles = deps.resolveFiles || resolveProposalFiles;

  const files = _resolveFiles(pathOrGlob);
  const results = [];
  for (const file of files) {
    let raw, proposal;
    try {
      raw = _readFile(file, 'utf8');
    } catch (e) {
      console.error(`[INVALID_PROPOSAL] ${file}: cannot read file: ${e.message}`);
      process.exit(1);
    }
    try {
      proposal = JSON.parse(raw);
    } catch (e) {
      console.error(`[INVALID_PROPOSAL] ${file}: invalid JSON: ${e.message}`);
      process.exit(1);
    }
    // Delegate to the shared core; the whole `options` (dryRun + deps) carries through.
    results.push(await ingestProposalObject(proposal, file, options));
  }
  return results;
}

/**
 * --proposal-b64 ingest (SD-LEO-INFRA-OPERATOR-SOURCING-DBDIRECT-001): base64-decode a
 * proposal JSON and route the OBJECT through ingestProposalObject(). FILE-FREE — lets an
 * operator-attached session (Adam/coordinator) on main source a DRAFT SD without writing
 * a payload file (which the worktree-hygiene Write guard blocks). base64-on-the-wire is
 * PREFERRED over a raw --proposal-json argv flag because it is immune to the Bash
 * single-quote mangling that defeats inline JSON. Buffer.from(.,'base64') is lenient
 * (never throws on junk — it drops out-of-alphabet bytes), so the post-decode JSON.parse
 * is the load-bearing validator that fails loud on garbage input.
 * @param {string} b64
 * @param {{dryRun?:boolean, deps?:{keyExists?:Function, createSD?:Function}}} options
 */
export async function createFromProposalB64(b64, options = {}) {
  if (!b64 || typeof b64 !== 'string') {
    console.error('[INVALID_PROPOSAL] --proposal-b64 requires a base64-encoded proposal JSON string');
    process.exit(1);
  }
  const raw = Buffer.from(b64, 'base64').toString('utf8');
  let proposal;
  try {
    proposal = JSON.parse(raw);
  } catch (e) {
    console.error(`[INVALID_PROPOSAL] --proposal-b64: invalid JSON after base64 decode: ${e.message}`);
    process.exit(1);
  }
  return [await ingestProposalObject(proposal, '<proposal-b64>', options)];
}

/**
 * Read all of process.stdin as a UTF-8 string (resolves on 'end'). Extracted so
 * --proposal-stdin can inject a fake reader in unit tests (no real pipe needed).
 */
function readStdinUtf8() {
  return new Promise((resolve, reject) => {
    // No piped input (interactive TTY): 'end' would never fire and the process would
    // hang until Ctrl-C. Fail loud instead — the caller surfaces [INVALID_PROPOSAL].
    if (process.stdin.isTTY) {
      reject(new Error('stdin is a TTY (no piped proposal JSON)'));
      return;
    }
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

/**
 * --proposal-stdin ingest (SD-LEO-INFRA-OPERATOR-SOURCING-DBDIRECT-001): read a proposal
 * JSON from stdin and route the OBJECT through ingestProposalObject(). FILE-FREE
 * pipe-based counterpart to --proposal-b64. The stdin reader is injectable
 * (deps.readStdin) so tests need no real pipe. Fails loud on empty stdin / invalid JSON.
 * @param {{dryRun?:boolean, deps?:{keyExists?:Function, createSD?:Function, readStdin?:Function}}} options
 */
export async function createFromProposalStdin(options = {}) {
  const { deps = {} } = options;
  const _readStdin = deps.readStdin || readStdinUtf8;
  let raw;
  try {
    raw = await _readStdin();
  } catch (e) {
    console.error(`[INVALID_PROPOSAL] --proposal-stdin: cannot read stdin: ${e.message}`);
    process.exit(1);
  }
  if (!raw || !raw.trim()) {
    console.error('[INVALID_PROPOSAL] --proposal-stdin: empty stdin (expected a proposal JSON on stdin)');
    process.exit(1);
  }
  let proposal;
  try {
    proposal = JSON.parse(raw);
  } catch (e) {
    console.error(`[INVALID_PROPOSAL] --proposal-stdin: invalid JSON: ${e.message}`);
    process.exit(1);
  }
  return [await ingestProposalObject(proposal, '<proposal-stdin>', options)];
}

// Export for programmatic use (e.g., corrective-sd-generator)
// SD-LEO-INFRA-BUILDDEFAULTSMOKETESTSTEPS-KEYWORD-DETECTOR-001 (FR-4): export buildDefaultSmokeTestSteps for unit-test access.
// SD-LEO-INFRA-AUTOTYPE-INFRA-KEYS-001 (FR-4): export the pure type-default resolvers for unit test.
export { createSD, buildDefaultSmokeTestSteps, inferDefaultSdTypeFromKey, resolveSdType };

// ============================================================================
// CLI Handler
// ============================================================================

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help')) {
    console.log(`
LEO Create SD - Centralized SD Creation

Usage:
  node scripts/leo-create-sd.js --from-uat <test-id>
  node scripts/leo-create-sd.js --from-learn <pattern-id>
  node scripts/leo-create-sd.js --from-feedback <feedback-id>
  node scripts/leo-create-sd.js --from-roadmap-item <roadmap-item-id>
  node scripts/leo-create-sd.js --from-qf <QF-ID>
  node scripts/leo-create-sd.js --from-proposal <path|glob> [--dry-run]
  node scripts/leo-create-sd.js --proposal-b64 <base64> [--dry-run]      # file-free DB-direct sourcing
  cat PROPOSAL.json | node scripts/leo-create-sd.js --proposal-stdin [--dry-run]
  node scripts/leo-create-sd.js --from-plan [path] [--type <type>] [--title "<title>"]
  node scripts/leo-create-sd.js --child <parent-key> [index] [--type <type>] [--title "<title>"]
  node scripts/leo-create-sd.js <source> <type> "<title>"

Sources: ${Object.keys(SD_SOURCES).join(', ')}
Types: ${Object.keys(SD_TYPES).join(', ')}

Flags:
  --yes, -y          Skip confirmation for auto-detected plans
  --type <type>      Override SD type (for --from-plan, --from-feedback, or --child; children never inherit 'orchestrator')
  --title "<title>"  Override title (for --from-plan, --from-feedback, or --child)
  --priority <p>     Override priority for --from-plan (critical|high|medium|low). Default from plan header
                     ## Priority, falling back to "medium" if absent.
  --venture <name>   Generate venture-scoped SD key (SD-{VENTURE}-{SOURCE}-{TYPE}-{SEMANTIC}-{NUM})
  --vision-key <key> Link SD to EVA vision document (stored in metadata, used for vision scoring)
                     Supported in both direct creation AND --from-plan mode.
  --arch-key <key>   Link SD to EVA architecture plan (stored in metadata, used for vision scoring)
                     Supported in both direct creation AND --from-plan mode.
  --migration-reviewed  Set metadata.migration_reviewed=true to satisfy GR-MIGRATION-REVIEW
                        guardrail (required when scope contains migration/schema keywords).
                        Honored on direct, --from-feedback, --child AND the proposal-ingest
                        routes (--from-proposal / --proposal-b64 / --proposal-stdin); on the
                        proposal routes proposal.metadata.migration_reviewed===true also attests.
  --security-reviewed   Set metadata.security_reviewed=true to satisfy GR-SECURITY-BASELINE
                        guardrail (required when scope contains auth/credential/RLS keywords).
                        Honored on the same routes as --migration-reviewed (incl. proposal
                        metadata.security_reviewed===true).
  --scope-slice <JSON>  (--child only) Declare the slice of parent orchestrator scope this
                        child claims. JSON shape: {stages?: number[], deliverable_globs?: string[]}.
                        Example: --scope-slice='{"stages":[18]}'
  --target-repos <list> Set metadata.target_repos[] for cross-repo SDs (comma-separated).
                        Valid values: EHG, EHG_Engineer (case-insensitive; normalized).
                        When set, PR_MERGE_VERIFICATION at LEAD-FINAL scopes its scan
                        to ONLY these repos. Required for SDs spanning both platform repos.
                        Example: --target-repos EHG,EHG_Engineer
                        Pairs with computeReposForSD() at lead-final-approval/gates.js
                        (SD-LEO-INFRA-CROSS-REPO-MERGE-001). Supported in: direct LEO,
                        --from-plan, --child, AND --from-roadmap-item (the latter also sets
                        the promoted SD's target_application to the PRIMARY repo so product
                        roadmap items route to rickfelix/ehg — SD-LEO-INFRA-PRODUCT-PROMOTION-TARGET-REPO-001).
  --dry-run          (--from-proposal / --proposal-b64 / --proposal-stdin) Validate + report
                     would-create SDs; ZERO database writes.
  --proposal-b64 <b64>  File-free DB-direct sourcing: base64-encoded proposal JSON ingested via
                        the same validate -> keyExists -> create core as --from-proposal. PREFERRED
                        for operator-attached (Adam/coordinator) sessions on main — needs NO payload
                        file and NO worktree (base64-on-the-wire is immune to Bash quote mangling).
  --proposal-stdin      File-free DB-direct sourcing via a pipe: read the proposal JSON from stdin.
  --help             Show this help message

Dependency Field Guide:
  The "dependencies" column (JSONB array) is the CORRECT place for SD prerequisites.
  Format: [{"sd_id": "SD-XXX-001"}, {"sd_id": "SD-YYY-002"}]

  This column controls:
    - Whether an SD shows as BLOCKED or READY in sd:next
    - Whether AUTO-PROCEED will skip or process the SD
    - Unresolved dependency warnings in the queue display

  DO NOT put dependency info in the "metadata" field — it will NOT be
  enforced by the queue system. Common mistakes:
    metadata.depends_on, metadata.dependencies, metadata.blocked_by,
    metadata.prerequisite_sds — all ignored by the dependency resolver.

  The only metadata dependency key that IS checked is:
    metadata.blocked_by_sd_key — soft/conditional blocker (single SD key)

Venture Context:
  Venture prefix is resolved in order: --venture flag > VENTURE env var > active session venture.
  When a venture context is active, SD keys are automatically prefixed with the venture name.

Examples:
  node scripts/leo-create-sd.js --from-uat abc123
  node scripts/leo-create-sd.js --from-feedback def456
  node scripts/leo-create-sd.js --from-qf QF-20260424-808           # Escalate Tier-3 quick-fix to SD
  node scripts/leo-create-sd.js --from-plan                              # Auto-detect most recent plan
  node scripts/leo-create-sd.js --from-plan --yes                        # Auto-detect without confirmation
  node scripts/leo-create-sd.js --from-plan ~/.claude/plans/my-plan.md   # Use specific plan
  node scripts/leo-create-sd.js --from-plan --type feature --yes         # Override inferred type
  node scripts/leo-create-sd.js --from-plan --type feature --title "My SD" --yes  # Override both
  node scripts/leo-create-sd.js --child SD-LEO-FEAT-001 0
  node scripts/leo-create-sd.js LEO fix "Login button not working"
  node scripts/leo-create-sd.js LEO infrastructure "Tooling upgrade"

Note: SD keys starting with QF- will be redirected to create-quick-fix.js.
      Guardrails are enforced at both CLI and database level — no bypass available.
`);
    process.exit(0);
  }

  try {
    if (args[0] === '--from-uat') {
      await createFromUAT(args[1]);
    } else if (args[0] === '--from-learn') {
      await createFromLearn(args[1]);
    } else if (args[0] === '--from-feedback') {
      // Parse --type and --title overrides (mirrors --from-plan / --child).
      // The feedback ID is the first non-flag positional after --from-feedback.
      const fbTypeIdx = args.indexOf('--type');
      const fbTitleIdx = args.indexOf('--title');
      const fbFlagValuePositions = new Set(
        [fbTypeIdx !== -1 ? fbTypeIdx + 1 : -1,
         fbTitleIdx !== -1 ? fbTitleIdx + 1 : -1].filter(i => i > 0)
      );
      // QF-20260509-LEO-CREATE-FLAGS: include review flags so they're not
      // mistaken for the feedback ID positional. Closes 8a640d32 sibling parity.
      const fbKnownFlags = new Set(['--from-feedback', '--type', '--title', '--migration-reviewed', '--security-reviewed']);
      const feedbackId = args.find((arg, i) =>
        i > 0 && !arg.startsWith('-') && !fbFlagValuePositions.has(i) && !fbKnownFlags.has(arg)
      ) || args[1];
      await createFromFeedback(feedbackId, {
        typeOverride: fbTypeIdx !== -1 ? args[fbTypeIdx + 1] : null,
        titleOverride: fbTitleIdx !== -1 ? args[fbTitleIdx + 1] : null,
        migrationReviewed: args.includes('--migration-reviewed'),
        securityReviewed: args.includes('--security-reviewed'),
      });
    } else if (args[0] === '--from-roadmap-item') {
      // SD-LEO-INFRA-SOURCING-ENGINE-REGISTER-FIRST-001 (FR-1): promote a roadmap_wave_items row to an
      // SD with the two-way stamp. Mirrors --from-feedback flag parsing (--type/--title/review flags).
      const riTypeIdx = args.indexOf('--type');
      const riTitleIdx = args.indexOf('--title');
      // SD-LEO-INFRA-PRODUCT-PROMOTION-TARGET-REPO-001: --target-repos routes a promoted roadmap
      // item to a product repo (e.g. EHG → rickfelix/ehg), unblocking the 268 product roadmap items
      // that --from-roadmap-item could not target (it forced venturePrefix=null / EHG_Engineer).
      const riTargetReposIdx = args.indexOf('--target-repos');
      const riFlagValuePositions = new Set(
        [riTypeIdx !== -1 ? riTypeIdx + 1 : -1,
         riTitleIdx !== -1 ? riTitleIdx + 1 : -1,
         riTargetReposIdx !== -1 ? riTargetReposIdx + 1 : -1].filter(i => i > 0)
      );
      const riKnownFlags = new Set(['--from-roadmap-item', '--type', '--title', '--migration-reviewed', '--security-reviewed', '--target-repos']);
      const roadmapItemId = args.find((arg, i) =>
        i > 0 && !arg.startsWith('-') && !riFlagValuePositions.has(i) && !riKnownFlags.has(arg)
      ) || args[1];
      await createFromRoadmapItem(roadmapItemId, {
        typeOverride: riTypeIdx !== -1 ? args[riTypeIdx + 1] : null,
        titleOverride: riTitleIdx !== -1 ? args[riTitleIdx + 1] : null,
        migrationReviewed: args.includes('--migration-reviewed'),
        securityReviewed: args.includes('--security-reviewed'),
        targetRepos: riTargetReposIdx !== -1 ? parseTargetReposArg(args[riTargetReposIdx + 1]) : null,
      });
    } else if (args[0] === '--from-qf') {
      // QF-20260701-833 follow-up: honor --security-reviewed on this route too (was
      // previously silently ignored here, unlike --from-feedback/--from-roadmap-item/
      // --child/--from-proposal), so a QF whose DESCRIPTION merely mentions security-
      // adjacent keywords (e.g. "CI DB secrets") isn't unescapably blocked by
      // GR-SECURITY-BASELINE when the actual code change touches no security-sensitive scope.
      await createFromQF(args[1], { securityReviewed: args.includes('--security-reviewed') });
    } else if (args[0] === '--from-proposal') {
      // SD-LEO-INFRA-FROM-PROPOSAL-INGEST-001: materialize PROPOSAL-*.json into DRAFT SDs.
      // path/glob = first non-flag positional after --from-proposal; --dry-run = no writes.
      const dryRun = args.includes('--dry-run');
      // FR-2: --migration-reviewed/--security-reviewed are known flags (not the path positional).
      const fpKnownFlags = new Set(['--from-proposal', '--dry-run', '--migration-reviewed', '--security-reviewed']);
      const proposalArg = args.find((a, i) => i > 0 && !a.startsWith('-') && !fpKnownFlags.has(a)) || args[1];
      await createFromProposal(proposalArg, {
        dryRun,
        migrationReviewed: args.includes('--migration-reviewed'),
        securityReviewed: args.includes('--security-reviewed'),
      });
    } else if (args[0] === '--proposal-b64') {
      // SD-LEO-INFRA-OPERATOR-SOURCING-DBDIRECT-001: file-free DB-direct sourcing.
      // The base64 string is the first non-flag positional (base64 never starts with '-').
      const dryRun = args.includes('--dry-run');
      // FR-2: --migration-reviewed/--security-reviewed are known flags (not the base64 positional).
      const b64KnownFlags = new Set(['--proposal-b64', '--dry-run', '--migration-reviewed', '--security-reviewed']);
      // No `|| args[1]` fallback: if no non-flag positional is present (e.g.
      // `--proposal-b64 --dry-run`), b64Arg stays undefined so createFromProposalB64's
      // guard reports the clear "requires a base64-encoded proposal JSON string" error
      // instead of base64-decoding the literal '--dry-run' flag into junk.
      const b64Arg = args.find((a, i) => i > 0 && !a.startsWith('-') && !b64KnownFlags.has(a));
      await createFromProposalB64(b64Arg, {
        dryRun,
        migrationReviewed: args.includes('--migration-reviewed'),
        securityReviewed: args.includes('--security-reviewed'),
      });
    } else if (args[0] === '--proposal-stdin') {
      // SD-LEO-INFRA-OPERATOR-SOURCING-DBDIRECT-001: file-free DB-direct sourcing via a pipe.
      const dryRun = args.includes('--dry-run');
      await createFromProposalStdin({
        dryRun,
        migrationReviewed: args.includes('--migration-reviewed'),
        securityReviewed: args.includes('--security-reviewed'),
      });
    } else if (args[0] === '--from-plan') {
      // Check for --yes flag (skip confirmation for auto-detect)
      const hasYesFlag = args.includes('--yes') || args.includes('-y');
      // Parse --type override (e.g., --from-plan --type feature)
      const typeIdx = args.indexOf('--type');
      const typeOverride = typeIdx !== -1 ? args[typeIdx + 1] : null;
      // Parse --title override (e.g., --from-plan --title "My Title")
      const titleIdx = args.indexOf('--title');
      const titleOverride = titleIdx !== -1 ? args[titleIdx + 1] : null;
      // Parse --priority override (e.g., --from-plan --priority high). Validated against enum below.
      const priorityIdx = args.indexOf('--priority');
      const priorityOverrideRaw = priorityIdx !== -1 ? args[priorityIdx + 1] : null;
      let priorityOverride = null;
      if (priorityOverrideRaw) {
        const normalized = priorityOverrideRaw.toLowerCase();
        if (!['critical', 'high', 'medium', 'low'].includes(normalized)) {
          console.error(`\n❌ Invalid --priority value: "${priorityOverrideRaw}". Valid: critical, high, medium, low`);
          process.exit(1);
        }
        priorityOverride = normalized;
      }
      // Parse --vision-key / --arch-key (link plan-created SD to registered vision/arch)
      const visionKeyIdx = args.indexOf('--vision-key');
      const visionKey = visionKeyIdx !== -1 ? args[visionKeyIdx + 1] : null;
      const archKeyIdx = args.indexOf('--arch-key');
      const archKey = archKeyIdx !== -1 ? args[archKeyIdx + 1] : null;
      // Parse boolean review flags (satisfy GR-MIGRATION-REVIEW / GR-SECURITY-BASELINE)
      const migrationReviewed = args.includes('--migration-reviewed');
      const securityReviewed = args.includes('--security-reviewed');
      // QF-20260509-LEO-CREATE-PLAN-DUP-GUARD: override the same-plan-within-24h refusal
      const forceCreate = args.includes('--force-create');
      // SD-LEO-INFRA-LEO-CREATE-CROSS-001: --target-repos for cross-repo SDs
      const targetReposIdxPlan = args.indexOf('--target-repos');
      const targetReposPlan = targetReposIdxPlan !== -1 ? parseTargetReposArg(args[targetReposIdxPlan + 1]) : null;
      // Path is any arg that isn't a flag or a flag's value
      const flagValuePositions = new Set(
        [
          typeIdx !== -1 ? typeIdx + 1 : -1,
          titleIdx !== -1 ? titleIdx + 1 : -1,
          priorityIdx !== -1 ? priorityIdx + 1 : -1,
          visionKeyIdx !== -1 ? visionKeyIdx + 1 : -1,
          archKeyIdx !== -1 ? archKeyIdx + 1 : -1,
          targetReposIdxPlan !== -1 ? targetReposIdxPlan + 1 : -1,
        ].filter(i => i > 0)
      );
      const knownPlanFlags = new Set([
        '--yes', '-y', '--type', '--title', '--priority', '--from-plan',
        '--vision-key', '--arch-key', '--migration-reviewed', '--security-reviewed',
        '--target-repos', '--force-create'
      ]);
      const planPath = args.find((arg, i) =>
        i > 0 && !arg.startsWith('-') && !flagValuePositions.has(i) && !knownPlanFlags.has(arg)
      ) || null;
      await createFromPlan(planPath, hasYesFlag, {
        typeOverride,
        titleOverride,
        priorityOverride,
        visionKey,
        archKey,
        migrationReviewed,
        securityReviewed,
        targetRepos: targetReposPlan,
        forceCreate,
      });
    } else if (args[0] === '--child') {
      // Parse --type and --title overrides for child creation
      const childOverrides = {};
      const childTypeIdx = args.indexOf('--type');
      if (childTypeIdx !== -1 && args[childTypeIdx + 1]) {
        childOverrides.type = args[childTypeIdx + 1];
      }
      const childTitleIdx = args.indexOf('--title');
      if (childTitleIdx !== -1 && args[childTitleIdx + 1]) {
        childOverrides.title = args[childTitleIdx + 1];
      }
      // Parse review flags for child creation (GR-MIGRATION-REVIEW / GR-SECURITY-BASELINE)
      if (args.includes('--migration-reviewed')) childOverrides.migrationReviewed = true;
      if (args.includes('--security-reviewed')) childOverrides.securityReviewed = true;
      // SD-LEO-INFRA-LEO-CREATE-CROSS-001: --target-repos for cross-repo child SDs
      const childTargetReposIdx = args.indexOf('--target-repos');
      if (childTargetReposIdx !== -1 && args[childTargetReposIdx + 1]) {
        childOverrides.targetRepos = parseTargetReposArg(args[childTargetReposIdx + 1]);
      }
      // Parse --vision-key / --arch-key for child creation
      const childVisionKeyIdx = args.indexOf('--vision-key');
      if (childVisionKeyIdx !== -1 && args[childVisionKeyIdx + 1]) {
        childOverrides.visionKey = args[childVisionKeyIdx + 1];
      }
      const childArchKeyIdx = args.indexOf('--arch-key');
      if (childArchKeyIdx !== -1 && args[childArchKeyIdx + 1]) {
        childOverrides.archKey = args[childArchKeyIdx + 1];
      }
      // Parse --scope-slice for child creation (SD-LEO-PROTOCOL-INFRASTRUCTURE-RELATIONSHIPAWARE-ORCH-001-A, US-001)
      // Accepts both `--scope-slice=<json>` and `--scope-slice <json>` forms.
      let childScopeSliceIdx = -1;
      let childScopeSliceRaw = null;
      for (let i = 0; i < args.length; i++) {
        if (args[i] === '--scope-slice') {
          childScopeSliceIdx = i;
          childScopeSliceRaw = args[i + 1];
          break;
        }
        if (args[i].startsWith('--scope-slice=')) {
          childScopeSliceIdx = i;
          childScopeSliceRaw = args[i].slice('--scope-slice='.length);
          break;
        }
      }
      if (childScopeSliceRaw != null) {
        try {
          const parsed = JSON.parse(childScopeSliceRaw);
          if (typeof parsed !== 'object' || parsed == null || Array.isArray(parsed)) {
            throw new Error('scope_slice must be a JSON object');
          }
          if (parsed.stages !== undefined && !Array.isArray(parsed.stages)) {
            throw new Error('scope_slice.stages must be an array of numbers');
          }
          if (parsed.deliverable_globs !== undefined && !Array.isArray(parsed.deliverable_globs)) {
            throw new Error('scope_slice.deliverable_globs must be an array of glob strings');
          }
          childOverrides.scopeSlice = parsed;
        } catch (err) {
          console.error(`\n❌ Invalid --scope-slice JSON: ${err.message}`);
          console.error(`   Received: ${childScopeSliceRaw}`);
          console.error('   Expected shape: {"stages": [18], "deliverable_globs": ["src/stage18/**"]}');
          process.exit(1);
        }
      }
      // args[1] = parent key, args[2] = index (skip flag positions)
      const childParentKey = args[1];
      const flagValuePositionsChild = new Set(
        [childTypeIdx, childTitleIdx, childVisionKeyIdx, childArchKeyIdx, childTargetReposIdx]
          .filter(i => i !== -1).map(i => i + 1)
      );
      // --scope-slice value (next arg) is also a flag value to skip when finding the index arg
      if (childScopeSliceIdx !== -1 && args[childScopeSliceIdx] === '--scope-slice') {
        flagValuePositionsChild.add(childScopeSliceIdx + 1);
      }
      const childIndexArg = args.find((a, i) =>
        i >= 2 && !a.startsWith('-') && !flagValuePositionsChild.has(i) && i !== childTypeIdx + 1 && i !== childTitleIdx + 1
      );
      // QF-20260610-473: pass null when no explicit index (so an EXPLICIT 0 is honored
      // and the absent case derives from max existing suffix instead of count).
      await createChild(childParentKey, childIndexArg != null ? parseInt(childIndexArg, 10) : null, childOverrides);
    } else {
      // Direct creation: <source> <type> "<title>"
      // Detect unknown flags to prevent silent corruption (SD-LEO-FIX-CREATE-ARGS-001)
      // QF-20260509-LEO-CREATE-FLAGS: --migration-reviewed / --security-reviewed / --yes / -y
      // are now valid in direct-args mode (closes 8a640d32 sibling-parity gap with --from-plan).
      const knownDirectFlags = new Set([
        '--venture', '--vision-key', '--arch-key', '--target-repos',
        '--migration-reviewed', '--security-reviewed', '--yes', '-y'
      ]);
      const unknownFlags = args.filter(a => a.startsWith('-') && !knownDirectFlags.has(a));
      if (unknownFlags.length > 0) {
        console.error('\n❌ Unknown flag(s): ' + unknownFlags.join(', '));
        console.error('   Direct creation supports: <source> <type> "<title>" [--venture <name>]');
        console.error('   Did you mean one of these?');
        console.error('     --from-plan [path] [--type <type>] [--title "<title>"]');
        console.error('     --from-feedback <id>');
        console.error('     --from-qf <QF-ID>');
        console.error('     --from-learn <pattern-id>');
        console.error('     --from-uat <test-id>');
        process.exit(1);
      }

      const [source, type, ...titleParts] = args;
      // Strip flags and their values from the title (SD-DISTILLTOBRAINSTORM quality fix)
      // Without this, --vision-key VALUE --arch-key VALUE leak into the title text
      const flagsWithValues = new Set(['--venture', '--vision-key', '--arch-key', '--target-repos']);
      const cleanedTitleParts = [];
      for (let i = 0; i < titleParts.length; i++) {
        if (flagsWithValues.has(titleParts[i])) {
          i++; // skip the flag's value too
        } else if (!titleParts[i].startsWith('--')) {
          cleanedTitleParts.push(titleParts[i]);
        }
      }
      const title = cleanedTitleParts.join(' ');

      if (!source || !type || !title) {
        console.error('Usage: leo-create-sd.js <source> <type> "<title>"');
        process.exit(1);
      }

      // Phase 0 exemption: vision + arch keys mean upstream brainstorm already
      // performed intent discovery, scoping, and out-of-scope contract to a
      // higher standard than Phase 0 alone. Skip the gate.
      const hasVisionKey = args.includes('--vision-key');
      const hasArchKey = args.includes('--arch-key');
      const phase0Exempt = hasVisionKey && hasArchKey;

      // SD-LEO-FIX-PHASE0-INTEGRATION-001: Phase 0 Intent Discovery Gate
      // Check if Phase 0 is required for this SD type before proceeding
      const gateResult = phase0Exempt
        ? { action: 'proceed', required: false, message: 'Phase 0 exempt: vision + arch keys provided from brainstorm pipeline.' }
        : checkGate(type);

      if (phase0Exempt) {
        console.log('✓ Phase 0 exempt: vision + arch keys provided (upstream brainstorm governance)');
      }

      if (gateResult.action === 'start') {
        // Phase 0 required but not started
        console.log('\n' + '═'.repeat(60));
        console.log('🔮 PHASE 0 INTENT DISCOVERY REQUIRED');
        console.log('═'.repeat(60));
        console.log(`   SD Type: ${type}`);
        console.log(`   Title: ${title}`);
        console.log('');
        console.log('   Feature and enhancement SDs require Phase 0 Intent Discovery');
        console.log('   to ensure proper scoping and crystallized requirements.');
        console.log('');
        console.log('📋 To start Phase 0:');
        console.log('   Use /leo create interactively to begin the discovery process.');
        console.log('   The discovery will ask clarifying questions one at a time.');
        console.log('');
        console.log('   After Phase 0 completes, run this command again.');
        console.log('═'.repeat(60));
        process.exit(0);
      }

      if (gateResult.action === 'resume') {
        // Phase 0 in progress but not complete
        const status = getPhase0Status();
        console.log('\n' + '═'.repeat(60));
        console.log('🔮 PHASE 0 IN PROGRESS');
        console.log('═'.repeat(60));
        console.log(`   Questions answered: ${status.questionsAnswered}/${status.minQuestions} minimum`);
        console.log(`   Has intent summary: ${status.hasIntentSummary ? '✓' : '✗'}`);
        console.log(`   Out of scope items: ${status.outOfScopeCount}/${status.minOutOfScope} minimum`);
        console.log(`   Crystallization: ${(status.crystallizationScore * 100).toFixed(0)}% (need ${(status.threshold * 100).toFixed(0)}%)`);
        console.log('');
        console.log('📋 To continue Phase 0:');
        console.log('   Use /leo create interactively to continue the discovery process.');
        console.log('');
        console.log('   To reset and start over: node scripts/phase-0-cli.js reset');
        console.log('═'.repeat(60));
        process.exit(0);
      }

      // Vision Readiness Rubric: Unified routing (QF / Direct SD / Vision-First)
      // Subsumes triage gate — evaluates scope, novelty, vision coverage, decomposition
      try {
        // Parse flags that trigger exemption
        const visionKeyIdx = args.indexOf('--vision-key');
        const rubricVisionKey = visionKeyIdx !== -1 ? args[visionKeyIdx + 1] : null;
        const archKeyIdx = args.indexOf('--arch-key');
        const rubricArchKey = archKeyIdx !== -1 ? args[archKeyIdx + 1] : null;

        // Get LOC estimate from triage gate for dimension scoring
        let locEstimate = 0;
        try {
          const triageResult = await runTriageGate({ title, description: title, type, source: 'interactive' }, supabase);
          locEstimate = triageResult.estimatedLoc || 0;
        } catch { /* LOC estimate is optional — rubric works without it */ }

        const rubricResult = await evaluateVisionReadiness({
          title,
          description: title,
          type,
          source: 'interactive',
          estimatedLoc: locEstimate,
          visionKey: rubricVisionKey,
          archKey: rubricArchKey,
        });

        if (rubricResult.route !== 'EXEMPT') {
          console.log('\n' + formatRubricResult(rubricResult));

          if (rubricResult.route === 'QUICK_FIX') {
            console.log('\n   💡 Quick Fix recommended:');
            console.log(`      node scripts/create-quick-fix.js --title "${title}" --type ${type}`);
            console.log('   Continuing with full SD creation...\n');
          } else if (rubricResult.route === 'VISION_FIRST') {
            console.log('\n   💡 Vision-First pipeline recommended:');
            console.log('      Start with /brainstorm to create a vision document,');
            console.log('      then architecture plan, then orchestrator + children.');
            console.log('   Continuing with direct SD creation...\n');
          }
        }
      } catch (rubricErr) {
        // Non-fatal: rubric failure should not block SD creation
        console.warn(`[vision-readiness] Warning: ${rubricErr.message}`);
      }

      // Phase 0 not required or complete - proceed with SD creation
      // Check if Phase 0 artifacts are available to enrich metadata
      let phase0Metadata = {};
      if (gateResult.action === 'proceed' && gateResult.session) {
        // Session exists and is complete - extract artifacts
        const artifacts = getArtifacts(gateResult.session);
        phase0Metadata = {
          phase_0: {
            intent_summary: artifacts.intentSummary,
            out_of_scope: artifacts.outOfScope,
            crystallization_score: artifacts.crystallizationScore,
            questions_answered: artifacts.questionsAnswered,
            ehg_stage: artifacts.ehgStage,
            completed_at: new Date().toISOString()
          }
        };
        console.log('\n✓ Phase 0 artifacts loaded into SD metadata');
      }

      // Resolve venture context (SD-LEO-INFRA-SD-NAMESPACING-001)
      // Check for --venture flag in args
      const ventureArgIdx = args.indexOf('--venture');
      const cliVenture = ventureArgIdx !== -1 ? args[ventureArgIdx + 1] : null;
      const venturePrefix = await resolveVenturePrefix(cliVenture, type);

      // Parse --vision-key and --arch-key flags (SD-MAN-INFRA-AUTOMATE-BRAINSTORM-PIPELINE-002)
      const visionKeyIdx = args.indexOf('--vision-key');
      const visionKey = visionKeyIdx !== -1 ? args[visionKeyIdx + 1] : null;
      const archKeyIdx = args.indexOf('--arch-key');
      const archKey = archKeyIdx !== -1 ? args[archKeyIdx + 1] : null;
      // SD-LEO-INFRA-LEO-CREATE-CROSS-001: --target-repos for cross-repo SDs
      const targetReposIdx = args.indexOf('--target-repos');
      const targetRepos = targetReposIdx !== -1 ? parseTargetReposArg(args[targetReposIdx + 1]) : null;

      // FR-003: Auto-route to orchestrator creator when arch key has phases
      // SD-FDBK-REFAC-LEO-CREATE-003-001: decision logic extracted to
      // scripts/modules/leo-create-sd/auto-route-decider.js. Layers A
      // (locked_decisions intent gate) and B (PR-staged disambiguator) prevent
      // misclassification of single-SD intent as orchestrator (witnessed on
      // SD-GVOS-COMPOSER-SNAPSHOTLOCKED-REGISTRY-ORCH-001).
      if (visionKey && archKey) {
        let archPlan = null;
        let brainstormSession = null;
        try {
          const sb = createSupabaseServiceClient();
          const { data: archPlanData, error: archPlanErr } = await sb
            .from('eva_architecture_plans')
            .select('content, sections')
            .eq('plan_key', archKey)
            .single();
          if (archPlanErr) {
            if (archPlanErr.code === 'PGRST116') {
              // Not found: likely a typo in --arch-key. Warn, skip FR-003, continue.
              console.warn(`\n⚠️  archPlan not found for --arch-key='${archKey}', skipping FR-003 auto-route.`);
              console.warn('   Verify spelling, or omit --arch-key to skip the auto-route check.');
              archPlan = null;
            } else {
              throw archPlanErr;
            }
          } else {
            archPlan = archPlanData;
          }

          // Reverse-lookup the brainstorm session that authored this plan key.
          // Uses metadata->>plan_key (no FK exists; JSONB-only linkage). .limit(2)
          // so we can distinguish 0 / 1 / 2+ rows (conservative bias on ambiguity).
          if (archPlan) {
            const { data: bsRows } = await sb
              .from('brainstorm_sessions')
              .select('metadata')
              .eq('metadata->>plan_key', archKey)
              .limit(2);
            brainstormSession = Array.isArray(bsRows) && bsRows.length === 1 ? bsRows[0] : null;
          }
        } catch (routeErr) {
          // QF-20260409-561 (P1): Fail loud; silent fallback violated feedback_auto_decompose_sd_hierarchy.
          // SD-FDBK-REFAC-LEO-CREATE-003-001 FR-5: PGRST116 was already handled above.
          console.error(`\n❌ Orchestrator auto-routing FAILED: ${routeErr.message}`);
          console.error(`   Check orphans: SELECT sd_key FROM strategic_directives_v2 WHERE metadata->>'vision_key'='${visionKey}';`);
          console.error('   Clean via database-agent, then re-run (create-orchestrator-from-plan.js will resume).');
          process.exit(1);
        }

        const { shouldAutoRouteToOrchestrator } = await import('./modules/leo-create-sd/auto-route-decider.js');
        const decision = shouldAutoRouteToOrchestrator({
          archPlan,
          brainstormSession,
          archKey,
          visionKey,
          title,
          options: { forceOrchestrator: args.includes('--force-orchestrator') },
        });

        // FR-4: emit a single structured telemetry line on every decision.
        console.log(`[AUTO-ROUTE-DECISION] ${JSON.stringify(decision.telemetry)}`);

        if (decision.route === 'orchestrator' && (decision.telemetry.structured_phase_count > 0 || decision.telemetry.content_phase_count >= 2)) {
          console.log(`\n🔄 Auto-routing to orchestrator creator (${decision.telemetry.structured_phase_count || decision.telemetry.content_phase_count} phases detected)...`);
          try {
            const { execSync } = await import('child_process');
            // QF-20260524-566 / feedback 0ee3c3b8 Bug 2: forward --target-repos so the
            // orchestrator + auto-created children inherit metadata.target_repos.
            const cmd = buildOrchestratorCmd({ visionKey, archKey, title, targetRepos });
            execSync(cmd, { stdio: 'inherit', cwd: process.cwd() });
            process.exit(0);
          } catch (execErr) {
            console.error(`\n❌ Orchestrator auto-routing FAILED: ${execErr.message}`);
            console.error(`   Check orphans: SELECT sd_key FROM strategic_directives_v2 WHERE metadata->>'vision_key'='${visionKey}';`);
            console.error('   Clean via database-agent, then re-run (create-orchestrator-from-plan.js will resume).');
            process.exit(1);
          }
        } else if (decision.route === 'single' && (decision.layer_a_signal !== 'absent' || decision.layer_b_signal !== 'absent')) {
          // FR-4 UX hint: explain the single-SD route + how to override.
          console.error('↪ Single-SD route taken. To force orchestrator: re-run with --force-orchestrator,');
          console.error('  or set LEO_AUTO_ROUTE_LAYER_A=off LEO_AUTO_ROUTE_LAYER_B=off to bypass both gates.');
        }
        // else: fall through to normal single-SD creation flow.

        // Advisory: warn about uncovered architecture phases (SD-LEO-INFRA-ARCHITECTURE-PHASE-COVERAGE-001)
        try {
          const sb2 = createSupabaseServiceClient();
          const { data: archPlanSections } = await sb2
            .from('eva_architecture_plans')
            .select('sections')
            .eq('plan_key', archKey)
            .single();
          const phases = archPlanSections?.sections?.implementation_phases;
          if (phases && Array.isArray(phases)) {
            const uncovered = phases.filter(p => !p.covered_by_sd_key);
            if (uncovered.length > 0) {
              console.log('\n⚠️  Architecture Phase Coverage Warning:');
              console.log(`   ${uncovered.length}/${phases.length} phase(s) have no assigned SD:`);
              for (const p of uncovered) {
                console.log(`   ❌ Phase ${p.number}: ${p.title}`);
              }
              console.log('   Assign SDs before LEAD-TO-PLAN to pass the phase coverage gate.\n');
            }
          }
        } catch { /* Advisory only — continue regardless */ }
      }

      const sdKey = await generateSDKey({ source, type, title, venturePrefix });

      // Quick-fix QF-20260312-516: Enrich SD fields from vision/arch documents
      // QF-20260509-171 (closes feedback 92ff36a1): refuse INSERT when a supplied
      // --vision-key/--arch-key resolves to no row in eva_vision_documents /
      // eva_architecture_plans. The metadata.vision_key/arch_key fields are an
      // FK-by-string, so an unresolved key would produce an orphan SD whose
      // strategic provenance LEAD evaluators cannot trace.
      const enrichResult = await enrichFromVisionArch(visionKey, archKey, supabase);
      if (enrichResult.missing.vision) {
        console.error(`\n❌ --vision-key '${visionKey}' not found in eva_vision_documents`);
        console.error('   Writing it to metadata would create an orphan FK-by-string with no source row.');
        console.error('   Verify the key, or omit --vision-key.\n');
        process.exit(1);
      }
      if (enrichResult.missing.arch) {
        console.error(`\n❌ --arch-key '${archKey}' not found in eva_architecture_plans`);
        console.error('   Writing it to metadata would create an orphan FK-by-string with no source row.');
        console.error('   Verify the key, or omit --arch-key.\n');
        process.exit(1);
      }
      const enriched = enrichResult.enriched;
      if (enriched) {
        console.log('✓ SD fields enriched from vision/architecture documents');
      }

      // SD-LEO-INFRA-MULTI-REPO-ROUTING-001: Resolve target_application from --venture flag
      const ventureConfig = cliVenture ? getVentureConfig(cliVenture) : null;
      const targetApp = ventureConfig?.name || cliVenture || null;

      // QF-20260509-LEO-CREATE-FLAGS: honor --migration-reviewed / --security-reviewed
      // in direct-args mode (closes 8a640d32 sibling parity with --from-plan / --from-feedback).
      const directMigrationReviewed = args.includes('--migration-reviewed');
      const directSecurityReviewed = args.includes('--security-reviewed');

      await createSD({
        sdKey,
        title,
        description: enriched?.description || title,
        type,
        rationale: enriched?.rationale || 'Created via /leo create',
        success_criteria: enriched?.success_criteria || null,
        key_changes: enriched?.key_changes || null,
        target_application: targetApp,
        metadata: {
          source: source.toLowerCase(),
          ...phase0Metadata,
          ...(visionKey && { vision_key: visionKey }),
          ...(archKey && { arch_key: archKey }),
          ...(enriched?.scope && { scope: enriched.scope }),
          ...(targetRepos && { target_repos: targetRepos }),
          ...(directMigrationReviewed ? { migration_reviewed: true } : {}),
          ...(directSecurityReviewed ? { security_reviewed: true } : {})
        }
      });
    }
    // Exit cleanly so fire-and-forget vision scoring doesn't block the process.
    // Without this, Node waits for the detached scoreSDAtConception() HTTP request,
    // causing the CLI to hang and users to retry — creating duplicate SDs.
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

if (isMainModule(import.meta.url)) {
  main();
}
