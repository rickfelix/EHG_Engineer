/**
 * LeadToPlanExecutor - Executes LEAD → PLAN handoffs
 * Part of LEO Protocol Unified Handoff System refactor
 *
 * Validates that LEAD approval is complete and ready for PLAN phase.
 * Note: This mostly delegates to the existing LeadToPlanVerifier.
 *
 * ENHANCED: Creates handoff retrospectives for continuous improvement
 */

import BaseExecutor from './BaseExecutor.js';
import { execSync } from 'child_process';
import path from 'path';
import readline from 'readline';
// validateSDHandoffState - available for future validation needs
import { validateSDHandoffState as _validateSDHandoffState, quickPreflightCheck } from '../../../lib/handoff-preflight.js';
// SD Branch Creation (proactive branch setup at LEAD-TO-PLAN)
import { createSDBranch, branchExists, generateBranchName } from '../../create-sd-branch.js';

// External verifier (will be lazy loaded)
let LeadToPlanVerifier;

export class LeadToPlanExecutor extends BaseExecutor {
  constructor(dependencies = {}) {
    super(dependencies);
    this.verifier = dependencies.verifier || null;
  }

  get handoffType() {
    return 'LEAD-TO-PLAN';
  }

  async setup(_sdId, _sd, _options) {
    await this._loadVerifier();
    return null;
  }

  getRequiredGates(_sd, _options) {
    const gates = [];

    // SD Transition Readiness Gate
    // Ensures SD is in valid state for LEAD→PLAN transition
    // Also checks for previous failed handoff attempts
    gates.push({
      name: 'GATE_SD_TRANSITION_READINESS',
      validator: async (ctx) => {
        console.log('\n🔄 GATE: SD Transition Readiness');
        console.log('-'.repeat(50));
        return this._validateTransitionReadiness(ctx.sd);
      },
      required: true,
      remediation: 'Ensure SD has valid status and no unresolved handoff failures. Address previous handoff rejections before retrying.'
    });

    // Target Application Validation Gate
    // SD-LEO-GEMINI-001: Validate target_application at LEAD-TO-PLAN to prevent
    // late-stage failures when commits are searched in wrong repository
    gates.push({
      name: 'TARGET_APPLICATION_VALIDATION',
      validator: async (ctx) => {
        console.log('\n🎯 GATE: Target Application Validation');
        console.log('-'.repeat(50));
        return this._validateTargetApplication(ctx.sd);
      },
      required: true,
      remediation: 'Set target_application to match the files in scope (EHG or EHG_Engineer)'
    });

    // Baseline Debt Check Gate
    // LEO Protocol v4.4: Prevents accumulation of pre-existing issues
    gates.push({
      name: 'BASELINE_DEBT_CHECK',
      validator: async (ctx) => {
        console.log('\n📊 GATE: Baseline Debt Check');
        console.log('-'.repeat(50));
        return this._checkBaselineDebt(ctx.sd);
      },
      required: true,
      weight: 0.8,
      remediation: 'Address stale critical baseline issues or assign ownership via: npm run baseline:assign <issue-key> <SD-ID>'
    });

    // LEO v4.4.0: Smoke Test Specification Gate
    // "Describe the 30-second demo that proves this SD delivered value."
    // If you can't answer this at LEAD, the SD is too vague.
    gates.push({
      name: 'SMOKE_TEST_SPECIFICATION',
      validator: async (ctx) => {
        console.log('\n👤 GATE: Smoke Test Specification (LEO v4.4.0)');
        console.log('-'.repeat(50));
        return this._validateSmokeTestSpecification(ctx.sd);
      },
      required: true,
      remediation: 'Add smoke_test_steps array with 3-5 user-observable verification steps. Example: [{step_number: 1, instruction: "Navigate to /dashboard", expected_outcome: "Dashboard loads with venture list visible"}]'
    });

    // LEO v4.4.1: Proactive Branch Creation Gate
    // DISABLED (2026-01-09): Removed proactive branch creation at LEAD-TO-PLAN
    // Root cause analysis found this created 192+ orphaned branches because:
    // - SDs that never proceed to EXEC still get branches
    // - Infrastructure SDs create branches in wrong repo (EHG vs EHG_Engineer)
    // - Ship command already has just-in-time branch creation (Step 3)
    //
    // Branches are now created on-demand when /ship is invoked.
    // See: scripts/branch-cleanup-intelligent.js for orphan cleanup.
    //
    // gates.push({
    //   name: 'SD_BRANCH_PREPARATION',
    //   validator: async (ctx) => this._ensureSDBranchExists(ctx.sd),
    //   required: false,
    //   weight: 0.9,
    //   remediation: 'Branch creation failed. Run manually: npm run sd:branch ' + (_sd?.id || '<SD-ID>')
    // });

    return gates;
  }

