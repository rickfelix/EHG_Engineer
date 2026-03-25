/**
 * ADR Extractor — Extracts Architecture Decision Records from Stage 14 output
 *
 * SD-LEO-INFRA-STREAM-ACTIVATE-DORMANT-001-A
 *
 * Parses Stage 14 technical architecture output and produces ADR objects
 * for insertion into the leo_adrs table. Each significant architectural
 * choice (layer technology, security strategy, data model) becomes an ADR.
 *
 * @module lib/eva/adr-extractor
 */

import { randomUUID } from 'crypto';

/** Valid decision types for leo_adrs.decision_type */
const DECISION_TYPES = ['technical_choice', 'data_model', 'api_design', 'security_architecture'];

/**
 * Extract ADR records from Stage 14 architecture output.
 *
 * @param {Object} archData - Stage 14 analysis result
 * @param {Object} archData.layers - Architecture layers (presentation, api, etc.)
 * @param {Object} archData.security - Security configuration
 * @param {Array}  archData.dataEntities - Data entities
 * @param {Array}  archData.integration_points - Integration points
 * @param {Array}  [archData.constraints] - Architectural constraints
 * @param {string} [archData.architecture_summary] - High-level summary
 * @returns {Array<Object>} ADR objects ready for leo_adrs insertion
 */
export function extractADRs(archData) {
  if (!archData || !archData.layers) return [];

  const adrs = [];
  let adrNumber = 1;

  // Extract layer technology decisions
  for (const [layerName, layer] of Object.entries(archData.layers)) {
    if (!layer || layer.technology === 'TBD') continue;

    adrs.push({
      id: randomUUID(),
      adr_number: `ADR-${String(adrNumber++).padStart(3, '0')}`,
      title: `${layerName} layer: ${layer.technology}`,
      status: 'accepted',
      decision_type: layerName === 'data' ? 'data_model' : layerName === 'api' ? 'api_design' : 'technical_choice',
      decision: `Use ${layer.technology} for the ${layerName} layer`,
      context: layer.rationale || `Technology selection for ${layerName} layer`,
      options: JSON.stringify(
        layer.components
          ? [{ option: layer.technology, chosen: true, components: layer.components }]
          : [{ option: layer.technology, chosen: true }]
      ),
      consequences: JSON.stringify({
        positive: [`${layer.technology} provides ${layerName} capabilities`],
        negative: [`Lock-in to ${layer.technology} ecosystem`],
        components: layer.components || [],
      }),
      rollback_plan: `Replace ${layer.technology} with alternative ${layerName} technology`,
    });
  }

  // Extract security architecture decision
  if (archData.security && archData.security.authStrategy && archData.security.authStrategy !== 'TBD') {
    adrs.push({
      id: randomUUID(),
      adr_number: `ADR-${String(adrNumber++).padStart(3, '0')}`,
      title: `Security: ${archData.security.authStrategy} authentication`,
      status: 'accepted',
      decision_type: 'security_architecture',
      decision: `Use ${archData.security.authStrategy} for authentication with ${archData.security.dataClassification} data classification`,
      context: `Security architecture for venture with compliance: ${(archData.security.complianceRequirements || []).join(', ') || 'none specified'}`,
      options: JSON.stringify([
        { option: archData.security.authStrategy, chosen: true, classification: archData.security.dataClassification },
      ]),
      consequences: JSON.stringify({
        positive: [`${archData.security.authStrategy} provides authentication`],
        compliance: archData.security.complianceRequirements || [],
        dataClassification: archData.security.dataClassification,
      }),
      rollback_plan: `Migrate to alternative authentication strategy`,
    });
  }

  // Extract data model decision if entities are defined
  if (archData.dataEntities && archData.dataEntities.length > 0) {
    const entityNames = archData.dataEntities.map(e => e.name).join(', ');
    adrs.push({
      id: randomUUID(),
      adr_number: `ADR-${String(adrNumber++).padStart(3, '0')}`,
      title: `Data model: ${archData.dataEntities.length} entities`,
      status: 'accepted',
      decision_type: 'data_model',
      decision: `Define ${archData.dataEntities.length} core data entities: ${entityNames}`,
      context: `Data model design for the venture's core domain`,
      options: JSON.stringify(
        archData.dataEntities.map(e => ({
          entity: e.name,
          description: e.description,
          relationships: e.relationships || [],
          volume: e.estimatedVolume || 'unknown',
        }))
      ),
      consequences: JSON.stringify({
        entities: archData.dataEntities.length,
        relationships: archData.dataEntities.reduce((sum, e) => sum + (e.relationships?.length || 0), 0),
      }),
      rollback_plan: `Restructure data model entities`,
    });
  }

  return adrs;
}

/**
 * Persist extracted ADRs to leo_adrs and update architecture plan adr_ids.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {Array<Object>} adrs - ADR objects from extractADRs()
 * @param {string|null} architecturePlanId - UUID of the eva_architecture_plans row (nullable)
 * @param {Object} [options]
 * @param {Function} [options.logger] - Logger (default: console)
 * @returns {Promise<{inserted: number, adrIds: string[]}>}
 */
