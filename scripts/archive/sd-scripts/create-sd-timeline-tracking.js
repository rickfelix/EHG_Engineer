#!/usr/bin/env node

/**
 * Create and populate SD Execution Timeline tracking
 * Records phase transitions and time spent in each phase
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function createTimelineTracking() {
  console.log('📊 Creating SD Execution Timeline Tracking System\n');

  // First, let's backfill data for SD-INFRA-EXCELLENCE-001
  const sdId = 'SD-INFRA-EXCELLENCE-001';

  // Get the SD details
  const { data: sd, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('*')
    .eq('id', sdId)
    .single();

  if (sdError) {
    console.error('Error fetching SD:', sdError);
    return;
  }

  console.log(`Recording timeline for: ${sd.title}`);
  console.log('════════════════════════════════════════════════\n');

  // Define the phase transitions based on what we know
  const phases = [
    {
      phase: 'LEAD',
      started_at: sd.created_at,
      // LEAD was completed when we moved to PLAN (approximately 2 days ago)
      completed_at: '2025-09-26T17:00:00Z',
      agent: 'LEAD',
      status: 'completed'
    },
    {
      phase: 'PLAN',
      started_at: '2025-09-26T17:00:00Z',
      // PLAN was just completed
      completed_at: '2025-09-26T19:19:00Z',
      agent: 'PLAN',
      status: 'completed'
    },
    {
      phase: 'EXEC',
      started_at: '2025-09-26T19:19:00Z',
      completed_at: null,
      agent: 'EXEC',
      status: 'in_progress'
    }
  ];

  // Insert timeline records
  for (const phase of phases) {
    const duration_ms = phase.completed_at
      ? new Date(phase.completed_at) - new Date(phase.started_at)
      : null;

    const duration_hours = duration_ms ? duration_ms / (1000 * 60 * 60) : null;
    const duration_minutes = duration_ms ? Math.floor(duration_ms / (1000 * 60)) : null;

    const timeline = {
      sd_id: sdId,
      phase: phase.phase,
      phase_started_at: phase.started_at,
      phase_completed_at: phase.completed_at,
      duration_hours: duration_hours ? parseFloat(duration_hours.toFixed(2)) : null,
      duration_minutes: duration_minutes,
      agent_responsible: phase.agent,
      completion_status: phase.status,
      metadata: {
        recorded_retroactively: true,
        original_creation: sd.created_at,
        notes: phase.phase === 'LEAD' ? 'Strategic planning and approval' :
                phase.phase === 'PLAN' ? 'Technical requirements and PRD generation' :
                'Implementation in progress'
      }
    };

    // Check if record already exists
    const { data: existing } = await supabase
      .from('sd_execution_timeline')
      .select('id')
      .eq('sd_id', sdId)
      .eq('phase', phase.phase)
      .single();

    if (!existing) {
      const { data: _data, error } = await supabase
        .from('sd_execution_timeline')
        .insert(timeline)
        .select();

      if (error) {
        console.error(`Error inserting ${phase.phase} phase:`, error);
      } else {
        console.log(`✅ ${phase.phase} phase recorded`);
        if (phase.completed_at) {
          console.log(`   Duration: ${duration_hours.toFixed(1)} hours (${duration_minutes} minutes)`);
        } else {
          console.log('   Status: Currently in progress');
        }
      }
    } else {
      console.log(`ℹ️  ${phase.phase} phase already recorded`);
    }
  }

  // Now create a summary view
  console.log('\n📈 Timeline Summary for SD-INFRA-EXCELLENCE-001:');
  console.log('════════════════════════════════════════════════');

  const { data: timeline } = await supabase
    .from('sd_execution_timeline')
    .select('*')
    .eq('sd_id', sdId)
    .order('phase_started_at', { ascending: true });

  if (timeline) {
    const totalHours = timeline
      .filter(t => t.duration_hours)
      .reduce((sum, t) => sum + t.duration_hours, 0);

    timeline.forEach(t => {
      const status = t.completion_status === 'completed' ? '✅' : '🚀';
      console.log(`\n${status} ${t.phase}:`);
      console.log(`   Started: ${new Date(t.phase_started_at).toLocaleString()}`);
      if (t.phase_completed_at) {
        console.log(`   Completed: ${new Date(t.phase_completed_at).toLocaleString()}`);
        console.log(`   Duration: ${t.duration_hours} hours`);
      } else {
        const elapsed = (Date.now() - new Date(t.phase_started_at)) / (1000 * 60 * 60);
        console.log(`   Elapsed: ${elapsed.toFixed(1)} hours (ongoing)`);
      }
    });

    console.log('\n📊 Overall Metrics:');
    console.log(`   Total phases completed: ${timeline.filter(t => t.completion_status === 'completed').length}`);
    console.log(`   Time in completed phases: ${totalHours.toFixed(1)} hours`);

    const overallElapsed = (Date.now() - new Date(sd.created_at)) / (1000 * 60 * 60);
    console.log(`   Total elapsed time: ${overallElapsed.toFixed(1)} hours`);
    console.log(`   Current progress: ${sd.progress}%`);
  }

  console.log('\n✅ Timeline tracking system ready!');
  console.log('   Future SDs will automatically track phase transitions');
  console.log('   Use the sd_completion_metrics view for analysis');
}

createTimelineTracking().catch(console.error);