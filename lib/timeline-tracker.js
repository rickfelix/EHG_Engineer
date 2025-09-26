/**
 * Automatic Timeline Tracking for Strategic Directives
 * Records phase transitions and durations automatically
 */

import { createClient } from '@supabase/supabase-js';

export class SDTimelineTracker {
  constructor(supabaseUrl, supabaseKey) {
    this.supabase = createClient(supabaseUrl, supabaseKey);
    this.tableExists = null;
  }

  /**
   * Check if timeline table exists
   */
  async checkTableExists() {
    if (this.tableExists !== null) return this.tableExists;

    const { error } = await this.supabase
      .from('sd_execution_timeline')
      .select('id')
      .limit(1);

    this.tableExists = !error || error.code !== 'PGRST205';
    return this.tableExists;
  }

  /**
   * Record when work starts on an SD (is_working_on = true)
   */
  async recordWorkStart(sdId) {
    console.log(`⏱️  Recording work start for ${sdId}`);

    // Update metadata as fallback
    const { data: sd } = await this.supabase
      .from('strategic_directives_v2')
      .select('metadata')
      .eq('id', sdId)
      .single();

    const metadata = sd?.metadata || {};
    metadata.work_started_at = new Date().toISOString();
    metadata.timeline = metadata.timeline || {};

    await this.supabase
      .from('strategic_directives_v2')
      .update({ metadata })
      .eq('id', sdId);

    // Try to record in timeline table if it exists
    if (await this.checkTableExists()) {
      await this.supabase.rpc('record_phase_transition', {
        p_sd_id: sdId,
        p_phase: 'WORK_STARTED',
        p_agent: 'USER'
      });
    }
  }

  /**
   * Record phase transition (e.g., LEAD -> PLAN)
   */
  async recordPhaseTransition(sdId, fromPhase, toPhase, agent) {
    console.log(`📊 Recording transition: ${fromPhase} → ${toPhase} for ${sdId}`);

    const now = new Date().toISOString();

    // Update metadata as fallback
    const { data: sd } = await this.supabase
      .from('strategic_directives_v2')
      .select('metadata')
      .eq('id', sdId)
      .single();

    const metadata = sd?.metadata || {};
    metadata.timeline = metadata.timeline || {};

    // Complete previous phase
    if (fromPhase && metadata.timeline[fromPhase.toLowerCase() + '_phase']) {
      const phase = metadata.timeline[fromPhase.toLowerCase() + '_phase'];
      phase.completed = now;
      const duration = (new Date(now) - new Date(phase.started)) / (1000 * 60 * 60);
      phase.duration_hours = parseFloat(duration.toFixed(2));
    }

    // Start new phase
    if (toPhase) {
      metadata.timeline[toPhase.toLowerCase() + '_phase'] = {
        started: now,
        completed: null,
        duration_hours: null,
        agent: agent
      };
    }

    await this.supabase
      .from('strategic_directives_v2')
      .update({ metadata })
      .eq('id', sdId);

    // Try to record in timeline table if it exists
    if (await this.checkTableExists()) {
      // Complete previous phase
      if (fromPhase) {
        await this.supabase
          .from('sd_execution_timeline')
          .update({
            phase_completed_at: now,
            completion_status: 'completed',
            updated_at: now
          })
          .eq('sd_id', sdId)
          .eq('phase', fromPhase)
          .is('phase_completed_at', null);
      }

      // Start new phase
      if (toPhase) {
        await this.supabase
          .from('sd_execution_timeline')
          .insert({
            sd_id: sdId,
            phase: toPhase,
            phase_started_at: now,
            agent_responsible: agent,
            completion_status: 'in_progress'
          });
      }
    }
  }

  /**
   * Get timeline summary for an SD
   */
  async getTimelineSummary(sdId) {
    const { data: sd } = await this.supabase
      .from('strategic_directives_v2')
      .select('metadata, created_at, current_phase')
      .eq('id', sdId)
      .single();

    if (!sd) return null;

    const timeline = sd.metadata?.timeline || {};
    const workStarted = sd.metadata?.work_started_at || sd.created_at;

    // Calculate queue time
    const queueTime = (new Date(workStarted) - new Date(sd.created_at)) / (1000 * 60 * 60);

    // Calculate active work time
    let activeWorkTime = 0;
    for (const phase of ['lead', 'plan', 'exec', 'verification', 'approval']) {
      const phaseData = timeline[phase + '_phase'];
      if (phaseData?.duration_hours) {
        activeWorkTime += phaseData.duration_hours;
      } else if (phaseData?.started) {
        // Phase in progress
        const elapsed = (Date.now() - new Date(phaseData.started)) / (1000 * 60 * 60);
        activeWorkTime += elapsed;
      }
    }

    return {
      sdId,
      currentPhase: sd.current_phase,
      queueTimeHours: parseFloat(queueTime.toFixed(2)),
      activeWorkTimeHours: parseFloat(activeWorkTime.toFixed(2)),
      totalElapsedHours: parseFloat((queueTime + activeWorkTime).toFixed(2)),
      timeline
    };
  }
}

export default SDTimelineTracker;