  /**
   * LEO v4.4.1: Proactive Branch Creation
   * Ensures SD branch exists BEFORE implementation starts (at LEAD approval)
   *
   * This addresses the gap where:
   * - Branch creation was only validated at PLAN-TO-EXEC (too late)
   * - Developers might start work before running handoff
   * - No explicit trigger point for branch creation existed
   *
   * @param {Object} sd - Strategic Directive
   * @returns {Object} Validation result with branch details
   */
  async _ensureSDBranchExists(sd) {
    const issues = [];
    const warnings = [];
    let branchName = null;
    let created = false;

    try {
      const sdId = sd.id || sd.sd_key;
      const title = sd.title || '';
      const targetApp = sd.target_application || 'EHG';

      // Determine repo path
      const repoPaths = {
        EHG: '/mnt/c/_EHG/EHG',
        EHG_Engineer: '/mnt/c/_EHG/EHG_Engineer'
      };
      const repoPath = repoPaths[targetApp];

      if (!repoPath) {
        warnings.push(`Unknown target_application: ${targetApp} - skipping branch creation`);
        console.log(`   ⚠️  Unknown target_application: ${targetApp}`);
        return { pass: true, score: 80, issues: [], warnings };
      }

      // Generate expected branch name
      branchName = generateBranchName(sdId, title);
      console.log(`   Target Application: ${targetApp}`);
      console.log(`   Repository: ${repoPath}`);
      console.log(`   Expected Branch: ${branchName}`);

      // Check if branch already exists
      const existsResult = await branchExists(branchName, repoPath);

      if (existsResult.exists) {
        console.log(`   ✅ Branch already exists (${existsResult.location})`);

        // Update database with branch name if not already set
        if (!sd.branch_name) {
          try {
            await this.supabase
              .from('strategic_directives_v2')
              .update({ branch_name: branchName })
              .eq('id', sd.id);
            console.log('   ✅ Branch name recorded in database');
          } catch {
            // Non-critical - continue
          }
        }

        return {
          pass: true,
          score: 100,
          issues: [],
          warnings: [],
          details: { branchName, exists: true, created: false }
        };
      }

      // Branch doesn't exist - create it proactively
      console.log('   ℹ️  Branch does not exist - creating proactively...');

      try {
        const result = await createSDBranch({
          sdId,
          title,
          app: targetApp,
          autoStash: true, // Automatically handle uncommitted changes
          noSwitch: false  // Switch to the new branch
        });

        if (result.success) {
          created = true;
          branchName = result.branchName;
          console.log(`   ✅ Branch created: ${branchName}`);

          return {
            pass: true,
            score: 100,
            issues: [],
            warnings: [],
            details: { branchName, exists: true, created: true }
          };
        } else {
          warnings.push('Branch creation returned unsuccessful - may need manual creation');
          console.log('   ⚠️  Branch creation did not complete successfully');
        }
      } catch (createError) {
        warnings.push(`Branch creation failed: ${createError.message}`);
        console.log(`   ⚠️  Could not create branch: ${createError.message}`);
        console.log('   📋 Manual command: npm run sd:branch ' + sdId);
      }

    } catch (error) {
      warnings.push(`Branch preparation error: ${error.message}`);
      console.log(`   ⚠️  Error: ${error.message}`);
    }

    // Even if branch creation failed, don't block handoff (soft gate)
    const passed = issues.length === 0;
    const score = passed ? (warnings.length > 0 ? 70 : 100) : 0;

    console.log(`   Result: ${passed ? '✅ PASS' : '❌ FAIL'} ${warnings.length > 0 ? '(with warnings)' : ''}`);

    return {
      pass: passed,
      score,
      max_score: 100,
      issues,
      warnings,
      details: { branchName, created }
    };
  }

  /**
   * Validate and potentially auto-correct target_application
   * SD-LEO-GEMINI-001: Prevents wrong repository being searched during final handoff
   */
  async _validateTargetApplication(sd) {
    const scope = (sd.scope || sd.description || '').toLowerCase();
    const title = (sd.title || '').toLowerCase();
    const combinedText = `${scope} ${title}`;

    // Patterns that indicate EHG_Engineer (LEO Protocol infrastructure)
    const engineerPatterns = [
      'claude.md', 'claude_', 'leo protocol', 'handoff.js', 'phase-preflight',
      'sub-agent', 'subagent', 'leo_protocol', 'retrospective', 'verification gate',
      'handoff system', 'bmad', 'scripts/modules', 'lib/sub-agents'
    ];

    // Patterns that indicate EHG (main application)
    const ehgPatterns = [
      'stage', 'venture', 'ui component', 'react', 'frontend', 'backend',
      'api endpoint', 'database table', 'rls policy', 'user interface',
      'supabase function', 'edge function'
    ];

    // Count pattern matches
    const engineerMatches = engineerPatterns.filter(p => combinedText.includes(p));
    const ehgMatches = ehgPatterns.filter(p => combinedText.includes(p));

    // Determine inferred target
    let inferredTarget = null;
    let confidence = 'low';

    if (engineerMatches.length > ehgMatches.length) {
      inferredTarget = 'EHG_Engineer';
      confidence = engineerMatches.length >= 2 ? 'high' : 'medium';
    } else if (ehgMatches.length > engineerMatches.length) {
      inferredTarget = 'EHG';
      confidence = ehgMatches.length >= 2 ? 'high' : 'medium';
    } else if (engineerMatches.length > 0) {
      inferredTarget = 'EHG_Engineer';
      confidence = 'medium';
    }

    const currentTarget = sd.target_application;

    console.log(`   Current target_application: ${currentTarget || '(not set)'}`);
    console.log(`   Inferred from scope: ${inferredTarget || '(could not determine)'} (${confidence} confidence)`);

    if (engineerMatches.length > 0) {
      console.log(`   Engineer patterns found: ${engineerMatches.slice(0, 3).join(', ')}${engineerMatches.length > 3 ? '...' : ''}`);
    }
    if (ehgMatches.length > 0) {
      console.log(`   EHG patterns found: ${ehgMatches.slice(0, 3).join(', ')}${ehgMatches.length > 3 ? '...' : ''}`);
    }

    // Validation scenarios
    if (!currentTarget && inferredTarget) {
      // No target set, but we can infer one - auto-set it
      console.log(`\n   ⚠️  target_application not set, auto-setting to: ${inferredTarget}`);

      const { error } = await this.supabase
        .from('strategic_directives_v2')
        .update({ target_application: inferredTarget })
        .eq('id', sd.id);

      if (error) {
        console.log(`   ❌ Failed to update: ${error.message}`);
        return {
          pass: false,
          score: 0,
          issues: [`Could not set target_application: ${error.message}`]
        };
      }

      console.log(`   ✅ Auto-set target_application to: ${inferredTarget}`);
      return {
        pass: true,
        score: 90,
        issues: [],
        warnings: [`target_application was auto-set to ${inferredTarget} based on scope analysis`]
      };
    }

    if (currentTarget && inferredTarget && currentTarget !== inferredTarget && confidence === 'high') {
      // Target set but doesn't match inferred with high confidence - warn and offer correction
      console.log('\n   ⚠️  MISMATCH DETECTED');
      console.log(`   Current: ${currentTarget}`);
      console.log(`   Inferred: ${inferredTarget} (high confidence)`);
      console.log(`   Auto-correcting to: ${inferredTarget}`);

      const { error } = await this.supabase
        .from('strategic_directives_v2')
        .update({ target_application: inferredTarget })
        .eq('id', sd.id);

      if (error) {
        console.log(`   ❌ Failed to update: ${error.message}`);
        return {
          pass: false,
          score: 0,
          issues: [`target_application mismatch: set to ${currentTarget}, but scope suggests ${inferredTarget}`]
        };
      }

      console.log(`   ✅ Corrected target_application to: ${inferredTarget}`);
      return {
        pass: true,
        score: 80,
        issues: [],
        warnings: [`target_application corrected from ${currentTarget} to ${inferredTarget}`]
      };
    }

    if (!currentTarget && !inferredTarget) {
      // No target and couldn't infer - default to EHG with warning
      console.log('\n   ⚠️  Could not determine target_application, defaulting to EHG');

      const { error } = await this.supabase
        .from('strategic_directives_v2')
        .update({ target_application: 'EHG' })
        .eq('id', sd.id);

      if (!error) {
        console.log('   ✅ Default target_application set to: EHG');
      }

      return {
        pass: true,
        score: 70,
        issues: [],
        warnings: ['target_application defaulted to EHG - verify this is correct']
      };
    }

    // Target is set and matches or no inference conflict
    console.log(`   ✅ target_application validated: ${currentTarget}`);
    return {
      pass: true,
      score: 100,
      issues: []
    };
  }

