#!/usr/bin/env node

/**
 * SD Recovery Audit Script
 *
 * Detects and remediates "limbo state" SDs where work was started
 * but proper LEO Protocol handoffs were bypassed.
 *
 * Part of LEO Protocol Recovery System
 * Pattern: PAT-SD-LIMBO-001
 *
 * Usage:
 *   node scripts/sd-recovery-audit.js <SD_KEY>
 *   node scripts/sd-recovery-audit.js SD-LEO-ENH-XXX-001
 *   node scripts/sd-recovery-audit.js SD-LEO-ENH-XXX-001 --remediate
 */

import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import dotenv from 'dotenv';

dotenv.config();

// ANSI colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m'
};

const c = colors;

// Status indicators
const PASS = `${c.green}✓${c.reset}`;
const FAIL = `${c.red}✗${c.reset}`;
const WARN = `${c.yellow}⚠${c.reset}`;
const INFO = `${c.blue}ℹ${c.reset}`;
const LIMBO = `${c.magenta}◉${c.reset}`;

// Expected handoff sequence by SD type
const HANDOFF_SEQUENCES = {
  default: ['LEAD-TO-PLAN', 'PLAN-TO-EXEC', 'EXEC-TO-PLAN', 'PLAN-TO-LEAD', 'LEAD-FINAL-APPROVAL'],
  infrastructure: ['LEAD-TO-PLAN', 'PLAN-TO-EXEC', 'PLAN-TO-LEAD', 'LEAD-FINAL-APPROVAL'], // Can skip EXEC-TO-PLAN
  orchestrator: ['LEAD-TO-PLAN', 'LEAD-FINAL-APPROVAL'] // Children drive progress
};

// Status progression
const STATUS_PROGRESSION = ['draft', 'planning', 'in_progress', 'verification', 'completed'];

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    printUsage();
    process.exit(0);
  }

  const sdKey = args[0];
  const remediateMode = args.includes('--remediate');
  const forceMode = args.includes('--force');

  console.log(`\n${c.bold}${c.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}`);
  console.log(`${c.bold}${c.cyan}  SD RECOVERY AUDIT${c.reset}`);
  console.log(`${c.bold}${c.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}`);
  console.log(`${c.dim}  Pattern: PAT-SD-LIMBO-001${c.reset}`);
  console.log(`${c.dim}  SD: ${sdKey}${c.reset}`);
  console.log(`${c.dim}  Mode: ${remediateMode ? 'REMEDIATE' : 'AUDIT ONLY'}${c.reset}\n`);

  // Initialize Supabase client
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  try {
    // 1. Fetch SD data
    const sd = await fetchSD(supabase, sdKey);
    if (!sd) {
      console.error(`${FAIL} SD not found: ${sdKey}`);
      process.exit(1);
    }

    // 2. Run the audit
    const auditResult = await runAudit(supabase, sd);

    // 3. Display results
    displayAuditResults(auditResult);

    // 4. Determine limbo state
    const limboAnalysis = analyzeLimboState(auditResult);
    displayLimboAnalysis(limboAnalysis);

    // 5. Remediation options
    if (limboAnalysis.isLimbo) {
      displayRemediationOptions(limboAnalysis, auditResult);

      if (remediateMode) {
        await executeRemediation(supabase, sd, limboAnalysis, auditResult, forceMode);
      } else {
        console.log(`\n${INFO} Run with ${c.yellow}--remediate${c.reset} to execute remediation`);
        console.log(`${INFO} Run with ${c.yellow}--remediate --force${c.reset} to skip confirmations\n`);
      }
    } else {
      console.log(`\n${PASS} ${c.green}SD is NOT in limbo state. Protocol compliance verified.${c.reset}\n`);
    }

    process.exit(limboAnalysis.isLimbo ? 1 : 0);

  } catch (error) {
    console.error(`\n${FAIL} ${c.red}Audit failed:${c.reset}`, error.message);
    process.exit(1);
  }
}

