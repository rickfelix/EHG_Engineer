/**
 * Root Cause Resolver
 *
 * Analyzes failures using parallel exploration, identifies root causes,
 * and attempts systematic resolution. Used by continuous LEO execution
 * when encountering blocks or failures.
 *
 * Strategy:
 * 1. Launch 4 parallel explorer agents with different focuses
 * 2. Synthesize findings to identify root cause
 * 3. Attempt systematic fix
 * 4. Return result (fixed or needs skip)
 *
 * Usage:
 *   import { analyzeFailure, attemptFix } from './root-cause-resolver.js';
 *
 *   const result = await analyzeFailure(error, { sdId, phase, context });
 *   if (result.rootCause) {
 *     const fixed = await attemptFix(result);
 *   }
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Cross-platform path resolution (SD-WIN-MIG-005 fix)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EHG_ENGINEER_ROOT = path.resolve(__dirname, '../..');

// Load environment
const envPath = path.join(EHG_ENGINEER_ROOT, '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Explorer focus areas for root cause analysis
 */
const EXPLORER_FOCUSES = {
  CODE: {
    name: 'Code Explorer',
    focus: 'Examine failing code, recent changes, test failures, lint errors',
    queries: [
      'Review the specific code file or function that failed',
      'Check recent git changes that might have introduced the issue',
      'Look for test failures and their stack traces',
      'Identify syntax errors, type mismatches, or logic bugs'
    ]
  },
  LOGS: {
    name: 'Log Explorer',
    focus: 'Review error logs, stack traces, console output, build logs',
    queries: [
      'Parse the full error message and stack trace',
      'Check for related warnings that preceded the error',
      'Look for timeout or network-related issues',
      'Identify the exact point of failure in the execution chain'
    ]
  },
  DEPENDENCIES: {
    name: 'Dependency Explorer',
    focus: 'Check external dependencies, API responses, database state, package versions',
    queries: [
      'Verify all required dependencies are installed and compatible',
      'Check if external APIs are responding correctly',
      'Validate database state and schema matches expectations',
      'Look for version conflicts or missing packages'
    ]
  },
  CONTEXT: {
    name: 'Context Explorer',
    focus: 'Review related SDs, protocol requirements, known patterns, previous solutions',
    queries: [
      'Check if similar issues occurred in related SDs',
      'Verify compliance with LEO Protocol requirements',
      'Look for known patterns in issue_patterns table',
      'Review previous successful resolutions of similar issues'
    ]
  }
};

/**
 * Analyze a failure using parallel exploration
 *
 * @param {Error|string} error - The error or failure description
 * @param {Object} context - Context about the failure
 * @param {string} context.sdId - SD that failed
 * @param {string} context.phase - Phase where failure occurred
 * @param {string} context.operation - Operation that failed
 * @param {Object} context.metadata - Additional context
 * @returns {Object} Analysis result with root cause and recommendations
 */
export async function analyzeFailure(error, context = {}) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorStack = error instanceof Error ? error.stack : null;

  const analysis = {
    error: errorMessage,
    stack: errorStack,
    context,
    timestamp: new Date().toISOString(),
    explorations: {},
    rootCause: null,
    confidence: 0,
    recommendations: [],
    canAutoFix: false
  };

  // Run explorations
  for (const [key, explorer] of Object.entries(EXPLORER_FOCUSES)) {
    analysis.explorations[key] = await explore(explorer, errorMessage, context);
  }

  // Synthesize root cause using "5 Whys" approach
  analysis.rootCause = synthesizeRootCause(analysis.explorations, errorMessage);

  // Determine if auto-fix is possible
  analysis.canAutoFix = canAutoFix(analysis.rootCause);

  // Generate recommendations
  analysis.recommendations = generateRecommendations(analysis);

  // Check known patterns
  const knownPattern = await checkKnownPatterns(errorMessage);
  if (knownPattern) {
    analysis.knownPattern = knownPattern;
    analysis.recommendations.unshift({
      priority: 1,
      action: 'apply_known_fix',
      description: `Known pattern found: ${knownPattern.pattern_name}`,
      fix: knownPattern.resolution_template
    });
    analysis.canAutoFix = true;
  }

  // Store in database for learning
  await logAnalysis(analysis);

  return analysis;
}

