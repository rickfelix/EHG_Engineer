/**
 * MetricsCollectorWorker — Collects and aggregates performance metrics
 * from stage executions for the dashboard.
 *
 * SD-LEO-ORCH-EVA-STAGE-PIPELINE-001-I
 */

import { BaseWorker } from './base-worker.js';

export class MetricsCollectorWorker extends BaseWorker {
  constructor(opts = {}) {
    super('metrics-collector', { intervalMs: 60_000, ...opts }); // every 1 min
  }

  async execute() {
    if (!this.supabase) return;

    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    // Collect today's stage execution stats
    const { data: todayExecs } = await this.supabase
      .from('stage_executions')
      .select('status, duration_minutes, stage_number')
      .gte('updated_at', todayStart.toISOString());

    if (!todayExecs?.length) {
      this._log('no-data');
      return;
    }

    const completed = todayExecs.filter((e) => e.status === 'completed');
    const failed = todayExecs.filter((e) => e.status === 'failed');
    const inProgress = todayExecs.filter(
      (e) => e.status === 'in_progress' || e.status === 'running',
    );

    // Stage velocity: average duration per stage number
    const velocity = {};
    const counts = {};
    for (const exec of completed) {
      if (exec.duration_minutes) {
        velocity[exec.stage_number] =
          (velocity[exec.stage_number] || 0) + exec.duration_minutes;
        counts[exec.stage_number] = (counts[exec.stage_number] || 0) + 1;
      }
    }
    for (const stage of Object.keys(velocity)) {
      velocity[stage] = Math.round(velocity[stage] / (counts[stage] || 1));
    }

    // Throughput
    const throughput = completed.length;
    const errorRate =
      completed.length + failed.length > 0
        ? failed.length / (completed.length + failed.length)
        : 0;

    this._log('metrics', {
      date: todayStart.toISOString().slice(0, 10),
      completed: completed.length,
      failed: failed.length,
      inProgress: inProgress.length,
      throughput,
      errorRate: Math.round(errorRate * 100),
      stageVelocity: velocity,
    });
  }
}
