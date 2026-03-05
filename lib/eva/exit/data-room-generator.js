/**
 * Data Room Artifact Generator
 *
 * SD: SD-VENTURE-ACQUISITIONREADINESS-ARCHITECTURE-ORCH-001-B (FR-002)
 *
 * Generates 5 data room artifact types for exit readiness:
 *   1. Financial Summary
 *   2. IP Portfolio
 *   3. Team Overview
 *   4. Operations Snapshot
 *   5. Asset Inventory
 *
 * Each artifact is versioned with content hashing for change detection.
 *
 * @module lib/eva/exit/data-room-generator
 */

import { createHash } from 'crypto';

const ARTIFACT_TYPES = ['financial', 'ip', 'team', 'operations', 'assets'];

function contentHash(obj) {
  return createHash('sha256').update(JSON.stringify(obj)).digest('hex').slice(0, 16);
}

async function generateFinancial(ventureId, { supabase }) {
  const { data: assets } = await supabase
    .from('venture_asset_registry')
    .select('estimated_value, asset_type')
    .eq('venture_id', ventureId);

  const totalValue = (assets || []).reduce((sum, a) => sum + (Number(a.estimated_value) || 0), 0);
  const byType = {};
  for (const a of assets || []) {
    byType[a.asset_type] = (byType[a.asset_type] || 0) + (Number(a.estimated_value) || 0);
  }

  return {
    total_asset_value: totalValue,
    asset_count: (assets || []).length,
    value_by_type: byType,
    generated_at: new Date().toISOString(),
  };
}

async function generateIP(ventureId, { supabase }) {
  const { data: assets } = await supabase
    .from('venture_asset_registry')
    .select('asset_name, asset_type, description')
    .eq('venture_id', ventureId)
    .in('asset_type', ['intellectual_property', 'patent', 'trademark', 'license', 'software']);

  return {
    ip_assets: (assets || []).map(a => ({
      name: a.asset_name,
      type: a.asset_type,
      description: a.description,
    })),
    ip_count: (assets || []).length,
    generated_at: new Date().toISOString(),
  };
}

async function generateTeam(ventureId, { supabase }) {
  const { data: profile } = await supabase
    .from('venture_exit_profiles')
    .select('notes, target_buyer_type')
    .eq('venture_id', ventureId)
    .eq('is_current', true)
    .single();

  const { data: contracts } = await supabase
    .from('venture_asset_registry')
    .select('asset_name, description')
    .eq('venture_id', ventureId)
    .in('asset_type', ['contract', 'partnership']);

  return {
    exit_profile_notes: profile?.notes || null,
    target_buyer_type: profile?.target_buyer_type || null,
    contracts: (contracts || []).map(c => ({ name: c.asset_name, description: c.description })),
    contract_count: (contracts || []).length,
    generated_at: new Date().toISOString(),
  };
}

async function generateOperations(ventureId, { supabase }) {
  const { data: venture } = await supabase
    .from('eva_ventures')
    .select('name, status')
    .eq('id', ventureId)
    .single();

  const { data: assets } = await supabase
    .from('venture_asset_registry')
    .select('id')
    .eq('venture_id', ventureId);

  return {
    venture_name: venture?.name || 'Unknown',
    venture_status: venture?.status || 'unknown',
    total_assets: (assets || []).length,
    generated_at: new Date().toISOString(),
  };
}

async function generateAssets(ventureId, { supabase }) {
  const { data: assets } = await supabase
    .from('venture_asset_registry')
    .select('id, asset_name, asset_type, estimated_value, description, created_at')
    .eq('venture_id', ventureId)
    .order('created_at', { ascending: false });

  return {
    assets: (assets || []).map(a => ({
      id: a.id,
      name: a.asset_name,
      type: a.asset_type,
      value: a.estimated_value,
      description: a.description,
    })),
    total_count: (assets || []).length,
    generated_at: new Date().toISOString(),
  };
}

const GENERATORS = {
  financial: generateFinancial,
  ip: generateIP,
  team: generateTeam,
  operations: generateOperations,
  assets: generateAssets,
};

/**
 * Generate data room artifacts for a venture.
 *
 * @param {string} ventureId - Venture UUID
 * @param {Object} deps - { supabase, logger?, types? }
 * @returns {Promise<Object>} Generation result
 */
export async function generateDataRoom(ventureId, deps = {}) {
  const { supabase, logger = console, types } = deps;

  if (!ventureId || !supabase) {
    return { error: 'Missing ventureId or supabase', artifacts: [], error_count: 1 };
  }

  const targetTypes = types || ARTIFACT_TYPES;
  const artifacts = [];
  let errorCount = 0;

  for (const type of targetTypes) {
    try {
      const generator = GENERATORS[type];
      if (!generator) {
        logger.warn(`[data-room-generator] Unknown type: ${type}`);
        errorCount++;
        continue;
      }

      const content = await generator(ventureId, { supabase });
      const hash = contentHash(content);

      // Check if content changed from current version
      const { data: existing } = await supabase
        .from('venture_data_room_artifacts')
        .select('id, content_hash, artifact_version')
        .eq('venture_id', ventureId)
        .eq('artifact_type', type)
        .eq('is_current', true)
        .single();

      if (existing && existing.content_hash === hash) {
        artifacts.push({ type, status: 'unchanged', version: existing.artifact_version });
        continue;
      }

      // Mark previous as not current
      if (existing) {
        await supabase
          .from('venture_data_room_artifacts')
          .update({ is_current: false, updated_at: new Date().toISOString() })
          .eq('id', existing.id);
      }

      const nextVersion = (existing?.artifact_version || 0) + 1;

      const { data, error } = await supabase
        .from('venture_data_room_artifacts')
        .insert({
          venture_id: ventureId,
          artifact_type: type,
          artifact_version: nextVersion,
          content,
          content_hash: hash,
          is_current: true,
        })
        .select('id, artifact_version')
        .single();

      if (error) {
        logger.error(`[data-room-generator] ${type}: ${error.message}`);
        errorCount++;
      } else {
        artifacts.push({ type, status: 'generated', version: data.artifact_version, id: data.id });
      }
    } catch (err) {
      logger.error(`[data-room-generator] ${type} error: ${err.message}`);
      errorCount++;
    }
  }

  logger.info(`[data-room-generator] Venture ${ventureId}: ${artifacts.length} artifacts, ${errorCount} errors`);
  return {
    venture_id: ventureId,
    artifacts,
    error_count: errorCount,
    generated_at: new Date().toISOString(),
  };
}

export { ARTIFACT_TYPES };
