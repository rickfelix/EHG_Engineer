/**
 * Lifecycle-to-SD Bridge
 *
 * SD-LEO-FEAT-LIFECYCLE-SD-BRIDGE-001
 * SD-LEO-INFRA-VENTURE-BUILD-READINESS-001-D (3-tier hierarchy, safety controls)
 * SD-LEO-INFRA-RECONCILE-VENTURE-LIFECYCLE-001 / FR-5 (docstring SSOT alignment)
 *
 * Converts Stage 19 ("Sprint Planning") sprint plan payloads into real LEO
 * Strategic Directives. Supports 3-tier hierarchy: orchestrator -> children
 * -> grandchildren.
 *
 * Stage 19 (Sprint Planning) generates `sd_bridge_payloads` with structured
 * data for each sprint item. This module consumes those payloads, creates an
 * orchestrator SD for the sprint, child SDs for each sprint item, and optional
 * grandchild SDs decomposed by architecture layer.
 *
 * NOTE: historical docstrings referenced "Stage 18" because the pre-2026-04-21
 * schema had S18="Sprint Planning". The redesigned schema has S18="Marketing
 * Copy Studio" and S19="Sprint Planning". Behavior is unchanged — only the
 * stage-number references in this docstring were updated.
 *
 * Safety controls:
 * - Amplification caps (MAX_CHILDREN=10, MAX_DEPTH=2, MAX_GRANDCHILDREN_PER_CHILD=5)
 * - Transaction wrapping with rollback on failure
 * - Provenance tagging on every auto-generated record
 *
 * Uses sd-key-generator.js for key generation with venture namespace.
 *
 * @module lib/eva/lifecycle-sd-bridge
 */

import { ServiceError } from './shared-services.js';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
// SD-LEO-INFRA-VENTURE-BUILD-EXEC-001 FR-1: venture SDs are created with full LEO
// rigor (NO bypass_governance) — this helper supplies the de-bypassed provenance.
import { ventureGovernanceMetadata } from './bridge/venture-governance-metadata.js';
import {
  generateSDKey,
  generateChildKey,
  generateGrandchildKey,
  normalizeVenturePrefix,
} from '../../scripts/modules/sd-key-generator.js';
// SD-LEO-REFAC-ELIMINATE-HARD-CODED-001: Registry-driven target_application
import { getCurrentVenture } from '../venture-resolver.js';
// SD-LEO-INFRA-BRIDGE-ARTIFACT-ENRICHMENT-001: Artifact enrichment
import { loadMapping, resolveArtifactsForSD } from './artifact-mapping-resolver.js';
import { summarizeArtifacts, enrichSDDescription } from './artifact-enrichment-pipeline.js';
import { validateIntegrity } from './referential-integrity-rubric.js';
// QF: target_application capability lookup (suppress api layer for SPA-only targets)
import { getTargetApplicationCapabilities } from './config/target-application-capabilities.js';
import { getActiveSDFilter } from '../sd/active-sd-predicate.js';
import { normalizeVentureName } from './bridge/venture-routing-error.js';
import { emitFeedback } from '../governance/emit-feedback.js';

// ── Amplification Caps (US-004) ─────────────────────────────────
const MAX_CHILDREN_PER_ORCHESTRATOR = 10;
const MAX_HIERARCHY_DEPTH = 2; // orchestrator(0) -> children(1) -> grandchildren(2)
const MAX_GRANDCHILDREN_PER_CHILD = 5;

// ── Provenance Constants (US-005) ───────────────────────────────
const GENERATION_SOURCE = 'auto-pipeline-stage-17-doc-gen';
const GENERATION_VERSION = '1.0';

// QF-20260504-716: Canonical-case map for target_application. Closes the
// 51-row lowercase 'ehg' drift that trips handoff.js execute-time gate
// L:targetApplicationValidation (whitelist ['EHG','EHG_Engineer']) even
// when precheck (case-insensitive) reports 100%. Unknown values pass through.
const TARGET_APP_CANONICAL = { 'ehg': 'EHG', 'ehg_engineer': 'EHG_Engineer' };
function normalizeTargetApplication(value) {
  if (!value || typeof value !== 'string') return value;
  return TARGET_APP_CANONICAL[value.toLowerCase()] ?? value;
}

// Type mapping from Stage 18 types to database sd_type
const TYPE_MAP = {
  feature: 'feature',
  bugfix: 'bugfix',
  enhancement: 'feature',
  refactor: 'refactor',
  infra: 'infrastructure',
};

// Architecture layers for grandchild decomposition
const ARCHITECTURE_LAYERS = [
  { key: 'data', label: 'Data Layer', description: 'Database schema, migrations, data access' },
  { key: 'api', label: 'API Layer', description: 'REST endpoints, request handling, validation' },
  { key: 'ui', label: 'UI Layer', description: 'Components, pages, user interactions' },
  { key: 'tests', label: 'Test Layer', description: 'Unit tests, integration tests, E2E tests' },
];

// SD-LEO-INFRA-REPO-GROUNDED-INTELLIGENT-001 FR-2: translate the S19 planner's architectureLayer
// taxonomy {frontend,backend,database,infrastructure,integration,security} into the bridge's
// grandchild taxonomy {data,api,ui,tests}. frontend→ui and database→data are exact; every other
// backend-flavoured concern (backend/integration/infrastructure/security) maps to the api layer.
// Without this translation the planner's signal lands on a key the bridge cannot resolve, so the
// previous code silently fell back to all four layers (the vacuous-decomposition root cause).
const PLANNER_TO_BRIDGE_LAYER = {
  frontend: 'ui',
  backend: 'api',
  database: 'data',
  integration: 'api',
  infrastructure: 'api',
  security: 'api',
};

/**
 * SD-LEO-INFRA-REPO-GROUNDED-INTELLIGENT-001 FR-5: feature flag gating the repo-grounded
 * (right-sized) decomposition. Default ON — the legacy all-four-layers multiplier is the bug, not
 * the desired behaviour. Set REPO_GROUNDED_DECOMPOSITION to false/0/off/no for a byte-identical
 * legacy kill-switch.
 * @returns {boolean}
 */
function isRepoGroundedDecompositionEnabled() {
  const v = process.env.REPO_GROUNDED_DECOMPOSITION;
  if (v === undefined || v === '') return true;
  const s = String(v).toLowerCase();
  return s !== 'false' && s !== '0' && s !== 'off' && s !== 'no';
}

// ── SD-LEO-INFRA-VENTURE-BUILD-EXEC-001 (FR-4 orchestration-quality): correct venture SD tree ──
// Pure + exported for testing. Address the systemic gaps the CronGenius E2E surfaced: children had
// no build-order dependencies, the orchestrator was lower-priority than its children, and the
// key/title doubled "Sprint".

/** Priority precedence (higher = more urgent). */
const PRIORITY_RANK = { critical: 4, high: 3, medium: 2, low: 1 };

/**
 * Orchestrator priority = the highest priority among its children — an orchestrator must never be
 * dequeued below the work it coordinates. Defaults to 'high' when no child carries a priority.
 * @param {Array<{priority?:string}>} payloads
 * @returns {string}
 */
