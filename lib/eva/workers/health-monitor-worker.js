/**
 * HealthMonitorWorker — Monitors venture workflow health.
 * Detects stale executions, failing stages, and blocked ventures.
 * Logs alerts for the workflow alerts hook to pick up.
 *
 * SD-LEO-ORCH-EVA-STAGE-PIPELINE-001-I
 */

import { BaseWorker } from './base-worker.js';
import { fetchAllPaginated } from '../../db/fetch-all-paginated.mjs';

/** A workflow is stale if no update in this many hours */
const STALE_THRESHOLD_HOURS = 24;

export class HealthMonitorWorker extends BaseWorker {
  constructor(opts = {}) {
    super('health-monitor', { intervalMs: 300_000, ...opts }); // every 5 min
  }

  async execute() {
    if (!this.supabase) return;

    const staleThreshold = new Date(
      Date.now() - STALE_THRESHOLD_HOURS * 3_600_000,
    ).toISOString();

    // 1. Detect stale in-progress workflow executions. Paginated (FR-6 batch 7):
    // a capped read would silently miss stale executions. Errors degrade to []
    // (prior destructure-without-error-check behavior).
    const stale = await fetchAllPaginated(() => this.supabase
      .from('workflow_executions')
      .select('id, venture_id, current_lifecycle_stage, updated_at') // schema-lint-disable-line — pre-existing reference on main (workflow_executions.current_lifecycle_stage — EHG-app pipeline table absent from the Engineer snapshot); moved into diff by FR-6 batch 7 rewrap
      .eq('status', 'in_progress')
      .lt('updated_at', staleThreshold)
      .order('id', { ascending: true })).catch(() => []);

    if (stale?.length) {
      this._log('stale-detected', {
        count: stale.length,
        ventureIds: stale.map((s) => s.venture_id),
      });
      // Log structured alerts to workflow_executions
      for (const s of stale) {
        await this._logAlert(s.venture_id, 'stale_execution', 'warning', {
          workflow_execution_id: s.id,
          current_stage: s.current_lifecycle_stage,
          last_updated: s.updated_at,
          stale_threshold_hours: STALE_THRESHOLD_HOURS,
        });
      }
    }

    // 2. Detect repeated failures on same stage (3+ failures). Paginated (FR-6
    // batch 7): failed executions accumulate without bound — a capped read would
    // silently undercount repeated failures. Errors degrade to [] (prior behavior).
    const failedExecs = await fetchAllPaginated(() => this.supabase
      .from('stage_executions')
      .select('id, execution_id, stage_number') // schema-lint-disable-line — pre-existing reference on main (stage_executions.execution_id/stage_number — EHG-app pipeline table absent from the Engineer snapshot); moved into diff by FR-6 batch 7 rewrap
      .eq('status', 'failed')
      .order('id', { ascending: true })).catch(() => []);

    if (failedExecs?.length) {
      const failureCounts = new Map();
      for (const f of failedExecs) {
        const key = `${f.execution_id}:${f.stage_number}`;
        failureCounts.set(key, (failureCounts.get(key) || 0) + 1);
      }
      const repeatedFailures = [...failureCounts.entries()].filter(
        ([, count]) => count >= 3,
      );
      if (repeatedFailures.length) {
        this._log('repeated-failures', {
          count: repeatedFailures.length,
          stages: repeatedFailures.map(([key]) => key),
        });
        // Log high-severity alert for repeated failures
        for (const [key, count] of repeatedFailures) {
          const [executionId, stageNum] = key.split(':');
          await this._logAlert(null, 'repeated_stage_failure', 'critical', {
            execution_id: executionId,
            stage_number: parseInt(stageNum, 10),
            failure_count: count,
          });
        }
      }
    }

    // 3. Count active vs total ventures
    const { count: activeCount } = await this.supabase
      .from('workflow_executions')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'in_progress');

    const { count: totalCount } = await this.supabase
      .from('workflow_executions')
      .select('id', { count: 'exact', head: true });

    this._log('health-summary', {
      activeWorkflows: activeCount ?? 0,
      totalWorkflows: totalCount ?? 0,
      staleWorkflows: stale?.length ?? 0,
    });
  }

  /**
   * Log a structured alert to workflow_executions for queryability.
   *
   * SD-MAN-INFRA-VENTURE-ARTIFACT-PIPELINE-003
   *
   * @param {string|null} ventureId
   * @param {string} alertType - e.g. 'stale_execution', 'repeated_stage_failure'
   * @param {'info'|'warning'|'critical'} severity
   * @param {Object} details - Alert-specific data
   */
  async _logAlert(ventureId, alertType, severity, details) {
    try {
      const { error } = await this.supabase
        .from('workflow_executions')
        .insert({
          venture_id: ventureId,
          workflow_template_id: 'health-monitor-alert',
          status: alertType,
          current_stage_data: {
            alert_type: alertType,
            severity,
            details,
            detected_by: 'health-monitor-worker',
            detected_at: new Date().toISOString(),
          },
        });

      if (error) {
        this._log('alert-log-failed', { alertType, error: error.message });
      }
    } catch (err) {
      this._log('alert-log-error', { alertType, error: err.message });
    }
  }
}
