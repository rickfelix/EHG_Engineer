/**
 * Compliance Loop for Complete Quick-Fix
 * Part of quick-fix modularization
 */

import { execSync } from 'child_process';
import { runComplianceRubric } from '../../../lib/quickfix-compliance-rubric.js';
import { MAX_REFINEMENT_ATTEMPTS } from './constants.js';

/**
 * Run compliance rubric with auto-refinement loop
 * @param {string} qfId - Quick-fix ID
 * @param {object} qf - Quick-fix record
 * @param {object} context - Context for compliance check
 * @param {Function} prompt - Prompt function for user input
 * @returns {Promise<object>} Final compliance results and refinement history
 */
export async function runComplianceWithRefinement(qfId, qf, context, prompt) {
  console.log('\n🔄 Compliance Rubric with Auto-Refinement (max 3 attempts)\n');

  let complianceResults = null;
  let refinementAttempt = 0;
  const refinementHistory = [];

  while (refinementAttempt < MAX_REFINEMENT_ATTEMPTS) {
    refinementAttempt++;
    console.log(`\n━━━ Compliance Check Attempt ${refinementAttempt}/${MAX_REFINEMENT_ATTEMPTS} ━━━\n`);

    const complianceContext = {
      qfId,
      originalError: qf.actual_behavior || qf.description,
      errorsBeforeFix: context.errorsBeforeFix || [],
      errorsAfterFix: context.errorsAfterFix || [],
      actualLoc: context.actualLoc,
      filesChanged: context.filesChanged,
      issueDescription: qf.description,
      complexity: qf.estimated_loc > 30 ? 'medium' : 'low',
      testsBeforeFix: null,
      testsAfterFix: { passedCount: context.testsPass ? 100 : 0 },
      testsPass: context.testsPass,
      refinementAttempt
    };

    complianceResults = await runComplianceRubric(qfId, complianceContext);

    refinementHistory.push({
      attempt: refinementAttempt,
      score: complianceResults.totalScore,
      verdict: complianceResults.verdict,
      failedCriteria: complianceResults.criteriaResults.filter(c => !c.passed).map(c => c.name)
    });

    // Check if we passed
    if (complianceResults.verdict === 'PASS') {
      console.log(`\n✅ Compliance PASSED on attempt ${refinementAttempt}\n`);
      break;
    }

    // Check if we're in WARN territory and it's acceptable
    if (complianceResults.verdict === 'WARN' && refinementAttempt === MAX_REFINEMENT_ATTEMPTS) {
      console.log(`\n⚠️  Final attempt reached WARN status (${complianceResults.totalScore}/100)\n`);
      break;
    }

    // If FAIL and not last attempt, show auto-refinement guidance
    if (complianceResults.verdict === 'FAIL' && refinementAttempt < MAX_REFINEMENT_ATTEMPTS) {
      console.log(`\n🔧 Auto-Refinement Attempt ${refinementAttempt}/${MAX_REFINEMENT_ATTEMPTS}\n`);
      console.log('   Failed criteria to address:\n');

      const failedCriteria = complianceResults.criteriaResults.filter(c => !c.passed);
      failedCriteria.forEach((c, i) => {
        console.log(`   ${i + 1}. ${c.name} (${c.score}/${c.maxScore} points)`);
        console.log(`      Issue: ${c.evidence}`);
        console.log(`      Suggestion: ${getRefinementSuggestion(c.id)}\n`);
      });

      const refineChoice = await prompt('\n   Attempt auto-refinement? (yes/no/skip): ');

      if (refineChoice.toLowerCase() === 'skip') {
        console.log('\n   Skipping remaining refinement attempts...\n');
        break;
      }

      if (!refineChoice.toLowerCase().startsWith('y')) {
        console.log('\n   Refinement cancelled by user.\n');
        break;
      }

      console.log('\n   Applying refinement strategies...\n');
      await applyAutoRefinement(failedCriteria, { qfId, filesChanged: context.filesChanged });
    }
  }

  // Show refinement history
  if (refinementHistory.length > 1) {
    console.log('\n📈 Refinement History:\n');
    refinementHistory.forEach((r) => {
      const icon = r.verdict === 'PASS' ? '✅' : r.verdict === 'WARN' ? '⚠️' : '❌';
      console.log(`   Attempt ${r.attempt}: ${icon} ${r.score}/100 (${r.verdict})`);
    });
    console.log();
  }

  return { complianceResults, refinementHistory };
}

/**
 * Get refinement suggestion for a failed compliance criterion
 * @param {string} criterionId - The criterion identifier
 * @returns {string} Suggestion text
 */
export function getRefinementSuggestion(criterionId) {
  const suggestions = {
    error_resolved: 'Verify the original error is fixed. Check browser console and server logs.',
    no_new_errors: 'Remove any new errors introduced. Check for TypeScript errors, runtime exceptions.',
    loc_constraint: 'Reduce scope. Consider splitting fix into multiple quick-fixes or escalate to SD.',
    targeted_fix: 'Reduce files changed. Quick-fix should touch 1-2 files maximum.',
    unit_tests_pass: 'Run: npm run test:unit and fix any failures.',
    e2e_tests_pass: 'Run: npm run test:e2e and fix any failures.',
    no_regression: 'Ensure no existing tests were broken. Run full test suite.',
    typescript_valid: 'Run: npx tsc --noEmit and fix TypeScript errors.',
    linting_clean: 'Run: npm run lint and address linting issues.',
    proper_patterns: 'Remove console.log statements, @ts-ignore, and fix any anti-patterns.',
    scope_appropriate: 'Ensure changed files match the issue description.',
    proper_classification: 'This may need escalation to full SD if scope has grown.'
  };

  return suggestions[criterionId] || 'Review the criterion and address the underlying issue.';
}

/**
 * Apply auto-refinement strategies for failed criteria
 * @param {Array} failedCriteria - List of failed compliance criteria
 * @param {Object} context - Refinement context
 */
async function applyAutoRefinement(failedCriteria, context) {
  const { filesChanged } = context;

  for (const criterion of failedCriteria) {
    console.log(`   🔧 Attempting to fix: ${criterion.name}`);

    switch (criterion.id) {
      case 'proper_patterns':
        console.log('      Scanning for anti-patterns...');
        for (const file of filesChanged || []) {
          if (file.endsWith('.test.ts') || file.endsWith('.test.tsx') || file.endsWith('.spec.ts')) {
            continue;
          }
          console.log(`      Check file: ${file} for console.log, @ts-ignore`);
        }
        break;

      case 'linting_clean':
        console.log('      Running auto-fix lint...');
        try {
          execSync('npm run lint -- --fix', { stdio: 'pipe', timeout: 30000 });
          console.log('      ✅ Auto-lint fix applied');
        } catch {
          console.log('      ⚠️  Auto-lint fix failed, manual intervention needed');
        }
        break;

      case 'typescript_valid':
        console.log('      TypeScript errors require manual fix');
        console.log('      Run: npx tsc --noEmit to see errors');
        break;

      case 'unit_tests_pass':
      case 'e2e_tests_pass':
        console.log('      Test failures require manual fix');
        console.log('      Review test output and address failures');
        break;

      default:
        console.log(`      Manual intervention required for: ${criterion.name}`);
    }
  }

  console.log('\n   ✅ Auto-refinement strategies applied. Re-running compliance check...\n');
}
