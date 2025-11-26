/**
 * QUICKFIX Sub-Agent (Quick-Fix Orchestrator - "LEO Lite" Field Medic)
 * LEO Protocol v4.2.0 - Quick-Fix Workflow Integration
 *
 * Purpose: Lightweight triage and resolution for UAT-discovered bugs/polish
 * Code: QUICKFIX
 * Priority: 95
 *
 * Philosophy: "Not every cut needs surgery - but know when to call the surgeon."
 *
 * Backstory: While other sub-agents are specialists (Database Architect, Security
 * Chief, QA Director), QUICKFIX is the field medic - trained to triage issues
 * quickly, call in specialists only when needed, and patch things up fast without
 * the full MASH unit.
 *
 * Created: 2025-11-17
 */

import { execSync } from 'child_process';
import dotenv from 'dotenv';
import { loadSubAgentInstructions } from '../sub-agent-executor.js';
import { estimateLOC, shouldEscalateByLOC, extractFileInfo } from '../ai-loc-estimator.js';
import { runComplianceRubric } from '../quickfix-compliance-rubric.js';
import { createSupabaseServiceClient } from '../../scripts/lib/supabase-connection.js';
import { shouldBypassFullSD, quickBypassCheck, THRESHOLDS } from '../utils/bypass-evaluation.js';
import { invokeQuickfixSpecialist, runAllQuickfixSpecialists } from '../utils/quickfix-specialists.js';

dotenv.config();

// Supabase client initialized in execute() to use async createSupabaseServiceClient
let supabase = null;

/**
 * Execute QUICKFIX sub-agent (Mini-Orchestrator)
 * Triages issue and intelligently invokes specialist sub-agents when needed
 *
 * @param {string} sdId - Strategic Directive ID (or null for standalone quick-fix)
 * @param {Object} subAgent - Sub-agent instructions (already loaded)
 * @param {Object} options - Execution options
 * @returns {Promise<Object>} Quick-fix results
 */