export async function persistADRs(supabase, adrs, architecturePlanId, options = {}) {
  const { logger = console } = options;
  if (!adrs || adrs.length === 0) {
    return { inserted: 0, adrIds: [] };
  }

  // Check for existing ADRs to enable idempotency
  if (architecturePlanId) {
    const { data: existingAdrs } = await supabase
      .from('leo_adrs')
      .select('id, adr_number, decision')
      .eq('architecture_plan_id', architecturePlanId)
      .neq('status', 'superseded');

    if (existingAdrs && existingAdrs.length > 0) {
      const existingMap = new Map(existingAdrs.map(a => [a.adr_number, a]));
      const newAdrs = adrs.filter(adr => {
        const existing = existingMap.get(adr.adr_number);
        if (existing && existing.decision === adr.decision) return false; // identical, skip
        return true;
      });
      if (newAdrs.length === 0) {
        logger.log('[ADR-Extractor] All ADRs already exist (idempotent skip)');
        return { inserted: 0, adrIds: existingAdrs.map(a => a.id) };
      }
      // Filter to only new/changed ADRs
      adrs = newAdrs;
    }
  }

  // Build rows for insertion
  const prdId = options.prdId || `venture:${options.ventureId || 'unknown'}`;
  const rows = adrs.map(adr => ({
    id: adr.id,
    prd_id: prdId,
    adr_number: adr.adr_number,
    title: adr.title,
    status: adr.status,
    decision: adr.decision,
    context: adr.context,
    options: typeof adr.options === 'string' ? JSON.parse(adr.options) : adr.options,
    consequences: typeof adr.consequences === 'string' ? JSON.parse(adr.consequences) : adr.consequences,
    rollback_plan: adr.rollback_plan,
    ...(architecturePlanId ? { architecture_plan_id: architecturePlanId } : {}),
  }));

  const { error: insertError } = await supabase
    .from('leo_adrs')
    .insert(rows);

  if (insertError) {
    logger.warn('[ADR-Extractor] Failed to insert ADRs:', insertError.message);
    return { inserted: 0, adrIds: [] };
  }

  const adrIds = rows.map(r => r.id);
  logger.log(`[ADR-Extractor] Inserted ${rows.length} ADRs`);

  // Update architecture plan adr_ids if plan ID provided
  if (architecturePlanId) {
    // Fetch existing adr_ids to append (not replace)
    const { data: plan } = await supabase
      .from('eva_architecture_plans')
      .select('adr_ids')
      .eq('id', architecturePlanId)
      .single();

    const existingIds = Array.isArray(plan?.adr_ids) ? plan.adr_ids : [];
    const mergedIds = [...new Set([...existingIds, ...adrIds])];

    const { error: updateError } = await supabase
      .from('eva_architecture_plans')
      .update({ adr_ids: mergedIds })
      .eq('id', architecturePlanId);

    if (updateError) {
      logger.warn('[ADR-Extractor] Failed to update architecture plan adr_ids:', updateError.message);
    } else {
      logger.log(`[ADR-Extractor] Updated architecture plan ${architecturePlanId} with ${adrIds.length} ADR IDs`);
    }
  }

  return { inserted: rows.length, adrIds };
}

/**
 * Supersede an existing ADR with a new one.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} oldAdrId - UUID of the ADR to supersede
 * @param {string} newAdrId - UUID of the replacement ADR
 * @returns {Promise<boolean>} true if successful
 */
export async function supersedeADR(supabase, oldAdrId, newAdrId) {
  const { error } = await supabase
    .from('leo_adrs')
    .update({ status: 'superseded', superseded_by: newAdrId })
    .eq('id', oldAdrId);

  return !error;
}

/**
 * Orchestrator entry point: extract ADRs from Stage 14 output and persist.
 * Finds the architecture plan for the venture, extracts ADRs, and persists them.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} ventureId - Venture UUID
 * @param {Object} stageOutput - Stage 14 analysis output
 * @param {Object} [options]
 * @param {Function} [options.logger]
 * @returns {Promise<{adrCount: number, adrIds: string[]}>}
 */
export async function extractAndPersistADRs(supabase, ventureId, stageOutput, options = {}) {
  const { logger = console } = options;

  // Find architecture plan for this venture
  const { data: plan } = await supabase
    .from('eva_architecture_plans')
    .select('id, plan_key, adr_ids')
    .eq('venture_id', ventureId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!plan) {
    logger.warn(`[ADR-Extractor] No architecture plan found for venture ${ventureId} — skipping`);
    return { adrCount: 0, adrIds: [] };
  }

  const adrs = extractADRs(stageOutput);
  if (adrs.length === 0) {
    logger.warn('[ADR-Extractor] No ADRs extracted from Stage 14 output');
    return { adrCount: 0, adrIds: [] };
  }

  logger.log(`[ADR-Extractor] Extracted ${adrs.length} ADRs from Stage 14 for venture ${ventureId}`);

  const result = await persistADRs(supabase, adrs, plan.id, {
    logger,
    prdId: `venture:${ventureId}`,
    ventureId,
  });

  return { adrCount: result.inserted, adrIds: result.adrIds };
}
