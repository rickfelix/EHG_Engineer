/**
 * QUICKFIX Lightweight Specialist Invocations
 * LEO Protocol v4.2.0 - Quick-Fix Workflow Integration
 *
 * Purpose: Lightweight specialist checks for QUICKFIX sub-agent
 * These are fast pattern-based checks, NOT full sub-agent executions
 *
 * Philosophy: "Quick checks for quick fixes - know when to escalate."
 *
 * Created: 2025-11-26 (QUICKFIX Enhancement)
 */

import { existsSync } from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Invoke a specialist sub-agent for QUICKFIX validation
 * Returns lightweight verdict without full analysis
 *
 * @param {string} specialistCode - DATABASE, SECURITY, TESTING, or DESIGN
 * @param {Object} context - Quick-fix context
 * @returns {Promise<Object>} Lightweight specialist feedback
 */
export async function invokeQuickfixSpecialist(specialistCode, context) {
  const { issue, triageResults } = context;

  switch (specialistCode) {
    case 'DATABASE':
      return await checkDatabaseQuickly(issue, triageResults);
    case 'SECURITY':
      return await checkSecurityQuickly(issue, triageResults);
    case 'TESTING':
      return await checkTestingQuickly(issue, triageResults);
    case 'DESIGN':
      return await checkDesignQuickly(issue, triageResults);
    default:
      return {
        verdict: 'UNKNOWN',
        escalate: false,
        recommendations: [`Unknown specialist: ${specialistCode}`]
      };
  }
}

/**
 * DATABASE Specialist - Quick Check
 * Checks for migration files, schema changes, RLS patterns
 */
async function checkDatabaseQuickly(issue, _triageResults) {
  const combined = `${issue.title} ${issue.description} ${issue.consoleError || ''}`.toLowerCase();

  const result = {
    verdict: 'PASS',
    escalate: false,
    escalation_reason: null,
    recommendations: [],
    checks_performed: []
  };

  // Check 1: Migration file detection
  const hasMigrationKeywords = /migration|schema|alter table|add column|drop|create table/i.test(combined);
  result.checks_performed.push({
    name: 'migration_keywords',
    passed: !hasMigrationKeywords,
    detail: hasMigrationKeywords ? 'Migration-related keywords detected' : 'No migration keywords'
  });

  if (hasMigrationKeywords) {
    result.verdict = 'ESCALATE';
    result.escalate = true;
    result.escalation_reason = 'Database schema changes require full SD workflow with DATABASE sub-agent validation';
    result.recommendations.push(
      'Schema migrations require full LEAD→PLAN→EXEC workflow',
      'DATABASE sub-agent must validate migration before execution'
    );
    return result;
  }

  // Check 2: RLS policy detection
  const hasRLSKeywords = /rls|row level|policy|grant|revoke/i.test(combined);
  result.checks_performed.push({
    name: 'rls_keywords',
    passed: !hasRLSKeywords,
    detail: hasRLSKeywords ? 'RLS-related keywords detected' : 'No RLS keywords'
  });

  if (hasRLSKeywords) {
    result.verdict = 'CAUTION';
    result.recommendations.push(
      'RLS policy changes should be reviewed carefully',
      'Consider escalating if touching authentication/authorization'
    );
  }

  // Check 3: Scan for pending migration files
  try {
    const migrationDir = path.join(process.cwd(), 'database', 'migrations');
    if (existsSync(migrationDir)) {
      const { stdout } = await execAsync(`ls -la ${migrationDir} 2>/dev/null | wc -l`);
      const fileCount = parseInt(stdout.trim()) - 1; // minus header
      result.checks_performed.push({
        name: 'migration_files',
        passed: true,
        detail: `${fileCount} migration files in database/migrations`
      });
    }
  } catch {
    // Migration dir check failed, continue
  }

  // Default recommendations for database-touching quick-fixes
  if (result.verdict === 'PASS') {
    result.recommendations = [
      'Verify no schema migrations needed (.sql files)',
      'Check if only data updates (safe for quick-fix)',
      'Review RLS policies if touching permissions'
    ];
  }

  return result;
}

/**
 * SECURITY Specialist - Quick Check
 * Checks for auth patterns, sensitive data, permission changes
 */