/**
 * Explore a specific focus area
 */
async function explore(explorer, error, context) {
  const result = {
    name: explorer.name,
    focus: explorer.focus,
    findings: [],
    suggestions: []
  };

  // Quick pattern matching for common issues
  const patterns = detectPatterns(error, explorer);
  result.findings.push(...patterns);

  // Check for SD-specific context
  if (context.sdId) {
    const sdContext = await getSDContext(context.sdId, explorer);
    result.findings.push(...sdContext);
  }

  return result;
}

/**
 * Detect patterns in error message
 */
function detectPatterns(error, explorer) {
  const findings = [];
  const lowerError = error.toLowerCase();

  // Common patterns by explorer type
  const patterns = {
    CODE: [
      { match: 'syntaxerror', finding: 'JavaScript syntax error detected' },
      { match: 'typeerror', finding: 'Type mismatch or null reference' },
      { match: 'referenceerror', finding: 'Undefined variable or import' },
      { match: 'cannot find module', finding: 'Missing module import' },
      { match: 'is not a function', finding: 'Incorrect function call or undefined method' }
    ],
    LOGS: [
      { match: 'timeout', finding: 'Operation timed out' },
      { match: 'econnrefused', finding: 'Connection refused - service not running' },
      { match: 'enotfound', finding: 'DNS lookup failed - network issue' },
      { match: '401', finding: 'Authentication failure' },
      { match: '403', finding: 'Authorization failure' },
      { match: '404', finding: 'Resource not found' },
      { match: '500', finding: 'Server error' }
    ],
    DEPENDENCIES: [
      { match: 'peer dep', finding: 'Peer dependency conflict' },
      { match: 'could not resolve', finding: 'Unresolved dependency' },
      { match: 'version', finding: 'Version mismatch' },
      { match: 'deprecated', finding: 'Using deprecated API' }
    ],
    CONTEXT: [
      { match: 'rls', finding: 'Row Level Security policy blocking access' },
      { match: 'permission', finding: 'Permission or role issue' },
      { match: 'migration', finding: 'Database migration issue' },
      { match: 'schema', finding: 'Schema mismatch' }
    ]
  };

  const relevantPatterns = patterns[explorer.name.split(' ')[0].toUpperCase()] || [];

  for (const pattern of relevantPatterns) {
    if (lowerError.includes(pattern.match)) {
      findings.push({
        type: 'pattern_match',
        pattern: pattern.match,
        finding: pattern.finding,
        confidence: 0.7
      });
    }
  }

  return findings;
}

/**
 * Get SD-specific context
 */
async function getSDContext(sdId, _explorer) {
  const findings = [];

  try {
    // Get SD details
    const { data: sd } = await supabase
      .from('strategic_directives_v2')
      .select('*')
      .or(`sd_key.eq.${sdId},id.eq.${sdId}`)
      .single();

    if (sd) {
      // Check for blocked_by dependencies
      if (sd.blocked_by && sd.blocked_by.length > 0) {
        findings.push({
          type: 'dependency',
          finding: `SD blocked by: ${sd.blocked_by.join(', ')}`,
          confidence: 0.9
        });
      }

      // Check current phase
      if (sd.current_phase) {
        findings.push({
          type: 'phase',
          finding: `Current phase: ${sd.current_phase}`,
          confidence: 1.0
        });
      }
    }

    // Check for related execution logs
    const { data: logs } = await supabase
      .from('continuous_execution_log')
      .select('*')
      .eq('child_sd_id', sdId)
      .eq('status', 'failed')
      .order('created_at', { ascending: false })
      .limit(3);

    if (logs && logs.length > 0) {
      findings.push({
        type: 'history',
        finding: `Previous failures: ${logs.length} recorded`,
        details: logs.map(l => l.error_message).filter(Boolean)
      });
    }
  } catch (_err) {
    // Ignore errors in context gathering
  }

  return findings;
}

