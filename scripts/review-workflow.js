#!/usr/bin/env node

/**
 * Interactive Workflow Review CLI
 *
 * Human-in-loop iteration tool for reviewing and fixing workflow issues
 * before PLAN→EXEC handoff.
 *
 * Features:
 * - Adaptive analysis depth (DEEP/STANDARD/LIGHT)
 * - Pattern-based recommendations
 * - Confidence-driven interaction (auto-suggest vs. ask)
 * - Max 3 iteration rounds
 * - Real-time story updates
 *
 * Usage:
 *   node scripts/review-workflow.js SD-EXAMPLE-001
 *
 * Options:
 *   --max-iterations=N    Max iterations (default: 3)
 *   --auto-apply-threshold=N  Confidence threshold for auto-apply (default: 0.90)
 *   --repo-path=PATH      Path to codebase (default: ../ehg relative to this script)
 *
 * Added: 2025-01-15 (SD-DESIGN-WORKFLOW-REVIEW-001)
 */

import { createSupabaseServiceClient } from '../lib/supabase-client.js';
import { execute as executeDesignSubAgent } from '../lib/sub-agents/design.js';
import { applyFixes } from '../lib/workflow-review/story-updater.js';
// refreshCache - available for future cache operations
import { getCacheStats, refreshCache as _refreshCache } from '../lib/workflow-review/pattern-cache.js';
import readline from 'readline';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Cross-platform path resolution (SD-WIN-MIG-005 fix)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EHG_ROOT = path.resolve(__dirname, '../../ehg');

dotenv.config();

// CLI colors
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m'
};

// Service role key for database operations (bypasses RLS)
const supabaseAdmin = createSupabaseServiceClient();

// CLI configuration
const config = {
  maxIterations: 3,
  autoApplyThreshold: 0.90,
  repoPath: EHG_ROOT
};

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const sdId = args.find(arg => !arg.startsWith('--'));

  if (!sdId) {
    console.error(`${colors.red}Error: SD-ID required${colors.reset}`);
    console.error('Usage: node scripts/review-workflow.js SD-EXAMPLE-001');
    process.exit(1);
  }

  // Parse options
  args.forEach(arg => {
    if (arg.startsWith('--max-iterations=')) {
      config.maxIterations = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--auto-apply-threshold=')) {
      config.autoApplyThreshold = parseFloat(arg.split('=')[1]);
    } else if (arg.startsWith('--repo-path=')) {
      config.repoPath = arg.split('=')[1];
    }
  });

  return { sdId };
}

/**
 * Load workflow data from database
 */
async function loadWorkflowData(sdId) {
  console.log(`\n${colors.cyan}📂 Loading workflow data for ${sdId}...${colors.reset}`);

  // Get SD UUID
  const { data: sd, error: sdError } = await supabaseAdmin
    .from('strategic_directives_v2')
    .select('uuid_id, description, title')
    .eq('id', sdId)
    .single();

  if (sdError || !sd) {
    throw new Error(`Failed to load SD: ${sdError?.message || 'Not found'}`);
  }

  // Get PRD
  const { data: prd, error: prdError } = await supabaseAdmin
    .from('product_requirements_v2')
    .select('*')
    .eq('sd_uuid', sd.uuid_id)
    .single();

  if (prdError || !prd) {
    throw new Error(`Failed to load PRD: ${prdError?.message || 'Not found'}`);
  }

  // Get user stories
  const { data: userStories, error: storiesError } = await supabaseAdmin
    .from('user_stories')
    .select('*')
    .eq('sd_id', sdId)
    .order('created_at', { ascending: true });

  if (storiesError) {
    throw new Error(`Failed to load user stories: ${storiesError.message}`);
  }

  if (!userStories || userStories.length === 0) {
    throw new Error('No user stories found for this SD');
  }

  console.log(`${colors.green}✓ Loaded: ${sd.title}${colors.reset}`);
  console.log(`${colors.green}✓ PRD: ${prd.title}${colors.reset}`);
  console.log(`${colors.green}✓ User Stories: ${userStories.length}${colors.reset}`);

  return { sd, prd, userStories };
}

/**
 * Run workflow review analysis
 */
async function runWorkflowReview(sdId) {
  console.log(`\n${colors.cyan}🔍 Running intelligent workflow review...${colors.reset}`);

  const results = await executeDesignSubAgent(
    sdId,
    { name: 'DESIGN', code: 'DESIGN' },
    {
      workflow_review: true,
      repo_path: config.repoPath,
      supabaseClient: supabaseAdmin
    }
  );

  const analysis = results.findings?.workflow_review;

  if (!analysis) {
    throw new Error('Workflow review did not produce results');
  }

  return analysis;
}

/**
 * Display analysis summary
 */
