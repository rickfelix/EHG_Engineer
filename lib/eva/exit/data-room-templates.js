/**
 * Data Room Templates
 *
 * Defines required due diligence documents per exit model type and evaluates
 * completeness against existing data room artifacts.
 *
 * Each exit model maps to a set of required documents. The checklist generator
 * queries live data to determine which documents are present, missing, or stale.
 *
 * @module lib/eva/exit/data-room-templates
 */

// ── Template Definitions ────────────────────────────────────

function doc(document_type, title, source_table = 'venture_data_room_artifacts', opts = {}) {
  return {
    document_type,
    title,
    required: true,
    source_table,
    ...opts,
  };
}

export const DATA_ROOM_TEMPLATES = Object.freeze({
  full_acquisition: [
    doc('financial_summary', 'Financial Summary'),
    doc('customer_list', 'Customer List'),
    doc('technical_architecture', 'Technical Architecture'),
    doc('dependency_map', 'Dependency Map'),
    doc('integration_inventory', 'Integration Inventory'),
    doc('separation_plan', 'Separation Plan'),
    doc('revenue_history', 'Revenue History'),
    doc('asset_inventory', 'Asset Inventory', 'venture_asset_registry'),
    doc('legal_summary', 'Legal Summary'),
  ],

  licensing: [
    doc('ip_portfolio', 'IP Portfolio', 'venture_asset_registry', {
      filter: { asset_type: ['intellectual_property', 'patent', 'trademark'] },
    }),
    doc('license_terms', 'License Terms'),
    doc('technical_documentation', 'Technical Documentation'),
    doc('revenue_projections', 'Revenue Projections'),
  ],

  acqui_hire: [
    doc('team_roster', 'Team Roster'),
    doc('compensation_structure', 'Compensation Structure'),
    doc('ip_assignment', 'IP Assignment'),
    doc('retention_plan', 'Retention Plan'),
  ],

  revenue_share: [
    doc('revenue_history', 'Revenue History'),
    doc('financial_projections', 'Financial Projections'),
    doc('partnership_terms', 'Partnership Terms'),
    doc('metric_dashboard', 'Metric Dashboard'),
  ],

  merger: [
    doc('financial_summary', 'Financial Summary'),
    doc('technical_architecture', 'Technical Architecture'),
    doc('dependency_map', 'Dependency Map'),
    doc('integration_inventory', 'Integration Inventory'),
    doc('asset_inventory', 'Asset Inventory', 'venture_asset_registry'),
    doc('legal_summary', 'Legal Summary'),
  ],

  wind_down: [
    doc('asset_inventory', 'Asset Inventory', 'venture_asset_registry'),
    doc('legal_summary', 'Legal Summary'),
    doc('financial_summary', 'Financial Summary'),
  ],
});

const VALID_EXIT_MODELS = Object.keys(DATA_ROOM_TEMPLATES);

// ── Public API ──────────────────────────────────────────────

/**
 * Return the list of required documents for a given exit model.
 *
 * @param {string} exitModel - One of: full_acquisition, licensing, acqui_hire,
 *   revenue_share, merger, wind_down
 * @returns {Array<Object>} Array of template items, each with document_type,
 *   title, required, source_table. Returns empty array for unknown models.
 */
export function getDataRoomTemplate(exitModel) {
  if (!exitModel || !DATA_ROOM_TEMPLATES[exitModel]) {
    return [];
  }
  // Return copies so callers cannot mutate the frozen template
  return DATA_ROOM_TEMPLATES[exitModel].map(item => ({ ...item }));
}

/**
 * Generate a completeness checklist for a venture's data room.
 *
 * 1. Queries venture_exit_profiles for the current exit model
 * 2. Gets the template for that model
 * 3. Checks venture_data_room_artifacts for existing artifacts (status=current)
 * 4. Checks venture_asset_registry for asset-based items
 * 5. Returns completeness report
 *
 * @param {string} ventureId - Venture UUID
 * @param {Object} supabase - Supabase client
 * @returns {Promise<Object>} Checklist result
 */