function printUsage() {
  console.log(`
${c.bold}SD Recovery Audit${c.reset}
Detects and remediates "limbo state" SDs where work was started
but proper LEO Protocol handoffs were bypassed.

${c.bold}Usage:${c.reset}
  node scripts/sd-recovery-audit.js <SD_KEY> [options]

${c.bold}Arguments:${c.reset}
  SD_KEY          The strategic directive key (e.g., SD-LEO-ENH-XXX-001)

${c.bold}Options:${c.reset}
  --remediate     Execute remediation after audit
  --force         Skip confirmation prompts during remediation
  --help, -h      Show this help message

${c.bold}Examples:${c.reset}
  node scripts/sd-recovery-audit.js SD-LEO-ENH-TARGET-APPLICATION-AWARE-001
  node scripts/sd-recovery-audit.js SD-LEO-ENH-TARGET-APPLICATION-AWARE-001 --remediate
  node scripts/sd-recovery-audit.js SD-LEO-ENH-TARGET-APPLICATION-AWARE-001 --remediate --force

${c.bold}What is "Limbo State"?${c.reset}
  An SD enters limbo when:
  - Work artifacts exist (PRD, user stories, code)
  - But formal handoffs are missing or incomplete
  - Quality gates may have been bypassed

  This can happen when work starts without running handoff.js,
  or when sessions are interrupted mid-workflow.

${c.bold}Remediation Options:${c.reset}
  1. ${c.green}Full Recovery${c.reset} - Reset to last valid checkpoint, re-run workflow
  2. ${c.yellow}Backfill + Acknowledge${c.reset} - Create missing handoffs, log gap
  3. ${c.red}Abort and Restart${c.reset} - Archive artifacts, restart from LEAD approval
`);
}

async function fetchSD(supabase, sdKey) {
  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .select('*')
    .eq('sd_key', sdKey)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }

  return data;
}

async function runAudit(supabase, sd) {
  const result = {
    sd: sd,
    artifacts: {},
    handoffs: [],
    qualityGates: [],
    gitCommits: [],
    timestamps: {}
  };

  // Fetch artifacts in parallel
  const [prd, userStories, handoffs, retrospective] = await Promise.all([
    fetchPRD(supabase, sd.id),
    fetchUserStories(supabase, sd.id),
    fetchHandoffs(supabase, sd.sd_key),
    fetchRetrospective(supabase, sd.sd_key)
  ]);

  result.artifacts.prd = prd;
  result.artifacts.userStories = userStories;
  result.artifacts.retrospective = retrospective;
  result.handoffs = handoffs;

  // Fetch git commits mentioning this SD
  result.gitCommits = fetchGitCommits(sd.sd_key);

  // Determine expected handoff sequence
  const sdType = sd.sd_type || 'feature';
  result.expectedSequence = HANDOFF_SEQUENCES[sdType] || HANDOFF_SEQUENCES.default;

  // Analyze quality gates
  result.qualityGates = analyzeQualityGates(sd, result);

  // Extract timestamps
  result.timestamps = {
    sdCreated: sd.created_at,
    sdUpdated: sd.updated_at,
    prdCreated: prd?.created_at,
    firstHandoff: handoffs.length > 0 ? handoffs[0].created_at : null,
    lastHandoff: handoffs.length > 0 ? handoffs[handoffs.length - 1].created_at : null,
    firstCommit: result.gitCommits.length > 0 ? result.gitCommits[0].date : null
  };

  return result;
}

async function fetchPRD(supabase, sdId) {
  const { data } = await supabase
    .from('product_requirements_v2')
    .select('*')
    .eq('sd_id', sdId)
    .single();
  return data;
}

async function fetchUserStories(supabase, sdId) {
  const { data } = await supabase
    .from('user_stories')
    .select('*')
    .eq('sd_id', sdId)
    .order('story_key');
  return data || [];
}

async function fetchHandoffs(supabase, sdKey) {
  const { data } = await supabase
    .from('sd_phase_handoffs')
    .select('*')
    .eq('sd_key', sdKey)
    .order('created_at');
  return data || [];
}

