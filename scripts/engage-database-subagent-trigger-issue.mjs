#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

async function main() {
  try {
    console.log('════════════════════════════════════════════════════════════════');
    console.log('🔧 Engaging DATABASE Sub-Agent for Trigger Diagnosis');
    console.log('════════════════════════════════════════════════════════════════\n');

    const executionData = {
      sd_id: 'SD-BOARD-GOVERNANCE-001',
      sub_agent_code: 'DATABASE',
      trigger_event: 'manual_engage',
      execution_context: {
        issue: 'Progress trigger interaction blocking sd_phase_tracking population',
        problem: 'When inserting phases into sd_phase_tracking with is_complete=true, the update_sd_progress_from_phases() trigger attempts to mark SD as complete, but enforce_progress_on_completion() blocks with "Progress: 80% (need 100%)"',
        findings: [
          'sd_phase_tracking table uses 0-100% progress per phase (average = total progress)',
          'calculate_sd_progress() sums and averages values from sd_phase_tracking',
          'get_progress_breakdown() calculates from other tables (PRD, deliverables, handoffs, etc.) and shows 80%',
          'enforce_progress_on_completion() checks calculate_sd_progress() but shows get_progress_breakdown() in error',
          'Even atomic multi-row INSERT fails because trigger runs per row',
          'All required data exists: PRD, handoffs (3 types accepted), retrospective, deliverables, user stories'
        ],
        diagnosis_needed: 'Why does calculate_sd_progress() return 80% when it should calculate from sd_phase_tracking (which doesn\'t exist yet or has correct data)?',
        proposed_solutions: [
          '1. Temporarily disable trigger_update_sd_progress trigger during INSERT',
          '2. Modify update_sd_progress_from_phases() to only mark complete if progress >= 100',
          '3. Use different progress calculation that doesn\'t rely on sd_phase_tracking',
          '4. Populate sd_phase_tracking differently (transaction-based approach)'
        ]
      }
    };

    const { data, error } = await supabase
      .from('sub_agent_execution_results')
      .insert(executionData)
      .select()
      .single();

    if (error) {
      console.error('❌ Error storing execution:', error.message);
      process.exit(1);
    }

    console.log('✅ DATABASE sub-agent execution stored');
    console.log(`   Execution ID: ${data.id}`);
    console.log(`   SD: ${data.sd_id}`);
    console.log(`   Sub-Agent: ${data.sub_agent_code}\n`);

    console.log('Database sub-agent will analyze:');
    console.log('1. Trigger execution order and timing');
    console.log('2. Progress calculation discrepancy');
    console.log('3. Safe workarounds that don\'t violate LEO Protocol');
    console.log('4. Root cause of 80% vs 100% mismatch\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
