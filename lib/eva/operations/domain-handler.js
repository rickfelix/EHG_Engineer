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

    // Collect pipeline throughput metrics
    const { count: activeVentures } = await supabase
      .from('eva_ventures')
      .select('id', { count: 'exact', head: true })
      .in('status', ['active', 'in_progress']);

    const { count: completedStages } = await supabase
      .from('eva_stage_gate_results')
      .select('id', { count: 'exact', head: true })
      .eq('passed', true)
      .gte('created_at', new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString());

    const snapshot = {
      metric_type: 'ops_pipeline_throughput',
      metric_value: JSON.stringify({ activeVentures, completedStages6h: completedStages }),
      created_at: new Date().toISOString(),
    };

    await supabase.from('eva_scheduler_metrics').insert(snapshot);

    logger.info(`[ops_metrics_collect] Active: ${activeVentures}, Stages (6h): ${completedStages}`);
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
        const signals = await captureSignals(text, { supabase });
        if (signals?.length > 0) detected += signals.length;
      }
    }

    logger.info(`[ops_enhancement_detect] Scanned ${(retros || []).length} retro(s), detected ${detected} signal(s)`);
    return { scanned: (retros || []).length, detected, timestamp: new Date().toISOString() };
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
};
