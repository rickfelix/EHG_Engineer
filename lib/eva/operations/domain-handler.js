/**
 * Operations Domain Handler for EVA Master Scheduler
 *
 * SD: SD-LEO-ORCH-EVA-STAGE-PIPELINE-001-I
 *
 * Registers 6 operations workers with the scheduler's domain registry:
 * - financial_sync (hourly) - Validate financial contracts across ventures
 * - feedback_classify (real-time/event) - Classify incoming feedback items
 * - metrics_collect (every 6h) - Collect AARRR metrics from active ventures
 * - health_score (hourly) - Run health checks on all registered services
 * - enhancement_detect (daily) - Scan retrospectives for enhancement signals
 * - operations_status (hourly) - Aggregate and persist operations snapshot
 *
 * @module lib/eva/operations/domain-handler
 */

/**
 * Register all operations workers with the scheduler's domain registry.
 *
 * @param {import('../service-registry.js').ServiceRegistry} domainRegistry
 */
export function registerOperationsHandlers(domainRegistry) {
  domainRegistry.register('ops_financial_sync', async (params) => {
    const { validateConsistency, getContract } = await import('../contracts/financial-contract.js');
    const { supabase, logger = console } = params;

    const { data: ventures } = await supabase
      .from('eva_ventures')
      .select('id')
      .in('status', ['active', 'in_progress'])
      .limit(50);

    const results = [];
    for (const v of ventures || []) {
      const contract = await getContract(v.id, { supabase });
      if (contract) {
        results.push({ ventureId: v.id, hasContract: true });
      }
    }

    logger.info(`[ops_financial_sync] Checked ${results.length} venture(s)`);
    return { checked: results.length, timestamp: new Date().toISOString() };
  });

  domainRegistry.register('ops_feedback_classify', async (params) => {
    const { classifyFeedback } = await import('../feedback-dimension-classifier.js');
    const { supabase, logger = console } = params;

    // Verify feedback_items table exists before querying (migration safety)
    const { error: probeError } = await supabase
      .from('feedback_items')
      .select('id', { count: 'exact', head: true })
      .limit(0);

    if (probeError) {
      logger.warn(`[ops_feedback_classify] feedback_items table not available: ${probeError.message}`);
      return { classified: 0, total: 0, skipped: true, reason: probeError.message, timestamp: new Date().toISOString() };
    }

    const { data: unclassified } = await supabase
      .from('feedback_items')
      .select('id, title, description')
      .is('dimension_code', null)
      .limit(20);

    let classified = 0;
    for (const item of unclassified || []) {
      const result = await classifyFeedback(item.title, item.description || '', supabase);
      if (result?.dimensionCode) {
        await supabase
          .from('feedback_items')
          .update({ dimension_code: result.dimensionCode })
          .eq('id', item.id);
        classified++;
      }
    }

    logger.info(`[ops_feedback_classify] Classified ${classified}/${(unclassified || []).length} item(s)`);
    return { classified, total: (unclassified || []).length, timestamp: new Date().toISOString() };
  });

  domainRegistry.register('ops_metrics_collect', async (params) => {
    const { supabase, logger = console } = params;
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();

    // Pipeline throughput metrics
    const { count: activeVentures } = await supabase
      .from('eva_ventures')
      .select('id', { count: 'exact', head: true })
      .in('status', ['active', 'in_progress']);

    const { count: completedStages } = await supabase
      .from('eva_stage_gate_results')
      .select('id', { count: 'exact', head: true })
      .eq('passed', true)
      .gte('created_at', sixHoursAgo);

    // AARRR business metrics from venture_financial_contract
    const { data: contracts } = await supabase
      .from('venture_financial_contract')
      .select('venture_id, cac_estimate, ltv_estimate, pricing_model, revenue_projection')
      .limit(50);

    const aarrr = {
      acquisition: { ventures_with_cac: (contracts || []).filter(c => c.cac_estimate).length },
      revenue: { ventures_with_ltv: (contracts || []).filter(c => c.ltv_estimate).length },
      total_contracts: (contracts || []).length,
    };

    const snapshot = {
      metric_type: 'ops_metrics_combined',
      metric_value: JSON.stringify({
        pipeline: { activeVentures, completedStages6h: completedStages },
        aarrr,
      }),
      created_at: new Date().toISOString(),
    };

    await supabase.from('eva_scheduler_metrics').insert(snapshot);

    logger.info(`[ops_metrics_collect] Active: ${activeVentures}, Stages (6h): ${completedStages}, Contracts: ${aarrr.total_contracts}`);
    return snapshot;
  });

  domainRegistry.register('ops_health_score', async (params) => {
    const { getSystemHealth, sweepStaleServices } = await import('../hub-health-monitor.js');
    const { logger = console } = params;

    sweepStaleServices();
    const health = getSystemHealth();

    logger.info(`[ops_health_score] System: ${health.status}, Services: ${health.services?.length || 0}`);
    return { ...health, timestamp: new Date().toISOString() };
  });

  domainRegistry.register('ops_enhancement_detect', async (params) => {
    const { captureSignals } = await import('../../retrospective-signals/index.js');
    const { supabase, logger = console } = params;

    // Get recent retrospectives to scan for enhancement signals
    const { data: retros } = await supabase
      .from('retrospectives')
      .select('id, what_went_well, what_needs_improvement, key_learnings')
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .limit(10);

    let detected = 0;
    for (const retro of retros || []) {
      const text = [retro.what_went_well, retro.what_needs_improvement, retro.key_learnings]
        .filter(Boolean)
        .join(' ');
      if (text.length > 20) {
        const result = await captureSignals(text, { sessionId: 'ops_enhancement_detect', sdId: retro.id });
        if (result?.count > 0) detected += result.count;
      }
    }

    logger.info(`[ops_enhancement_detect] Scanned ${(retros || []).length} retro(s), detected ${detected} signal(s)`);
    return { scanned: (retros || []).length, detected, timestamp: new Date().toISOString() };
  });

  // ── Phase 2: Exit Readiness Workers ─────────────────────────
  // SD: SD-VENTURE-ACQUISITIONREADINESS-ARCHITECTURE-ORCH-001-B

  domainRegistry.register('ops_separability_score', async (params) => {
    const { computeSeparabilityScore } = await import('../exit/separability-scorer.js');
    const { supabase, logger = console } = params;

    const { data: ventures } = await supabase
      .from('eva_ventures')
      .select('id')
      .in('status', ['active', 'in_progress'])
      .limit(50);

    let scored = 0;
    for (const v of ventures || []) {
      const result = await computeSeparabilityScore(v.id, { supabase, logger });
      if (result) scored++;
    }

    logger.info(`[ops_separability_score] Scored ${scored}/${(ventures || []).length} venture(s)`);
    return { scored, total: (ventures || []).length, timestamp: new Date().toISOString() };
  });

  domainRegistry.register('ops_data_room_refresh', async (params) => {
    const { generateDataRoom } = await import('../exit/data-room-generator.js');
    const { supabase, logger = console } = params;

    const { data: ventures } = await supabase
      .from('eva_ventures')
      .select('id')
      .in('status', ['active', 'in_progress'])
      .limit(50);

    let refreshed = 0;
    for (const v of ventures || []) {
      const result = await generateDataRoom(v.id, { supabase, logger });
      if (result && !result.error) refreshed++;
    }

    logger.info(`[ops_data_room_refresh] Refreshed ${refreshed}/${(ventures || []).length} venture(s)`);
    return { refreshed, total: (ventures || []).length, timestamp: new Date().toISOString() };
  });

  domainRegistry.register('ops_status_snapshot', async (params) => {
    const { getOperationsStatus } = await import('./index.js');
    const { supabase, logger = console } = params;

    const status = await getOperationsStatus({ supabase, logger });

    // Persist snapshot to scheduler metrics
    await supabase.from('eva_scheduler_metrics').insert({
      metric_type: 'ops_status_snapshot',
      metric_value: JSON.stringify(status),
      created_at: status.timestamp,
    });

    logger.info(`[ops_status_snapshot] Overall: ${status.overall}`);
    return status;
  });
}

/**
 * Operations worker cadence configuration.
 * Used by scheduler to determine execution frequency.
 */
export const OPERATIONS_CADENCES = {
  ops_financial_sync: 'hourly',
  ops_feedback_classify: 'frequent',   // 10 min (event-driven fallback)
  ops_metrics_collect: 'six_hourly',
  ops_health_score: 'hourly',
  ops_enhancement_detect: 'daily',
  ops_status_snapshot: 'hourly',
  ops_separability_score: 'daily',
  ops_data_room_refresh: 'daily',
};