async function fetchRetrospective(supabase, sdKey) {
  const { data } = await supabase
    .from('sd_retrospectives')
    .select('*')
    .eq('sd_key', sdKey)
    .single();
  return data;
}

function fetchGitCommits(sdKey) {
  try {
    const output = execSync(
      `git log --oneline --all --grep="${sdKey}" --format="%h|%s|%ai" -n 20`,
      { encoding: 'utf-8', timeout: 5000 }
    );

    return output.trim().split('\n').filter(Boolean).map(line => {
      const [hash, message, date] = line.split('|');
      return { hash, message, date };
    });
  } catch {
    return [];
  }
}

function analyzeQualityGates(sd, result) {
  const gates = [];
  const handoffTypes = result.handoffs.map(h => h.transition_type);

  // Gate 1: LEAD-TO-PLAN exists
  gates.push({
    name: 'GATE_LEAD_TO_PLAN',
    description: 'LEAD approval handoff exists',
    passed: handoffTypes.includes('LEAD-TO-PLAN'),
    required: true
  });

  // Gate 2: PRD exists before PLAN-TO-EXEC
  const _planToExecExists = handoffTypes.includes('PLAN-TO-EXEC');
  gates.push({
    name: 'GATE_PRD_EXISTS',
    description: 'PRD created before PLAN-TO-EXEC',
    passed: result.artifacts.prd !== null,
    required: true
  });

  // Gate 3: User stories exist
  gates.push({
    name: 'GATE_USER_STORIES_EXIST',
    description: 'User stories generated',
    passed: result.artifacts.userStories.length > 0,
    required: sd.sd_type !== 'infrastructure' && sd.sd_type !== 'orchestrator'
  });

  // Gate 4: Handoff sequence is valid
  const sequenceValid = validateHandoffSequence(handoffTypes, result.expectedSequence);
  gates.push({
    name: 'GATE_HANDOFF_SEQUENCE',
    description: 'Handoff sequence follows protocol',
    passed: sequenceValid.valid,
    details: sequenceValid.details,
    required: true
  });

  // Gate 5: Status matches handoff state
  const statusMatchesHandoffs = validateStatusConsistency(sd.status, handoffTypes);
  gates.push({
    name: 'GATE_STATUS_CONSISTENCY',
    description: 'SD status consistent with handoffs',
    passed: statusMatchesHandoffs.valid,
    details: statusMatchesHandoffs.details,
    required: true
  });

  // Gate 6: Retrospective exists (for completed SDs)
  if (sd.status === 'completed' || handoffTypes.includes('LEAD-FINAL-APPROVAL')) {
    gates.push({
      name: 'GATE_RETROSPECTIVE_EXISTS',
      description: 'Retrospective captured for completed SD',
      passed: result.artifacts.retrospective !== null,
      required: true
    });
  }

  return gates;
}

function validateHandoffSequence(actualHandoffs, expectedSequence) {
  if (actualHandoffs.length === 0) {
    return { valid: false, details: 'No handoffs found' };
  }

  // Check that handoffs appear in expected order (gaps allowed for infrastructure)
  let expectedIdx = 0;
  const missing = [];
  const outOfOrder = [];

  for (const handoff of actualHandoffs) {
    const handoffIdx = expectedSequence.indexOf(handoff);
    if (handoffIdx === -1) {
      // Unknown handoff type
      continue;
    }
    if (handoffIdx < expectedIdx) {
      outOfOrder.push(handoff);
    } else {
      // Check for gaps
      for (let i = expectedIdx; i < handoffIdx; i++) {
        missing.push(expectedSequence[i]);
      }
      expectedIdx = handoffIdx + 1;
    }
  }

  // Check remaining expected handoffs
  for (let i = expectedIdx; i < expectedSequence.length; i++) {
    missing.push(expectedSequence[i]);
  }

  const details = [];
  if (missing.length > 0) details.push(`Missing: ${missing.join(', ')}`);
  if (outOfOrder.length > 0) details.push(`Out of order: ${outOfOrder.join(', ')}`);

  return {
    valid: outOfOrder.length === 0 && missing.length === 0,
    details: details.length > 0 ? details.join('; ') : 'Sequence valid'
  };
}