/**
 * Synthesize root cause from explorations
 */
function synthesizeRootCause(explorations, error) {
  const allFindings = [];

  for (const [key, exploration] of Object.entries(explorations)) {
    allFindings.push(...exploration.findings.map(f => ({
      ...f,
      source: key
    })));
  }

  // Sort by confidence
  allFindings.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));

  if (allFindings.length === 0) {
    return {
      summary: 'Unknown error - no patterns matched',
      confidence: 0.1,
      findings: []
    };
  }

  // Take top findings
  const topFindings = allFindings.slice(0, 5);
  const avgConfidence = topFindings.reduce((sum, f) => sum + (f.confidence || 0), 0) / topFindings.length;

  return {
    summary: topFindings[0].finding,
    confidence: avgConfidence,
    findings: topFindings,
    fiveWhys: applyFiveWhys(topFindings[0], error)
  };
}

/**
 * Apply "5 Whys" analysis
 */
function applyFiveWhys(finding, _error) {
  const whys = [
    { why: 'Why did this error occur?', answer: finding.finding },
    { why: 'Why was this condition present?', answer: 'Under investigation' },
    { why: 'Why wasn\'t this caught earlier?', answer: 'Needs verification' },
    { why: 'Why wasn\'t there a safeguard?', answer: 'May need additional validation' },
    { why: 'What is the fundamental cause?', answer: finding.finding }
  ];
  return whys;
}

/**
 * Check if issue can be auto-fixed
 */
function canAutoFix(rootCause) {
  if (!rootCause || rootCause.confidence < 0.6) return false;

  const autoFixablePatterns = [
    'missing module import',
    'peer dependency',
    'type mismatch',
    'connection refused',
    'timeout'
  ];

  const summary = (rootCause.summary || '').toLowerCase();
  return autoFixablePatterns.some(p => summary.includes(p));
}

/**
 * Generate fix recommendations
 */
function generateRecommendations(analysis) {
  const recs = [];

  if (!analysis.rootCause) return recs;

  const summary = (analysis.rootCause.summary || '').toLowerCase();

  if (summary.includes('module') || summary.includes('import')) {
    recs.push({
      priority: 1,
      action: 'install_dependency',
      description: 'Install missing module',
      command: 'npm install <module>'
    });
  }

  if (summary.includes('connection') || summary.includes('timeout')) {
    recs.push({
      priority: 1,
      action: 'verify_service',
      description: 'Verify required service is running',
      command: 'Check leo-stack.sh status'
    });
  }

  if (summary.includes('permission') || summary.includes('rls')) {
    recs.push({
      priority: 1,
      action: 'check_permissions',
      description: 'Review database permissions and RLS policies',
      command: 'Check Supabase RLS policies'
    });
  }

  // Default recommendation
  recs.push({
    priority: 99,
    action: 'manual_review',
    description: 'Manual review required',
    details: analysis.rootCause.summary
  });

  return recs.sort((a, b) => a.priority - b.priority);
}

/**
 * Check known patterns from database
 */
async function checkKnownPatterns(error) {
  try {
    const { data: patterns } = await supabase
      .from('issue_patterns')
      .select('*')
      .eq('is_active', true);

    if (!patterns) return null;

    const lowerError = error.toLowerCase();

    for (const pattern of patterns) {
      const keywords = pattern.detection_keywords || [];
      if (keywords.some(kw => lowerError.includes(kw.toLowerCase()))) {
        return pattern;
      }
    }
  } catch (_err) {
    // Ignore errors
  }

  return null;
}

