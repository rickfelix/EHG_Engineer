/**
 * Lifecycle-to-SD Bridge
 *
 * SD-LEO-FEAT-LIFECYCLE-SD-BRIDGE-001
 * Converts Stage 18 sprint plan payloads into real LEO Strategic Directives.
 *
 * Stage 18 generates `sd_bridge_payloads` with structured data for each
 * sprint item. This module consumes those payloads, creates an orchestrator
 * SD for the sprint, and creates child SDs for each sprint item.
 *
 * Uses sd-key-generator.js for key generation with venture namespace.
 *
 * @module lib/eva/lifecycle-sd-bridge
 */

import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import {
  generateSDKey,
  generateChildKey,
  normalizeVenturePrefix,
} from '../../scripts/modules/sd-key-generator.js';

// Type mapping from Stage 18 types to database sd_type
const TYPE_MAP = {
  feature: 'feature',
  bugfix: 'bugfix',
  enhancement: 'feature',
  refactor: 'refactor',
  infra: 'infrastructure',
};

/**
 * Convert Stage 18 sprint plan output into LEO Strategic Directives.
 *
 * Creates one orchestrator SD for the sprint, plus one child SD per sprint item.
 * Idempotent: if the orchestrator already exists for this venture+sprint, returns
 * existing keys without creating duplicates.
 *
 * @param {Object} params
 * @param {Object} params.stageOutput - Output from Stage 18 (includes sd_bridge_payloads)
 * @param {Object} params.ventureContext - Venture metadata { id, name }
 * @param {Object} [deps]
 * @param {Object} [deps.supabase] - Supabase client override (for testing)
 * @param {Object} [deps.logger] - Logger (defaults to console)
 * @returns {Promise<Object>} { created, orchestratorKey, childKeys, errors }
 */
export async function convertSprintToSDs(params, deps = {}) {
  const { stageOutput, ventureContext } = params;
  const { logger = console } = deps;
  const supabase = deps.supabase || getSupabaseClient();

  const sprintName = stageOutput.sprint_name;
  const sprintGoal = stageOutput.sprint_goal;
  const sprintDuration = stageOutput.sprint_duration_days;
  const payloads = stageOutput.sd_bridge_payloads || [];

  if (!payloads.length) {
    logger.warn('[LifecycleSDBridge] No sd_bridge_payloads in stage output');
    return { created: false, orchestratorKey: null, childKeys: [], errors: ['No sprint items to convert'] };
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
      errors: [],
    };
  }

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
  const { error: orchError } = await supabase
    .from('strategic_directives_v2')
    .insert({
      id: orchestratorId,
      sd_key: orchestratorKey,
      title: `Sprint: ${sprintName}`,
      description: `Orchestrator for sprint "${sprintName}". Goal: ${sprintGoal}. Duration: ${sprintDuration} days. Items: ${payloads.length}.`,
      scope: `Sprint orchestrator coordinating ${payloads.length} child SDs for venture ${ventureContext?.name || 'unknown'}.`,
      rationale: `Stage 18 sprint planning generated ${payloads.length} items requiring LEO workflow execution.`,
      sd_type: 'orchestrator',
      status: 'draft',
      priority: 'medium',
      category: 'Feature',
      current_phase: 'LEAD',
      target_application: 'EHG_Engineer',
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
      metadata: {
        created_via: 'lifecycle-sd-bridge',
        venture_id: ventureContext?.id,
        venture_name: ventureContext?.name,
        sprint_name: sprintName,
        sprint_goal: sprintGoal,
        sprint_duration_days: sprintDuration,
        created_at: new Date().toISOString(),
      },
    });

  if (orchError) {
    logger.error(`[LifecycleSDBridge] Failed to create orchestrator: ${orchError.message}`);
    return { created: false, orchestratorKey: null, childKeys: [], errors: [orchError.message] };
  }

  logger.log(`[LifecycleSDBridge] Created orchestrator: ${orchestratorKey} (${orchestratorId})`);

  // Create child SDs for each sprint item
  const childKeys = [];
  const errors = [];

  for (let i = 0; i < payloads.length; i++) {
    const payload = payloads[i];
    const childIndex = String.fromCharCode(65 + i); // A, B, C, ...
    const childKey = generateChildKey(orchestratorKey, childIndex);
    const dbType = TYPE_MAP[payload.type] || 'feature';

    const childId = randomUUID();
    const { error: childError } = await supabase
      .from('strategic_directives_v2')
      .insert({
        id: childId,
        sd_key: childKey,
        title: payload.title,
        description: payload.description,
        scope: payload.scope,
        rationale: `Sprint item from "${sprintName}": ${payload.description}`,
        sd_type: dbType,
        status: 'draft',
        priority: payload.priority || 'medium',
        category: dbType.charAt(0).toUpperCase() + dbType.slice(1),
        current_phase: 'LEAD',
        target_application: payload.target_application || 'EHG_Engineer',
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
        metadata: {
          created_via: 'lifecycle-sd-bridge',
          venture_id: ventureContext?.id,
          venture_name: ventureContext?.name,
          sprint_name: sprintName,
          sprint_item_index: i,
          dependencies: payload.dependencies || [],
          created_at: new Date().toISOString(),
        },
      });

    if (childError) {
      logger.error(`[LifecycleSDBridge] Failed to create child ${childKey}: ${childError.message}`);
      errors.push(`${childKey}: ${childError.message}`);
    } else {
      logger.log(`[LifecycleSDBridge] Created child: ${childKey} (${dbType})`);
      childKeys.push(childKey);
    }
  }

  return {
    created: true,
    orchestratorKey,
    childKeys,
    errors,
  };
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
      childCount: result.childKeys.length,
      errors: result.errors,
      bridgedAt: new Date().toISOString(),
    }),
    metadata: {
      orchestratorKey: result.orchestratorKey,
      childCount: result.childKeys.length,
      hasErrors: result.errors.length > 0,
    },
    quality_score: result.errors.length === 0 ? 100 : Math.max(0, 100 - result.errors.length * 25),
    validation_status: result.errors.length === 0 ? 'validated' : 'pending',
    validated_by: 'lifecycle-sd-bridge',
    is_current: true,
    source: 'lifecycle-sd-bridge',
  };
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
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
  return createClient(url, key);
}

// ── Exports for testing ─────────────────────────────────────────

export const _internal = {
  TYPE_MAP,
  findExistingOrchestrator,
  getSupabaseClient,
};
