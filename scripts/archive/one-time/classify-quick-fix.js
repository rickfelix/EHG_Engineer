#!/usr/bin/env node

/**
 * Classify Quick-Fix
 * Determines if issue qualifies for quick-fix workflow or requires full SD
 *
 * Usage:
 *   node scripts/classify-quick-fix.js QF-20251117-001
 *   node scripts/classify-quick-fix.js QF-20251117-001 --auto-escalate  (auto-escalate if doesn't qualify)
 *
 * Classification Criteria (ALL must be true for quick-fix):
 * - Estimated LOC ≤ 50
 * - Type: bug, polish, typo, or documentation (NOT feature)
 * - No database schema changes
 * - No authentication/security changes
 * - Existing tests cover the change
 * - Single file/component touched
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { analyzePatterns, createPatternRetrospective } from '../lib/utils/quickfix-rca-integration.js';

dotenv.config();

// Classification rules
const CLASSIFICATION_RULES = {
  maxLoc: 50,
  allowedTypes: ['bug', 'polish', 'typo', 'documentation'],
  forbiddenKeywords: [
    'migration',
    'schema change',
    'database',
    'auth',
    'authentication',
    'authorization',
    'security',
    'RLS',
    'new table',
    'alter table'
  ],
  riskKeywords: [
    'multiple files',
    'refactor',
    'new feature',
    'complex',
    'breaking change'
  ]
};

function analyzeDescription(description, title) {
  const combined = `${title} ${description}`.toLowerCase();
  const issues = [];

  // Check for forbidden keywords
  for (const keyword of CLASSIFICATION_RULES.forbiddenKeywords) {
    if (combined.includes(keyword.toLowerCase())) {
      issues.push(`Contains forbidden keyword: "${keyword}"`);
    }
  }

  // Check for risk keywords
  for (const keyword of CLASSIFICATION_RULES.riskKeywords) {
    if (combined.includes(keyword.toLowerCase())) {
      issues.push(`Contains risk keyword: "${keyword}"`);
    }
  }

  return issues;
}

async function classifyQuickFix(qfId, options = {}) {
  console.log(`\n🔍 Classifying Quick-Fix: ${qfId}\n`);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.log('❌ Missing Supabase credentials in .env file');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Fetch quick-fix record
  const { data: qf, error } = await supabase
    .from('quick_fixes')
    .select('*')
    .eq('id', qfId)
    .single();

  if (error || !qf) {
    console.log(`❌ Quick-fix not found: ${qfId}`);
    process.exit(1);
  }

  console.log('📋 Quick-Fix Details:');
  console.log(`   Title: ${qf.title}`);
  console.log(`   Type: ${qf.type}`);
  console.log(`   Severity: ${qf.severity}`);
  console.log(`   Estimated LOC: ${qf.estimated_loc || 'not specified'}`);
  console.log(`   Status: ${qf.status}\n`);

  // Already escalated?
  if (qf.status === 'escalated') {
    console.log(`⚠️  Already escalated to SD: ${qf.escalated_to_sd_id || 'pending'}`);
    console.log(`   Reason: ${qf.escalation_reason}\n`);
    return { qualifies: false, alreadyEscalated: true };
  }

  // Run classification checks
  const checks = [];
  let qualifies = true;

  // Check 1: LOC threshold
  if (qf.estimated_loc && qf.estimated_loc > CLASSIFICATION_RULES.maxLoc) {
    checks.push({
      pass: false,
      rule: 'LOC Threshold',
      message: `Estimated LOC (${qf.estimated_loc}) exceeds limit (${CLASSIFICATION_RULES.maxLoc})`
    });
    qualifies = false;
  } else {
    checks.push({
      pass: true,
      rule: 'LOC Threshold',
      message: `Estimated LOC (${qf.estimated_loc || 'unspecified'}) ≤ ${CLASSIFICATION_RULES.maxLoc}`
    });
  }

  // Check 2: Type validation
  if (!CLASSIFICATION_RULES.allowedTypes.includes(qf.type)) {
    checks.push({
      pass: false,
      rule: 'Type Validation',
      message: `Type "${qf.type}" not allowed (must be: ${CLASSIFICATION_RULES.allowedTypes.join(', ')})`
    });
    qualifies = false;
  } else {
    checks.push({
      pass: true,
      rule: 'Type Validation',
      message: `Type "${qf.type}" is allowed`
    });
  }

  // Check 3: Description analysis
  const descriptionIssues = analyzeDescription(qf.description || '', qf.title);
  if (descriptionIssues.length > 0) {
    checks.push({
      pass: false,
      rule: 'Description Analysis',
      message: descriptionIssues.join('; ')
    });
    qualifies = false;
  } else {
    checks.push({
      pass: true,
      rule: 'Description Analysis',
      message: 'No forbidden/risk keywords detected'
    });
  }

  // Check 4: Severity gate (critical severity should be reviewed)
  if (qf.severity === 'critical') {
    checks.push({
      pass: false,
      rule: 'Severity Gate',
      message: 'Critical severity issues should go through full SD for proper review'
    });
    qualifies = false;
  } else {
    checks.push({
      pass: true,
      rule: 'Severity Gate',
      message: `Severity "${qf.severity}" acceptable for quick-fix`
    });
  }

  // Check 5: RCA Pattern Detection (NEW)
  console.log('\n🔍 Running Root Cause Analysis...\n');

  const patternAnalysis = await analyzePatterns({
    title: qf.title,
    description: qf.description,
    consoleError: qf.actual_behavior,
    type: qf.type
  });

  if (patternAnalysis.isSystemic) {
    checks.push({
      pass: false,
      rule: 'RCA Pattern Detection',
      message: patternAnalysis.escalationReason
    });
    qualifies = false;

    // Create retrospective for systemic pattern
    console.log('\n📝 Creating pattern retrospective...');
    await createPatternRetrospective(qfId, patternAnalysis);
  } else {
    checks.push({
      pass: true,
      rule: 'RCA Pattern Detection',
      message: `No systemic pattern detected (${patternAnalysis.similarIssuesCount} similar issues found)`
    });
  }

  // Display results
  console.log('\n📊 Classification Results:\n');

  for (const check of checks) {
    const icon = check.pass ? '✅' : '❌';
    console.log(`${icon} ${check.rule}`);
    console.log(`   ${check.message}\n`);
  }

  // Final verdict
  if (qualifies) {
    console.log('\n✅ QUALIFIES FOR QUICK-FIX WORKFLOW\n');
    console.log('📍 Next steps:');
    console.log(`   1. Read details: node scripts/read-quick-fix.js ${qfId}`);
    console.log(`   2. Create branch: git checkout -b quick-fix/${qfId}`);
    console.log(`   3. Implement fix (≤${CLASSIFICATION_RULES.maxLoc} LOC)`);
    console.log('   4. Run tests: npm run test:unit && npm run test:e2e');
    console.log(`   5. Complete: node scripts/complete-quick-fix.js ${qfId}\n`);

    return { qualifies: true, checks };
  } else {
    console.log('\n❌ DOES NOT QUALIFY - ESCALATION REQUIRED\n');
    console.log('This issue requires a full Strategic Directive.\n');

    if (options.autoEscalate) {
      console.log('🔄 Auto-escalating to SD workflow...\n');

      const escalationReason = checks
        .filter(c => !c.pass)
        .map(c => c.message)
        .join('; ');

      const { error: updateError } = await supabase
        .from('quick_fixes')
        .update({
          status: 'escalated',
          escalation_reason: escalationReason
        })
        .eq('id', qfId);

      if (updateError) {
        console.log('❌ Failed to update status:', updateError.message);
        process.exit(1);
      }

      console.log('✅ Status updated to: escalated');
      console.log(`   Reason: ${escalationReason}\n`);
    }

    console.log('📋 Next steps:');
    console.log('   1. Create Strategic Directive with LEAD approval');
    console.log('   2. Run: node scripts/add-prd-to-database.js SD-XXX');
    console.log('   3. Follow full LEAD→PLAN→EXEC workflow\n');

    return { qualifies: false, checks, escalationReason: checks.filter(c => !c.pass).map(c => c.message).join('; ') };
  }
}

// CLI argument parsing
const args = process.argv.slice(2);

if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
  console.log(`
LEO Quick-Fix Workflow - Classify Issue

Usage:
  node scripts/classify-quick-fix.js QF-20251117-001
  node scripts/classify-quick-fix.js QF-20251117-001 --auto-escalate

Options:
  --auto-escalate       Automatically escalate to SD if doesn't qualify
  --help, -h            Show this help

Classification Criteria (ALL must pass):
  - Estimated LOC ≤ 50
  - Type: bug, polish, typo, or documentation
  - No database schema changes
  - No auth/security changes
  - Severity not critical

Examples:
  node scripts/classify-quick-fix.js QF-20251117-001
  node scripts/classify-quick-fix.js QF-20251117-001 --auto-escalate
  `);
  process.exit(0);
}

const qfId = args[0];
const options = {
  autoEscalate: args.includes('--auto-escalate')
};

// Run
classifyQuickFix(qfId, options).catch((err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