function validateStatusConsistency(status, handoffTypes) {
  // Map handoffs to expected status
  const handoffToStatus = {
    'LEAD-TO-PLAN': 'planning',
    'PLAN-TO-EXEC': 'in_progress',
    'EXEC-TO-PLAN': 'verification',
    'PLAN-TO-LEAD': 'verification',
    'LEAD-FINAL-APPROVAL': 'completed'
  };

  if (handoffTypes.length === 0) {
    const valid = status === 'draft';
    return {
      valid,
      details: valid ? 'Status matches (no handoffs = draft)' : `Expected 'draft', got '${status}'`
    };
  }

  const lastHandoff = handoffTypes[handoffTypes.length - 1];
  const expectedStatus = handoffToStatus[lastHandoff] || status;

  const valid = status === expectedStatus;
  return {
    valid,
    details: valid
      ? `Status '${status}' matches last handoff '${lastHandoff}'`
      : `Status mismatch: got '${status}', expected '${expectedStatus}' (last handoff: ${lastHandoff})`
  };
}

function analyzeLimboState(auditResult) {
  const analysis = {
    isLimbo: false,
    severity: 'none', // none, low, medium, high, critical
    indicators: [],
    rootCause: null,
    recommendedAction: null
  };

  const failedGates = auditResult.qualityGates.filter(g => g.required && !g.passed);
  const { sd, artifacts, handoffs, gitCommits } = auditResult;

  // Check for limbo indicators

  // Indicator 1: Artifacts exist but no handoffs
  if ((artifacts.prd || artifacts.userStories.length > 0) && handoffs.length === 0) {
    analysis.indicators.push({
      type: 'ARTIFACTS_WITHOUT_HANDOFFS',
      message: 'Work artifacts exist but no handoffs recorded',
      severity: 'high'
    });
  }

  // Indicator 2: Status advanced beyond handoffs
  const statusIdx = STATUS_PROGRESSION.indexOf(sd.status);
  const expectedStatusFromHandoffs = getExpectedStatusFromHandoffs(handoffs);
  const expectedIdx = STATUS_PROGRESSION.indexOf(expectedStatusFromHandoffs);

  if (statusIdx > expectedIdx) {
    analysis.indicators.push({
      type: 'STATUS_AHEAD_OF_HANDOFFS',
      message: `Status '${sd.status}' is ahead of handoff state '${expectedStatusFromHandoffs}'`,
      severity: 'high'
    });
  }

  // Indicator 3: Git commits exist but no EXEC handoffs
  const hasExecHandoff = handoffs.some(h =>
    h.transition_type === 'PLAN-TO-EXEC' || h.transition_type === 'EXEC-TO-PLAN'
  );
  if (gitCommits.length > 0 && !hasExecHandoff) {
    analysis.indicators.push({
      type: 'COMMITS_WITHOUT_EXEC_HANDOFF',
      message: `${gitCommits.length} git commit(s) found but no EXEC phase handoffs`,
      severity: 'medium'
    });
  }

  // Indicator 4: PRD exists but no LEAD-TO-PLAN
  const hasLeadToPlan = handoffs.some(h => h.transition_type === 'LEAD-TO-PLAN');
  if (artifacts.prd && !hasLeadToPlan) {
    analysis.indicators.push({
      type: 'PRD_WITHOUT_LEAD_APPROVAL',
      message: 'PRD created without LEAD-TO-PLAN handoff',
      severity: 'high'
    });
  }

  // Indicator 5: Failed quality gates
  if (failedGates.length > 0) {
    analysis.indicators.push({
      type: 'QUALITY_GATES_FAILED',
      message: `${failedGates.length} quality gate(s) failed: ${failedGates.map(g => g.name).join(', ')}`,
      severity: failedGates.length > 2 ? 'critical' : 'medium'
    });
  }

  // Determine if in limbo
  analysis.isLimbo = analysis.indicators.length > 0;

  // Calculate severity
  if (analysis.indicators.length > 0) {
    const severityScores = { low: 1, medium: 2, high: 3, critical: 4 };
    const maxSeverity = Math.max(...analysis.indicators.map(i => severityScores[i.severity] || 0));
    analysis.severity = ['none', 'low', 'medium', 'high', 'critical'][maxSeverity];
  }

  // Determine root cause
  if (analysis.isLimbo) {
    analysis.rootCause = determineRootCause(analysis.indicators);
    analysis.recommendedAction = determineRecommendedAction(analysis);
  }

  return analysis;
}