export async function execute(sdId, subAgent, options = {}) {
  console.log('\n🎯 Starting QUICKFIX Orchestrator...');
  console.log('   Quick-Fix Orchestrator - "LEO Lite" Field Medic\n');

  // Initialize Supabase client with SERVICE_ROLE_KEY (SD-FOUND-SAFETY-002 pattern)
  if (!supabase) {
    supabase = await createSupabaseServiceClient('engineer', { verbose: false });
  }

  const results = {
    verdict: 'PASS',
    confidence: 100,
    critical_issues: [],
    warnings: [],
    recommendations: [],
    detailed_analysis: {},
    findings: {
      quick_fix_created: null,
      classification: null,
      specialists_invoked: [],
      escalation_required: false
    },
    options
  };

  try {
    // Extract issue details from options
    const issue = options.issue || {};
    const {
      title,
      description,
      type = 'bug',
      severity = 'medium',
      steps,
      expected,
      actual,
      estimatedLoc = 10,
      consoleError
    } = issue;

    if (!title && !description) {
      throw new Error('QUICKFIX requires issue title or description');
    }

    console.log('📋 Issue Triage\n');
    console.log(`   Title: ${title || 'Untitled'}`);
    console.log(`   Type: ${type}`);
    console.log(`   Severity: ${severity}\n`);

    // AI-Powered LOC Estimation (Enhancement #12)
    console.log('🤖 AI-Powered LOC Estimation\n');

    // Extract file info from console error
    const fileInfo = extractFileInfo(consoleError || '');
    if (fileInfo.file) {
      console.log(`   📂 Detected File: ${fileInfo.file}`);
      if (fileInfo.line) {
        console.log(`   📍 Line Number: ${fileInfo.line}`);
      }
    }

    const aiEstimation = estimateLOC({
      description,
      title,
      errorType: consoleError ? 'runtime' : '',
      file: fileInfo.file || '',
      consoleError: consoleError || '',
      type
    });

    console.log(`   📊 Estimated LOC: ${aiEstimation.estimatedLoc} (${aiEstimation.confidence}% confidence)`);
    console.log(`   💡 Reasoning: ${aiEstimation.reasoning}\n`);

    // Use AI estimation if user didn't provide one
    const finalEstimatedLoc = estimatedLoc || aiEstimation.estimatedLoc;

    // Step 1: Generate Quick-Fix ID
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const random = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
    const qfId = `QF-${year}${month}${day}-${random}`;

    console.log(`🆔 Generated Quick-Fix ID: ${qfId}\n`);

    // Step 2: Intelligent Triage - Should we invoke specialists?
    console.log('🔍 Step 1: Intelligent Triage\n');

    const triageResults = await triageIssue({
      title,
      description,
      type,
      severity,
      estimatedLoc,
      consoleError
    });

    results.findings.triage = triageResults;

    // Display triage results
    console.log(`   Estimated Complexity: ${triageResults.complexity}`);
    console.log(`   Risk Level: ${triageResults.risk}`);
    console.log(`   Specialists Needed: ${triageResults.specialists.length > 0 ? triageResults.specialists.join(', ') : 'None'}\n`);

    // Step 3: Invoke specialist sub-agents if needed
    if (triageResults.specialists.length > 0) {
      console.log('🔧 Step 2: Invoking Specialist Sub-Agents\n');

      for (const specialistCode of triageResults.specialists) {
        console.log(`   Calling ${specialistCode} sub-agent...`);

        try {
          const specialistResults = await invokeSpecialist(specialistCode, {
            qfId,
            issue,
            triageResults
          });

          results.findings.specialists_invoked.push({
            code: specialistCode,
            verdict: specialistResults.verdict,
            recommendations: specialistResults.recommendations
          });

          // Check if specialist recommends escalation
          if (specialistResults.escalate) {
            results.findings.escalation_required = true;
            results.warnings.push({
              severity: 'HIGH',
              issue: `${specialistCode} sub-agent recommends escalation`,
              recommendation: specialistResults.escalation_reason
            });
          }

          console.log(`   ✅ ${specialistCode}: ${specialistResults.verdict}\n`);

        } catch (err) {
          console.log(`   ⚠️  ${specialistCode} invocation failed: ${err.message}\n`);
          results.warnings.push({
            severity: 'MEDIUM',
            issue: `Failed to invoke ${specialistCode} sub-agent`,
            recommendation: 'Proceed with caution or escalate to full SD'
          });
        }
      }
    } else {
      console.log('✅ Step 2: No specialist sub-agents needed (simple fix)\n');
    }

    // Step 4: Check for auto-escalation conditions
    console.log('🚦 Step 3: Escalation Check\n');

    const shouldEscalate = triageResults.estimatedLoc > 50 ||
                           triageResults.complexity === 'high' ||
                           triageResults.risk === 'high' ||
                           results.findings.escalation_required;

    if (shouldEscalate) {
      console.log('   ⚠️  AUTO-ESCALATION REQUIRED\n');

      const escalationReason = [];
      if (triageResults.estimatedLoc > 50) escalationReason.push(`LOC (${triageResults.estimatedLoc}) > 50`);
      if (triageResults.complexity === 'high') escalationReason.push('High complexity');
      if (triageResults.risk === 'high') escalationReason.push('High risk');
      if (results.findings.escalation_required) escalationReason.push('Specialist recommendation');

      const { data, error } = await supabase
        .from('quick_fixes')
        .insert({
          id: qfId,
          title: title || 'Untitled issue',
          type,
          severity,
          description: description || '',
          steps_to_reproduce: steps || '',
          expected_behavior: expected || '',
          actual_behavior: actual || consoleError || '',
          estimated_loc: triageResults.estimatedLoc,
          status: 'escalated',
          escalation_reason: escalationReason.join('; '),
          found_during: 'uat',
          created_by: 'QUICKFIX_AGENT'
        })
        .select()
        .single();

      if (error) throw error;

      results.findings.quick_fix_created = data;
      results.findings.escalation_required = true;
      results.verdict = 'ESCALATE';
      results.confidence = 100;

      console.log(`   Reason: ${escalationReason.join('; ')}\n`);
      console.log('📋 Next Steps:');
      console.log('   1. Create Strategic Directive with LEAD approval');
      console.log('   2. Follow full LEAD→PLAN→EXEC workflow\n');

      results.recommendations.push(
        'This issue requires a full Strategic Directive',
        'Create SD and follow LEAD→PLAN→EXEC workflow',
        `Escalation reasons: ${escalationReason.join('; ')}`
      );

      return results;
    }

    // Step 5: Create Quick-Fix (qualifies for lightweight workflow)
    console.log('   ✅ Qualifies for Quick-Fix Workflow\n');
    console.log('📝 Step 4: Creating Quick-Fix Record\n');

    const { data, error } = await supabase
      .from('quick_fixes')
      .insert({
        id: qfId,
        title: title || 'Untitled issue',
        type,
        severity,
        description: description || '',
        steps_to_reproduce: steps || '',
        expected_behavior: expected || '',
        actual_behavior: actual || consoleError || '',
        estimated_loc: triageResults.estimatedLoc,
        status: 'open',
        found_during: 'uat',
        created_by: 'QUICKFIX_AGENT'
      })
      .select()
      .single();

    if (error) throw error;

    results.findings.quick_fix_created = data;
    results.findings.classification = {
      qualifies: true,
      estimated_loc: triageResults.estimatedLoc,
      complexity: triageResults.complexity,
      risk: triageResults.risk
    };

    console.log(`   ✅ Quick-Fix created: ${qfId}\n`);

    // Step 6: Provide implementation guidance
    console.log('📍 Step 5: Implementation Guidance\n');

    console.log('   Next Steps:');
    console.log(`   1. Read details:    node scripts/read-quick-fix.js ${qfId}`);
    console.log(`   2. Create branch:   git checkout -b quick-fix/${qfId}`);
    console.log('   3. Implement fix:   (≤50 LOC, single file preferred)');
    console.log('   4. Restart server:  pkill -f "npm run dev" && npm run dev');
    console.log('   5. Run tests:       npm run test:unit && npm run test:e2e');
    console.log('   6. Verify UAT:      (manually test the fix)');
    console.log(`   7. Create PR:       gh pr create --title "fix(${qfId}): ..."`);
    console.log(`   8. Complete:        node scripts/complete-quick-fix.js ${qfId}\n`);

    results.recommendations.push(
      `Quick-fix ${qfId} created successfully`,
      `Estimated LOC: ${triageResults.estimatedLoc}`,
      'Follow 8-step implementation workflow',
      'Compliance rubric will be run during completion (100-point scale)',
      'Both unit and E2E tests required',
      'PR creation mandatory (no direct merge)',
      'User approval required for commit/push'
    );

    console.log(`🏁 QUICKFIX Creation Complete: ${results.verdict} (${results.confidence}% confidence)\n`);
    console.log('   Note: Compliance rubric validation will run during completion step.\n');

    return results;

  } catch (error) {
    console.error('\n❌ QUICKFIX error:', error.message);
    results.verdict = 'ERROR';
    results.error = error.message;
    results.confidence = 0;
    results.critical_issues.push({
      severity: 'CRITICAL',
      issue: 'QUICKFIX sub-agent execution failed',
      recommendation: 'Review error and retry or escalate to full SD',
      error: error.message
    });
    return results;
  }
}