export function aggregateOrchestratorPriority(payloads) {
  let best = 0;
  let bestName = 'high';
  for (const p of (payloads || [])) {
    const r = PRIORITY_RANK[String(p?.priority || '').toLowerCase()] || 0;
    if (r > best) { best = r; bestName = String(p.priority).toLowerCase(); }
  }
  return best > 0 ? bestName : 'high';
}

/**
 * Architecture-layer rank for build ordering: data/backend (0) → api (1) → integration/auth (2) →
 * ui/frontend (3) → tests/docs (4). Read from architecture_layer | scope | type (the sprint
 * planner sets `scope`=backend/integration/frontend); keyword fallback; unknown → 2 (middle).
 * @param {{architecture_layer?:string, scope?:string, type?:string}} payload
 * @returns {number}
 */
const LAYER_RANK = {
  data: 0, db: 0, schema: 0, backend: 0, migration: 0,
  api: 1,
  integration: 2, service: 2, auth: 2,
  ui: 3, frontend: 3, component: 3,
  tests: 4, test: 4, docs: 4, documentation: 4,
};
export function sprintItemLayerRank(payload) {
  const fields = [payload?.architecture_layer, payload?.scope, payload?.type]
    .filter(Boolean).map((s) => String(s).toLowerCase());
  for (const f of fields) { if (f in LAYER_RANK) return LAYER_RANK[f]; }
  const blob = fields.join(' ');
  for (const kw of Object.keys(LAYER_RANK)) { if (blob.includes(kw)) return LAYER_RANK[kw]; }
  return 2;
}

/**
 * Build-order dependencies for each child: a child depends on every child in a strictly-earlier
 * architecture layer, so the existing SD dependency-resolver gates the build (backend → integration
 * → frontend). Returns an array (parallel to childKeys) of SD-key arrays. Explicit per-item
 * dependencies are kept in metadata; this fills the (currently empty) build-order column.
 * @param {string[]} childKeys
 * @param {number[]} ranks
 * @returns {string[][]}
 */
export function deriveChildBuildOrder(childKeys, ranks) {
  return childKeys.map((_, i) => childKeys.filter((__, j) => ranks[j] < ranks[i]));
}

/**
 * De-duplicate the sprint label so keys/titles do not read "Sprint: Sprint 2026-05-26" /
 * "…SPRINT-SPRINT-…". Strips a leading "Sprint" (+ separators); falls back to the raw name.
 * @param {string} sprintName
 * @returns {string}
 */
export function normalizeSprintLabel(sprintName) {
  const s = String(sprintName || '').trim();
  const stripped = s.replace(/^sprint[\s:_-]*/i, '').trim();
  return stripped || s || 'sprint';
}

/**
 * SD-LEO-INFRA-UNIFY-VENTURE-NON-001 / Child C — pipeline refusal gate.
 *
 * Require a chairman-approved canonical L2 vision doc before generating
 * orchestrator + child SDs for a venture. Two distinct ServiceError codes
 * surface the self-service unblock command (per Child D's --seed-from flag).
 *
 * Called at the top of convertSprintToSDs's try block — refuses BEFORE any
 * DB insert runs, so no orphan rows can be created when a venture lacks a
 * usable vision.
 *
 * @param {object} supabase
 * @param {string} ventureId
 * @param {string} ventureName — display name for error messages
 * @returns {Promise<object>} canonical L2 vision doc row { vision_key, version }
 * @throws {ServiceError} VENTURE_ID_MISSING | VENTURE_L2_VISION_MISSING | VENTURE_L2_VISION_DRAFT_SEED
 */