function getExpectedStatusFromHandoffs(handoffs) {
  if (handoffs.length === 0) return 'draft';

  const lastHandoff = handoffs[handoffs.length - 1].transition_type;
  const statusMap = {
    'LEAD-TO-PLAN': 'planning',
    'PLAN-TO-EXEC': 'in_progress',
    'EXEC-TO-PLAN': 'verification',
    'PLAN-TO-LEAD': 'verification',
    'LEAD-FINAL-APPROVAL': 'completed'
  };

  return statusMap[lastHandoff] || 'draft';
}

function determineRootCause(indicators) {
  const types = indicators.map(i => i.type);

  if (types.includes('ARTIFACTS_WITHOUT_HANDOFFS')) {
    return 'Work started without running handoff.js to create LEAD-TO-PLAN handoff';
  }
  if (types.includes('STATUS_AHEAD_OF_HANDOFFS')) {
    return 'SD status was manually advanced without completing required handoffs';
  }
  if (types.includes('PRD_WITHOUT_LEAD_APPROVAL')) {
    return 'PRD creation script ran without LEAD approval handoff';
  }
  if (types.includes('COMMITS_WITHOUT_EXEC_HANDOFF')) {
    return 'Code was committed without PLAN-TO-EXEC handoff';
  }
  return 'Protocol steps bypassed during SD execution';
}

function determineRecommendedAction(analysis) {
  const severity = analysis.severity;
  const types = analysis.indicators.map(i => i.type);

  if (severity === 'critical' || types.includes('ARTIFACTS_WITHOUT_HANDOFFS')) {
    return {
      action: 'FULL_RECOVERY',
      description: 'Reset to last valid checkpoint and re-run workflow with proper handoffs',
      steps: [
        'Audit existing artifacts for quality',
        'Reset SD status to match last valid handoff',
        'Re-run handoff.js for missing transitions',
        'Continue workflow from recovery point'
      ]
    };
  }

  if (severity === 'high') {
    return {
      action: 'BACKFILL_AND_ACKNOWLEDGE',
      description: 'Create missing handoffs retroactively and log the gap',
      steps: [
        'Validate existing artifacts meet quality gates',
        'Create missing handoff records with backfill flag',
        'Log recovery action in audit_log',
        'Continue workflow'
      ]
    };
  }

  return {
    action: 'MINOR_REMEDIATION',
    description: 'Fix specific issues and continue',
    steps: [
      'Address specific gate failures',
      'Log remediation in audit_log',
      'Continue workflow'
    ]
  };
}