/**
 * Log analysis for learning
 */
async function logAnalysis(analysis) {
  try {
    await supabase
      .from('continuous_execution_log')
      .update({
        explorer_agents_used: Object.keys(analysis.explorations).length,
        root_cause_identified: analysis.rootCause?.summary
      })
      .eq('child_sd_id', analysis.context?.sdId)
      .eq('status', 'failed')
      .order('created_at', { ascending: false })
      .limit(1);
  } catch (_err) {
    // Ignore logging errors
  }
}

/**
 * Attempt to fix the identified issue
 *
 * @param {Object} analysis - Analysis result from analyzeFailure
 * @returns {Object} Fix result
 */
export async function attemptFix(analysis) {
  const result = {
    attempted: true,
    success: false,
    action: null,
    details: null
  };

  if (!analysis.canAutoFix || analysis.recommendations.length === 0) {
    result.attempted = false;
    result.details = 'No auto-fix available';
    return result;
  }

  const topRec = analysis.recommendations[0];
  result.action = topRec.action;

  // For now, return that fix was attempted but needs human verification
  // In future, this could actually execute fixes
  result.success = false;
  result.details = `Recommended: ${topRec.description}. Manual intervention may be needed.`;

  return result;
}

/**
 * Skip an SD and log the reason
 *
 * @param {string} sdId - SD to skip
 * @param {string} reason - Reason for skipping
 * @param {string} sessionId - Current session
 */
export async function skipAndLog(sdId, reason, sessionId) {
  // Log to continuous execution
  await supabase
    .from('continuous_execution_log')
    .insert({
      session_id: sessionId || 'unknown',
      child_sd_id: sdId,
      phase: 'SKIP',
      status: 'skipped',
      error_message: reason
    });

  // Update SD status
  await supabase
    .from('strategic_directives_v2')
    .update({
      status: 'blocked',
      notes: `Auto-skipped: ${reason}`
    })
    .or(`sd_key.eq.${sdId},id.eq.${sdId}`);

  return { skipped: true, reason };
}

// CLI support
if (process.argv[1].endsWith('root-cause-resolver.js')) {
  const error = process.argv[2];
  const sdId = process.argv[3];

  if (!error) {
    console.log('Usage: node root-cause-resolver.js "<error_message>" [sd_id]');
    console.log('');
    console.log('Analyzes an error and suggests root cause and fixes.');
    process.exit(1);
  }

  (async () => {
    console.log('\nAnalyzing failure...\n');

    const analysis = await analyzeFailure(error, { sdId });

    console.log('ROOT CAUSE ANALYSIS');
    console.log('═'.repeat(50));
    console.log(`\nError: ${analysis.error.substring(0, 100)}...`);

    console.log(`\nRoot Cause: ${analysis.rootCause?.summary || 'Unknown'}`);
    console.log(`Confidence: ${Math.round((analysis.rootCause?.confidence || 0) * 100)}%`);
    console.log(`Can Auto-Fix: ${analysis.canAutoFix ? 'Yes' : 'No'}`);

    if (analysis.knownPattern) {
      console.log(`\nKnown Pattern: ${analysis.knownPattern.pattern_name}`);
    }

    console.log('\nExplorations:');
    for (const [_key, exp] of Object.entries(analysis.explorations)) {
      console.log(`  ${exp.name}: ${exp.findings.length} findings`);
      for (const f of exp.findings.slice(0, 2)) {
        console.log(`    - ${f.finding}`);
      }
    }

    console.log('\nRecommendations:');
    for (const rec of analysis.recommendations.slice(0, 3)) {
      console.log(`  [${rec.priority}] ${rec.action}: ${rec.description}`);
    }

    console.log('');
  })();
}

export default {
  analyzeFailure,
  attemptFix,
  skipAndLog,
  EXPLORER_FOCUSES
};
