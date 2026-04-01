/**
 * S20 Pause Controller — Event-Driven Pause/Resume for Stage 20
 *
 * SD-LEO-INFRA-S20-VENTURE-LEO-001
 *
 * State machine: CHECKING → PAUSED → RESUMING → COMPLETE
 *
 * When S19 creates orchestrator SDs via the lifecycle-sd-bridge, S20 pauses
 * and waits for ALL orchestrator SDs to reach COMPLETED before advancing.
 * State is persisted in venture_stage_work.advisory_data so it survives
 * worker restarts. Uses Supabase realtime for event-driven resume with
 * a periodic safety-net DB check every 5 minutes.
 *
 * @module lib/eva/s20-pause-controller
 */

const PAUSE_STATES = {
  CHECKING: 'CHECKING',
  PAUSED: 'PAUSED',
  RESUMING: 'RESUMING',
  COMPLETE: 'COMPLETE',
};

const DEFAULT_TIMEOUT_DAYS = 7;
const SAFETY_NET_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export class S20PauseController {
  /**
   * @param {import('@supabase/supabase-js').SupabaseClient} supabase
   * @param {{ log: Function, warn: Function }} logger
   */
  constructor(supabase, logger) {
    this._supabase = supabase;
    this._logger = logger || { log: console.log, warn: console.warn };
    this._realtimeChannels = new Map(); // ventureId → channel
    this._safetyNetTimers = new Map(); // ventureId → timer
  }

  /**
   * Main entry point: check if S20 should pause for this venture.
   * Returns { blocked, status, data } to the worker's stage loop.
   *
   * @param {string} ventureId
   * @returns {Promise<{ blocked: boolean, status: string, data: object }>}
   */
  async check(ventureId) {
    try {
      // Load existing pause state from DB
      const pauseState = await this._loadPauseState(ventureId);

      // Force advance override
      if (pauseState?.force_advanced) {
        this._logger.log(`[S20Pause] Venture ${ventureId}: force-advanced — skipping pause`);
        return { blocked: false, status: 'force_advanced', data: pauseState };
      }

      // Already complete from a previous run
      if (pauseState?.state === PAUSE_STATES.COMPLETE) {
        this._logger.log(`[S20Pause] Venture ${ventureId}: already COMPLETE — proceeding`);
        return { blocked: false, status: 'complete', data: pauseState };
      }

      // Check for Replit build path — delegate back to legacy handler
      const buildMethod = await this._getBuildMethod(ventureId);
      if (buildMethod === 'replit_agent') {
        return { blocked: false, status: 'replit_path', data: { build_method: 'replit_agent' } };
      }

      // Find linked orchestrator SDs created by S19 bridge
      const orchestratorSDs = await this._findLinkedOrchestratorSDs(ventureId);

      // No SDs linked — legacy venture, skip pause
      if (orchestratorSDs.length === 0) {
        this._logger.log(`[S20Pause] Venture ${ventureId}: no linked SDs — skipping pause (backward compatible)`);
        return { blocked: false, status: 'no_sds', data: { total_sds: 0 } };
      }

      // Check completion status of all orchestrators
      const completionResult = this._evaluateCompletion(orchestratorSDs);

      if (completionResult.allComplete) {
        // All orchestrators done — transition to COMPLETE
        this._logger.log(
          `[S20Pause] Venture ${ventureId}: all ${orchestratorSDs.length} orchestrator(s) COMPLETED — resuming`
        );
        await this._savePauseState(ventureId, {
          state: PAUSE_STATES.COMPLETE,
          linked_sd_ids: orchestratorSDs.map(sd => sd.id),
          completed_at: new Date().toISOString(),
        });
        this._cleanup(ventureId);
        return {
          blocked: false,
          status: 'complete',
          data: {
            total_sds: orchestratorSDs.length,
            completed_sds: completionResult.completedCount,
            sd_statuses: completionResult.statuses,
          },
        };
      }

      // Not all complete — enter or remain in PAUSED state
      const now = new Date();
      const existingPause = pauseState?.state === PAUSE_STATES.PAUSED ? pauseState : null;
      const pausedAt = existingPause?.paused_at ? new Date(existingPause.paused_at) : now;
      const timeoutDays = existingPause?.timeout_days || DEFAULT_TIMEOUT_DAYS;
      const timeoutAt = new Date(pausedAt.getTime() + timeoutDays * 24 * 60 * 60 * 1000);

      // Check timeout
      const isTimedOut = now >= timeoutAt;
      if (isTimedOut) {
        this._logger.warn(
          `[S20Pause] Venture ${ventureId}: TIMEOUT after ${timeoutDays} days — alerting chairman (NOT auto-advancing)`
        );
      }

      // Persist pause state
      await this._savePauseState(ventureId, {
        state: PAUSE_STATES.PAUSED,
        linked_sd_ids: orchestratorSDs.map(sd => sd.id),
        paused_at: pausedAt.toISOString(),
        timeout_at: timeoutAt.toISOString(),
        timeout_days: timeoutDays,
        timed_out: isTimedOut,
        last_checked_at: now.toISOString(),
        total_sds: orchestratorSDs.length,
        completed_sds: completionResult.completedCount,
        non_terminal_sds: completionResult.nonTerminalCount,
        sd_statuses: completionResult.statuses,
      });

      // Start realtime subscription if not already active
      this._ensureRealtimeSubscription(ventureId, orchestratorSDs.map(sd => sd.id));

      // Start safety-net timer if not already active
      this._ensureSafetyNet(ventureId);

      // Compute health score
      const daysPaused = (now - pausedAt) / (1000 * 60 * 60 * 24);
      let healthScore = 'green';
      if (daysPaused >= timeoutDays) healthScore = 'red';
      else if (daysPaused >= timeoutDays * 0.5) healthScore = 'yellow';

      this._logger.log(
        `[S20Pause] Venture ${ventureId}: PAUSED — ${completionResult.completedCount}/${orchestratorSDs.length} complete, ` +
        `${daysPaused.toFixed(1)}d elapsed, health=${healthScore}`
      );

      return {
        blocked: true,
        status: 'paused',
        data: {
          state: PAUSE_STATES.PAUSED,
          total_sds: orchestratorSDs.length,
          completed_sds: completionResult.completedCount,
          non_terminal_sds: completionResult.nonTerminalCount,
          health_score: healthScore,
          paused_at: pausedAt.toISOString(),
          timeout_at: timeoutAt.toISOString(),
          timed_out: isTimedOut,
          sd_statuses: completionResult.statuses,
        },
      };
    } catch (err) {
      this._logger.warn(`[S20Pause] check failed for venture ${ventureId}: ${err.message}`);
      // Fail-open: don't block on check failure
      return { blocked: false, status: 'error', data: { error: err.message } };
    }
  }

  /**
   * Force advance S20 for a venture — chairman override.
   * @param {string} ventureId
   * @param {string} advancedBy
   */
  async forceAdvance(ventureId, advancedBy = 'chairman') {
    const pauseState = await this._loadPauseState(ventureId);
    await this._savePauseState(ventureId, {
      ...pauseState,
      state: PAUSE_STATES.COMPLETE,
      force_advanced: true,
      force_advanced_by: advancedBy,
      force_advanced_at: new Date().toISOString(),
    });
    this._cleanup(ventureId);
    this._logger.log(`[S20Pause] Venture ${ventureId}: force-advanced by ${advancedBy}`);
  }

  /**
   * Get SD progress data for a venture — used by dashboard RPC.
   * @param {string} ventureId
   * @returns {Promise<object>}
   */
  async getProgress(ventureId) {
    const pauseState = await this._loadPauseState(ventureId);
    const orchestratorSDs = await this._findLinkedOrchestratorSDs(ventureId);

    // For each orchestrator, fetch children
    const orchestrators = [];
    for (const osd of orchestratorSDs) {
      const { data: children } = await this._supabase
        .from('strategic_directives_v2')
        .select('id, sd_key, title, status, current_phase, progress')
        .eq('parent_sd_id', osd.id)
        .order('created_at', { ascending: true });

      orchestrators.push({
        sd_key: osd.sd_key,
        title: osd.title,
        status: osd.status,
        current_phase: osd.current_phase,
        progress: osd.progress || 0,
        children: (children || []).map(c => ({
          sd_key: c.sd_key,
          title: c.title,
          status: c.status,
          current_phase: c.current_phase,
          progress: c.progress || 0,
        })),
      });
    }

    return {
      venture_id: ventureId,
      pause_state: pauseState,
      orchestrators,
      summary: {
        total_orchestrators: orchestratorSDs.length,
        completed: orchestratorSDs.filter(sd => sd.status === 'completed').length,
        in_progress: orchestratorSDs.filter(sd => sd.status !== 'completed' && sd.status !== 'cancelled').length,
      },
    };
  }

  /**
   * Re-subscribe to realtime channels for all PAUSED ventures.
   * Called on worker startup to restore subscriptions.
   */
  async restoreSubscriptions() {
    try {
      const { data: pausedVentures } = await this._supabase
        .from('venture_stage_work')
        .select('venture_id, advisory_data')
        .eq('lifecycle_stage', 20)
        .eq('stage_status', 'blocked');

      if (!pausedVentures || pausedVentures.length === 0) return;

      for (const vsw of pausedVentures) {
        const pause = vsw.advisory_data?.pause_state;
        if (pause?.state === PAUSE_STATES.PAUSED && pause?.linked_sd_ids?.length > 0) {
          this._logger.log(`[S20Pause] Restoring subscription for venture ${vsw.venture_id}`);
          this._ensureRealtimeSubscription(vsw.venture_id, pause.linked_sd_ids);
          this._ensureSafetyNet(vsw.venture_id);
        }
      }
    } catch (err) {
      this._logger.warn(`[S20Pause] restoreSubscriptions failed: ${err.message}`);
    }
  }

  /**
   * Cleanup all subscriptions and timers — call on worker shutdown.
   */
  destroy() {
    for (const [ventureId] of this._realtimeChannels) {
      this._cleanup(ventureId);
    }
  }

  // ── Private Methods ──

  async _loadPauseState(ventureId) {
    const { data } = await this._supabase
      .from('venture_stage_work')
      .select('advisory_data')
      .eq('venture_id', ventureId)
      .eq('lifecycle_stage', 20)
      .maybeSingle();

    return data?.advisory_data?.pause_state || null;
  }

  async _savePauseState(ventureId, pauseState) {
    // Load existing advisory_data to merge
    const { data: existing } = await this._supabase
      .from('venture_stage_work')
      .select('advisory_data')
      .eq('venture_id', ventureId)
      .eq('lifecycle_stage', 20)
      .maybeSingle();

    const advisoryData = { ...(existing?.advisory_data || {}), pause_state: pauseState };
    const stageStatus = pauseState.state === PAUSE_STATES.COMPLETE ? 'completed' : 'blocked';

    await this._supabase
      .from('venture_stage_work')
      .upsert({
        venture_id: ventureId,
        lifecycle_stage: 20,
        stage_status: stageStatus,
        work_type: 'sd_required',
        advisory_data: advisoryData,
      }, { onConflict: 'venture_id,lifecycle_stage' });
  }

  async _getBuildMethod(ventureId) {
    const { data } = await this._supabase
      .from('venture_stage_work')
      .select('advisory_data')
      .eq('venture_id', ventureId)
      .eq('lifecycle_stage', 20)
      .maybeSingle();

    return data?.advisory_data?.build_method || 'claude_code';
  }

  async _findLinkedOrchestratorSDs(ventureId) {
    // Find SDs linked to this venture that are orchestrators (have children)
    // or are standalone SDs from the S19 bridge
    const { data: allSDs } = await this._supabase
      .from('strategic_directives_v2')
      .select('id, sd_key, title, status, current_phase, progress, parent_sd_id')
      .eq('venture_id', ventureId);

    if (!allSDs || allSDs.length === 0) return [];

    // Find top-level SDs (no parent, or parent is not in this venture)
    const ventureSDIds = new Set(allSDs.map(sd => sd.id));
    const topLevel = allSDs.filter(sd =>
      !sd.parent_sd_id || !ventureSDIds.has(sd.parent_sd_id)
    );

    return topLevel;
  }

  _evaluateCompletion(orchestratorSDs) {
    const terminalStatuses = new Set(['completed', 'cancelled']);
    const completedCount = orchestratorSDs.filter(sd => sd.status === 'completed').length;
    const nonTerminal = orchestratorSDs.filter(sd => !terminalStatuses.has(sd.status));

    return {
      allComplete: nonTerminal.length === 0,
      completedCount,
      nonTerminalCount: nonTerminal.length,
      statuses: orchestratorSDs.map(sd => ({
        sd_key: sd.sd_key,
        status: sd.status,
        current_phase: sd.current_phase,
        progress: sd.progress || 0,
      })),
    };
  }

  _ensureRealtimeSubscription(ventureId, sdIds) {
    if (this._realtimeChannels.has(ventureId)) return;

    const channelName = `s20-watch-${ventureId.slice(0, 8)}`;
    const channel = this._supabase
      .channel(channelName)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'strategic_directives_v2',
      }, (payload) => {
        // Check if this update is for one of our watched SDs
        if (sdIds.includes(payload.new.id)) {
          const newPhase = payload.new.current_phase;
          const newStatus = payload.new.status;
          if (newStatus === 'completed' || newPhase === 'COMPLETED') {
            this._logger.log(
              `[S20Pause] Realtime: SD ${payload.new.sd_key || payload.new.id} completed for venture ${ventureId}`
            );
            // The worker's next poll iteration will pick up the change
            // via check() — no need to advance here directly
          }
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          this._logger.log(`[S20Pause] Realtime channel ${channelName} subscribed for venture ${ventureId}`);
        }
      });

    this._realtimeChannels.set(ventureId, channel);
  }

  _ensureSafetyNet(ventureId) {
    if (this._safetyNetTimers.has(ventureId)) return;

    const timer = setInterval(async () => {
      try {
        const orchestratorSDs = await this._findLinkedOrchestratorSDs(ventureId);
        if (orchestratorSDs.length === 0) return;

        const completion = this._evaluateCompletion(orchestratorSDs);
        if (completion.allComplete) {
          this._logger.log(
            `[S20Pause] Safety-net: all orchestrators complete for venture ${ventureId} (missed realtime event)`
          );
          await this._savePauseState(ventureId, {
            state: PAUSE_STATES.COMPLETE,
            linked_sd_ids: orchestratorSDs.map(sd => sd.id),
            completed_at: new Date().toISOString(),
            completed_via: 'safety_net',
          });
          this._cleanup(ventureId);
        }
      } catch (err) {
        this._logger.warn(`[S20Pause] Safety-net check failed for venture ${ventureId}: ${err.message}`);
      }
    }, SAFETY_NET_INTERVAL_MS);

    this._safetyNetTimers.set(ventureId, timer);
  }

  _cleanup(ventureId) {
    // Remove realtime channel
    const channel = this._realtimeChannels.get(ventureId);
    if (channel) {
      this._supabase.removeChannel(channel);
      this._realtimeChannels.delete(ventureId);
    }

    // Clear safety-net timer
    const timer = this._safetyNetTimers.get(ventureId);
    if (timer) {
      clearInterval(timer);
      this._safetyNetTimers.delete(ventureId);
    }
  }
}

export { PAUSE_STATES };
export default S20PauseController;