function displayAuditResults(auditResult) {
  const { sd, artifacts, handoffs, gitCommits, qualityGates } = auditResult;

  // Section 1: SD Overview
  console.log(`${c.bold}${c.white}ARTIFACT INVENTORY${c.reset}`);
  console.log(`${c.dim}${'─'.repeat(50)}${c.reset}`);

  console.log(`  ${c.cyan}SD Key:${c.reset}     ${sd.sd_key}`);
  console.log(`  ${c.cyan}Title:${c.reset}      ${sd.title?.substring(0, 50)}${sd.title?.length > 50 ? '...' : ''}`);
  console.log(`  ${c.cyan}Type:${c.reset}       ${sd.sd_type || 'feature'}`);
  console.log(`  ${c.cyan}Status:${c.reset}     ${sd.status}`);
  console.log(`  ${c.cyan}Created:${c.reset}    ${formatDate(sd.created_at)}`);
  console.log('');

  // Artifacts table
  console.log(`  ${c.bold}Artifacts:${c.reset}`);
  console.log(`    ${artifacts.prd ? PASS : FAIL} PRD: ${artifacts.prd ? `PRD-${artifacts.prd.id?.substring(0, 8)}` : 'Not found'}`);
  console.log(`    ${artifacts.userStories.length > 0 ? PASS : WARN} User Stories: ${artifacts.userStories.length} found`);
  console.log(`    ${artifacts.retrospective ? PASS : WARN} Retrospective: ${artifacts.retrospective ? 'Created' : 'Not found'}`);
  console.log(`    ${gitCommits.length > 0 ? INFO : WARN} Git Commits: ${gitCommits.length} mentioning SD`);
  console.log('');

  // Section 2: Handoffs
  console.log(`${c.bold}${c.white}HANDOFF CHAIN${c.reset}`);
  console.log(`${c.dim}${'─'.repeat(50)}${c.reset}`);

  if (handoffs.length === 0) {
    console.log(`  ${WARN} ${c.yellow}No handoffs recorded${c.reset}`);
  } else {
    for (const handoff of handoffs) {
      const icon = handoff.status === 'accepted' ? PASS :
                   handoff.status === 'rejected' ? FAIL : INFO;
      console.log(`  ${icon} ${handoff.transition_type}`);
      console.log(`      ${c.dim}Created: ${formatDate(handoff.created_at)} | By: ${handoff.created_by || 'unknown'}${c.reset}`);
    }
  }
  console.log('');

  // Expected vs Actual
  console.log(`  ${c.cyan}Expected Sequence:${c.reset} ${auditResult.expectedSequence.join(' → ')}`);
  console.log(`  ${c.cyan}Actual Sequence:${c.reset}   ${handoffs.map(h => h.transition_type).join(' → ') || '(none)'}`);
  console.log('');

  // Section 3: Quality Gates
  console.log(`${c.bold}${c.white}QUALITY GATES${c.reset}`);
  console.log(`${c.dim}${'─'.repeat(50)}${c.reset}`);

  for (const gate of qualityGates) {
    const icon = gate.passed ? PASS : (gate.required ? FAIL : WARN);
    const reqLabel = gate.required ? '' : `${c.dim}(optional)${c.reset}`;
    console.log(`  ${icon} ${gate.name} ${reqLabel}`);
    console.log(`      ${c.dim}${gate.description}${c.reset}`);
    if (gate.details && !gate.passed) {
      console.log(`      ${c.yellow}${gate.details}${c.reset}`);
    }
  }
  console.log('');
}

function displayLimboAnalysis(analysis) {
  console.log(`${c.bold}${c.white}LIMBO STATE ANALYSIS${c.reset}`);
  console.log(`${c.dim}${'─'.repeat(50)}${c.reset}`);

  if (!analysis.isLimbo) {
    console.log(`  ${PASS} ${c.green}No limbo state detected${c.reset}`);
    return;
  }

  // Severity indicator
  const severityColors = {
    low: c.blue,
    medium: c.yellow,
    high: c.red,
    critical: `${c.bgRed}${c.white}`
  };
  const severityColor = severityColors[analysis.severity] || c.white;
  console.log(`  ${LIMBO} ${c.bold}LIMBO STATE DETECTED${c.reset}`);
  console.log(`  ${c.cyan}Severity:${c.reset} ${severityColor}${analysis.severity.toUpperCase()}${c.reset}`);
  console.log('');

  // Indicators
  console.log(`  ${c.bold}Indicators:${c.reset}`);
  for (const indicator of analysis.indicators) {
    const icon = indicator.severity === 'critical' ? FAIL :
                 indicator.severity === 'high' ? FAIL :
                 indicator.severity === 'medium' ? WARN : INFO;
    console.log(`    ${icon} ${indicator.type}`);
    console.log(`        ${c.dim}${indicator.message}${c.reset}`);
  }
  console.log('');

  // Root cause
  console.log(`  ${c.cyan}Root Cause:${c.reset}`);
  console.log(`    ${analysis.rootCause}`);
  console.log('');
}