function displayAnalysisSummary(analysis, iteration) {
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`${colors.bright}📊 Workflow Analysis Summary - Iteration ${iteration}${colors.reset}`);
  console.log(`${'═'.repeat(70)}`);

  // Analysis depth
  if (analysis.analysis_depth_info) {
    console.log(`\n${colors.cyan}📐 Analysis Depth:${colors.reset} ${analysis.analysis_depth_info.overall_depth}`);
    const depths = analysis.analysis_depth_info.story_depths;
    if (depths) {
      console.log(`   DEEP: ${depths.filter(d => d.depth === 'DEEP').length} stories`);
      console.log(`   STANDARD: ${depths.filter(d => d.depth === 'STANDARD').length} stories`);
      console.log(`   LIGHT: ${depths.filter(d => d.depth === 'LIGHT').length} stories`);
    }
  }

  // Confidence metrics
  if (analysis.confidence_metrics) {
    const cm = analysis.confidence_metrics;
    const confidenceColor = cm.overall >= 0.90 ? colors.green :
                            cm.overall >= 0.70 ? colors.yellow : colors.red;
    console.log(`\n${colors.cyan}🎯 Overall Confidence:${colors.reset} ${confidenceColor}${(cm.overall * 100).toFixed(0)}%${colors.reset}`);
    console.log(`   High confidence (≥90%): ${cm.high_confidence_count}`);
    console.log(`   Medium confidence (60-89%): ${cm.medium_confidence_count}`);
    console.log(`   Low confidence (<60%): ${cm.low_confidence_count}`);
  }

  // UX score
  const uxColor = analysis.ux_impact_score >= 7.0 ? colors.green :
                  analysis.ux_impact_score >= 6.0 ? colors.yellow : colors.red;
  console.log(`\n${colors.cyan}📊 UX Impact Score:${colors.reset} ${uxColor}${analysis.ux_impact_score}/10${colors.reset}`);

  // Status
  const statusColor = analysis.status === 'PASS' ? colors.green : colors.red;
  console.log(`\n${colors.cyan}Status:${colors.reset} ${statusColor}${analysis.status}${colors.reset}`);

  // Issues summary
  const vr = analysis.validation_results || {};
  const allIssues = [
    ...(vr.dead_ends || []),
    ...(vr.circular_flows || []),
    ...(vr.unreachable_states || []),
    ...(vr.error_recovery || []),
    ...(vr.loading_states || []),
    ...(vr.confirmations || []),
    ...(vr.form_validation || []),
    ...(vr.state_management || []),
    ...(vr.accessibility || []),
    ...(vr.browser_controls || [])
  ];

  console.log(`\n${colors.cyan}Issues Found:${colors.reset}`);
  console.log(`   ${colors.red}CRITICAL: ${allIssues.filter(i => i.severity === 'CRITICAL').length}${colors.reset}`);
  console.log(`   ${colors.yellow}HIGH: ${allIssues.filter(i => i.severity === 'HIGH').length}${colors.reset}`);
  console.log(`   ${colors.blue}MEDIUM: ${allIssues.filter(i => i.severity === 'MEDIUM').length}${colors.reset}`);
  console.log(`   ${colors.gray}LOW: ${allIssues.filter(i => i.severity === 'LOW').length}${colors.reset}`);
  console.log(`   ${colors.bright}Total: ${allIssues.length}${colors.reset}`);

  return allIssues;
}

/**
 * Display issue details
 */
function displayIssue(issue, index, total) {
  const severityColor =
    issue.severity === 'CRITICAL' ? colors.red :
    issue.severity === 'HIGH' ? colors.yellow :
    issue.severity === 'MEDIUM' ? colors.blue : colors.gray;

  console.log(`\n${'─'.repeat(70)}`);
  console.log(`${colors.bright}Issue ${index + 1}/${total}${colors.reset}`);
  console.log(`${colors.cyan}Dimension:${colors.reset} ${issue.dimension || issue.type}`);
  console.log(`${colors.cyan}Severity:${colors.reset} ${severityColor}${issue.severity}${colors.reset}`);

  if (issue.confidence !== undefined) {
    const confColor = issue.confidence >= 0.90 ? colors.green :
                      issue.confidence >= 0.60 ? colors.yellow : colors.red;
    console.log(`${colors.cyan}Confidence:${colors.reset} ${confColor}${(issue.confidence * 100).toFixed(0)}%${colors.reset}`);
  }

  console.log(`${colors.cyan}Description:${colors.reset} ${issue.description}`);

  if (issue.story_id) {
    console.log(`${colors.cyan}Affected Story:${colors.reset} ${issue.story_id}`);
  }

  if (issue.recommendation) {
    console.log(`${colors.cyan}Recommendation:${colors.reset} ${issue.recommendation}`);
  }

  if (issue.context_flags) {
    const flags = [];
    if (issue.context_flags.is_financial) flags.push('💰 Financial');
    if (issue.context_flags.is_destructive) flags.push('⚠️  Destructive');
    if (issue.context_flags.is_required_path) flags.push('🎯 Critical Path');
    if (flags.length > 0) {
      console.log(`${colors.cyan}Context:${colors.reset} ${flags.join(' ')}`);
    }
  }
}