async function checkSecurityQuickly(issue, triageResults) {
  const combined = `${issue.title} ${issue.description} ${issue.consoleError || ''}`.toLowerCase();

  const result = {
    verdict: 'PASS',
    escalate: false,
    escalation_reason: null,
    recommendations: [],
    checks_performed: []
  };

  // Check 1: Authentication keywords
  const hasAuthKeywords = /auth|login|logout|session|token|jwt|cookie|credential/i.test(combined);
  result.checks_performed.push({
    name: 'auth_keywords',
    passed: !hasAuthKeywords || triageResults.risk !== 'high',
    detail: hasAuthKeywords ? 'Authentication-related keywords detected' : 'No auth keywords'
  });

  // Check 2: Permission keywords
  const hasPermissionKeywords = /permission|role|access|admin|privilege|grant/i.test(combined);
  result.checks_performed.push({
    name: 'permission_keywords',
    passed: !hasPermissionKeywords || triageResults.risk !== 'high',
    detail: hasPermissionKeywords ? 'Permission-related keywords detected' : 'No permission keywords'
  });

  // Check 3: Sensitive data keywords
  const hasSensitiveKeywords = /password|secret|key|api.key|private|encrypt|decrypt/i.test(combined);
  result.checks_performed.push({
    name: 'sensitive_keywords',
    passed: !hasSensitiveKeywords,
    detail: hasSensitiveKeywords ? 'Sensitive data keywords detected' : 'No sensitive keywords'
  });

  // Escalation logic
  if (triageResults.risk === 'high' && (hasAuthKeywords || hasPermissionKeywords)) {
    result.verdict = 'ESCALATE';
    result.escalate = true;
    result.escalation_reason = 'Authentication/authorization changes require security review';
    result.recommendations.push(
      'High-risk auth changes require full SECURITY sub-agent review',
      'Create SD with SECURITY sub-agent in PLAN phase'
    );
    return result;
  }

  if (hasSensitiveKeywords) {
    result.verdict = 'CAUTION';
    result.recommendations.push(
      'Sensitive data handling detected - review carefully',
      'Ensure no secrets in logs or error messages'
    );
    return result;
  }

  // Default recommendations
  result.recommendations = [
    'Verify no auth logic changes',
    'Check if only UI changes (safe for quick-fix)',
    'Review session handling if applicable'
  ];

  return result;
}

/**
 * TESTING Specialist - Quick Check
 * Checks test coverage, existing tests, test patterns
 */
async function checkTestingQuickly(issue, _triageResults) {
  const combined = `${issue.title} ${issue.description} ${issue.consoleError || ''}`.toLowerCase();

  const result = {
    verdict: 'PASS',
    escalate: false,
    escalation_reason: null,
    recommendations: [],
    checks_performed: []
  };

  // Check 1: File detection from issue
  const fileMatch = combined.match(/([a-zA-Z0-9_-]+\.(tsx?|jsx?|js))/g) || [];
  result.checks_performed.push({
    name: 'file_detection',
    passed: true,
    detail: fileMatch.length > 0 ? `Files mentioned: ${fileMatch.join(', ')}` : 'No specific files mentioned'
  });

  // Check 2: Look for existing tests
  if (fileMatch.length > 0) {
    const testExists = [];
    for (const file of fileMatch.slice(0, 3)) { // Check first 3 files max
      const baseName = file.replace(/\.(tsx?|jsx?|js)$/, '');
      const possibleTestPaths = [
        `tests/unit/${baseName}.test.ts`,
        `tests/unit/${baseName}.test.js`,
        `tests/e2e/${baseName}.spec.ts`,
        `src/**/${baseName}.test.ts`
      ];

      for (const _testPath of possibleTestPaths) {
        try {
          const { stdout } = await execAsync(`find . -path "*/${baseName}*.test.*" -o -path "*/${baseName}*.spec.*" 2>/dev/null | head -1`);
          if (stdout.trim()) {
            testExists.push(stdout.trim());
            break;
          }
        } catch {
          // Continue
        }
      }
    }

    result.checks_performed.push({
      name: 'existing_tests',
      passed: true,
      detail: testExists.length > 0 ? `Found tests: ${testExists.join(', ')}` : 'No existing tests found'
    });

    if (testExists.length === 0) {
      result.recommendations.push('No existing tests found - ensure manual verification');
    }
  }

  // Check 3: Test-related keywords
  const isTestFix = /test|spec|coverage|assertion|expect|mock/i.test(combined);
  result.checks_performed.push({
    name: 'test_fix',
    passed: true,
    detail: isTestFix ? 'This appears to be a test-related fix' : 'Not a test-related fix'
  });

  // TESTING never escalates for quick-fixes, just provides guidance
  result.recommendations.push(
    'Run unit tests before completing: npm run test:unit',
    'Run E2E smoke tests: npm run test:e2e',
    'Verify no test regressions introduced'
  );

  return result;
}