function displayRemediationOptions(analysis, _auditResult) {
  console.log(`${c.bold}${c.white}REMEDIATION OPTIONS${c.reset}`);
  console.log(`${c.dim}${'─'.repeat(50)}${c.reset}`);

  const recommended = analysis.recommendedAction;

  console.log(`  ${c.green}[RECOMMENDED]${c.reset} ${c.bold}${recommended.action}${c.reset}`);
  console.log(`    ${recommended.description}`);
  console.log(`    ${c.cyan}Steps:${c.reset}`);
  for (const step of recommended.steps) {
    console.log(`      • ${step}`);
  }
  console.log('');

  // Other options
  if (recommended.action !== 'FULL_RECOVERY') {
    console.log(`  ${c.yellow}[ALTERNATIVE]${c.reset} FULL_RECOVERY`);
    console.log('    Reset to last valid checkpoint and re-run workflow');
    console.log('');
  }

  if (recommended.action !== 'ABORT_AND_RESTART') {
    console.log(`  ${c.red}[LAST RESORT]${c.reset} ABORT_AND_RESTART`);
    console.log('    Archive all artifacts and start fresh from LEAD approval');
    console.log('');
  }
}

async function executeRemediation(supabase, sd, analysis, auditResult, forceMode) {
  const action = analysis.recommendedAction.action;

  console.log(`\n${c.bold}${c.cyan}EXECUTING REMEDIATION: ${action}${c.reset}`);
  console.log(`${c.dim}${'─'.repeat(50)}${c.reset}\n`);

  switch (action) {
    case 'FULL_RECOVERY':
      await executeFullRecovery(supabase, sd, auditResult, forceMode);
      break;
    case 'BACKFILL_AND_ACKNOWLEDGE':
      await executeBackfill(supabase, sd, auditResult, forceMode);
      break;
    case 'MINOR_REMEDIATION':
      await executeMinorRemediation(supabase, sd, auditResult, forceMode);
      break;
    default:
      console.log(`${WARN} Unknown action: ${action}`);
  }
}

async function executeFullRecovery(supabase, sd, auditResult, _forceMode) {
  const handoffs = auditResult.handoffs;

  // Determine recovery point
  const lastValidHandoff = handoffs.length > 0 ? handoffs[handoffs.length - 1] : null;
  const targetStatus = lastValidHandoff
    ? getExpectedStatusFromHandoffs([lastValidHandoff])
    : 'draft';

  console.log(`${INFO} Recovery point: ${lastValidHandoff?.transition_type || 'INITIAL'} → status: ${targetStatus}`);

  // Step 1: Reset SD status
  console.log(`${INFO} Resetting SD status from '${sd.status}' to '${targetStatus}'...`);

  const { error: updateError } = await supabase
    .from('strategic_directives_v2')
    .update({
      status: targetStatus,
      updated_at: new Date().toISOString()
    })
    .eq('sd_key', sd.sd_key);

  if (updateError) {
    console.log(`${FAIL} Failed to reset status: ${updateError.message}`);
    return;
  }
  console.log(`${PASS} Status reset to '${targetStatus}'`);

  // Step 2: Log recovery action
  await logRecoveryAction(supabase, sd.sd_key, 'FULL_RECOVERY', {
    original_status: sd.status,
    target_status: targetStatus,
    recovery_point: lastValidHandoff?.transition_type || 'INITIAL',
    indicators: auditResult.qualityGates.filter(g => !g.passed).map(g => g.name)
  });

  console.log(`${PASS} Recovery logged to audit_log`);
  console.log(`\n${INFO} Next steps:`);
  console.log(`    1. Run: node scripts/handoff.js ${sd.sd_key} LEAD-TO-PLAN`);
  console.log('    2. Follow normal LEO Protocol workflow');
}

