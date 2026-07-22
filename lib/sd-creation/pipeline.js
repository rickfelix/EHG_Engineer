/**
 * SD-ARCH-HOTSPOT-LEO-CREATE-001: shared SD-creation core, extracted VERBATIM from
 * scripts/leo-create-sd.js (the 3,499-line hotspot). Contains the enrich/validate helpers
 * (buildDefault* family, mapToDbType, resolveSdType, inheritStrategicFields, mapPriority),
 * the venture-prefix resolver, the conception-time vision pre-screen, and createSD itself.
 *
 * ONE sanctioned behavior change (per the refactor SD): hard exits inside this library
 * is converted to {ok,error} returns —
 *   createSD(options) resolves to:
 *     { ok: true,  sd }                                        on success
 *     { ok: true,  done: true, exitCode: 0, code, message }    former early-exit(0) paths
 *     { ok: false, error, code, exitCode }                     former exit(1) paths
 * The CLI (scripts/leo-create-sd.js) maps these back to the historical exit codes;
 * createSDOrThrow preserves the historical programmatic contract (row on success,
 * throw on failure) for importers of the scripts/leo-create-sd.js shim.
 */

import { randomUUID } from 'crypto';
import { supabase } from './context.js';
import { normalizeVenturePrefix } from '../../scripts/modules/sd-key-generator.js';
import { VentureContextManager } from '../eva/venture-context-manager.js';
import { getCurrentVenture, getVentureConfig } from '../venture-resolver.js';
import { routeWorkItem } from '../utils/work-item-router.js';
import { scanMetadataForMisplacedDependencies } from '../../scripts/modules/sd-next/dependency-resolver.js';
import { scoreSD } from '../../scripts/eva/vision-scorer.js';
import { trackWriteSource } from '../eva/cli-write-gate.js';
// SD-LEO-INFRA-RECONCILE-VENTURE-BUILD-001 (FR-5) + SD-FDBK-INFRA-KEY-GENERATOR-LEAKS-001:
// shared no-venture classifier — guards the applications auto-register AND the venture-prefix
// resolver so engineering/governance work never inherits a spurious venture prefix.
import { isLegitimateNoVenture } from '../eva/bridge/sd-router.js';
import { deriveSdFunctionalRequirements } from '../sd/derive-functional-requirements.js';
import { validateWaveDisposition, applyWaveDisposition } from '../roadmap/wave-disposition.js';
import { validateSDFields } from '../../scripts/modules/validate-sd-fields.js';
// SD-LEO-INFRA-SOURCING-ENGINE-REGISTER-FIRST-001: pure register-first helpers (FR-2 warn-only decision).
import { shouldWarnRegisterFirst } from '../sourcing-engine/register-first.js';
// SD-LEO-INFRA-SD-AUTHORING-TARGET-AUTODETECT-001: path-based target detector
import { detectFromKeyChanges } from '../../scripts/modules/handoff/executors/lead-to-plan/gates/target-application.js';
import { assertValidSdType } from '../sd-type-enum.js';