export async function assertVentureVisionReady(supabase, ventureId, ventureName) {
  if (!ventureId) {
    throw new ServiceError(
      'VENTURE_ID_MISSING',
      'Cannot generate orchestrator: ventureContext.id is null. The bridge requires a resolved venture row.',
      'LifecycleSDBridge',
    );
  }

  const { data: canonical } = await supabase
    .from('eva_vision_documents')
    .select('vision_key, version, content, updated_at')
    .eq('venture_id', ventureId)
    .eq('level', 'L2')
    .eq('status', 'active')
    .eq('chairman_approved', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (canonical) return canonical;

  const { data: archived } = await supabase
    .from('eva_vision_documents')
    .select('vision_key, status, updated_at')
    .eq('venture_id', ventureId)
    .eq('level', 'L2')
    .eq('status', 'draft_seed')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (archived) {
    throw new ServiceError(
      'VENTURE_L2_VISION_DRAFT_SEED',
      [
        `Venture ${ventureName || ventureId}: archived stub L2 vision found (vision_key=${archived.vision_key}, status=draft_seed).`,
        'No chairman-approved canonical L2 exists. To unblock orchestrator generation:',
        `  /brainstorm --seed-from=draft_seed --venture ${ventureName || '<name>'}`,
        'After the brainstorm completes, review the generated L2 doc and set chairman_approved=true.',
      ].join('\n'),
      'LifecycleSDBridge',
    );
  }

  throw new ServiceError(
    'VENTURE_L2_VISION_MISSING',
    [
      `Venture ${ventureName || ventureId}: no L2 vision document found.`,
      'To unblock orchestrator generation, run:',
      `  /brainstorm --venture ${ventureName || '<name>'}`,
      'After the brainstorm completes, review the generated L2 doc and set chairman_approved=true.',
    ].join('\n'),
    'LifecycleSDBridge',
  );
}

/**
 * Build provenance metadata for auto-generated records.
 * @param {string} ventureId - Source venture UUID
 * @returns {Object} Provenance metadata fields
 */
function buildProvenance(ventureId) {
  return {
    generation_source: GENERATION_SOURCE,
    source_venture_id: ventureId || null,
    generated_at: new Date().toISOString(),
    generation_version: GENERATION_VERSION,
  };
}

/**
 * SD-LEO-FEAT-DELIBERATE-VISION-APPROVAL-001 / FR-5 — idempotent SD insert.
 *
 * Re-running build-plan generation for the same venture/sprint regenerates the
 * SAME deterministic sd_keys (sd-key-generator is venture+index deterministic).
 * A plain `.insert()` raises Postgres 23505 on the unique constraint
 * `strategic_directives_v2_sd_key_key`, which previously threw → rolled back the
 * whole run and surfaced as a hard failure. This helper makes creation
 * idempotent on sd_key: an existing row is treated as REUSE (no overwrite, no
 * throw).
 *
 * Strategy: keep the plain INSERT (so a fresh sd_key inserts exactly once) and
 * catch 23505 as "already exists" → `{ created:false }`. We deliberately do NOT
 * upsert-overwrite an existing SD: a re-run must not clobber an SD that may have
 * advanced past LEAD. INSERT-or-skip is the correct idempotency semantics here.
 *
 * NOTE: `row.metadata` MUST be an object (`{}`), never null — the metadata
 * trigger on strategic_directives_v2 rejects null. All call sites already pass
 * a populated metadata object.
 *
 * @param {Object} supabase
 * @param {Object} row - full strategic_directives_v2 row (must include sd_key, id, metadata:{})
 * @returns {Promise<{ created: boolean, error: Object|null }>}
 */
async function insertSDIdempotent(supabase, row) {
  const { error } = await supabase
    .from('strategic_directives_v2')
    .insert(row);

  if (error) {
    // 23505 = unique_violation on sd_key. Treat the collision as reuse, not
    // failure: the deterministic key already exists from a prior generation pass.
    // (Message fallback covers clients that don't surface error.code.)
    const isDuplicate = error.code === '23505'
      || /duplicate key value|strategic_directives_v2_sd_key_key/i.test(error.message || '');
    if (isDuplicate) {
      return { created: false, error: null };
    }
    return { created: false, error };
  }

  return { created: true, error: null };
}

/**
 * Convert Stage 19 (Sprint Planning) sprint plan output into LEO Strategic Directives.
 *
 * Creates a 3-tier hierarchy: orchestrator -> children -> grandchildren.
 * Wrapped in try/catch with rollback on failure.
 * Enforces amplification caps and provenance tagging.
 *
 * @param {Object} params
 * @param {Object} params.stageOutput - Output from Stage 19 / Sprint Planning (includes sd_bridge_payloads)
 * @param {Object} params.ventureContext - Venture metadata { id, name }
 * @param {Object} [params.options] - Generation options
 * @param {boolean} [params.options.generateGrandchildren=true] - Whether to decompose children into grandchildren
 * @param {Object} [deps]
 * @param {Object} [deps.supabase] - Supabase client override (for testing)
 * @param {Object} [deps.logger] - Logger (defaults to console)
 * @returns {Promise<Object>} { created, orchestratorKey, childKeys, grandchildKeys, errors }
 */
export async function convertSprintToSDs(params, deps = {}) {
  const { stageOutput, ventureContext, evaKeys = {}, options = {} } = params;
  const { generateGrandchildren = true, skipEnrichment = false } = options;
  const { logger = console } = deps;
  const supabase = deps.supabase || getSupabaseClient();

  const sprintName = stageOutput.sprint_name;
  const sprintLabel = normalizeSprintLabel(sprintName); // FR-4: de-dupe "Sprint Sprint …" in key/title
  const sprintGoal = stageOutput.sprint_goal;
  const sprintDuration = stageOutput.sprint_duration_days;
  let payloads = stageOutput.sd_bridge_payloads || [];

  if (!payloads.length) {
    logger.warn('[LifecycleSDBridge] No sd_bridge_payloads in stage output');
    return { created: false, orchestratorKey: null, childKeys: [], grandchildKeys: [], errors: ['No sprint items to convert'] };
  }

  // Amplification cap: limit children (US-004)
  if (payloads.length > MAX_CHILDREN_PER_ORCHESTRATOR) {
    logger.warn(`[LifecycleSDBridge] Amplification cap hit: requested ${payloads.length} children, capped at ${MAX_CHILDREN_PER_ORCHESTRATOR}`);
    payloads = payloads.slice(0, MAX_CHILDREN_PER_ORCHESTRATOR);
  }

  const venturePrefix = ventureContext?.name
    ? normalizeVenturePrefix(ventureContext.name)
    : null;

  // Idempotency check: look for existing orchestrator for this venture+sprint
  const existing = await findExistingOrchestrator(supabase, ventureContext?.id, sprintName);
  if (existing) {
    logger.log(`[LifecycleSDBridge] Orchestrator already exists: ${existing.orchestratorKey}`);
    return {
      created: false,
      orchestratorKey: existing.orchestratorKey,
      childKeys: existing.childKeys,
      grandchildKeys: [],
      errors: [],
    };
  }

  // Track all created IDs for rollback on failure
  const createdIds = [];
  const childKeys = [];
  const grandchildKeys = [];
  const errors = [];

  try {
    // SD-LEO-INFRA-UNIFY-VENTURE-NON-001 / Child C: refuse generation if no
    // chairman-approved canonical L2 vision doc exists for this venture.
    // ServiceError message names the exact /brainstorm unblock command.
    await assertVentureVisionReady(supabase, ventureContext?.id, ventureContext?.name);

    // Generate orchestrator SD key
    const orchestratorKey = await generateSDKey({
      source: 'LEO',
      type: 'orchestrator',
      title: `Sprint ${sprintLabel}`,
      venturePrefix,
      skipLeadValidation: true,
    });

    // FR-4: precompute child keys + architecture-layer ranks → build-order dependencies, so the SD
    // dependency-resolver gates the build (backend → integration → frontend) instead of dispatching
    // children in arbitrary/parallel order.
    const childKeysAll = payloads.map((_, j) => generateChildKey(orchestratorKey, j));
    const childRanks = payloads.map(sprintItemLayerRank);
    const childBuildDeps = deriveChildBuildOrder(childKeysAll, childRanks);

    // Create orchestrator SD (FR-5: idempotent on sd_key — reuse on re-run)
    const orchestratorId = randomUUID();
    const provenance = buildProvenance(ventureContext?.id);
    const { created: orchCreated, error: orchError } = await insertSDIdempotent(supabase, {
        id: orchestratorId,
        sd_key: orchestratorKey,
        venture_id: ventureContext?.id || null,
        title: `Sprint: ${sprintLabel}`,
        description: `Orchestrator for sprint "${sprintLabel}". Goal: ${sprintGoal}. Duration: ${sprintDuration} days. Items: ${payloads.length}.`,
        scope: `Sprint orchestrator coordinating ${payloads.length} child SDs for venture ${ventureContext?.name || 'unknown'}.`,
        rationale: `Stage 18 sprint planning generated ${payloads.length} items requiring LEO workflow execution.`,
        sd_type: 'orchestrator',
        status: 'draft',
        priority: aggregateOrchestratorPriority(payloads), // FR-4: never below the work it coordinates
        category: 'Feature',
        current_phase: 'LEAD',
        target_application: normalizeTargetApplication(ventureContext?.name || getCurrentVenture()),
        created_by: 'lifecycle-sd-bridge',
        success_criteria: payloads.map(p => p.title),
        success_metrics: [
          { metric: 'Child SD completion', target: `${payloads.length}/${payloads.length} children completed`, actual: 'TBD' },
        ],
        strategic_objectives: [`Complete sprint "${sprintName}" via LEO workflow`],
        key_principles: ['Follow LEO Protocol for all changes', 'Each sprint item is an independent SD'],
        key_changes: payloads.map(p => ({ change: p.title, type: p.type })),
        smoke_test_steps: [],
        risks: [],
        governance_metadata: ventureGovernanceMetadata('orchestrator'),
        metadata: {
          ...provenance,
          created_via: 'lifecycle-sd-bridge',
          venture_id: ventureContext?.id,
          venture_name: ventureContext?.name,
          sprint_name: sprintName,
          sprint_goal: sprintGoal,
          sprint_duration_days: sprintDuration,
          vision_key: evaKeys.vision_key || null,
          plan_key: evaKeys.plan_key || null,
          created_at: new Date().toISOString(),
        },
      });

    if (orchError) {
      throw new Error(`Failed to create orchestrator: ${orchError.message}`);
    }

    // FR-5: only track for rollback rows we actually created; a reused
    // (pre-existing) orchestrator must NOT be cancelled if a later step fails.
    if (orchCreated) {
      createdIds.push(orchestratorId);
      logger.log(`[LifecycleSDBridge] Created orchestrator: ${orchestratorKey} (${orchestratorId})`);
    } else {
      logger.log(`[LifecycleSDBridge] Orchestrator already existed (reused on re-run): ${orchestratorKey}`);
    }

    // ── SD-LEO-INFRA-BRIDGE-ARTIFACT-ENRICHMENT-001: Artifact enrichment ──
    let enrichmentResults = null;
    if (!skipEnrichment && ventureContext?.id) {
      try {
        enrichmentResults = await loadAndEnrichArtifacts({
          supabase, logger, ventureId: ventureContext.id, ventureContext, payloads,
        });
      } catch (enrichErr) {
        // FAIL-CLOSED: if enrichment fails, entire bridge fails
        throw new Error(`[LifecycleSDBridge] Artifact enrichment failed (fail-closed): ${enrichErr.message}`);
      }
    }

    // Create child SDs for each sprint item
    for (let i = 0; i < payloads.length; i++) {
      const payload = payloads[i];
      const childKey = generateChildKey(orchestratorKey, i);
      const dbType = TYPE_MAP[payload.type] || 'feature';

      // SD-LEO-INFRA-COMPLETE-LEO-BRIDGE-001 FR-1: a child that WILL gain grandchildren must be
      // created as sd_type='orchestrator' from the start. When a grandchild is later inserted with
      // parent_sd_id=childId, the AFTER-INSERT trigger trg_enforce_parent_orchestrator_type fires a
      // nested feature->orchestrator UPDATE on the child; the type-change governance chain rejects
      // that UPDATE (bridge SDs deliberately carry no bypass) and raised
      // SD_TYPE_CHANGE_EXPLANATION_REQUIRED, rolling back the whole tree. Typing the parent as
      // orchestrator up front makes that trigger a no-op (its WHERE sd_type!='orchestrator' skips it):
      // no type change, no bypass, governance fully intact. Gate on the SAME effective layer set the
      // grandchildren are built from, so a child is never typed orchestrator without grandchildren (FR-2).
      const childEffectiveTarget = normalizeTargetApplication(payload.target_application || ventureContext?.name || getCurrentVenture());
      const childSdType = (generateGrandchildren && computeEffectiveGrandchildLayers(payload, childEffectiveTarget).length > 0)
        ? 'orchestrator'
        : dbType;

      // Apply enrichment if available
      const enrichment = enrichmentResults?.get(i);
      const childDescription = enrichment?.enrichedDescription || payload.description;
      const childArtifactRefs = enrichment?.artifactReferences || [];

      const childId = randomUUID();
      const { created: childCreated, error: childError } = await insertSDIdempotent(supabase, {
          id: childId,
          sd_key: childKey,
          venture_id: ventureContext?.id || null,
          title: payload.title,
          description: childDescription,
          scope: payload.scope,
          rationale: `Sprint item from "${sprintName}": ${payload.description}`,
          sd_type: childSdType,
          status: 'draft',
          priority: payload.priority || 'medium',
          category: dbType.charAt(0).toUpperCase() + dbType.slice(1),
          current_phase: 'LEAD',
          target_application: normalizeTargetApplication(payload.target_application || ventureContext?.name || getCurrentVenture()),
          created_by: 'lifecycle-sd-bridge',
          parent_sd_id: orchestratorId,
          dependencies: childBuildDeps[i], // FR-4: earlier-architecture-layer child SD keys → resolver gates build order
          success_criteria: [payload.success_criteria],
          success_metrics: [
            { metric: 'Implementation completeness', target: '100%', actual: 'TBD' },
          ],
          strategic_objectives: [`Deliver: ${payload.title}`],
          key_principles: ['Follow LEO Protocol for all changes'],
          key_changes: [{ change: payload.title, type: dbType }],
          smoke_test_steps: [],
          risks: (payload.risks || []).map(r =>
            typeof r === 'string' ? { risk: r, mitigation: 'TBD' } : r,
          ),
          governance_metadata: ventureGovernanceMetadata('child'),
          metadata: {
            ...provenance,
            created_via: 'lifecycle-sd-bridge',
            venture_id: ventureContext?.id,
            venture_name: ventureContext?.name,
            sprint_name: sprintName,
            sprint_item_index: i,
            dependencies: payload.dependencies || [],
            vision_key: evaKeys.vision_key || null,
            plan_key: evaKeys.plan_key || null,
            artifact_references: childArtifactRefs,
            extracted_context: enrichment?.extractedContext || null,
            created_at: new Date().toISOString(),
          },
        });

      if (childError) {
        throw new Error(`Failed to create child ${childKey}: ${childError.message}`);
      }

      // FR-5: childKeys always reflects the full intended set (used for the
      // return + integrity check), but only newly-created rows are tracked for
      // rollback so a re-run never cancels pre-existing children.
      childKeys.push(childKey);
      if (childCreated) {
        createdIds.push(childId);
        logger.log(`[LifecycleSDBridge] Created child: ${childKey} (${dbType})`);
      } else {
        logger.log(`[LifecycleSDBridge] Child already existed (reused on re-run): ${childKey}`);
      }

      // Generate grandchildren for this child (US-001).
      // Skip on reuse: a pre-existing child already has its grandchildren, and
      // its real id differs from this run's freshly-generated childId.
      if (generateGrandchildren && childCreated) {
        const gcKeys = await createGrandchildren({
          supabase,
          logger,
          parentChildId: childId,
          parentChildKey: childKey,
          childPayload: payload,
          ventureContext,
          provenance,
          createdIds,
        });
        grandchildKeys.push(...gcKeys);
      }
    }

    // ── Post-creation referential integrity validation ──
    if (enrichmentResults && ventureContext?.id) {
      try {
        const { data: createdSDs } = await supabase
          .from('strategic_directives_v2')
          .select('sd_key, venture_id, metadata')
          .in('sd_key', childKeys);

        const { data: artifacts } = await supabase
          .from('venture_artifacts')
          .select('id, artifact_type, lifecycle_stage')
          .eq('venture_id', ventureContext.id)
          .eq('is_current', true);

        const mapping = await loadMapping(supabase, ventureContext.archetype || 'default', { logger });

        const integrity = await validateIntegrity(supabase, {
          ventureId: ventureContext.id,
          ventureName: ventureContext.name,
          sdRecords: createdSDs || [],
          artifacts: artifacts || [],
          mapping,
        }, { logger });

        if (!integrity.passed) {
          logger.warn(`[LifecycleSDBridge] Integrity rubric: ${integrity.failures.length} issues (score: ${integrity.score}/100)`);
          for (const f of integrity.failures) {
            errors.push(`[Integrity] ${f.sd_key}: ${f.message}`);
          }
        }
      } catch (integrityErr) {
        logger.warn(`[LifecycleSDBridge] Integrity validation error (non-blocking): ${integrityErr.message}`);
      }
    }

    return {
      created: true,
      orchestratorKey,
      childKeys,
      grandchildKeys,
      errors,
    };
  } catch (err) {
    logger.error(`[LifecycleSDBridge] Hierarchy creation failed: ${err.message}`);
    errors.push(err.message);

    // Rollback: try RPC first, then manual cleanup
    if (createdIds.length > 0) {
      await rollbackCreatedRecords(supabase, createdIds, logger);
    }

    return {
      created: false,
      orchestratorKey: null,
      childKeys: [],
      grandchildKeys: [],
      errors,
    };
  }
}

/**
 * Create grandchild SDs for a child by decomposing into architecture layers.
 *
 * @param {Object} params
 * @returns {Promise<string[]>} Array of grandchild keys created
 */
async function createGrandchildren({
  supabase, logger, parentChildId, parentChildKey,
  childPayload, ventureContext, provenance, createdIds,
}) {
  const gcKeys = [];
  // Determine which architecture layers apply based on payload hints
  const candidateLayers = selectApplicableLayers(childPayload);

  // Filter by target_application capability — suppress api for SPA-only targets.
  // SD-LEO-INFRA-FAIL-CLOSED-VENTURE-001-B / PA-5: when capability suppression
  // fires AND target_application !== venture.name, emit a structured warning to
  // the feedback table via emitFeedback. Per security-agent C-SEC-3B no string
  // interpolation of user-supplied values; per database-agent C-DB-3 reuse
  // emitFeedback (single canonical write path); per database-agent C-DB-2 use
  // feedback.sd_id (UUID).
  const effectiveTarget = normalizeTargetApplication(childPayload.target_application || ventureContext?.name || getCurrentVenture());
  const layers = filterLayersByCapability(candidateLayers, effectiveTarget, {
    logger,
    parentChildKey,
    ventureName: ventureContext?.name || null,
    parentChildId,
    supabase,
  });

  // Cap grandchildren per child (US-004)
  const cappedLayers = layers.slice(0, MAX_GRANDCHILDREN_PER_CHILD);
  if (layers.length > MAX_GRANDCHILDREN_PER_CHILD) {
    logger.warn(
      `[LifecycleSDBridge] Grandchild cap hit for ${parentChildKey}: requested ${layers.length}, capped at ${MAX_GRANDCHILDREN_PER_CHILD}`,
    );
  }

  for (let j = 0; j < cappedLayers.length; j++) {
    const layer = cappedLayers[j];
    const gcKey = generateGrandchildKey(parentChildKey, j);
    const gcId = randomUUID();
    // SD-LEO-INFRA-REPO-GROUNDED-INTELLIGENT-001 FR-4: intra-child build order — each architecture
    // layer depends on the previously-created layer (data → api → ui → tests) so the consumer can
    // build a layered child in dependency order instead of facing empty grandchild dependencies.
    const gcDependencies = j > 0 ? [generateGrandchildKey(parentChildKey, j - 1)] : [];

    const { created: gcCreated, error: gcError } = await insertSDIdempotent(supabase, {
        id: gcId,
        sd_key: gcKey,
        venture_id: ventureContext?.id || null,
        title: `${childPayload.title} — ${layer.label}`,
        description: `${layer.description} for "${childPayload.title}".`,
        scope: `${layer.label} implementation for parent task.`,
        rationale: `Architecture-layer decomposition of "${childPayload.title}" — ${layer.key} concern.`,
        sd_type: TYPE_MAP[childPayload.type] || 'feature',
        status: 'draft',
        priority: childPayload.priority || 'medium',
        category: 'Feature',
        current_phase: 'LEAD',
        target_application: normalizeTargetApplication(childPayload.target_application || ventureContext?.name || getCurrentVenture()),
        created_by: 'lifecycle-sd-bridge',
        parent_sd_id: parentChildId,
        dependencies: gcDependencies, // FR-4: earlier-layer grandchild keys gate intra-child build order
        success_criteria: [`${layer.label} implementation complete and tested`],
        success_metrics: [
          { metric: `${layer.label} completeness`, target: '100%', actual: 'TBD' },
        ],
        strategic_objectives: [`Deliver ${layer.key} layer for: ${childPayload.title}`],
        key_principles: ['Follow LEO Protocol for all changes'],
        key_changes: [{ change: `${layer.label} for ${childPayload.title}`, type: childPayload.type || 'feature' }],
        smoke_test_steps: [],
        risks: [],
        governance_metadata: ventureGovernanceMetadata('grandchild'),
        metadata: {
          ...provenance,
          created_via: 'lifecycle-sd-bridge',
          venture_id: ventureContext?.id,
          architecture_layer: layer.key,
          parent_child_key: parentChildKey,
          grandchild_index: j,
          created_at: new Date().toISOString(),
        },
      });

    if (gcError) {
      throw new Error(`Failed to create grandchild ${gcKey}: ${gcError.message}`);
    }

    gcKeys.push(gcKey);
    if (gcCreated) {
      createdIds.push(gcId); // FR-5: only track newly-created rows for rollback
      logger.log(`[LifecycleSDBridge] Created grandchild: ${gcKey} (${layer.key})`);
    } else {
      logger.log(`[LifecycleSDBridge] Grandchild already existed (reused on re-run): ${gcKey}`);
    }
  }

  return gcKeys;
}

/**
 * Determine which architecture layers apply for a given sprint item.
 * Uses payload hints if available, otherwise returns all layers.
 *
 * @param {Object} payload - Sprint item payload
 * @returns {Array} Applicable architecture layers
 */
function selectApplicableLayers(payload) {
  // SD-LEO-INFRA-REPO-GROUNDED-INTELLIGENT-001 FR-2/FR-3: honor the S19 planner's per-item
  // architectureLayer signal — right-size to the single mapped layer instead of stamping all four.
  // Skipped when REPO_GROUNDED_DECOMPOSITION is off (legacy kill-switch), when the planner gave no
  // signal, or when the item is explicitly marked 'layered' (a genuinely large item that still
  // wants full multi-layer decomposition).
  if (
    isRepoGroundedDecompositionEnabled() &&
    payload && payload.architectureLayer &&
    payload.decomposition_strategy !== 'layered'
  ) {
    const bridgeKey = PLANNER_TO_BRIDGE_LAYER[String(payload.architectureLayer).toLowerCase()];
    const layer = ARCHITECTURE_LAYERS.find(l => l.key === bridgeKey);
    if (layer) return [layer];
  }
  // Explicit bridge-taxonomy hint (already keyed data/api/ui/tests).
  if (payload.architecture_layers && Array.isArray(payload.architecture_layers)) {
    return payload.architecture_layers
      .map(key => ARCHITECTURE_LAYERS.find(l => l.key === key))
      .filter(Boolean);
  }
  // Fallback: all layers apply (legacy payloads, absent signal, or decomposition_strategy='layered').
  return ARCHITECTURE_LAYERS;
}

/**
 * Pure capability partition (NO logging / NO feedback side effects): splits candidate
 * architecture layers into { kept, suppressed } for a target application. Extracted so the
 * SAME suppression logic drives BOTH the at-creation orchestrator-typing decision
 * (computeEffectiveGrandchildLayers, before the child INSERT) and the side-effectful
 * filterLayersByCapability (during grandchild creation) — single source of truth.
 * SD-LEO-INFRA-COMPLETE-LEO-BRIDGE-001 FR-1/FR-2.
 *
 * @param {Array} layers - Candidate layers from selectApplicableLayers
 * @param {string} targetApplication - Effective target app
 * @returns {{ kept: Array, suppressed: string[] }}
 */
function partitionLayersByCapability(layers, targetApplication) {
  const caps = getTargetApplicationCapabilities(targetApplication);
  const suppressed = [];
  const kept = layers.filter(layer => {
    if (layer.key === 'api' && caps.has_serverless_api === false) {
      suppressed.push(layer.key);
      return false;
    }
    return true;
  });
  return { kept, suppressed };
}

/**
 * Pure: the effective (capability-filtered, capped) grandchild layer set for a child payload.
 * A non-empty result means the child WILL gain grandchildren and must therefore be created as an
 * orchestrator so the parent-orchestrator promotion trigger stays a no-op. No side effects, so it
 * is safe to call before the child INSERT and on idempotent re-runs.
 * SD-LEO-INFRA-COMPLETE-LEO-BRIDGE-001 FR-1.
 *
 * @param {Object} childPayload - Sprint item payload
 * @param {string} effectiveTarget - normalized target application for the child
 * @returns {Array} capped effective grandchild layers (empty => leaf child)
 */
function computeEffectiveGrandchildLayers(childPayload, effectiveTarget) {
  const { kept } = partitionLayersByCapability(selectApplicableLayers(childPayload), effectiveTarget);
  return kept.slice(0, MAX_GRANDCHILDREN_PER_CHILD);
}

/**
 * Filter layers by target_application capability. Removes layers the target
 * cannot host (e.g. `api` for a Vite SPA with no serverless runtime). Emits
 * one audit log line per suppression decision so the choice is auditable.
 *
 * SD-LEO-INFRA-FAIL-CLOSED-VENTURE-001-B / PA-5 / FR-B5:
 * When suppression fires AND venture name is provided AND
 * normalizeVentureName(targetApplication) !== normalizeVentureName(ventureName),
 * emit a structured warning to feedback table via emitFeedback. The warning
 * surfaces capability-suppression-on-mismatched-target as a portfolio-isolation
 * signal. Per security-agent C-SEC-3B no string interpolation of user-supplied
 * values into title/description.
 *
 * @param {Array} layers - Candidate layers from selectApplicableLayers
 * @param {string|null|undefined} targetApplication - Effective target app
 * @param {Object} [opts]
 * @param {Object} [opts.logger=console]
 * @param {string} [opts.parentChildKey] - Parent SD key for log context
 * @param {string|null} [opts.ventureName] - Raw venture name for mismatch detection (PA-5)
 * @param {string|null} [opts.parentChildId] - Parent SD UUID for feedback.sd_id (PA-5)
 * @param {Object|null} [opts.supabase] - Supabase client (PA-5; warning is fire-and-forget if missing)
 * @returns {Array} Filtered layers
 */
function filterLayersByCapability(
  layers,
  targetApplication,
  { logger = console, parentChildKey = '', ventureName = null, parentChildId = null, supabase = null } = {},
) {
  const caps = getTargetApplicationCapabilities(targetApplication);
  // SD-LEO-INFRA-COMPLETE-LEO-BRIDGE-001: delegate the filtering to the pure partition so the
  // typing decision and the actual grandchild creation can never diverge.
  const { kept, suppressed } = partitionLayersByCapability(layers, targetApplication);
  if (suppressed.length > 0) {
    logger.log(
      `[LifecycleSDBridge] Suppressed architecture_layer(s) [${suppressed.join(',')}] for target_application=${targetApplication} (has_serverless_api=${caps.has_serverless_api})${parentChildKey ? ` parent=${parentChildKey}` : ''}`,
    );

    // PA-5: emit warning when suppression fires on venture-mismatched SD
    if (supabase && ventureName) {
      const normalizedTarget = normalizeVentureName(targetApplication);
      const normalizedVenture = normalizeVentureName(ventureName);
      if (normalizedTarget !== normalizedVenture) {
        // Fire-and-forget; don't block layer filtering on emission failure
        emitFeedback({
          supabase,
          title: 'Capability suppression on venture-mismatched SD',
          description:
            'A capability-driven layer suppression fired on an SD whose target_application ' +
            'does not match its parent venture name. This is a portfolio-isolation signal ' +
            '(possible mis-routing). Inspect SD context.',
          severity: 'high',
          category: 'harness_backlog',
          sd_id: parentChildId,
          dedup_key: `capability-suppression-mismatch::${suppressed.join(',')}`,
          metadata: {
            layer_suppressed: suppressed,
            venture_name: ventureName,
            normalized_venture_name: normalizedVenture,
            target_application: targetApplication,
            normalized_target_application: normalizedTarget,
            parent_child_key: parentChildKey,
            event: 'PA5_CAPABILITY_SUPPRESSION_VENTURE_MISMATCH',
          },
        }).catch((err) => {
          logger.warn(`[LifecycleSDBridge] PA-5 emitFeedback failed (non-blocking): ${err.message}`);
        });
      }
    }
  }
  return kept;
}

/**
 * Rollback created records on failure (US-003).
 * Tries fn_rollback_sd_hierarchy RPC first, falls back to manual cancel.
 */
async function rollbackCreatedRecords(supabase, createdIds, logger) {
  // Try RPC rollback first (uses the first ID, which is the orchestrator)
  const orchestratorId = createdIds[0];
  const { data: rpcResult, error: rpcError } = await supabase.rpc(
    'fn_rollback_sd_hierarchy',
    { p_orchestrator_id: orchestratorId },
  );

  if (!rpcError && rpcResult) {
    logger.log(`[LifecycleSDBridge] RPC rollback successful: ${JSON.stringify(rpcResult)}`);
    return;
  }

  // Fallback: manually cancel each created record
  logger.warn(`[LifecycleSDBridge] RPC rollback failed (${rpcError?.message}), using manual cleanup`);
  for (const id of createdIds) {
    const { error } = await supabase
      .from('strategic_directives_v2')
      .update({ status: 'cancelled', cancellation_reason: 'lifecycle-sd-bridge rollback: hierarchy creation failed', updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) {
      logger.error(`[LifecycleSDBridge] Failed to cancel ${id}: ${error.message}`);
    }
  }
  logger.log(`[LifecycleSDBridge] Manual rollback: cancelled ${createdIds.length} records`);
}

/**
 * Build an artifact record for persisting bridge results.
 *
 * @param {string} ventureId - Venture UUID
 * @param {number} stageId - Stage number (18)
 * @param {Object} result - Result from convertSprintToSDs
 * @returns {Object} Row for venture_artifacts insert
 */
export function buildBridgeArtifactRecord(ventureId, stageId, result) {
  return {
    venture_id: ventureId,
    lifecycle_stage: stageId,
    artifact_type: 'lifecycle_sd_bridge',
    title: `Lifecycle-to-SD Bridge - Stage ${stageId}`,
    content: JSON.stringify({
      created: result.created,
      orchestratorKey: result.orchestratorKey,
      childKeys: result.childKeys,
      grandchildKeys: result.grandchildKeys || [],
      childCount: result.childKeys.length,
      grandchildCount: (result.grandchildKeys || []).length,
      errors: result.errors,
      bridgedAt: new Date().toISOString(),
    }),
    metadata: {
      orchestratorKey: result.orchestratorKey,
      childCount: result.childKeys.length,
      grandchildCount: (result.grandchildKeys || []).length,
      hasErrors: result.errors.length > 0,
    },
    quality_score: result.errors.length === 0 ? 100 : Math.max(0, 100 - result.errors.length * 25),
    validation_status: result.errors.length === 0 ? 'validated' : 'pending',
    validated_by: 'lifecycle-sd-bridge',
    is_current: true,
    source: 'lifecycle-sd-bridge',
  };
}

/**
 * Convert a post-lifecycle EXPAND decision into a LEO Strategic Directive.
 *
 * Called when a venture completes Stage 25 and the chairman decides to expand.
 * Creates a single SD representing the new venture expansion.
 *
 * @param {Object} params
 * @param {Object} params.expansionParams - Expansion details
 * @param {string} params.expansionParams.parentVentureId - Parent venture UUID
 * @param {string} params.expansionParams.parentVentureName - Parent venture name
 * @param {string} params.expansionParams.expansionTitle - Title for the new SD
 * @param {string} params.expansionParams.expansionDescription - Description
 * @param {string} [params.expansionParams.expansionType='feature'] - SD type
 * @param {Object} params.stageOutput - Stage 25 output
 * @param {Object} params.ventureContext - Parent venture context
 * @param {Object} [deps]
 * @param {Object} [deps.supabase] - Supabase client override
 * @param {Object} [deps.logger] - Logger
 * @returns {Promise<Object>} { created, sdKey, errors }
 */
export async function convertExpansionToSD(params, deps = {}) {
  const { expansionParams, stageOutput, ventureContext } = params;
  const { logger = console } = deps;
  const supabase = deps.supabase || getSupabaseClient();

  const {
    parentVentureId,
    parentVentureName,
    expansionTitle,
    expansionDescription,
    expansionType = 'feature',
  } = expansionParams;

  if (!expansionTitle) {
    return { created: false, sdKey: null, errors: ['expansionTitle is required'] };
  }

  const venturePrefix = parentVentureName
    ? normalizeVenturePrefix(parentVentureName)
    : null;

  // Idempotency: check for existing expansion SD from this parent
  const { data: existing } = await supabase
    .from('strategic_directives_v2')
    .select('sd_key')
    .eq('metadata->>created_via', 'lifecycle-sd-bridge-expand')
    .eq('metadata->>parent_venture_id', parentVentureId)
    .limit(1);

  if (existing?.length) {
    logger.log(`[LifecycleSDBridge] Expansion SD already exists: ${existing[0].sd_key}`);
    return { created: false, sdKey: existing[0].sd_key, errors: [] };
  }

  const dbType = TYPE_MAP[expansionType] || 'feature';

  const sdKey = await generateSDKey({
    source: 'LEO',
    type: dbType,
    title: expansionTitle,
    venturePrefix,
    skipLeadValidation: true,
  });

  const sdId = randomUUID();
  const provenance = buildProvenance(parentVentureId);
  const { error } = await supabase
    .from('strategic_directives_v2')
    .insert({
      id: sdId,
      sd_key: sdKey,
      venture_id: parentVentureId || null,
      title: expansionTitle,
      description: expansionDescription,
      scope: `Venture expansion from completed lifecycle of "${parentVentureName}".`,
      rationale: `Post-lifecycle EXPAND decision for venture "${parentVentureName}" (${parentVentureId}).`,
      sd_type: dbType,
      status: 'draft',
      priority: 'medium',
      category: dbType.charAt(0).toUpperCase() + dbType.slice(1),
      current_phase: 'LEAD',
      target_application: normalizeTargetApplication(parentVentureName || getCurrentVenture()),
      created_by: 'lifecycle-sd-bridge-expand',
      success_criteria: [`Deliver: ${expansionTitle}`],
      success_metrics: [
        { metric: 'Implementation completeness', target: '100%', actual: 'TBD' },
      ],
      strategic_objectives: [`Expand from completed venture "${parentVentureName}"`],
      key_principles: ['Follow LEO Protocol for all changes'],
      key_changes: [{ change: expansionTitle, type: dbType }],
      smoke_test_steps: [],
      risks: [],
      governance_metadata: ventureGovernanceMetadata('expansion'),
      metadata: {
        ...provenance,
        created_via: 'lifecycle-sd-bridge-expand',
        parent_venture_id: parentVentureId,
        parent_venture_name: parentVentureName,
        expansion_type: expansionType,
        created_at: new Date().toISOString(),
      },
    });

  if (error) {
    logger.error(`[LifecycleSDBridge] Expansion SD creation failed: ${error.message}`);
    return { created: false, sdKey: null, errors: [error.message] };
  }

  logger.log(`[LifecycleSDBridge] Expansion SD created: ${sdKey} (${sdId})`);
  return { created: true, sdKey, errors: [] };
}

// ── Internal Helpers ────────────────────────────────────────────

/**
 * Check if an orchestrator SD already exists for this venture+sprint combination.
 */
async function findExistingOrchestrator(supabase, ventureId, sprintName) {
  if (!ventureId || !sprintName) return null;

  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key')
    .eq('sd_type', 'orchestrator')
    .eq('metadata->>venture_id', ventureId)
    .eq('metadata->>sprint_name', sprintName)
    .limit(1);

  if (error || !data?.length) return null;

  const orchestrator = data[0];

  // Find children
  const { data: children } = await supabase
    .from('strategic_directives_v2')
    .select('sd_key')
    .eq('parent_sd_id', orchestrator.id)
    .order('sd_key', { ascending: true });

  return {
    orchestratorKey: orchestrator.sd_key,
    childKeys: (children || []).map(c => c.sd_key),
  };
}

/**
 * Get Supabase client from environment.
 */
function getSupabaseClient() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new ServiceError('MISSING_CONFIG', 'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required', 'LifecycleSDBridge');
  return createClient(url, key);
}

// ── Artifact Enrichment Helpers (SD-LEO-INFRA-BRIDGE-ARTIFACT-ENRICHMENT-001) ──

/**
 * Load venture artifacts from stages 0-18 and run enrichment pipeline.
 * Returns a Map of payload index -> enrichment result.
 *
 * @param {Object} params
 * @returns {Promise<Map<number, Object>>} Map of sdIndex -> { enrichedDescription, artifactReferences, extractedContext }
 */
async function loadAndEnrichArtifacts({ supabase, logger, ventureId, ventureContext, payloads }) {
  // Load all current artifacts for this venture (stages 0-18)
  const { data: artifacts, error: artError } = await supabase
    .from('venture_artifacts')
    .select('id, artifact_type, lifecycle_stage, title, content, artifact_data, updated_at')
    .eq('venture_id', ventureId)
    .eq('is_current', true)
    .lte('lifecycle_stage', 18)
    .order('lifecycle_stage', { ascending: true });

  if (artError) {
    throw new Error(`Failed to load venture artifacts: ${artError.message}`);
  }

  if (!artifacts || artifacts.length === 0) {
    logger.log('[LifecycleSDBridge] No artifacts found for enrichment (stages 0-18), skipping');
    return null;
  }

  logger.log(`[LifecycleSDBridge] Loaded ${artifacts.length} artifacts for enrichment`);

  // Load mapping for this venture type
  const ventureType = ventureContext.archetype || 'default';
  const mapping = await loadMapping(supabase, ventureType, { logger });

  // Pass 1: Summarize all artifacts (cached)
  const summaryMap = await summarizeArtifacts(supabase, ventureId, artifacts, { logger });

  // Pass 2: Enrich each child SD payload
  const results = new Map();
  for (let i = 0; i < payloads.length; i++) {
    const payload = payloads[i];
    const sdLayer = inferSDLayer(payload);
    const resolved = resolveArtifactsForSD(mapping, sdLayer, artifacts);

    const enrichment = await enrichSDDescription({
      sdTitle: payload.title,
      sdDescription: payload.description,
      sdLayer,
      resolvedArtifacts: resolved,
      summaryMap,
      ventureContext,
    }, { logger });

    results.set(i, enrichment);
  }

  logger.log(`[LifecycleSDBridge] Enrichment complete: ${results.size} SDs enriched`);
  return results;
}

/**
 * Infer the SD architecture layer from a sprint payload's hints.
 */
function inferSDLayer(payload) {
  if (payload.architecture_layer) return payload.architecture_layer;
  const type = payload.type || '';
  if (type.includes('data') || type.includes('db') || type.includes('schema')) return 'data';
  if (type.includes('api') || type.includes('endpoint')) return 'api';
  if (type.includes('ui') || type.includes('frontend') || type.includes('component')) return 'ui';
  if (type.includes('test')) return 'tests';
  return 'data'; // default
}

/**
 * Re-enrich existing SDs with artifact references.
 * Used for retroactive enrichment of SDs created before this feature.
 *
 * @param {Object} supabase - Supabase client
 * @param {string} ventureId - Venture UUID
 * @param {Object} [options]
 * @param {Object} [options.logger] - Logger
 * @param {boolean} [options.dryRun=false] - If true, don't update SDs
 * @returns {Promise<Object>} { enriched, skipped, errors }
 */
export async function reEnrichExistingSDs(supabase, ventureId, options = {}) {
  const { logger = console, dryRun = false } = options;

  // Load venture info
  const { data: venture } = await supabase
    .from('ventures')
    .select('id, name, archetype')
    .eq('id', ventureId)
    .single();

  if (!venture) {
    return { enriched: 0, skipped: 0, errors: ['Venture not found'] };
  }

  // Load artifacts (stages 0-18)
  const { data: artifacts } = await supabase
    .from('venture_artifacts')
    .select('id, artifact_type, lifecycle_stage, title, content, artifact_data, updated_at')
    .eq('venture_id', ventureId)
    .eq('is_current', true)
    .lte('lifecycle_stage', 18);

  if (!artifacts?.length) {
    return { enriched: 0, skipped: 0, errors: ['No artifacts found for stages 0-18'] };
  }

  // Load existing SDs for this venture.
  // SD-FDBK-INFRA-RETROFIT-LIB-EVA-001: routes through getActiveSDFilter (the
  // canonical active-SD predicate shipped by SD-EVA-SUPPORT-CLI-SKILL-ORCH-001-C
  // FR-6). Behavior change: enrichment now also excludes archived venture SDs
  // (`archived_at IS NOT NULL`) and inactive ones (`is_active = false`). The
  // status set (draft/in_progress/active) is unchanged.
  const { data: existingSDs } = await getActiveSDFilter(
    supabase
      .from('strategic_directives_v2')
      .select('id, sd_key, title, description, metadata, sd_type')
      .eq('venture_id', ventureId)
      .neq('sd_type', 'orchestrator')
  );

  if (!existingSDs?.length) {
    return { enriched: 0, skipped: 0, errors: ['No active SDs found for this venture'] };
  }

  const mapping = await loadMapping(supabase, venture.archetype || 'default', { logger });
  const summaryMap = await summarizeArtifacts(supabase, ventureId, artifacts, { logger });

  let enriched = 0;
  let skipped = 0;
  const errors = [];

  for (const sd of existingSDs) {
    // Skip if already has artifact_references
    if (sd.metadata?.artifact_references?.length > 0) {
      skipped++;
      continue;
    }

    const sdLayer = sd.metadata?.architecture_layer || inferSDLayer({ type: sd.sd_type });
    const resolved = resolveArtifactsForSD(mapping, sdLayer, artifacts);

    try {
      const enrichment = await enrichSDDescription({
        sdTitle: sd.title,
        sdDescription: sd.description,
        sdLayer,
        resolvedArtifacts: resolved,
        summaryMap,
        ventureContext: { id: venture.id, name: venture.name },
      }, { logger });

      if (!dryRun) {
        const { error: updateError } = await supabase
          .from('strategic_directives_v2')
          .update({
            description: enrichment.enrichedDescription,
            metadata: {
              ...sd.metadata,
              artifact_references: enrichment.artifactReferences,
              extracted_context: enrichment.extractedContext,
              re_enriched_at: new Date().toISOString(),
            },
          })
          .eq('id', sd.id);

        if (updateError) {
          errors.push(`Failed to update ${sd.sd_key}: ${updateError.message}`);
          continue;
        }
      }

      enriched++;
      logger.log(`[ReEnrichment] ${dryRun ? '[DRY RUN]' : ''} Enriched: ${sd.sd_key}`);
    } catch (err) {
      errors.push(`Failed to enrich ${sd.sd_key}: ${err.message}`);
    }
  }

  return { enriched, skipped, errors };
}

// ── Exports for testing ─────────────────────────────────────────

export const _internal = {
  TYPE_MAP,
  ARCHITECTURE_LAYERS,
  MAX_CHILDREN_PER_ORCHESTRATOR,
  MAX_HIERARCHY_DEPTH,
  MAX_GRANDCHILDREN_PER_CHILD,
  GENERATION_SOURCE,
  GENERATION_VERSION,
  buildProvenance,
  insertSDIdempotent,
  selectApplicableLayers,
  PLANNER_TO_BRIDGE_LAYER,
  isRepoGroundedDecompositionEnabled,
  partitionLayersByCapability,
  computeEffectiveGrandchildLayers,
  filterLayersByCapability,
  rollbackCreatedRecords,
  createGrandchildren,
  findExistingOrchestrator,
  getSupabaseClient,
  loadAndEnrichArtifacts,
  inferSDLayer,
};
