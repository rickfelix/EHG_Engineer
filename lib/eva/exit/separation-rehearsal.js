/**
 * Separation Rehearsal Engine
 *
 * Simulates venture separation by analyzing dependencies, shared resources,
 * and integration points across 5 dimensions: technical, data, operational,
 * financial, and legal.
 *
 * Queries Phase 1 tables (venture_asset_registry, venture_exit_profiles) and
 * Phase 2 tables (venture_separability_scores) with graceful degradation when
 * Phase 2 data is unavailable.
 *
 * @module lib/eva/exit/separation-rehearsal
 */

const DIMENSIONS = ['technical', 'data', 'operational', 'financial', 'legal'];

const PASS_THRESHOLD = 70;

/**
 * Returns the default weighting for each separation dimension.
 *
 * @returns {{ technical: number, data: number, operational: number, financial: number, legal: number }}
 */
export function getDefaultDimensionWeights() {
  return {
    technical: 0.25,
    data: 0.25,
    operational: 0.20,
    financial: 0.15,
    legal: 0.15,
  };
}

// ---------------------------------------------------------------------------
// Phase 2 helper: fetch existing separability scores (graceful degradation)
// ---------------------------------------------------------------------------

async function fetchSeparabilityScores(ventureId, supabase) {
  try {
    const { data, error } = await supabase
      .from('venture_separability_scores')
      .select('overall_score, infrastructure_independence, data_portability, ip_clarity, team_dependency, operational_autonomy, metadata, scored_at')
      .eq('venture_id', ventureId)
      .order('scored_at', { ascending: false })
      .limit(1)
      .single();

    if (error) return null;
    return data;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Phase 1 helpers: fetch assets and exit profile
// ---------------------------------------------------------------------------

async function fetchAssets(ventureId, supabase) {
  try {
    const { data, error } = await supabase
      .from('venture_asset_registry')
      .select('id, asset_name, asset_type, estimated_value, description, metadata')
      .eq('venture_id', ventureId);

    if (error) return { assets: [], warning: `venture_asset_registry query failed: ${error.message}` };
    return { assets: data || [] };
  } catch (err) {
    return { assets: [], warning: `venture_asset_registry unavailable: ${err.message}` };
  }
}

async function fetchExitProfile(ventureId, supabase) {
  try {
    const { data, error } = await supabase
      .from('venture_exit_profiles')
      .select('id, notes, target_buyer_type, exit_type, target_timeline')
      .eq('venture_id', ventureId)
      .eq('is_current', true)
      .single();

    if (error) return { profile: null, warning: `venture_exit_profiles query failed: ${error.message}` };
    return { profile: data };
  } catch (err) {
    return { profile: null, warning: `venture_exit_profiles unavailable: ${err.message}` };
  }
}

// ---------------------------------------------------------------------------
// Dimension scorers
// ---------------------------------------------------------------------------

function scoreTechnical(assets, _profile, _phase2Scores) {
  let score = 100;
  const blockers = [];
  const recommendations = [];

  const techTypes = ['infrastructure', 'software', 'domain'];
  const techAssets = assets.filter(a => techTypes.includes(a.asset_type));

  // More infrastructure/software assets = more integration risk
  if (techAssets.length > 5) {
    const deduction = Math.min(40, (techAssets.length - 5) * 8);
    score -= deduction;
    blockers.push(`${techAssets.length} tech assets indicate deep integration`);
  }

  // Shared dependencies detected through metadata
  const sharedDeps = techAssets.filter(a => {
    const meta = a.metadata || {};
    return meta.shared === true || meta.shared_dependency === true;
  });

  if (sharedDeps.length > 0) {
    score -= sharedDeps.length * 10;
    blockers.push(`${sharedDeps.length} shared dependency asset(s) found`);
    recommendations.push('Isolate shared infrastructure components before separation');
  }

  // No tech assets at all is actually good for separability
  if (techAssets.length === 0) {
    recommendations.push('No technical assets registered -- verify asset inventory is complete');
  }

  if (techAssets.length > 0 && sharedDeps.length === 0) {
    recommendations.push('Tech assets exist with no shared dependencies -- well isolated');
  }

  return {
    dimension: 'technical',
    score: Math.max(0, Math.min(100, score)),
    blockers,
    recommendations,
  };
}

function scoreData(assets, _profile, _phase2Scores) {
  let score = 100;
  const blockers = [];
  const recommendations = [];

  const dataTypes = ['data', 'customer_list', 'dataset', 'analytics'];
  const dataAssets = assets.filter(a => dataTypes.includes(a.asset_type));

  // Data assets with shared provenance get lower scores
  const sharedSourceAssets = dataAssets.filter(a => {
    const meta = a.metadata || {};
    return meta.shared_source === true || meta.provenance === 'shared' || meta.shared === true;
  });

  if (sharedSourceAssets.length > 0) {
    const deduction = Math.min(50, sharedSourceAssets.length * 15);
    score -= deduction;
    blockers.push(`${sharedSourceAssets.length} data asset(s) have shared-source provenance`);
    recommendations.push('Establish data ownership and export agreements for shared data sources');
  }

  // Large data footprint adds extraction complexity
  if (dataAssets.length > 3) {
    const deduction = Math.min(20, (dataAssets.length - 3) * 5);
    score -= deduction;
    recommendations.push('Create data migration plan for high-volume data assets');
  }

  if (dataAssets.length === 0) {
    recommendations.push('No data assets registered -- verify data inventory is complete');
  }

  return {
    dimension: 'data',
    score: Math.max(0, Math.min(100, score)),
    blockers,
    recommendations,
  };
}

function scoreOperational(assets, profile, _phase2Scores) {
  let score = 100;
  const blockers = [];
  const recommendations = [];

  const opsTypes = ['process', 'partnership', 'contract', 'service_agreement'];
  const opsAssets = assets.filter(a => opsTypes.includes(a.asset_type));
  const partnerships = assets.filter(a => a.asset_type === 'partnership');

  // More partnerships = more operational coupling
  if (partnerships.length > 2) {
    const deduction = Math.min(35, (partnerships.length - 2) * 10);
    score -= deduction;
    blockers.push(`${partnerships.length} active partnerships create operational coupling`);
    recommendations.push('Review partnership agreements for separation clauses');
  }

  // Process assets indicate operational entanglement
  const processAssets = assets.filter(a => a.asset_type === 'process');
  if (processAssets.length > 3) {
    const deduction = Math.min(20, (processAssets.length - 3) * 5);
    score -= deduction;
    recommendations.push('Document and decouple shared operational processes');
  }

  // Exit profile with defined buyer type improves operational readiness
  if (profile && profile.target_buyer_type) {
    score = Math.min(100, score + 5);
    recommendations.push(`Exit profile targets ${profile.target_buyer_type} -- operational plan can be buyer-specific`);
  }

  if (opsAssets.length === 0) {
    recommendations.push('No operational assets registered -- verify operational inventory');
  }

  return {
    dimension: 'operational',
    score: Math.max(0, Math.min(100, score)),
    blockers,
    recommendations,
  };
}

function scoreFinancial(assets, _profile, _phase2Scores) {
  let score = 100;
  const blockers = [];
  const recommendations = [];

  const financialTypes = ['financial', 'revenue_stream', 'investment', 'account'];
  const financialAssets = assets.filter(a => financialTypes.includes(a.asset_type));

  // Financial asset diversity is good -- but only if they have value
  const valuedAssets = financialAssets.filter(a => Number(a.estimated_value) > 0);

  if (financialAssets.length === 0) {
    score -= 20;
    recommendations.push('No financial assets registered -- document revenue streams and financial instruments');
  } else if (valuedAssets.length < financialAssets.length) {
    const unvalued = financialAssets.length - valuedAssets.length;
    score -= Math.min(15, unvalued * 5);
    recommendations.push(`${unvalued} financial asset(s) lack valuation -- assign estimated values`);
  }

  // Revenue stream independence: check for diversity
  const revenueStreams = assets.filter(a => a.asset_type === 'revenue_stream');
  if (revenueStreams.length === 1) {
    score -= 15;
    blockers.push('Single revenue stream creates financial dependency risk');
    recommendations.push('Diversify revenue sources or document concentration risk mitigation');
  } else if (revenueStreams.length === 0 && financialAssets.length > 0) {
    score -= 10;
    recommendations.push('No explicit revenue streams registered -- document income sources');
  }

  // Shared financial instruments
  const sharedFinancial = financialAssets.filter(a => {
    const meta = a.metadata || {};
    return meta.shared === true || meta.shared_dependency === true;
  });

  if (sharedFinancial.length > 0) {
    score -= sharedFinancial.length * 10;
    blockers.push(`${sharedFinancial.length} shared financial instrument(s) require disentanglement`);
    recommendations.push('Separate shared financial accounts and instruments');
  }

  return {
    dimension: 'financial',
    score: Math.max(0, Math.min(100, score)),
    blockers,
    recommendations,
  };
}

function scoreLegal(assets, _profile, _phase2Scores) {
  let score = 100;
  const blockers = [];
  const recommendations = [];

  const legalTypes = ['contract', 'license', 'patent', 'trademark', 'intellectual_property', 'legal_agreement'];
  const legalAssets = assets.filter(a => legalTypes.includes(a.asset_type));

  // Restrictive licenses reduce separability
  const licenses = assets.filter(a => a.asset_type === 'license');
  const restrictiveLicenses = licenses.filter(a => {
    const meta = a.metadata || {};
    const desc = (a.description || '').toLowerCase();
    return meta.restrictive === true || meta.exclusive === true
      || desc.includes('exclusive') || desc.includes('non-transferable');
  });

  if (restrictiveLicenses.length > 0) {
    const deduction = Math.min(40, restrictiveLicenses.length * 15);
    score -= deduction;
    blockers.push(`${restrictiveLicenses.length} restrictive/non-transferable license(s) found`);
    recommendations.push('Review license transfer provisions and negotiate assignability clauses');
  }

  // Contracts without transfer clauses
  const contracts = assets.filter(a => a.asset_type === 'contract');
  if (contracts.length > 3) {
    score -= Math.min(20, (contracts.length - 3) * 5);
    recommendations.push('Audit contracts for change-of-control and assignment provisions');
  }

  // Patents and trademarks are generally positive for clean separation
  const patents = assets.filter(a => a.asset_type === 'patent' || a.asset_type === 'trademark');
  if (patents.length > 0) {
    score = Math.min(100, score + 5);
    recommendations.push(`${patents.length} registered IP asset(s) support clean ownership transfer`);
  }

  if (legalAssets.length === 0) {
    recommendations.push('No legal assets registered -- verify legal inventory is complete');
  }

  return {
    dimension: 'legal',
    score: Math.max(0, Math.min(100, score)),
    blockers,
    recommendations,
  };
}

const DIMENSION_SCORERS = {
  technical: scoreTechnical,
  data: scoreData,
  operational: scoreOperational,
  financial: scoreFinancial,
  legal: scoreLegal,
};

// ---------------------------------------------------------------------------
// Shared resource and critical dependency detection
// ---------------------------------------------------------------------------

function detectSharedResources(assets) {
  return assets
    .filter(a => {
      const meta = a.metadata || {};
      return meta.shared === true || meta.shared_dependency === true || meta.shared_source === true;
    })
    .map(a => ({
      id: a.id,
      name: a.asset_name,
      type: a.asset_type,
      description: a.description,
    }));
}

function detectCriticalDependencies(assets, profile) {
  const dependencies = [];

  // Assets flagged as critical in metadata
  const criticalAssets = assets.filter(a => {
    const meta = a.metadata || {};
    return meta.critical === true || meta.dependency_level === 'critical';
  });

  for (const a of criticalAssets) {
    dependencies.push({
      asset_id: a.id,
      name: a.asset_name,
      type: a.asset_type,
      reason: 'Asset flagged as critical dependency',
    });
  }

  // Partnerships are implicit critical dependencies
  const partnerships = assets.filter(a => a.asset_type === 'partnership');
  for (const p of partnerships) {
    dependencies.push({
      asset_id: p.id,
      name: p.asset_name,
      type: 'partnership',
      reason: 'Active partnership requires separation agreement',
    });
  }

  // Exit profile indicates buyer-specific dependencies
  if (profile && profile.exit_type === 'strategic_acquisition') {
    dependencies.push({
      asset_id: null,
      name: 'Strategic Acquisition Alignment',
      type: 'exit_strategy',
      reason: 'Strategic acquisition exit type requires buyer-aligned separation plan',
    });
  }

  return dependencies;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Simulate venture separation by analyzing dependencies, shared resources,
 * and integration points across 5 dimensions.
 *
 * @param {string} ventureId - Venture UUID
 * @param {'dry_run'|'full'} mode - dry_run for read-only analysis, full for threshold validation
 * @param {Object} supabase - Supabase client instance
 * @returns {Promise<Object>} Rehearsal result
 */
export async function rehearseSeparation(ventureId, mode, supabase) {
  const warnings = [];

  // --- Input validation ---
  if (!ventureId) {
    return {
      mode: mode || 'dry_run',
      overall_separable: false,
      overall_score: 0,
      dimension_results: [],
      shared_resources: [],
      critical_dependencies: [],
      warnings: ['ventureId is required'],
    };
  }

  if (!supabase) {
    return {
      mode: mode || 'dry_run',
      overall_separable: false,
      overall_score: 0,
      dimension_results: [],
      shared_resources: [],
      critical_dependencies: [],
      warnings: ['supabase client is required'],
    };
  }

  const effectiveMode = mode === 'full' ? 'full' : 'dry_run';

  // --- Fetch Phase 1 data ---
  const { assets, warning: assetWarning } = await fetchAssets(ventureId, supabase);
  if (assetWarning) warnings.push(assetWarning);

  const { profile, warning: profileWarning } = await fetchExitProfile(ventureId, supabase);
  if (profileWarning) warnings.push(profileWarning);

  // --- Fetch Phase 2 data (graceful degradation) ---
  const phase2Scores = await fetchSeparabilityScores(ventureId, supabase);
  if (!phase2Scores) {
    warnings.push('Phase 2 separability scores unavailable -- using asset-based analysis only');
  }

  // --- Score each dimension ---
  const weights = getDefaultDimensionWeights();
  const dimensionResults = [];

  for (const dim of DIMENSIONS) {
    try {
      const result = DIMENSION_SCORERS[dim](assets, profile, phase2Scores);
      dimensionResults.push(result);
    } catch (err) {
      warnings.push(`${dim} scoring failed: ${err.message}`);
      dimensionResults.push({
        dimension: dim,
        score: 0,
        blockers: [`Scoring error: ${err.message}`],
        recommendations: ['Investigate scoring failure and retry'],
      });
    }
  }

  // --- Compute weighted overall score ---
  let weightedSum = 0;
  for (const result of dimensionResults) {
    const w = weights[result.dimension] || 0;
    weightedSum += result.score * w;
  }
  const overallScore = Math.round(weightedSum * 100) / 100;

  // --- Detect shared resources and critical dependencies ---
  const sharedResources = detectSharedResources(assets);
  const criticalDependencies = detectCriticalDependencies(assets, profile);

  // --- Determine separability ---
  let overallSeparable;
  if (effectiveMode === 'full') {
    overallSeparable = overallScore >= PASS_THRESHOLD;
  } else {
    // dry_run: report separability assessment without authoritative pass/fail
    overallSeparable = overallScore >= PASS_THRESHOLD;
  }

  return {
    mode: effectiveMode,
    overall_separable: overallSeparable,
    overall_score: overallScore,
    dimension_results: dimensionResults,
    shared_resources: sharedResources,
    critical_dependencies: criticalDependencies,
    warnings,
  };
}

export { DIMENSIONS, PASS_THRESHOLD };
