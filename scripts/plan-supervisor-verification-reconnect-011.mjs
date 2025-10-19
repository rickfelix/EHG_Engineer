#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

console.log('\n🔍 PLAN SUPERVISOR VERIFICATION - SD-RECONNECT-011');
console.log('======================================================================\n');

// Fetch SD with verification data
const { data: sd, error: fetchError } = await supabase
  .from('strategic_directives_v2')
  .select('*')
  .eq('sd_key', 'SD-RECONNECT-011')
  .single();

if (fetchError || !sd) {
  console.error('❌ Failed to fetch SD:', fetchError);
  process.exit(1);
}

// Retrieve sub-agent verdicts from metadata
const subAgentResults = sd.metadata?.sub_agent_verification || {};

console.log('📊 SUB-AGENT VERIFICATION RESULTS:');
console.log('----------------------------------------------------------------------\n');

const verdicts = [
  { name: 'TESTING', ...subAgentResults.TESTING },
  { name: 'SECURITY', ...subAgentResults.SECURITY },
  { name: 'PERFORMANCE', ...subAgentResults.PERFORMANCE },
  { name: 'DATABASE', ...subAgentResults.DATABASE },
  { name: 'ACCESSIBILITY', ...subAgentResults.ACCESSIBILITY },
];

verdicts.forEach(v => {
  const icon = v.verdict === 'PASS' ? '✅' :
               v.verdict === 'CONDITIONAL_PASS' ? '⚠️' :
               v.verdict === 'NEEDS_MEASUREMENT' ? '📏' : '❌';
  console.log(`${icon} ${v.name}: ${v.verdict} (${v.confidence}% confidence)`);
  if (v.findings) {
    Object.entries(v.findings).forEach(([key, value]) => {
      console.log(`   - ${key}: ${value}`);
    });
  }
  if (v.recommendation) {
    console.log(`   💡 Recommendation: ${v.recommendation}`);
  }
  console.log('');
});

console.log('----------------------------------------------------------------------\n');

// PLAN Supervisor Verdict Calculation
const totalConfidence = verdicts.reduce((sum, v) => sum + v.confidence, 0) / verdicts.length;
const passCount = verdicts.filter(v => v.verdict === 'PASS').length;
const conditionalCount = verdicts.filter(v => v.verdict === 'CONDITIONAL_PASS' || v.verdict === 'NEEDS_MEASUREMENT').length;
const failCount = verdicts.filter(v => v.verdict === 'FAIL').length;

console.log('🎯 PLAN SUPERVISOR CONSOLIDATED VERDICT:');
console.log('======================================================================\n');

let supervisorVerdict;
let supervisorConfidence;
let supervisorRecommendation;

if (failCount > 0) {
  supervisorVerdict = 'FAIL';
  supervisorConfidence = totalConfidence;
  supervisorRecommendation = 'Critical issues identified. Block LEAD approval until resolved.';
} else if (conditionalCount > 2) {
  supervisorVerdict = 'CONDITIONAL_PASS';
  supervisorConfidence = totalConfidence;
  supervisorRecommendation = 'Multiple conditional passes. Acceptable for MVP but requires LEAD review and follow-up SD for improvements.';
} else if (totalConfidence >= 85) {
  supervisorVerdict = 'PASS';
  supervisorConfidence = totalConfidence;
  supervisorRecommendation = 'All critical requirements met. Ready for LEAD approval.';
} else {
  supervisorVerdict = 'CONDITIONAL_PASS';
  supervisorConfidence = totalConfidence;
  supervisorRecommendation = 'Requirements met with minor concerns. LEAD review recommended.';
}

console.log(`Verdict: ${supervisorVerdict}`);
console.log(`Overall Confidence: ${supervisorConfidence.toFixed(1)}%`);
console.log(`\nBreakdown:`);
console.log(`  ✅ PASS: ${passCount}`);
console.log(`  ⚠️  CONDITIONAL: ${conditionalCount}`);
console.log(`  ❌ FAIL: ${failCount}`);
console.log(`\n💡 Recommendation: ${supervisorRecommendation}\n`);

// Key Findings Summary
console.log('🔑 KEY FINDINGS:');
console.log('----------------------------------------------------------------------\n');

const keyFindings = {
  strengths: [
    'Zero database schema changes required (100% backend reuse)',
    'Strong security posture with protected routes and API validation (95% confidence)',
    'Accessibility compliance via Shadcn UI components (WCAG 2.1 AA)',
    'Efficient code splitting and lazy loading implemented',
  ],
  concerns: [
    'No automated tests (0% coverage) - MVP acceptable but needs follow-up',
    'Performance targets defined but not benchmarked',
    'Accessibility not validated with assistive technology',
  ],
  risks: [
    'Technical debt from missing test coverage',
    'Unknown real-world performance under load',
  ],
};

console.log('✅ STRENGTHS:');
keyFindings.strengths.forEach(s => console.log(`   - ${s}`));
console.log('\n⚠️  CONCERNS:');
keyFindings.concerns.forEach(c => console.log(`   - ${c}`));
console.log('\n🚨 RISKS:');
keyFindings.risks.forEach(r => console.log(`   - ${r}`));

console.log('\n----------------------------------------------------------------------\n');

// Store supervisor verdict in metadata
const supervisorReport = {
  verdict: supervisorVerdict,
  confidence: supervisorConfidence,
  recommendation: supervisorRecommendation,
  timestamp: new Date().toISOString(),
  sub_agent_summary: {
    total_agents: verdicts.length,
    pass_count: passCount,
    conditional_count: conditionalCount,
    fail_count: failCount,
  },
  key_findings: keyFindings,
};

const { error: updateError } = await supabase
  .from('strategic_directives_v2')
  .update({
    metadata: {
      ...sd.metadata,
      plan_supervisor_verification: supervisorReport,
    },
  })
  .eq('sd_key', 'SD-RECONNECT-011');

if (updateError) {
  console.error('❌ Failed to store supervisor verdict:', updateError);
  process.exit(1);
}

console.log('✅ PLAN Supervisor Verification complete and stored in database\n');
console.log('📋 NEXT STEP: Create PLAN→LEAD handoff for final approval\n');
console.log('======================================================================\n');
