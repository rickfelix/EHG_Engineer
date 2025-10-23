#!/usr/bin/env node
/**
 * Query handoff details from sd_phase_handoffs table
 * Usage: node scripts/query-handoff-details.mjs <handoff-id>
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

async function queryHandoff(handoffId) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );

    const { data, error } = await supabase
      .from('sd_phase_handoffs')
      .select('*')
      .eq('id', handoffId)
      .single();

    if (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }

    if (!data) {
      console.error(`No handoff found with ID: ${handoffId}`);
      process.exit(1);
    }

    // Output structured data
    console.log('='.repeat(80));
    console.log(`HANDOFF DETAILS: ${data.sd_id}`);
    console.log('='.repeat(80));
    console.log();
    console.log('1. HANDOFF STATUS:', data.status);
    console.log('   From Phase:', data.from_phase);
    console.log('   To Phase:', data.to_phase);
    console.log('   Created:', data.created_at);
    console.log('   Accepted:', data.accepted_at || 'N/A');
    console.log();
    console.log('2. EXECUTIVE SUMMARY:');
    console.log(data.executive_summary || 'N/A');
    console.log();
    console.log('3. ACTION ITEMS FOR EXEC:');
    console.log(data.action_items || 'N/A');
    console.log();
    console.log('4. PLAN PRESENTATION (execution_plan):');
    if (data.plan_presentation?.execution_plan) {
      console.log(JSON.stringify(data.plan_presentation.execution_plan, null, 2));
    } else {
      console.log('N/A');
    }
    console.log();
    console.log('5. FILE SCOPE (files to modify/create):');
    if (data.plan_presentation?.file_scope) {
      console.log(JSON.stringify(data.plan_presentation.file_scope, null, 2));
    } else {
      console.log('N/A');
    }
    console.log();
    console.log('6. KNOWN ISSUES:');
    console.log(data.known_issues || 'N/A');
    console.log();
    console.log('7. COMPLETENESS REPORT:');
    console.log(data.completeness_report || 'N/A');
    console.log();
    console.log('8. KEY DECISIONS:');
    console.log(data.key_decisions || 'N/A');
    console.log();
    console.log('9. DELIVERABLES MANIFEST:');
    console.log(data.deliverables_manifest || 'N/A');
    console.log();
    console.log('10. RESOURCE UTILIZATION:');
    console.log(data.resource_utilization || 'N/A');
    console.log();
    console.log('11. METADATA:');
    console.log(JSON.stringify(data.metadata, null, 2));
    console.log();
    console.log('='.repeat(80));

  } catch (err) {
    console.error('Fatal error:', err.message);
    process.exit(1);
  }
}

// Get handoff ID from command line
const handoffId = process.argv[2];
if (!handoffId) {
  console.error('Usage: node scripts/query-handoff-details.mjs <handoff-id>');
  process.exit(1);
}

queryHandoff(handoffId);