export async function generateDataRoomChecklist(ventureId, supabase) {
  const warnings = [];

  if (!ventureId || !supabase) {
    return {
      error: 'Missing ventureId or supabase client',
      exit_model: null,
      total_required: 0,
      completed: 0,
      completion_pct: 0,
      items: [],
      warnings: ['Missing required parameters'],
    };
  }

  // ── 1. Get current exit profile ────────────────────────────
  let exitModel = null;
  try {
    const { data: profile, error } = await supabase
      .from('venture_exit_profiles')
      .select('exit_model')
      .eq('venture_id', ventureId)
      .eq('is_current', true)
      .single();

    if (error) {
      warnings.push(`venture_exit_profiles query error: ${error.message}`);
    }
    exitModel = profile?.exit_model || null;
  } catch (err) {
    warnings.push(`venture_exit_profiles unavailable: ${err.message}`);
  }

  if (!exitModel || !VALID_EXIT_MODELS.includes(exitModel)) {
    return {
      error: exitModel ? `Unknown exit model: ${exitModel}` : 'No current exit profile found',
      exit_model: exitModel,
      total_required: 0,
      completed: 0,
      completion_pct: 0,
      items: [],
      warnings,
    };
  }

  // ── 2. Get template ────────────────────────────────────────
  const template = getDataRoomTemplate(exitModel);

  // ── 3. Query existing data room artifacts ──────────────────
  let existingArtifacts = [];
  try {
    const { data, error } = await supabase
      .from('venture_data_room_artifacts')
      .select('artifact_type, is_current, updated_at')
      .eq('venture_id', ventureId)
      .eq('is_current', true);

    if (error) {
      warnings.push(`venture_data_room_artifacts query error: ${error.message}`);
    } else {
      existingArtifacts = data || [];
    }
  } catch (err) {
    warnings.push(`venture_data_room_artifacts unavailable: ${err.message}`);
  }

  const artifactTypeSet = new Set(existingArtifacts.map(a => a.artifact_type));

  // ── 4. Query asset registry for asset-based items ──────────
  let assetRegistryItems = [];
  try {
    const { data, error } = await supabase
      .from('venture_asset_registry')
      .select('id, asset_type')
      .eq('venture_id', ventureId);

    if (error) {
      warnings.push(`venture_asset_registry query error: ${error.message}`);
    } else {
      assetRegistryItems = data || [];
    }
  } catch (err) {
    warnings.push(`venture_asset_registry unavailable: ${err.message}`);
  }

  // ── 5. Evaluate each template item ─────────────────────────
  const STALE_THRESHOLD_DAYS = 90;
  const staleDate = new Date(Date.now() - STALE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000);

  const items = template.map(item => {
    let status = 'missing';

    if (item.source_table === 'venture_asset_registry') {
      // Check asset registry; use filter if specified
      let matchingAssets;
      if (item.filter?.asset_type) {
        matchingAssets = assetRegistryItems.filter(a =>
          item.filter.asset_type.includes(a.asset_type)
        );
      } else {
        matchingAssets = assetRegistryItems;
      }
      status = matchingAssets.length > 0 ? 'complete' : 'missing';
    } else {
      // Check data room artifacts table
      if (artifactTypeSet.has(item.document_type)) {
        const artifact = existingArtifacts.find(a => a.artifact_type === item.document_type);
        const updatedAt = artifact?.updated_at ? new Date(artifact.updated_at) : null;
        if (updatedAt && updatedAt < staleDate) {
          status = 'stale';
        } else {
          status = 'complete';
        }
      }
    }

    return {
      document_type: item.document_type,
      title: item.title,
      required: item.required,
      status,
      source_table: item.source_table,
    };
  });

  const totalRequired = items.filter(i => i.required).length;
  const completed = items.filter(i => i.required && i.status === 'complete').length;
  const completionPct = totalRequired > 0 ? Math.round((completed / totalRequired) * 100) : 0;

  return {
    exit_model: exitModel,
    total_required: totalRequired,
    completed,
    completion_pct: completionPct,
    items,
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}