/**
 * Prompt user for action
 */
async function promptUserAction(issue) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const question = (prompt) => new Promise((resolve) => {
    rl.question(prompt, resolve);
  });

  let action = 'skip';
  let customFix = null;

  // High confidence (≥90%): offer auto-apply
  if (issue.confidence >= config.autoApplyThreshold) {
    console.log(`\n${colors.green}${colors.bright}🎯 High Confidence Recommendation${colors.reset}`);
    console.log(`${colors.green}Auto-apply: ${issue.recommendation}${colors.reset}`);
    const answer = await question(`\n${colors.cyan}Apply this fix? (y/n/custom/skip):${colors.reset} `);

    if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
      action = 'auto-apply';
    } else if (answer.toLowerCase() === 'custom') {
      action = 'custom';
      customFix = await question(`${colors.cyan}Enter custom fix:${colors.reset} `);
    } else if (answer.toLowerCase() === 'skip') {
      action = 'skip';
    } else {
      action = 'abort';
    }
  }
  // Medium confidence (60-89%): show options
  else if (issue.confidence >= 0.60) {
    console.log(`\n${colors.yellow}${colors.bright}💡 Medium Confidence Recommendation${colors.reset}`);
    console.log(`${colors.yellow}Suggested: ${issue.recommendation}${colors.reset}`);
    const answer = await question(`\n${colors.cyan}Action? (apply/custom/skip/abort):${colors.reset} `);

    if (answer.toLowerCase() === 'apply') {
      action = 'apply';
    } else if (answer.toLowerCase() === 'custom') {
      action = 'custom';
      customFix = await question(`${colors.cyan}Enter custom fix:${colors.reset} `);
    } else if (answer.toLowerCase() === 'abort') {
      action = 'abort';
    } else {
      action = 'skip';
    }
  }
  // Low confidence (<60%): ask for guidance
  else {
    console.log(`\n${colors.red}${colors.bright}❓ Low Confidence - Need Guidance${colors.reset}`);
    console.log(`${colors.red}Unable to recommend specific fix${colors.reset}`);
    const answer = await question(`\n${colors.cyan}How should this be fixed? (custom/skip/abort):${colors.reset} `);

    if (answer.toLowerCase() === 'custom') {
      action = 'custom';
      customFix = await question(`${colors.cyan}Enter fix description:${colors.reset} `);
    } else if (answer.toLowerCase() === 'abort') {
      action = 'abort';
    } else {
      action = 'skip';
    }
  }

  rl.close();

  return { action, customFix };
}

/**
 * Main workflow review session
 */