// SD-LEO-INFRA-VISION-KEY-STAMP-AT-SD-CREATION-001 (L7, Vision Loop-Completeness Map
// @ f2b64a94): the canonical, chairman-approved EHG L1 vision (eva_vision_documents,
// status='active', chairman_approved=true). Used as the default vision_key stamp when
// a caller doesn't declare one — see the createSD gap-fill block below.
const DEFAULT_VISION_KEY = 'VISION-EHG-L1-001';

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
export function inheritStrategicFields(parent) {
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
export function mapPriority(feedbackPriority) {
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
export function mapToDbType(userType) {
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
    corrective: 'infrastructure', // QF-20260722-851: 'corrective' rejected by DB, no canonical type was ever added for it
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
export function inferDefaultSdTypeFromKey(sdKey) {
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
export function resolveSdType(rawType, sdKey) {
  return rawType || inferDefaultSdTypeFromKey(sdKey) || 'feature';
}

/**
 * Build default success_metrics based on SD type and title
 * Ensures validator requirements (3+ items with {metric, target}) are met
 */
export function buildDefaultSuccessMetrics(type, _title) {
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
export function buildDefaultStrategicObjectives(type, title) {
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
export function buildDefaultKeyChanges(type, title) {
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
export function buildDefaultSmokeTestSteps(type, title, scope) {
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
export function buildDefaultSuccessCriteria(type, _title) {
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
 *
 * SD-ARCH-HOTSPOT-LEO-CREATE-001 (sanctioned exit→return conversion): every former
 * hard-exit site in this function now RETURNS — the exact console/error output at each
 * site is unchanged; only the process-kill became a structured result the caller maps.
 * Returns {ok:true, sd} | {ok:true, done:true, ...} | {ok:false, error, code, exitCode}.
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
    // SD-LEO-INFRA-ROADMAP-FOLD-SEAM-001: orchestrator parents are plan-affecting
    // events — creation requires an explicit wave disposition ({ waveId } or
    // { noWave: reason }); enforced below once dbType resolves.
    wave_disposition = null,
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
    // SD-ARCH-HOTSPOT-LEO-CREATE-001: was a hard exit(0) — early-exit(0) success
    // semantics preserved via a done-result the CLI maps to exit 0.
    return { ok: true, done: true, exitCode: 0, code: 'QF_PREFIX_REDIRECT', message: 'Quick-fix prefix detected — redirected to the Quick-Fix workflow' };
  }

  // Map user-friendly type to valid database sd_type
  const dbType = mapToDbType(type);

  // SD-LEO-INFRA-ROADMAP-FOLD-SEAM-001 (FR-2): an orchestrator parent is a
  // plan-affecting event — it MUST carry an explicit wave disposition
  // (--wave <id> | --no-wave "<reason>" on the CLI; wave_disposition option
  // programmatically). Validated before any insert; the verdict rides
  // metadata.wave_disposition. Explicit-never-default: silent non-disposition
  // is the defect this closes (roadmap frozen 26 days, nine waveless
  // ratified workstreams). Children/non-orchestrators are unchanged.
  let waveVerdict = null;
  if (dbType === 'orchestrator') {
    waveVerdict = validateWaveDisposition(wave_disposition);
    metadata.wave_disposition = waveVerdict;
  }

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
  // (naming the field and the plan section it expected) instead of letting a generic
  // default slip through to a downstream handoff gate. Non-blocking; creation continues. Only
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
    const { getVisionWatchPoints } = await import('../../scripts/vision-delta-aggregator.js');
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
    const guardrailRegistry = await import('../governance/guardrail-registry.js');
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
      // SD-ARCH-HOTSPOT-LEO-CREATE-001: was a hard exit(1) — the CLI maps this to exit 1.
      return { ok: false, error: 'Guardrail violation — SD creation blocked', code: 'GUARDRAIL_VIOLATION', exitCode: 1 };
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
    const { validateCascade } = await import('../../scripts/modules/governance/cascade-validator.js');
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
      // SD-ARCH-HOTSPOT-LEO-CREATE-001: was a hard exit(1) — the CLI maps this to exit 1.
      return { ok: false, error: 'Cascade violation — SD creation blocked', code: 'CASCADE_VIOLATION', exitCode: 1 };
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
  //
  // QF-20260704-717: --min-tier-rank/--min-tier-rank-reason let a caller EXPLICITLY set a higher
  // floor with a recorded reason (throws loudly if the reason is missing); absent that, the
  // no-signal case (the common --from-plan shape) stamps the fleet-claimable baseline instead of
  // the fail-safe-up ladder top, so a signal-less SD is never stranded unclaimable-by-construction.
  try {
    if (!Number.isFinite(Number(sdData.metadata?.min_tier_rank))) {
      const cliArgs = process.argv.slice(2);
      const explicitRankIdx = cliArgs.indexOf('--min-tier-rank');
      const explicitReasonIdx = cliArgs.indexOf('--min-tier-rank-reason');
      // SD-LEO-INFRA-HOLD-STATE-CONTRACT-001 (FR-4): optional hold-state-contract stamp
      // siblings on the explicit-override path. Adversarial review at ship-gate found the
      // original wiring stopped at stampPayloadForCreation() (DB-free by design) and never
      // called checkExplicitTierRankStamp() from a real caller -- meaning enforce mode
      // would never actually reject an incomplete override, and observe mode would never
      // log a calibration row, for this surface. Wired here, the one production call site.
      const explicitOwnerIdx = cliArgs.indexOf('--min-tier-rank-owner');
      const explicitReviewAtIdx = cliArgs.indexOf('--min-tier-rank-review-at');
      const explicitReleaseConditionIdx = cliArgs.indexOf('--min-tier-rank-release-condition');
      const explicitRank = explicitRankIdx !== -1 ? Number(cliArgs[explicitRankIdx + 1]) : null;
      const explicitReason = explicitReasonIdx !== -1 ? cliArgs[explicitReasonIdx + 1] : null;
      const explicitOwner = explicitOwnerIdx !== -1 ? cliArgs[explicitOwnerIdx + 1] : null;
      const explicitReviewAt = explicitReviewAtIdx !== -1 ? cliArgs[explicitReviewAtIdx + 1] : null;
      const explicitReleaseCondition = explicitReleaseConditionIdx !== -1 ? cliArgs[explicitReleaseConditionIdx + 1] : null;
      const writingSessionId = process.env.CLAUDE_SESSION_ID || null;
      const { stampPayloadForCreation, checkExplicitTierRankStamp } = await import('../fleet/sd-tier-rank.mjs');
      sdData.metadata = {
        ...sdData.metadata,
        ...stampPayloadForCreation(sdData, {
          explicitRank, explicitReason, explicitOwner, explicitReviewAt, explicitReleaseCondition, writingSessionId,
        }),
      };
      if (explicitRank != null) {
        await checkExplicitTierRankStamp(supabase, {
          explicitReason, explicitOwner, explicitReviewAt, explicitReleaseCondition,
        });
      }
    }
  } catch (tierErr) {
    if (tierErr.message?.includes('explicit override requires a recorded reason')) throw tierErr; // loud, per QF-20260704-717 acceptance criterion 3
    if (tierErr.code === 'HOLD_STATE_CONTRACT_VIOLATION') throw tierErr; // loud in enforce mode — never silently swallow a contract rejection
    console.warn(`   ⚠️  min_tier_rank stamp skipped (non-blocking): ${tierErr.message}`);
  }

  // SD-LEO-INFRA-VISION-KEY-STAMP-AT-SD-CREATION-001 (L7): stamp metadata.vision_key at this
  // single createSD convergence point (covers direct-args, --from-proposal, --child, --from-plan,
  // --from-feedback, UAT, learn) so every new SD is checkable by VISION_FIDELITY_GATE — previously
  // 2142/2142 gate evaluations skipped with reason no_vision_key. GAP-FILL only: an already-supplied
  // vision_key (e.g. a validated --vision-key that already passed enrichFromVisionArch's orphan-FK
  // guard in direct-lane.js) is preserved verbatim, never overwritten. The proposal-ingest lane
  // deliberately drops any proposal-declared vision_key before it reaches here (leak-guard against an
  // unvalidated FK-by-string — see proposal-lanes.js), so proposal-sourced SDs always get the
  // canonical default here, which is correct: the default is a known-good, hardcoded chairman-
  // approved key, not an unvalidated caller-supplied one.
  if (!sdData.metadata?.vision_key) {
    sdData.metadata = { ...sdData.metadata, vision_key: DEFAULT_VISION_KEY };
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

  // SD-ARCH-HOTSPOT-LEO-CREATE-001 F-B fold-in (SD-2 born-un-authorized polarity, creation side):
  // ride the SAME two-flag ladder Charlie shipped in lib/claim/gates/dispatch-authorization.cjs
  // (dispatch_auth_born_denied / _enforce). Mode 'off' (default) = byte-identical creation.
  // In observe/enforce the newly-created SD is stamped with an explicit birth marker so the
  // claim-side gate's observe-window evidence can distinguish born-unauthorized SDs from
  // pre-cutover rows. Stamp-only at creation — grants are authority-gated (chairman/
  // coordinator/backfill-cutover) and never minted here. Fail-soft: any resolver error
  // leaves creation byte-identical.
  try {
    const { resolveDispatchAuthMode } = await import('../claim/gates/dispatch-authorization.cjs')
      .then((m) => m.default || m);
    const dispatchAuthMode = await resolveDispatchAuthMode();
    if (dispatchAuthMode !== 'off') {
      sdData.metadata = { ...(sdData.metadata || {}), dispatch_auth_born: 'unauthorized' };
      console.log(`   🔒 dispatch-auth ${dispatchAuthMode}: SD born un-authorized (metadata.dispatch_auth_born stamped; grant required before dispatch when enforce flips)`);
    }
  } catch { /* fail-soft: ladder unavailable -> today's behavior */ }

  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .insert(sdData)
    .select('id, uuid_id, sd_key, sd_code_user_facing, title, sd_type, status, priority, current_phase')
    .single();

  if (error) {
    const msg = `Failed to create SD: ${error.message}`;
    console.error(msg);
    // SD-ARCH-HOTSPOT-LEO-CREATE-001 (sanctioned exit→return conversion): was
    // `if CLI-mode hard-exit(1) else throw`. Library code now always returns
    // {ok:false, code:'INSERT_FAILED'}; the CLI re-throws it so main()'s catch prints
    // the historical "Error: ..." line and exits 1, and createSDOrThrow re-throws it
    // for programmatic importers (EVA, corrective-sd-generator) — same visible contract.
    return { ok: false, error: msg, code: 'INSERT_FAILED', exitCode: 1 };
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
    const { triggerRankPass } = await import('../coordinator/trigger-rank-pass.mjs');
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

  // SD-LEO-INFRA-ROADMAP-FOLD-SEAM-001 (FR-2): durable disposition effects —
  // wave item (when a wave was chosen) + roadmap freshness stamp. The SD row's
  // metadata.wave_disposition (written pre-insert) is the source of truth;
  // applyWaveDisposition is idempotent, so a failure here is loudly surfaced
  // with remediation rather than rolling back the created SD.
  if (waveVerdict) {
    try {
      await applyWaveDisposition(supabase, {
        waveDisposition: wave_disposition,
        sourceKey: data.sd_key,
        title: data.title,
        dispositionSource: 'orchestrator_sd_creation',
      });
      console.log(`   🌊 wave disposition recorded: ${waveVerdict.kind === 'wave' ? `wave ${waveVerdict.waveId}` : `no_wave (${waveVerdict.reason})`} — roadmap freshness stamped`);
    } catch (wdErr) {
      console.error(`   ❌ wave disposition apply FAILED (SD created, metadata.wave_disposition recorded): ${wdErr.message}`);
      // The recorder CLI heals this exactly: it applies with sourceKey =
      // workstream, and this path applies with sourceKey = sd_key — pass the
      // sd_key as the workstream and the idempotent apply converges on the
      // same roadmap_wave_items identity.
      const flag = waveVerdict.kind === 'wave' ? `--wave ${waveVerdict.waveId}` : `--no-wave ${JSON.stringify(waveVerdict.reason)}`;
      console.error(`      Remediation (idempotent): node scripts/record-plan-ratification.mjs --workstream ${JSON.stringify(data.sd_key)} ${flag}`);
    }
  }

  // Scope complexity advisory for orchestrator SDs (SD-MAN-ORCH-SCOPE-COMPLEXITY-ANALYSIS-001-A)
  if (dbType === 'orchestrator') {
    import('../analysis/scope-complexity-scorer.js')
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

  return { ok: true, sd: data };
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

/**
 * SD-ARCH-HOTSPOT-LEO-CREATE-001: historical programmatic contract preserved for importers
 * of the scripts/leo-create-sd.js shim — resolves to the inserted SD row on success and
 * THROWS on failure (matching the pre-refactor throw on insert error). Former hard-exit
 * failure paths (guardrail/cascade violations) now throw instead of killing the host
 * process (the sanctioned exit→return conversion); the former exit(0) QF-prefix redirect
 * resolves to the {ok:true, done:true} result object.
 */
async function createSDOrThrow(options) {
  const res = await createSD(options);
  if (res.ok === false) throw new Error(res.error);
  return res.done ? res : res.sd;
}

/**
 * SD-ARCH-HOTSPOT-LEO-CREATE-001: named pipeline entry — composes enrich (buildDefault* /
 * type resolution) → validate (guardrail registry + cascade validator + GATE_SD_QUALITY
 * pre-check) → insert. createSD IS that composition, moved verbatim; runCreatePipeline is
 * the injectable seam (deps.createSD) for tests and future adapters.
 */
async function runCreatePipeline(options, deps = {}) {
  const create = deps.createSD || createSD;
  return create(options);
}

export { createSD, createSDOrThrow, runCreatePipeline, DEFAULT_VISION_KEY };