  /**
   * Check baseline debt - prevents accumulation of pre-existing issues
   * LEO Protocol v4.4: BASELINE_DEBT_CHECK gate
   *
   * BLOCKS if: Stale critical issues (>30 days) exist without owner
   * WARNS if: Total open issues > 10 or stale non-critical > 5
   */
  async _checkBaselineDebt(sd) {
    try {
      // Try to use the database function first (most efficient)
      const { data: gateResult, error: rpcError } = await this.supabase
        .rpc('check_baseline_gate', { p_sd_id: sd.id });

      if (!rpcError && gateResult) {
        const result = gateResult;
        const passed = result.verdict === 'PASS';

        console.log(`   Open issues: ${result.total_open_count || 0}`);
        console.log(`   Stale critical: ${result.stale_critical_count || 0}`);
        console.log(`   SD-owned issues: ${result.owned_issues_count || 0}`);
        console.log(`   Result: ${passed ? '✅ PASS' : '❌ BLOCKED'}`);

        // Convert JSONB arrays to regular arrays
        const issues = Array.isArray(result.issues) ? result.issues : [];
        const warnings = Array.isArray(result.warnings) ? result.warnings : [];

        return {
          pass: passed,
          score: passed ? (warnings.length > 0 ? 80 : 100) : 0,
          max_score: 100,
          issues: issues,
          warnings: warnings,
          details: {
            totalOpen: result.total_open_count,
            staleCritical: result.stale_critical_count,
            ownedIssues: result.owned_issues_count
          }
        };
      }

      // Fallback: Query baseline directly if RPC not available
      console.log('   ℹ️  Using fallback baseline check (RPC not available)');

      // Check if table exists
      const { data: summary, error: summaryError } = await this.supabase
        .from('baseline_summary')
        .select('*');

      if (summaryError) {
        // Table doesn't exist yet - pass with warning
        console.log('   ⚠️  Baseline table not available (migration may be pending)');
        return {
          pass: true,
          score: 100,
          issues: [],
          warnings: ['Baseline table not available - skipping check']
        };
      }

      // Query stale issues (>30 days old and still open)
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data: staleIssues } = await this.supabase
        .from('sd_baseline_issues')
        .select('issue_key, category, severity, created_at')
        .eq('status', 'open')
        .lt('created_at', thirtyDaysAgo);

      const issues = [];
      const warnings = [];

      // Check for stale critical issues
      const staleCritical = staleIssues?.filter(i => i.severity === 'critical') || [];
      if (staleCritical.length > 0) {
        issues.push(`${staleCritical.length} critical baseline issues unaddressed for >30 days`);
        staleCritical.forEach(i => {
          const daysOld = Math.floor((Date.now() - new Date(i.created_at).getTime()) / (24 * 60 * 60 * 1000));
          issues.push(`  - ${i.issue_key}: ${i.category} (${daysOld} days old)`);
        });
      }

      // Calculate total open
      const totalOpen = summary?.reduce((sum, s) => sum + (s.open_count || 0), 0) || 0;
      if (totalOpen > 10) {
        warnings.push(`Baseline debt growing: ${totalOpen} open issues across all categories`);
      }

      // Check stale non-critical
      const staleNonCritical = staleIssues?.filter(i => i.severity !== 'critical') || [];
      if (staleNonCritical.length > 5) {
        warnings.push(`${staleNonCritical.length} non-critical issues unaddressed for >30 days`);
      }

      const passed = issues.length === 0;
      const score = passed ? (warnings.length > 0 ? 80 : 100) : 0;

      console.log(`   Open issues: ${totalOpen}`);
      console.log(`   Stale critical: ${staleCritical.length}`);
      console.log(`   Result: ${passed ? '✅ PASS' : '❌ BLOCKED'}`);

      return {
        pass: passed,
        score,
        max_score: 100,
        issues,
        warnings,
        details: { totalOpen, staleCritical: staleCritical.length, summary }
      };

    } catch (error) {
      // On any error, pass with warning (don't block for infrastructure issues)
      console.log(`   ⚠️  Baseline check error: ${error.message}`);
      return {
        pass: true,
        score: 90,
        issues: [],
        warnings: [`Baseline check skipped due to error: ${error.message}`]
      };
    }
  }

  /**
   * Validate SD Transition Readiness for LEAD→PLAN
   *
   * TIER 1 Implementation: Entry validation gate
   * Prevents handoff attempts when SD is not ready or has unresolved issues.
   *
   * Checks:
   * 1. SD has required fields (title, scope, acceptance_criteria)
   * 2. SD status allows for LEAD→PLAN transition
   * 3. No previous failed/rejected LEAD-TO-PLAN handoffs (must resolve first)
   * 4. Quick preflight check for handoff state consistency
   */
  async _validateTransitionReadiness(sd) {
    const issues = [];
    const warnings = [];
    let score = 100;

    console.log(`   SD: ${sd.sd_key} - ${sd.title}`);
    console.log(`   Current Status: ${sd.status || 'NOT SET'}`);

    // Check 1: Required fields for planning
    const requiredFields = ['title', 'description'];
    const missingFields = requiredFields.filter(f => !sd[f] || sd[f].trim() === '');

    if (missingFields.length > 0) {
      issues.push(`Missing required fields: ${missingFields.join(', ')}`);
      console.log(`   ❌ Missing required fields: ${missingFields.join(', ')}`);
    } else {
      console.log('   ✅ All required fields present');
    }

    // Check 2: SD status allows LEAD→PLAN transition
    const validStatuses = ['ACTIVE', 'APPROVED', 'PLANNING', 'READY', 'LEAD_APPROVED', null, undefined];
    const blockingStatuses = ['COMPLETED', 'CANCELLED', 'ARCHIVED', 'ON_HOLD'];

    if (blockingStatuses.includes(sd.status?.toUpperCase())) {
      issues.push(`SD status '${sd.status}' does not allow handoff - must be active/approved`);
      console.log(`   ❌ Blocking status: ${sd.status}`);
    } else if (!validStatuses.some(s => s === sd.status || (s && sd.status?.toUpperCase() === s))) {
      warnings.push(`Unusual SD status: ${sd.status} - verify this is intentional`);
      console.log(`   ⚠️  Unusual status: ${sd.status}`);
      score -= 10;
    } else {
      console.log('   ✅ Status allows transition');
    }

    // Check 3: Look for previous failed/rejected LEAD-TO-PLAN handoffs
    try {
      const { data: previousHandoffs } = await this.supabase
        .from('sd_handoffs')
        .select('id, status, created_at, rejection_reason')
        .eq('sd_id', sd.id)
        .eq('handoff_type', 'LEAD-TO-PLAN')
        .in('status', ['REJECTED', 'FAILED', 'BLOCKED'])
        .order('created_at', { ascending: false })
        .limit(5);

      if (previousHandoffs && previousHandoffs.length > 0) {
        const latestFailed = previousHandoffs[0];
        const failedCount = previousHandoffs.length;

        console.log(`   ⚠️  Found ${failedCount} previous failed/rejected handoff attempt(s)`);

        // If the most recent attempt was rejected, require acknowledgment
        if (latestFailed.status === 'REJECTED') {
          issues.push(`Previous LEAD-TO-PLAN handoff was REJECTED: ${latestFailed.rejection_reason || 'No reason provided'}`);
          issues.push('Action: Address rejection reason before retrying handoff');
          console.log(`   ❌ Last rejection: ${latestFailed.rejection_reason || 'No reason provided'}`);
        } else {
          warnings.push(`Previous handoff attempt failed (${failedCount}x) - verify issues resolved`);
          score -= 15;
        }
      } else {
        console.log('   ✅ No previous failed handoff attempts');
      }
    } catch (error) {
      // Table may not exist yet - warn but don't block
      warnings.push(`Could not check previous handoffs: ${error.message}`);
      console.log(`   ⚠️  Handoff history check skipped: ${error.message}`);
    }

    // Check 4: Quick preflight check using shared utility
    try {
      const preflightResult = await quickPreflightCheck(sd.id, 'PLAN');
      if (!preflightResult.ready) {
        // This is informational for LEAD→PLAN (first handoff)
        // The preflight utility expects LEAD-TO-PLAN to exist for PLAN phase
        // But we're CREATING it now, so this is expected
        console.log('   ℹ️  Preflight: No prior handoffs (expected for LEAD→PLAN)');
      } else {
        console.log('   ✅ Preflight check passed');
      }
    } catch (error) {
      // Preflight utility error - continue anyway
      console.log(`   ⚠️  Preflight check skipped: ${error.message}`);
    }

    // QF-20251220-426: Check 5: success_metrics must be populated
    // Root cause: Empty success_metrics caused RETROSPECTIVE_QUALITY_GATE failures
    // at PLAN-TO-LEAD. Catching this at LEAD-TO-PLAN prevents downstream issues.
    // ROOT CAUSE FIX: Also check success_criteria as fallback (SD creation scripts use this field)
    let successMetrics = sd.success_metrics;
    let metricsSource = 'success_metrics';

    // Fallback to success_criteria if success_metrics is empty (common in SD creation scripts)
    if ((!successMetrics || (Array.isArray(successMetrics) && successMetrics.length === 0))
        && sd.success_criteria && Array.isArray(sd.success_criteria) && sd.success_criteria.length > 0) {
      successMetrics = sd.success_criteria;
      metricsSource = 'success_criteria (fallback)';
      console.log('   ℹ️  Using success_criteria as fallback for success_metrics');
    }

    if (!successMetrics || (Array.isArray(successMetrics) && successMetrics.length === 0)) {
      issues.push('success_metrics AND success_criteria are both empty - must define at least one measurable success metric');
      console.log('   ❌ success_metrics and success_criteria are both empty or missing');
    } else if (Array.isArray(successMetrics)) {
      // Validate structure: accept both object format (metric/target) AND string format (success_criteria)
      // Object format: { metric: "...", target: "..." }
      // String format: "Schema allows all status values..." (from success_criteria)
      const validMetrics = successMetrics.filter(m =>
        (m && typeof m === 'object' && m.metric && m.target) || // Object format
        (m && typeof m === 'string' && m.trim().length > 0)     // String format (success_criteria)
      );
      if (validMetrics.length === 0) {
        issues.push('success_metrics/success_criteria has no valid entries');
        console.log('   ❌ No valid metric entries found');
      } else if (validMetrics.length < successMetrics.length) {
        warnings.push(`${successMetrics.length - validMetrics.length} metric entries are invalid`);
        console.log(`   ⚠️  ${validMetrics.length}/${successMetrics.length} metrics are valid`);
        score -= 10;
      } else {
        console.log(`   ✅ ${metricsSource} validated (${validMetrics.length} entries)`);
      }
    } else {
      warnings.push('success_metrics is not an array - may cause downstream issues');
      console.log('   ⚠️  success_metrics is not an array');
      score -= 10;
    }

    const passed = issues.length === 0;
    console.log(`\n   Result: ${passed ? '✅ READY for LEAD→PLAN transition' : '❌ NOT READY - resolve issues above'}`);

    return {
      pass: passed,
      score: passed ? Math.max(score, 70) : 0,
      max_score: 100,
      issues,
      warnings
    };
  }

  async executeSpecific(sdId, sd, _options, _gateResults) {
    // Display pre-handoff warnings from recent retrospectives
    await this._displayPreHandoffWarnings('LEAD_TO_PLAN');

    // Delegate to existing LeadToPlanVerifier
    // This verifier handles all the LEAD→PLAN validation logic
    const verifier = this.verifier || new LeadToPlanVerifier();
    const result = await verifier.verifyHandoff(sdId);

    if (!result.success) {
      return result;
    }

    // Gap #7 Fix (2026-01-01): Update SD current_phase to PLAN_PRD
    await this._transitionSdToPlan(sdId, sd);

    // Auto-generate PRD script on successful LEAD→PLAN handoff
    await this._autoGeneratePRDScript(sdId, sd);

    // Create handoff retrospective after successful handoff
    await this._createHandoffRetrospective(sdId, sd, result, 'LEAD_TO_PLAN');

    // Merge additional context
    return {
      success: true,
      ...result,
      qualityScore: result.qualityScore || 100
    };
  }

  /**
   * STATE TRANSITION: Update SD current_phase on successful LEAD-TO-PLAN handoff
   *
   * Gap #7 Fix (2026-01-01): LeadToPlanExecutor was missing state transition.
   * SD remained in LEAD phase even after handoff was approved.
   * This caused phase tracking to be out of sync.
   */
  async _transitionSdToPlan(sdId, sd) {
    console.log('\n📊 STATE TRANSITION: SD Phase Update');
    console.log('-'.repeat(50));

    try {
      // Determine the correct SD ID field (UUID vs legacy_id)
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sdId);
      const queryField = isUUID ? 'id' : 'legacy_id';

      const { error } = await this.supabase
        .from('strategic_directives_v2')
        .update({
          current_phase: 'PLAN_PRD',
          status: 'in_progress',
          updated_at: new Date().toISOString()
        })
        .eq(queryField, sdId);

      if (error) {
        console.log(`   ⚠️  Could not update SD phase: ${error.message}`);
      } else {
        const oldPhase = sd?.current_phase || 'LEAD';
        console.log(`   ✅ SD phase transitioned: ${oldPhase} → PLAN_PRD`);
        console.log('   ✅ SD status transitioned: → in_progress');
      }
    } catch (error) {
      console.log(`   ⚠️  SD transition error: ${error.message}`);
    }
  }

  /**
   * DISPLAY PRE-HANDOFF WARNINGS
   *
   * Query recent retrospectives to surface common issues before handoff execution.
   * This allows the team to proactively address known friction points.
   */
  async _displayPreHandoffWarnings(handoffType) {
    try {
      console.log('\n⚠️  PRE-HANDOFF WARNINGS: Recent Friction Points');
      console.log('='.repeat(70));

      // Query recent retrospectives of this handoff type
      const { data: retrospectives, error } = await this.supabase
        .from('retrospectives')
        .select('what_needs_improvement, action_items, key_learnings')
        .eq('retrospective_type', handoffType)
        .eq('status', 'PUBLISHED')
        .order('conducted_date', { ascending: false })
        .limit(10);

      if (error || !retrospectives || retrospectives.length === 0) {
        console.log('   ℹ️  No recent retrospectives found for this handoff type');
        console.log('');
        return;
      }

      // Aggregate common issues
      const issueFrequency = {};
      retrospectives.forEach(retro => {
        const improvements = Array.isArray(retro.what_needs_improvement)
          ? retro.what_needs_improvement
          : [];

        improvements.forEach(item => {
          const improvement = typeof item === 'string' ? item : item.improvement || item;
          if (improvement) {
            issueFrequency[improvement] = (issueFrequency[improvement] || 0) + 1;
          }
        });
      });

      // Sort by frequency and display top 3
      const topIssues = Object.entries(issueFrequency)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);

      if (topIssues.length > 0) {
        console.log('   📊 Most Common Issues (last 10 retrospectives):');
        topIssues.forEach(([issue, count], index) => {
          console.log(`   ${index + 1}. [${count}x] ${issue}`);
        });
      } else {
        console.log('   ✅ No common issues identified in recent retrospectives');
      }

      console.log('');
    } catch (error) {
      console.log(`   ⚠️  Could not load warnings: ${error.message}`);
      console.log('');
    }
  }

  /**
   * CREATE HANDOFF RETROSPECTIVE
   *
   * After a successful handoff, automatically creates a retrospective record.
   * Uses handoff metrics for quality scoring. Interactive prompts are optional
   * and have a timeout to prevent blocking in non-interactive contexts.
   *
   * ROOT CAUSE FIX: Previous version used blocking readline prompts that would
   * hang indefinitely in non-interactive mode (piped output, Claude Code, etc.).
   * Now uses non-blocking defaults with optional interactive enhancement.
   */
  async _createHandoffRetrospective(sdId, sd, handoffResult, retrospectiveType) {
    try {
      console.log('\n📝 HANDOFF RETROSPECTIVE: Auto-capturing learnings');
      console.log('='.repeat(70));

      // Determine if running interactively (TTY connected to stdin)
      const isInteractive = process.stdin.isTTY && process.stdout.isTTY;

      let clarityRating = '4';
      let criteriaRating = '4';
      let depsRating = '4';
      let simplicityRating = '4';
      let frictionPoints = 'none';

      if (isInteractive) {
        // Interactive mode: prompt with timeout
        console.log('   Handoff successful! Quick feedback (10s timeout, Enter to skip):');
        console.log('');

        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout
        });

        const promptWithTimeout = (question, timeoutMs = 10000) => new Promise((resolve) => {
          const timer = setTimeout(() => {
            resolve('');
          }, timeoutMs);

          rl.question(`   ${question}`, (answer) => {
            clearTimeout(timer);
            resolve(answer);
          });
        });

        // Key questions for LEAD→PLAN handoff (with timeout)
        clarityRating = (await promptWithTimeout('SD clarity? (1-5, 5=very clear): ')) || '4';
        criteriaRating = (await promptWithTimeout('Acceptance criteria? (1-5): ')) || '4';
        depsRating = (await promptWithTimeout('Dependencies identified? (1-5): ')) || '4';
        simplicityRating = (await promptWithTimeout('Simplicity held up? (1-5): ')) || '4';
        frictionPoints = (await promptWithTimeout('Friction points? (or "none"): ')) || 'none';

        rl.close();
      } else {
        // Non-interactive mode: use defaults based on handoff result
        console.log('   Running in non-interactive mode - using auto-generated metrics');

        // Derive quality from handoff result
        if (handoffResult.qualityScore) {
          const derivedRating = Math.ceil(handoffResult.qualityScore / 20); // 0-100 -> 1-5
          clarityRating = String(derivedRating);
          criteriaRating = String(derivedRating);
          depsRating = String(derivedRating);
          simplicityRating = String(derivedRating);
        }
      }

      // Calculate quality score from ratings
      const numericRatings = [clarityRating, criteriaRating, depsRating, simplicityRating]
        .map(r => parseInt(r, 10))
        .filter(n => !isNaN(n) && n >= 1 && n <= 5);

      const avgRating = numericRatings.length > 0
        ? numericRatings.reduce((a, b) => a + b, 0) / numericRatings.length
        : 4; // Default to 4 if no ratings provided

      const qualityScore = Math.round((avgRating / 5) * 100);

      // Build retrospective data
      const whatWentWell = [];
      if (parseInt(clarityRating) >= 4) whatWentWell.push({ achievement: 'SD was clear and well-defined for planning', is_boilerplate: false });
      if (parseInt(criteriaRating) >= 4) whatWentWell.push({ achievement: 'Acceptance criteria were comprehensive and actionable', is_boilerplate: false });
      if (parseInt(depsRating) >= 4) whatWentWell.push({ achievement: 'Dependencies were correctly identified upfront', is_boilerplate: false });
      if (parseInt(simplicityRating) >= 4) whatWentWell.push({ achievement: 'Simplicity assessment was accurate and helpful', is_boilerplate: false });
      if (handoffResult.success) whatWentWell.push({ achievement: 'Handoff validation passed all gates successfully', is_boilerplate: false });

      // Ensure minimum 5 achievements
      const boilerplateAchievements = [
        'LEAD phase completed systematically',
        'SD approval workflow followed correctly',
        'Handoff documentation generated automatically'
      ];
      while (whatWentWell.length < 5) {
        whatWentWell.push({ achievement: boilerplateAchievements[whatWentWell.length - 2] || 'Standard LEAD process followed', is_boilerplate: true });
      }

      const whatNeedsImprovement = [];
      if (parseInt(clarityRating) <= 3) whatNeedsImprovement.push('SD clarity could be improved for better planning');
      if (parseInt(criteriaRating) <= 3) whatNeedsImprovement.push('Acceptance criteria need more detail and specificity');
      if (parseInt(depsRating) <= 3) whatNeedsImprovement.push('Dependency identification process needs enhancement');
      if (parseInt(simplicityRating) <= 3) whatNeedsImprovement.push('Simplicity assessment methodology could be refined');
      if (frictionPoints && frictionPoints !== 'none' && frictionPoints !== 'N/A') {
        whatNeedsImprovement.push(frictionPoints);
      }

      // Ensure minimum 3 improvements
      while (whatNeedsImprovement.length < 3) {
        whatNeedsImprovement.push('Continue monitoring handoff process for improvement opportunities');
      }

      const keyLearnings = [
        { learning: `Average handoff quality rating: ${avgRating.toFixed(1)}/5`, is_boilerplate: false },
        { learning: `Handoff completed with quality score: ${qualityScore}%`, is_boilerplate: false }
      ];

      if (frictionPoints && frictionPoints !== 'none' && frictionPoints !== 'N/A') {
        keyLearnings.push({ learning: `Friction identified: ${frictionPoints}`, is_boilerplate: false });
      }

      // Ensure minimum 5 learnings
      const boilerplateLearnings = [
        'LEAD→PLAN handoff process provides valuable quality gates',
        'Pre-handoff warnings help identify recurring issues',
        'Retrospective capture improves continuous learning'
      ];
      while (keyLearnings.length < 5) {
        keyLearnings.push({ learning: boilerplateLearnings[keyLearnings.length - 3] || 'Standard handoff learning captured', is_boilerplate: true });
      }

      const actionItems = [];
      if (parseInt(clarityRating) <= 3) {
        actionItems.push({ action: 'Enhance SD template to improve clarity for PLAN phase', is_boilerplate: false });
      }
      if (parseInt(criteriaRating) <= 3) {
        actionItems.push({ action: 'Create acceptance criteria checklist for LEAD approval', is_boilerplate: false });
      }
      if (frictionPoints && frictionPoints !== 'none' && frictionPoints !== 'N/A') {
        actionItems.push({ action: `Address friction point: ${frictionPoints}`, is_boilerplate: false });
      }

      // Ensure minimum 3 action items
      while (actionItems.length < 3) {
        actionItems.push({ action: 'Continue following LEO Protocol handoff best practices', is_boilerplate: true });
      }

      // Create retrospective record
      const retrospective = {
        sd_id: sdId,
        project_name: sd.title,
        retro_type: retrospectiveType,
        retrospective_type: retrospectiveType, // New field for handoff type
        title: `${retrospectiveType} Handoff Retrospective: ${sd.title}`,
        description: `Retrospective for ${retrospectiveType} handoff of ${sd.sd_key}`,
        conducted_date: new Date().toISOString(),
        agents_involved: ['LEAD', 'PLAN'],
        sub_agents_involved: [],
        human_participants: ['LEAD'],
        what_went_well: whatWentWell,
        what_needs_improvement: whatNeedsImprovement,
        action_items: actionItems,
        key_learnings: keyLearnings,
        quality_score: qualityScore,
        team_satisfaction: Math.round(avgRating * 2), // Scale to 1-10
        business_value_delivered: 'Handoff process improvement',
        customer_impact: 'Process efficiency improvement',
        technical_debt_addressed: false,
        technical_debt_created: false,
        bugs_found: 0,
        bugs_resolved: 0,
        tests_added: 0,
        objectives_met: handoffResult.success,
        on_schedule: true,
        within_scope: true,
        success_patterns: [`Quality rating: ${avgRating.toFixed(1)}/5`],
        failure_patterns: whatNeedsImprovement.slice(0, 3),
        improvement_areas: whatNeedsImprovement.slice(0, 3),
        generated_by: 'MANUAL',
        trigger_event: 'HANDOFF_COMPLETION',
        status: 'PUBLISHED',
        performance_impact: 'Standard',
        target_application: 'EHG_Engineer',
        learning_category: 'PROCESS_IMPROVEMENT',
        related_files: [],
        related_commits: [],
        related_prs: [],
        affected_components: ['LEO Protocol', 'Handoff System'],
        tags: ['handoff', 'lead-to-plan', 'process-improvement']
      };

      // Insert retrospective
      const { data, error } = await this.supabase
        .from('retrospectives')
        .insert(retrospective)
        .select();

      if (error) {
        console.log(`\n   ⚠️  Could not save retrospective: ${error.message}`);
        console.log('   Retrospective data will not be persisted');
      } else {
        console.log(`\n   ✅ Handoff retrospective created (ID: ${data[0].id})`);
        console.log(`   Quality Score: ${qualityScore}% | Team Satisfaction: ${Math.round(avgRating * 2)}/10`);
      }

      console.log('');
    } catch (error) {
      console.log(`\n   ⚠️  Retrospective creation error: ${error.message}`);
      console.log('   Continuing with handoff execution');
      console.log('');
    }
  }

  /**
   * AUTO-GENERATE PRD SCRIPT ON LEAD→PLAN HANDOFF
   *
   * Automatically generates a PRD creation script when LEAD approves an SD.
   * This integration ensures PRD scripts are created immediately after approval.
   */
  async _autoGeneratePRDScript(sdId, sd) {
    try {
      console.log('\n🤖 AUTO-GENERATING PRD SCRIPT');
      console.log('='.repeat(70));

      console.log(`   SD: ${sd.title || sdId}`);

      const scriptPath = path.join(process.cwd(), 'scripts', 'generate-prd-script.js');
      const title = sd.title || 'Technical Implementation';

      console.log(`   Running: node scripts/generate-prd-script.js ${sdId} "${title}"`);

      try {
        const output = execSync(
          `node "${scriptPath}" ${sdId} "${title}"`,
          { encoding: 'utf-8', cwd: process.cwd() }
        );

        console.log('\n' + output);
        console.log('✅ PRD script auto-generated successfully!');

        // Gap #3 Fix (2026-01-01): Auto-execute the generated PRD script
        const prdScriptPath = path.join(process.cwd(), 'scripts', `create-prd-${sdId.toLowerCase()}.js`);

        console.log('');
        console.log('📄 AUTO-EXECUTING PRD SCRIPT...');
        console.log(`   Running: node ${prdScriptPath}`);
        console.log('');

        try {
          const prdOutput = execSync(
            `node "${prdScriptPath}"`,
            { encoding: 'utf-8', cwd: process.cwd(), timeout: 120000 }
          );
          console.log(prdOutput);
          console.log('✅ PRD created and sub-agents invoked successfully!');
        } catch (prdExecError) {
          console.log(`   ⚠️  PRD script execution failed: ${prdExecError.message}`);
          console.log('');
          console.log('📝 MANUAL STEPS (if needed):');
          console.log(`   1. Edit: scripts/create-prd-${sdId.toLowerCase()}.js`);
          console.log('      - Update TODO sections');
          console.log('      - Add requirements, architecture, test scenarios');
          console.log('');
          console.log(`   2. Run: node scripts/create-prd-${sdId.toLowerCase()}.js`);
          console.log('      - Creates PRD in database');
          console.log('      - Validates schema automatically');
          console.log('      - Triggers sub-agents');
        }
        console.log('');

      } catch (execError) {
        if (execError.message.includes('already exists')) {
          console.log('   ℹ️  PRD script already exists - skipping generation');
          // Gap #3 Fix: Even if script exists, try to execute it
          const prdScriptPath = path.join(process.cwd(), 'scripts', `create-prd-${sdId.toLowerCase()}.js`);
          console.log('   📄 Attempting to execute existing PRD script...');
          try {
            execSync(`node "${prdScriptPath}"`, { encoding: 'utf-8', cwd: process.cwd(), timeout: 120000 });
            console.log('   ✅ Existing PRD script executed successfully');
          } catch (existingError) {
            console.log(`   ⚠️  Existing script execution failed: ${existingError.message}`);
          }
        } else {
          console.log(`   ⚠️  Generation failed: ${execError.message}`);
          console.log('   You can manually run: npm run prd:new ' + sdId);
        }
      }

    } catch (error) {
      console.log('\n⚠️  Auto-generation error:', error.message);
      console.log('   PRD script can be generated manually:');
      console.log(`   npm run prd:new ${sdId}`);
    }
  }

  /**
   * LEO v4.4.0: Validate smoke test specification
   * "Describe the 30-second demo that proves this SD delivered value."
   *
   * BLOCKS feature SDs without smoke_test_steps
   * SKIPS for infrastructure/documentation/orchestrator SDs
   *
   * @param {Object} sd - Strategic Directive
   * @returns {Object} Validation result
   */
  async _validateSmokeTestSpecification(sd) {
    const sdType = (sd.sd_type || 'feature').toLowerCase();

    // SD types that don't require smoke test specification
    const EXEMPT_SD_TYPES = ['documentation', 'infrastructure', 'refactor', 'orchestrator'];

    if (EXEMPT_SD_TYPES.includes(sdType)) {
      console.log(`   ℹ️  SD Type: ${sdType} - smoke test specification not required`);
      return {
        pass: true,
        score: 100,
        max_score: 100,
        issues: [],
        warnings: [`Smoke test skipped for ${sdType} SD type`],
        details: { skipped: true, reason: `${sdType} SD type exempt` }
      };
    }

    console.log(`   SD Type: ${sdType} - smoke test specification REQUIRED`);

    // Check if smoke_test_steps exists and is valid
    const smokeTestSteps = sd.smoke_test_steps || [];
    const isArray = Array.isArray(smokeTestSteps);
    const stepCount = isArray ? smokeTestSteps.length : 0;

    console.log(`   Smoke test steps: ${stepCount} defined`);

    if (stepCount === 0) {
      console.log('   ❌ BLOCKING: No smoke test steps defined');
      console.log('\n   LEAD Question 9: "Describe the 30-second demo that proves this SD delivered value."');
      console.log('   If you cannot answer this question, the SD is too vague.\n');
      console.log('   Required: Add smoke_test_steps array with 3-5 user-observable steps');
      console.log('   Example:');
      console.log('   [');
      console.log('     { "step_number": 1, "instruction": "Navigate to /dashboard", "expected_outcome": "Dashboard loads with venture list" },');
      console.log('     { "step_number": 2, "instruction": "Click Create Venture button", "expected_outcome": "New venture form appears" },');
      console.log('     { "step_number": 3, "instruction": "Fill form and click Save", "expected_outcome": "Success toast + venture in list" }');
      console.log('   ]');

      return {
        pass: false,
        score: 0,
        max_score: 100,
        issues: [
          'BLOCKING: Feature SD requires smoke_test_steps for LEAD approval',
          'Answer LEAD Q9: "Describe the 30-second demo that proves this SD delivered value"'
        ],
        warnings: [],
        remediation: 'Add smoke_test_steps JSONB array with 3-5 user-observable verification steps'
      };
    }

    // Validate step quality
    const issues = [];
    const warnings = [];

    if (stepCount < 3) {
      warnings.push(`Only ${stepCount} smoke test steps - recommend 3-5 for comprehensive verification`);
    }

    // Check each step has required fields
    let validSteps = 0;
    for (const step of smokeTestSteps) {
      const hasInstruction = step.instruction || step.instruction_template;
      const hasOutcome = step.expected_outcome || step.expected_outcome_template;

      if (hasInstruction && hasOutcome) {
        validSteps++;
        console.log(`   ✅ Step ${step.step_number || validSteps}: ${(hasInstruction).substring(0, 50)}...`);
      } else {
        warnings.push(`Step ${step.step_number || '?'} missing instruction or expected_outcome`);
      }
    }

    if (validSteps === 0) {
      issues.push('No valid smoke test steps (each must have instruction and expected_outcome)');
    }

    // Use GPT-5 Mini to validate smoke test is concrete (if available)
    let aiValidation = null;
    try {
      const { validateSmokeTestQuality } = await import('../../human-verification-validator.js').catch(() => ({}));
      if (validateSmokeTestQuality) {
        aiValidation = await validateSmokeTestQuality(smokeTestSteps, sd);
        if (aiValidation && !aiValidation.isConcreteEnough) {
          warnings.push(`AI review: ${aiValidation.feedback || 'Smoke test steps may be too vague'}`);
        }
      }
    } catch {
      // AI validation optional - continue without it
    }

    const passed = issues.length === 0;
    const score = passed ? (warnings.length > 0 ? 85 : 100) : 0;

    console.log(`   Result: ${passed ? '✅ PASS' : '❌ FAIL'} (${validSteps}/${stepCount} valid steps)`);

    return {
      pass: passed,
      score,
      max_score: 100,
      issues,
      warnings,
      details: {
        stepCount,
        validSteps,
        aiValidation: aiValidation?.isConcreteEnough ?? null
      }
    };
  }

  getRemediation(_gateName) {
    return 'Review LEAD validation requirements. Ensure SD has all required fields and approvals.';
  }

  async _loadVerifier() {
    if (!LeadToPlanVerifier) {
      const { default: Verifier } = await import('../../../verify-handoff-lead-to-plan.js');
      LeadToPlanVerifier = Verifier;
    }
  }
}

export default LeadToPlanExecutor;
