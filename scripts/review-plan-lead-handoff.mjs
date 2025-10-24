#!/usr/bin/env node
/**
 * Review PLAN→LEAD Handoff for LEAD Final Approval
 * SD: SD-INFRA-VALIDATION
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const SD_ID = 'SD-INFRA-VALIDATION';

console.log('📋 LEAD FINAL APPROVAL REVIEW');
console.log('═══════════════════════════════════════════════════════════\n');

// Get PLAN→LEAD handoff
const { data: handoff, error } = await supabase
  .from('sd_phase_handoffs')
  .select('*')
  .eq('sd_id', SD_ID)
  .eq('from_phase', 'PLAN')
  .eq('to_phase', 'LEAD')
  .order('created_at', { ascending: false })
  .limit(1)
  .single();

if (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
}

console.log('1. EXECUTIVE SUMMARY');
console.log('───────────────────────────────────────────────────────────');
console.log(handoff.executive_summary);
console.log('');

console.log('2. COMPLETENESS REPORT (Verification Results)');
console.log('───────────────────────────────────────────────────────────');
console.log(handoff.completeness_report);
console.log('');

console.log('3. KNOWN ISSUES & RISKS');
console.log('───────────────────────────────────────────────────────────');
console.log(handoff.known_issues);
console.log('');

console.log('═══════════════════════════════════════════════════════════');
console.log('📊 LEAD APPROVAL ASSESSMENT');
console.log('═══════════════════════════════════════════════════════════\n');

// Parse completeness report for confidence score
const confidenceMatch = handoff.completeness_report.match(/Overall Confidence.*?(\d+)%/);
const confidence = confidenceMatch ? parseInt(confidenceMatch[1]) : 0;

console.log('✅ Verification Confidence:', confidence + '%');

if (confidence >= 85) {
  console.log('   Status: MEETS THRESHOLD (≥85%)');
} else {
  console.log('   Status: BELOW THRESHOLD (<85%)');
  console.log('   Note: Review comprehensive verification results');
}

console.log('');

// Check for blockers
const hasBlockers = handoff.known_issues.toLowerCase().includes('blocker');
console.log('⚠️  Critical Blockers:', hasBlockers ? 'YES - REVIEW REQUIRED' : 'NO');

console.log('');

// Check acceptance criteria
const acceptanceMet = handoff.completeness_report.includes('8/8');
console.log('📋 Acceptance Criteria:', acceptanceMet ? '8/8 MET ✅' : 'INCOMPLETE ❌');

console.log('');

// Final recommendation
console.log('🎯 LEAD DECISION:');
if (confidence >= 80 && !hasBlockers && acceptanceMet) {
  console.log('   ✅ APPROVE - All requirements met');
  console.log('   Next: Generate retrospective and mark complete');
} else {
  console.log('   ⚠️  REVIEW REQUIRED');
  console.log('   Reason:',
    confidence < 80 ? `Low confidence (${confidence}%)` :
    hasBlockers ? 'Critical blockers present' :
    !acceptanceMet ? 'Acceptance criteria incomplete' : 'Unknown');
}

console.log('\n═══════════════════════════════════════════════════════════\n');