/**
 * Triage issue to determine complexity, risk, and which specialists to invoke
 */
async function triageIssue(issue) {
  const { title, description, type, severity, estimatedLoc, consoleError } = issue;

  const combined = `${title} ${description} ${consoleError || ''}`.toLowerCase();

  // Detect keywords
  const keywords = {
    database: ['database', 'schema', 'migration', 'sql', 'table', 'column', 'rls', 'postgres', 'supabase'],
    security: ['auth', 'authentication', 'authorization', 'security', 'permission', 'role', 'token', 'session'],
    testing: ['test', 'coverage', 'playwright', 'vitest', 'e2e', 'unit test'],
    design: ['ui', 'ux', 'design', 'layout', 'responsive', 'mobile', 'alignment', 'spacing', 'color', 'button', 'style', 'css', 'tailwind', 'accessibility', 'a11y'],
    performance: ['slow', 'performance', 'lag', 'timeout', 'cache', 'optimize']
  };

  // Determine which specialists to invoke
  const specialists = [];

  for (const [domain, domainKeywords] of Object.entries(keywords)) {
    if (domainKeywords.some(kw => combined.includes(kw))) {
      switch (domain) {
        case 'database':
          specialists.push('DATABASE');
          break;
        case 'security':
          specialists.push('SECURITY');
          break;
        case 'testing':
          specialists.push('TESTING');
          break;
        case 'design':
          // Invoke DESIGN for UI/UX issues
          specialists.push('DESIGN');
          break;
        // Performance doesn't auto-invoke for quick-fixes (usually requires profiling)
      }
    }
  }

  // Determine complexity
  let complexity = 'low';
  if (estimatedLoc > 30) complexity = 'medium';
  if (estimatedLoc > 50) complexity = 'high';
  if (specialists.length > 2) complexity = 'high';

  // Determine risk
  let risk = 'low';
  if (severity === 'high' || severity === 'critical') risk = 'medium';
  if (specialists.includes('DATABASE') || specialists.includes('SECURITY')) risk = 'high';

  return {
    estimatedLoc,
    complexity,
    risk,
    specialists: [...new Set(specialists)] // Remove duplicates
  };
}

/**
 * Invoke a specialist sub-agent for quick validation
 * Uses lightweight quickfix-specialists utility for actual checks
 * Returns lightweight verdict without full sub-agent execution
 */
async function invokeSpecialist(specialistCode, context) {
  // Use the actual lightweight specialist implementation
  // This performs real pattern matching and file checks
  // but doesn't do full sub-agent execution
  return await invokeQuickfixSpecialist(specialistCode, context);
}
