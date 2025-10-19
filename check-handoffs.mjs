#!/usr/bin/env node
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

console.log('🔍 Checking SD-AGENT-MIGRATION-001 handoffs...\n');

// Check handoffs
const { data: handoffs, error: handoffError } = await supabase
  .from('sd_phase_handoffs')
  .select('*')
  .eq('sd_id', 'SD-AGENT-MIGRATION-001')
  .order('created_at', { ascending: true });

if (handoffError) {
  console.log('⚠️  Handoffs table error:', handoffError.message);
} else if (!handoffs || handoffs.length === 0) {
  console.log('❌ ROOT CAUSE #4: NO HANDOFFS RECORDED\n');
  console.log('CRITICAL: All phase transitions require 7-element handoffs!\n');
  console.log('Missing handoffs means:');
  console.log('  - No EXEC→PLAN handoff (implementation complete)');
  console.log('  - No PLAN→LEAD handoff (verification complete)');
  console.log('  - No deliverables manifest');
  console.log('  - No completeness report\n');
} else {
  console.log(`✅ Found ${handoffs.length} handoffs:\n`);
  handoffs.forEach((h, idx) => {
    console.log(`${idx + 1}. ${h.from_agent} → ${h.to_agent}`);
    console.log(`   Created: ${new Date(h.created_at).toLocaleString()}`);
    console.log(`   Status: ${h.status}`);

    // Check 7 mandatory elements
    const hasExecutiveSummary = h.executive_summary ? '✅' : '❌';
    const hasCompleteness = h.completeness_report ? '✅' : '❌';
    const hasDeliverables = h.deliverables_manifest ? '✅' : '❌';
    const hasDecisions = h.key_decisions ? '✅' : '❌';
    const hasIssues = h.known_issues ? '✅' : '❌';
    const hasResources = h.resource_utilization ? '✅' : '❌';
    const hasActions = h.action_items ? '✅' : '❌';

    console.log(`   7-Element Validation:`);
    console.log(`     ${hasExecutiveSummary} Executive Summary`);
    console.log(`     ${hasCompleteness} Completeness Report`);
    console.log(`     ${hasDeliverables} Deliverables Manifest`);
    console.log(`     ${hasDecisions} Key Decisions`);
    console.log(`     ${hasIssues} Known Issues`);
    console.log(`     ${hasResources} Resource Utilization`);
    console.log(`     ${hasActions} Action Items\n`);

    // Show completeness report if exists
    if (h.completeness_report) {
      console.log(`   📊 Completeness Report:\n${JSON.stringify(h.completeness_report, null, 4)}\n`);
    }

    // Show deliverables manifest if exists
    if (h.deliverables_manifest) {
      console.log(`   📦 Deliverables Manifest:\n${JSON.stringify(h.deliverables_manifest, null, 4)}\n`);
    }
  });
}

// Check sub-agent executions
const { data: subAgents, error: subAgentError } = await supabase
  .from('sub_agent_execution_results')
  .select('*')
  .eq('sd_id', 'SD-AGENT-MIGRATION-001')
  .order('executed_at', { ascending: false });

console.log('═══════════════════════════════════════════════════════════\n');

if (subAgentError) {
  console.log('⚠️  Sub-agent table error:', subAgentError.message);
} else if (!subAgents || subAgents.length === 0) {
  console.log('❌ ROOT CAUSE #5: NO SUB-AGENT VERIFICATIONS\n');
  console.log('CRITICAL: No sub-agents verified this SD!\n');
  console.log('Missing verifications:');
  console.log('  - QA Director: Should verify all features work');
  console.log('  - Design Agent: Should verify all 4 UI features exist');
  console.log('  - Systems Analyst: Should check for missing components');
  console.log('  - Database Architect: Should verify schema + seed data\n');
} else {
  console.log(`✅ Found ${subAgents.length} sub-agent executions:\n`);
  subAgents.forEach((sa, idx) => {
    console.log(`${idx + 1}. ${sa.sub_agent_code}: ${sa.verdict}`);
    console.log(`   Executed: ${new Date(sa.executed_at).toLocaleString()}`);
    console.log(`   Confidence: ${sa.confidence_score}%`);
    console.log(`   Recommendations: ${sa.recommendations ? sa.recommendations.length : 0} items\n`);
  });
}