async function runInteractiveReview(sdId) {
  console.log(`\n${colors.bright}╔════════════════════════════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.bright}║         Interactive Workflow Review - Human-in-Loop               ║${colors.reset}`);
  console.log(`${colors.bright}╚════════════════════════════════════════════════════════════════════╝${colors.reset}`);

  console.log(`\n${colors.cyan}Configuration:${colors.reset}`);
  console.log(`   Max Iterations: ${config.maxIterations}`);
  console.log(`   Auto-Apply Threshold: ${(config.autoApplyThreshold * 100).toFixed(0)}%`);
  console.log(`   Repository: ${config.repoPath}`);

  // Display cache stats
  const cacheStats = await getCacheStats();
  if (cacheStats) {
    const validColor = cacheStats.is_valid ? colors.green : colors.yellow;
    console.log(`\n${colors.cyan}Pattern Cache:${colors.reset}`);
    console.log(`   Status: ${validColor}${cacheStats.is_valid ? 'VALID' : 'EXPIRED'}${colors.reset}`);
    console.log(`   Age: ${cacheStats.age_hours}h (max: 24h)`);
    console.log(`   Patterns: ${cacheStats.total_patterns}`);
    if (!cacheStats.is_valid) {
      console.log(`   ${colors.yellow}⚠️  Cache will be refreshed during analysis${colors.reset}`);
    }
  } else {
    console.log(`\n${colors.cyan}Pattern Cache:${colors.reset} ${colors.gray}Not found (will be created)${colors.reset}`);
  }

  // Load data
  const { sd: _sd, prd: _prd, userStories: _userStories } = await loadWorkflowData(sdId);

  let iteration = 1;
  let continueIterating = true;
  const appliedFixes = [];

  while (continueIterating && iteration <= config.maxIterations) {
    console.log(`\n${'═'.repeat(70)}`);
    console.log(`${colors.bright}${colors.magenta}🔄 Iteration ${iteration}/${config.maxIterations}${colors.reset}`);
    console.log(`${'═'.repeat(70)}`);

    // Run analysis
    const analysis = await runWorkflowReview(sdId);

    // Display summary
    const allIssues = displayAnalysisSummary(analysis, iteration);

    // If no issues, we're done
    if (allIssues.length === 0) {
      console.log(`\n${colors.green}${colors.bright}✅ No issues found! Workflow is ready for EXEC handoff.${colors.reset}`);
      continueIterating = false;
      break;
    }

    // If PASS status and no CRITICAL issues, offer to skip iteration
    const criticalIssues = allIssues.filter(i => i.severity === 'CRITICAL');
    if (analysis.status === 'PASS' && criticalIssues.length === 0) {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });

      const answer = await new Promise(resolve => {
        rl.question(`\n${colors.cyan}Status is PASS. Continue reviewing issues? (y/n):${colors.reset} `, resolve);
      });

      rl.close();

      if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
        console.log(`\n${colors.green}✓ Review complete. Proceeding to EXEC handoff.${colors.reset}`);
        continueIterating = false;
        break;
      }
    }

    // Review each issue
    let issuesFixed = 0;
    let aborted = false;

    for (let i = 0; i < allIssues.length; i++) {
      const issue = allIssues[i];

      displayIssue(issue, i, allIssues.length);

      const { action, customFix } = await promptUserAction(issue);

      if (action === 'abort') {
        console.log(`\n${colors.yellow}⚠️  Review aborted by user${colors.reset}`);
        aborted = true;
        continueIterating = false;
        break;
      }

      if (action === 'auto-apply' || action === 'apply') {
        appliedFixes.push({
          issue,
          fix: issue.recommendation,
          iteration
        });
        issuesFixed++;
        console.log(`${colors.green}✓ Fix queued${colors.reset}`);
      } else if (action === 'custom') {
        appliedFixes.push({
          issue,
          fix: customFix,
          iteration
        });
        issuesFixed++;
        console.log(`${colors.green}✓ Custom fix queued${colors.reset}`);
      } else {
        console.log(`${colors.gray}⏭️  Skipped${colors.reset}`);
      }
    }

    if (aborted) {
      break;
    }

    // Apply fixes to user stories
    if (issuesFixed > 0) {
      console.log(`\n${colors.cyan}📝 Applying ${issuesFixed} fix(es) to user stories...${colors.reset}`);

      const fixesWithIssues = appliedFixes
        .filter(f => f.iteration === iteration)
        .map(f => ({ issue: f.issue, fix: f.fix }));

      const applyResults = await applyFixes(fixesWithIssues, supabaseAdmin);

      console.log(`${colors.green}✓ ${applyResults.succeeded} fix(es) applied successfully${colors.reset}`);

      if (applyResults.failed > 0) {
        console.log(`${colors.red}✗ ${applyResults.failed} fix(es) failed to apply${colors.reset}`);

        // Show failure details
        applyResults.details
          .filter(d => !d.result.success)
          .forEach((detail, i) => {
            console.log(`   ${i + 1}. ${detail.issue.story_id}: ${detail.result.message}`);
          });
      }
    }

    // Check if we should continue
    if (issuesFixed === 0) {
      console.log(`\n${colors.yellow}⚠️  No fixes applied in this iteration${colors.reset}`);
      continueIterating = false;
    } else if (iteration >= config.maxIterations) {
      console.log(`\n${colors.yellow}⚠️  Reached maximum iterations (${config.maxIterations})${colors.reset}`);
      continueIterating = false;
    } else {
      iteration++;
    }
  }

  // Final summary
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`${colors.bright}📊 Final Summary${colors.reset}`);
  console.log(`${'═'.repeat(70)}`);
  console.log(`${colors.cyan}Total Iterations:${colors.reset} ${iteration}`);
  console.log(`${colors.cyan}Fixes Applied:${colors.reset} ${appliedFixes.length}`);

  if (appliedFixes.length > 0) {
    console.log(`\n${colors.cyan}Applied Fixes:${colors.reset}`);
    appliedFixes.forEach((fix, i) => {
      console.log(`   ${i + 1}. [Iteration ${fix.iteration}] ${fix.issue.dimension}: ${fix.fix}`);
    });
  }

  console.log(`\n${colors.green}${colors.bright}✅ Workflow review complete!${colors.reset}\n`);
}

/**
 * Main entry point
 */
async function main() {
  try {
    const { sdId } = parseArgs();
    await runInteractiveReview(sdId);
    process.exit(0);
  } catch (_error) {
    console.error(`\n${colors.red}${colors.bright}❌ Error:${colors.reset} ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
