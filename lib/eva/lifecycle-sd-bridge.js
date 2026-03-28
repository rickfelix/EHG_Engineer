/**
 * Lifecycle-to-SD Bridge
 *
 * SD-LEO-FEAT-LIFECYCLE-SD-BRIDGE-001
 * SD-LEO-INFRA-VENTURE-BUILD-READINESS-001-D (3-tier hierarchy, safety controls)
 *
 * Converts Stage 18 sprint plan payloads into real LEO Strategic Directives.
 * Supports 3-tier hierarchy: orchestrator -> children -> grandchildren.
 *
 * Stage 18 generates `sd_bridge_payloads` with structured data for each
 * sprint item. This module consumes those payloads, creates an orchestrator
 * SD for the sprint, child SDs for each sprint item, and optional grandchild
 * SDs decomposed by architecture layer.
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

// ── Amplification Caps (US-004) ─────────────────────────────────
const MAX_CHILDREN_PER_ORCHESTRATOR = 10;
const MAX_HIERARCHY_DEPTH = 2; // orchestrator(0) -> children(1) -> grandchildren(2)
const MAX_GRANDCHILDREN_PER_CHILD = 5;

// ── Provenance Constants (US-005) ───────────────────────────────
const GENERATION_SOURCE = 'auto-pipeline-stage-17-doc-gen';
const GENERATION_VERSION = '1.0';

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
 * Convert Stage 18 sprint plan output into LEO Strategic Directives.
 *
 * Creates a 3-tier hierarchy: orchestrator -> children -> grandchildren.
 * Wrapped in try/catch with rollback on failure.
 * Enforces amplification caps and provenance tagging.
 *
 * @param {Object} params
 * @param {Object} params.stageOutput - Output from Stage 18 (includes sd_bridge_payloads)
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
    // Generate orchestrator SD key
    const orchestratorKey = await generateSDKey({
      source: 'LEO',
      type: 'orchestrator',
      title: `Sprint ${sprintName}`,
      venturePrefix,
      skipLeadValidation: true,
    });

    // Create orchestrator SD
    const orchestratorId = randomUUID();
    const provenance = buildProvenance(ventureContext?.id);
    const { error: orchError } = await supabase
      .from('strategic_directives_v2')
      .insert({
        id: orchestratorId,
        sd_key: orchestratorKey,
        venture_id: ventureContext?.id || null,
        title: `Sprint: ${sprintName}`,
        description: `Orchestrator for sprint "${sprintName}". Goal: ${sprintGoal}. Duration: ${sprintDuration} days. Items: ${payloads.length}.`,
        scope: `Sprint orchestrator coordinating ${payloads.length} child SDs for venture ${ventureContext?.name || 'unknown'}.`,
        rationale: `Stage 18 sprint planning generated ${payloads.length} items requiring LEO workflow execution.`,
        sd_type: 'orchestrator',
        status: 'draft',
        priority: 'medium',
        category: 'Feature',
        current_phase: 'LEAD',
        target_application: ventureContext?.name || getCurrentVenture(),
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
        governance_metadata: {
          bypass_reason: 'lifecycle-sd-bridge: automated SD creation from venture pipeline Stage 19 sprint planning',
          automation_context: { bypass_governance: true, actor_role: 'LEO_ORCHESTRATOR', bypass_reason: 'lifecycle-sd-bridge: automated SD creation from venture pipeline Stage 19 sprint planning' },
        },
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

    createdIds.push(orchestratorId);
    logger.log(`[LifecycleSDBridge] Created orchestrator: ${orchestratorKey} (${orchestratorId})`);

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

      // Apply enrichment if available
      const enrichment = enrichmentResults?.get(i);
      const childDescription = enrichment?.enrichedDescription || payload.description;
      const childArtifactRefs = enrichment?.artifactReferences || [];

      const childId = randomUUID();
      const { error: childError } = await supabase
        .from('strategic_directives_v2')
        .insert({
          id: childId,
          sd_key: childKey,
          venture_id: ventureContext?.id || null,
          title: payload.title,
          description: childDescription,
          scope: payload.scope,
          rationale: `Sprint item from "${sprintName}": ${payload.description}`,
          sd_type: dbType,
          status: 'draft',
          priority: payload.priority || 'medium',
          category: dbType.charAt(0).toUpperCase() + dbType.slice(1),
          current_phase: 'LEAD',
          target_application: payload.target_application || getCurrentVenture(),
          created_by: 'lifecycle-sd-bridge',
          parent_sd_id: orchestratorId,
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
          governance_metadata: {
            bypass_reason: 'lifecycle-sd-bridge: automated child SD from venture pipeline sprint decomposition',
          automation_context: { bypass_governance: true, actor_role: 'LEO_ORCHESTRATOR', bypass_reason: 'lifecycle-sd-bridge: automated child SD from venture pipeline sprint decomposition' },
          },
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

      createdIds.push(childId);
      childKeys.push(childKey);
      logger.log(`[LifecycleSDBridge] Created child: ${childKey} (${dbType})`);

      // Generate grandchildren for this child (US-001)
      if (generateGrandchildren) {
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
  const layers = selectApplicableLayers(childPayload);

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

    const { error: gcError } = await supabase
      .from('strategic_directives_v2')
      .insert({
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
        target_application: childPayload.target_application || getCurrentVenture(),
        created_by: 'lifecycle-sd-bridge',
        parent_sd_id: parentChildId,
        success_criteria: [`${layer.label} implementation complete and tested`],
        success_metrics: [
          { metric: `${layer.label} completeness`, target: '100%', actual: 'TBD' },
        ],
        strategic_objectives: [`Deliver ${layer.key} layer for: ${childPayload.title}`],
        key_principles: ['Follow LEO Protocol for all changes'],
        key_changes: [{ change: `${layer.label} for ${childPayload.title}`, type: childPayload.type || 'feature' }],
        smoke_test_steps: [],
        risks: [],
        governance_metadata: {
          bypass_reason: 'lifecycle-sd-bridge: automated grandchild SD from architecture-layer decomposition',
          automation_context: { bypass_governance: true, actor_role: 'LEO_ORCHESTRATOR', bypass_reason: 'lifecycle-sd-bridge: automated grandchild SD from architecture-layer decomposition' },
        },
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

    createdIds.push(gcId);
    gcKeys.push(gcKey);
    logger.log(`[LifecycleSDBridge] Created grandchild: ${gcKey} (${layer.key})`);
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
  if (payload.architecture_layers && Array.isArray(payload.architecture_layers)) {
    return payload.architecture_layers
      .map(key => ARCHITECTURE_LAYERS.find(l => l.key === key))
      .filter(Boolean);
  }
  // Default: all layers apply
  return ARCHITECTURE_LAYERS;
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
      target_application: parentVentureName || getCurrentVenture(),
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
      governance_metadata: {
        bypass_reason: 'lifecycle-sd-bridge: automated expansion SD from venture post-lifecycle EXPAND decision',
        automation_context: { bypass_governance: true, actor_role: 'LEO_ORCHESTRATOR', bypass_reason: 'lifecycle-sd-bridge: automated expansion SD from venture post-lifecycle EXPAND decision' },
      },
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

  // Load existing SDs for this venture
  const { data: existingSDs } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, title, description, metadata, sd_type')
    .eq('venture_id', ventureId)
    .neq('sd_type', 'orchestrator')
    .in('status', ['draft', 'in_progress', 'active']);

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
  selectApplicableLayers,
  rollbackCreatedRecords,
  createGrandchildren,
  findExistingOrchestrator,
  getSupabaseClient,
  loadAndEnrichArtifacts,
  inferSDLayer,
};
