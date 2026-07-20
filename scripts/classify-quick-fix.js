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
import { pathToFileURL } from 'url';
import { analyzePatterns, createPatternRetrospective } from '../lib/utils/quickfix-rca-integration.js';
// SD-LEO-INFRA-SESSION-AWARE-AUTO-001 (FR-2): session-aware QF adoption.
import { claimQuickFix } from '../lib/quick-fix-claim.mjs';

dotenv.config();

// SD-REFILL-00202Z4B: export the pure matchers for unit tests (CLI is guarded below).
export { matchesKeyword, analyzeDescription, CLASSIFICATION_RULES };

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

// SD-REFILL-00202Z4B: escape regex metacharacters so a keyword is matched literally.
function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * SD-REFILL-00202Z4B: word-boundary keyword match. The prior naive `combined.includes(keyword)`
 * substring-matched 'auth' INSIDE 'authoring'/'author'/'authentic', force-escalating low-LOC doc QFs
 * to a full SD (witnessed: QF-20260614-918, a doc fix for the Adam contract, escalated on 'authoring').
 * Anchor with \b on both sides, but tolerate a trailing plural/gerund suffix so genuinely-risky inflected
 * forms still match (refactor→refactoring/refactors, database→databases, migration→migrations,
 * "breaking change"→"breaking changes"). 'authoring' is NOT matched: after 'auth' comes 'o' (a word char),
 * so no suffix option and no \b applies. Case-insensitive. Pure.
 * @param {string} text already-lowercased haystack
 * @param {string} keyword the keyword/phrase to test
 * @returns {boolean}
 */
function matchesKeyword(text, keyword) {
  const re = new RegExp(`\\b${escapeRegExp(keyword.toLowerCase())}(?:e?s|ing|ed)?\\b`, 'i');
  return re.test(text);
}

function analyzeDescription(description, title) {
  const combined = `${title} ${description}`.toLowerCase();
  const issues = [];

  // Check for forbidden keywords (word-boundary, not naive substring — see matchesKeyword)
  for (const keyword of CLASSIFICATION_RULES.forbiddenKeywords) {
    if (matchesKeyword(combined, keyword)) {
      issues.push(`Contains forbidden keyword: "${keyword}"`);
    }
  }

  // Check for risk keywords
  for (const keyword of CLASSIFICATION_RULES.riskKeywords) {
    if (matchesKeyword(combined, keyword)) {
      issues.push(`Contains risk keyword: "${keyword}"`);
    }
  }

  return issues;
}

async function classifyQuickFix(qfId, options = {}) {
  console.log(`\n🔍 Classifying Quick-Fix: ${qfId}\n`);

  // QF-20260720-415: this client claims (UPDATEs) quick_fixes rows via claimQuickFix()
  // below, a privileged write RLS blocks for the anon role. The anon key silently no-ops
  // the UPDATE (0 rows, no error) instead of throwing, which claimQuickFix() then
  // misreports as "a different holder owns it" — every claim attempt failed fleet-wide
  // regardless of actual claim state. Use the service-role key, matching every other
  // privileged-write script in this codebase (e.g. the SD-claim path).
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

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
    id: qf.id, // SD-FDBK-FIX-CLASSIFY-QUICK-FIX-001: exclude self from its own candidate set
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
    // SD-LEO-INFRA-SESSION-AWARE-AUTO-001 (FR-2): claim the QF for THIS session
    // before emitting implementation guidance. /quick-fix and /leo <QF-id> run
    // this script early; previously nothing claimed the QF here, so two parallel
    // sessions could both adopt the same quick-fix. Fail-closed CAS via the
    // shared helper closes that race at the actual adopt entrypoint.
    // Gate on session id presence exactly like create-quick-fix.js — a
    // non-session invocation (no CLAUDE_SESSION_ID) must never crash classify.
    const sessionId = process.env.CLAUDE_SESSION_ID;
    if (!sessionId) {
      console.log('ℹ️  No CLAUDE_SESSION_ID — skipping QF claim (non-session invocation).\n');
    } else {
      const { claimed, holder } = await claimQuickFix(supabase, qfId, sessionId);
      if (!claimed) {
        const holderShort = holder ? String(holder).slice(0, 8) : 'another session';
        console.log('\n🛑 BLOCKED — QF ALREADY CLAIMED\n');
        console.log(`   QF ${qfId} is already claimed by session ${holderShort}.`);
        console.log('   Pick different work — run /leo next.\n');
        // Non-zero, distinct from the exit(1) error path, so the skill can act
        // on "foreign claim" without proceeding to implementation guidance.
        process.exit(2);
      }
      console.log(`\n🔒 Claimed QF ${qfId} for session ${String(sessionId).slice(0, 8)}\n`);
    }

    console.log('\n✅ QUALIFIES FOR QUICK-FIX WORKFLOW\n');
    console.log('📍 Next steps:');
    console.log(`   1. Read details: node scripts/read-quick-fix.js ${qfId}`);
    console.log(`   2. Create branch: git checkout -b qf/${qfId}`);
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

// CLI argument parsing — guarded so importing this module (for tests) does not run the CLI.
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
const args = isMain ? process.argv.slice(2) : [];

if (isMain && (args.length === 0 || args.includes('--help') || args.includes('-h'))) {
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

if (isMain) {
  const qfId = args[0];
  const options = {
    autoEscalate: args.includes('--auto-escalate')
  };

  // Run
  classifyQuickFix(qfId, options).catch((err) => {
    console.error('❌ Error:', err.message);
    process.exit(1);
  });
}