/**
 * DESIGN Specialist - Quick Check
 * Checks UI patterns, accessibility, responsive design
 */
async function checkDesignQuickly(issue, triageResults) {
  const combined = `${issue.title} ${issue.description} ${issue.consoleError || ''}`.toLowerCase();

  const result = {
    verdict: 'PASS',
    escalate: false,
    escalation_reason: null,
    recommendations: [],
    checks_performed: []
  };

  // Check 1: Large UI change detection
  const isLargeUIChange = /redesign|refactor.*ui|major.*change|new.*component/i.test(combined);
  result.checks_performed.push({
    name: 'large_ui_change',
    passed: !isLargeUIChange,
    detail: isLargeUIChange ? 'Large UI change detected' : 'Minor UI change'
  });

  if (isLargeUIChange || triageResults.estimatedLoc > 40) {
    result.verdict = 'ESCALATE';
    result.escalate = true;
    result.escalation_reason = 'Large UI changes need DESIGN sub-agent review';
    result.recommendations.push(
      'Major UI changes require full DESIGN sub-agent validation',
      'Component sizing guidelines: 300-600 LOC sweet spot'
    );
    return result;
  }

  // Check 2: Accessibility keywords
  const hasA11yKeywords = /accessibility|a11y|aria|screen.reader|keyboard|focus|contrast/i.test(combined);
  result.checks_performed.push({
    name: 'accessibility',
    passed: true,
    detail: hasA11yKeywords ? 'Accessibility-related fix' : 'No a11y keywords'
  });

  if (hasA11yKeywords) {
    result.verdict = 'REVIEW';
    result.recommendations.push(
      'Accessibility changes should be tested with screen reader',
      'Verify keyboard navigation works',
      'Check color contrast ratios (WCAG AA compliance)'
    );
  }

  // Check 3: Responsive keywords
  const hasResponsiveKeywords = /responsive|mobile|tablet|breakpoint|media.query/i.test(combined);
  result.checks_performed.push({
    name: 'responsive',
    passed: true,
    detail: hasResponsiveKeywords ? 'Responsive-related fix' : 'No responsive keywords'
  });

  if (hasResponsiveKeywords) {
    result.recommendations.push(
      'Test on mobile, tablet, and desktop viewports',
      'Verify touch targets are at least 44x44px'
    );
  }

  // Check 4: Component-specific keywords
  const componentKeywords = combined.match(/button|modal|form|input|table|card|navigation|menu/gi) || [];
  if (componentKeywords.length > 0) {
    result.checks_performed.push({
      name: 'component_type',
      passed: true,
      detail: `Component types: ${[...new Set(componentKeywords)].join(', ')}`
    });

    result.recommendations.push(
      `Verify ${componentKeywords[0]} follows Shadcn component patterns`,
      'Check hover, active, and disabled states'
    );
  }

  // Default recommendations
  if (result.recommendations.length === 0) {
    result.recommendations = [
      'Verify Tailwind/CSS patterns for consistency',
      'Check responsive behavior (mobile, tablet, desktop)',
      'Ensure design system compliance'
    ];
  }

  return result;
}

/**
 * Run all relevant specialists for a quick-fix
 * @param {Array<string>} specialists - List of specialist codes
 * @param {Object} context - Quick-fix context
 * @returns {Promise<Object>} Combined specialist results
 */
export async function runAllQuickfixSpecialists(specialists, context) {
  const results = {
    specialists_invoked: [],
    escalation_required: false,
    escalation_reasons: [],
    all_recommendations: []
  };

  for (const code of specialists) {
    try {
      const specialistResult = await invokeQuickfixSpecialist(code, context);

      results.specialists_invoked.push({
        code,
        verdict: specialistResult.verdict,
        escalate: specialistResult.escalate,
        recommendations: specialistResult.recommendations,
        checks_performed: specialistResult.checks_performed
      });

      if (specialistResult.escalate) {
        results.escalation_required = true;
        results.escalation_reasons.push(`${code}: ${specialistResult.escalation_reason}`);
      }

      results.all_recommendations.push(...specialistResult.recommendations);
    } catch (err) {
      results.specialists_invoked.push({
        code,
        verdict: 'ERROR',
        error: err.message,
        recommendations: ['Specialist check failed - proceed with caution']
      });
    }
  }

  return results;
}