async function executeBackfill(supabase, sd, auditResult, _forceMode) {
  const existingHandoffs = auditResult.handoffs.map(h => h.transition_type);
  const expectedSequence = auditResult.expectedSequence;

  // Find missing handoffs up to current point
  const currentStatusIdx = STATUS_PROGRESSION.indexOf(sd.status);
  const missingHandoffs = [];

  for (const expected of expectedSequence) {
    if (!existingHandoffs.includes(expected)) {
      const handoffStatusIdx = STATUS_PROGRESSION.indexOf(getStatusForHandoff(expected));
      if (handoffStatusIdx <= currentStatusIdx) {
        missingHandoffs.push(expected);
      }
    }
  }

  if (missingHandoffs.length === 0) {
    console.log(`${PASS} No handoffs need backfilling`);
    return;
  }

  console.log(`${INFO} Backfilling ${missingHandoffs.length} handoff(s): ${missingHandoffs.join(', ')}`);

  for (const handoffType of missingHandoffs) {
    const { error } = await supabase
      .from('sd_phase_handoffs')
      .insert({
        sd_key: sd.sd_key,
        transition_type: handoffType,
        from_phase: handoffType.split('-TO-')[0],
        to_phase: handoffType.split('-TO-')[1] || handoffType.split('-')[1],
        status: 'accepted',
        created_by: 'RECOVERY-BACKFILL',
        metadata: {
          backfilled: true,
          backfill_reason: 'SD Recovery Audit - PAT-SD-LIMBO-001',
          original_sd_status: sd.status,
          backfill_timestamp: new Date().toISOString()
        }
      });

    if (error) {
      console.log(`${FAIL} Failed to backfill ${handoffType}: ${error.message}`);
    } else {
      console.log(`${PASS} Backfilled: ${handoffType}`);
    }
  }

  // Log recovery action
  await logRecoveryAction(supabase, sd.sd_key, 'BACKFILL_AND_ACKNOWLEDGE', {
    backfilled_handoffs: missingHandoffs,
    original_status: sd.status
  });

  console.log(`${PASS} Backfill complete and logged`);
}

async function executeMinorRemediation(supabase, sd, auditResult, _forceMode) {
  const failedGates = auditResult.qualityGates.filter(g => g.required && !g.passed);

  console.log(`${INFO} Addressing ${failedGates.length} failed gate(s)...`);

  for (const gate of failedGates) {
    console.log(`${WARN} ${gate.name}: ${gate.details || gate.description}`);
    console.log(`    ${c.dim}Manual intervention may be required${c.reset}`);
  }

  // Log recovery action
  await logRecoveryAction(supabase, sd.sd_key, 'MINOR_REMEDIATION', {
    addressed_gates: failedGates.map(g => g.name),
    original_status: sd.status
  });

  console.log(`\n${INFO} Review gate failures above and address manually`);
}

async function logRecoveryAction(supabase, sdKey, action, details) {
  await supabase
    .from('audit_log')
    .insert({
      event_type: 'sd_recovery_action',
      entity_type: 'strategic_directive',
      entity_id: sdKey,
      old_value: { status: details.original_status },
      new_value: { action, ...details },
      metadata: {
        pattern: 'PAT-SD-LIMBO-001',
        recovery_timestamp: new Date().toISOString()
      },
      severity: 'warning',
      created_by: 'SD-RECOVERY-AUDIT'
    });
}

function getStatusForHandoff(handoffType) {
  const map = {
    'LEAD-TO-PLAN': 'planning',
    'PLAN-TO-EXEC': 'in_progress',
    'EXEC-TO-PLAN': 'verification',
    'PLAN-TO-LEAD': 'verification',
    'LEAD-FINAL-APPROVAL': 'completed'
  };
  return map[handoffType] || 'draft';
}

function formatDate(dateStr) {
  if (!dateStr) return 'N/A';
  const date = new Date(dateStr);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// Run main
main();
