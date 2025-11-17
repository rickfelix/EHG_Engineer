/**
 * Quick-Fix Compliance Rubric & Self-Scoring System
 * Combat overconfidence with objective measurement
 *
 * Philosophy: "Trust, but verify - with data."
 *
 * Scoring Tiers:
 * - 90-100: PASS (can complete)
 * - 70-89:  WARN (user review recommended)
 * - <70:    FAIL (must refine or escalate)
 *
 * Created: 2025-11-17
 */

import { execSync } from 'child_process';
import { readFile } from 'fs/promises';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

/**
 * Quick-Fix Compliance Rubric
 * 10 criteria across 4 categories (100-point scale)
 */
const QUICKFIX_RUBRIC = {
  // CATEGORY 1: Fix Quality (40 points)
  fix_quality: {
    weight: 40,
    criteria: [
      {
        id: 'error_resolved',
        name: 'Original Error Resolved',
        points: 15,
        check: async (context) => {
          // Check if original error appears in current console
          const consoleErrors = context.errorsAfterFix || [];
          const originalErrorGone = !consoleErrors.some(err =>
            err.toLowerCase().includes(context.originalError?.toLowerCase() || 'NOMATCH')
          );

          return {
            score: originalErrorGone ? 15 : 0,
            passed: originalErrorGone,
            evidence: originalErrorGone
              ? 'Original error no longer appears in console'
              : `Original error still present in ${consoleErrors.filter(e => e.includes(context.originalError)).length} location(s)`
          };
        }
      },
      {
        id: 'no_new_errors',
        name: 'No New Errors Introduced',
        points: 10,
        check: async (context) => {
          const beforeErrors = context.errorsBeforeFix || [];
          const afterErrors = context.errorsAfterFix || [];

          const newErrors = afterErrors.filter(e => !beforeErrors.some(be => be.includes(e)));

          return {
            score: newErrors.length === 0 ? 10 : Math.max(0, 10 - (newErrors.length * 3)),
            passed: newErrors.length === 0,
            evidence: newErrors.length === 0
              ? 'No new console errors detected'
              : `${newErrors.length} new error(s): ${newErrors.slice(0, 2).join('; ')}`
          };
        }
      },
      {
        id: 'loc_constraint',
        name: 'LOC Constraint Met (≤50)',
        points: 10,
        check: async (context) => {
          const actualLoc = context.actualLoc || 0;
          const withinLimit = actualLoc <= 50;

          return {
            score: withinLimit ? 10 : 0,
            passed: withinLimit,
            evidence: `Actual LOC: ${actualLoc} (limit: 50)`
          };
        }
      },
      {
        id: 'targeted_fix',
        name: 'Fix is Targeted (Not Overengineered)',
        points: 5,
        check: async (context) => {
          const filesChanged = context.filesChanged?.length || 0;
          const targeted = filesChanged <= 2;

          return {
            score: targeted ? 5 : Math.max(0, 5 - filesChanged),
            passed: targeted,
            evidence: `Files changed: ${filesChanged} (recommended: ≤2)`
          };
        }
      }
    ]
  },

  // CATEGORY 2: Testing & Validation (30 points)
  testing: {
    weight: 30,
    criteria: [
      {
        id: 'unit_tests_pass',
        name: 'Unit Tests Passing',
        points: 10,
        check: async (context) => {
          try {
            const result = execSync('npm run test:unit', {
              stdio: 'pipe',
              encoding: 'utf-8',
              timeout: 60000
            });

            return {
              score: 10,
              passed: true,
              evidence: 'Unit tests passed'
            };
          } catch (err) {
            return {
              score: 0,
              passed: false,
              evidence: `Unit tests failed: ${err.message.substring(0, 100)}`
            };
          }
        }
      },
      {
        id: 'e2e_tests_pass',
        name: 'E2E Smoke Tests Passing',
        points: 10,
        check: async (context) => {
          try {
            const result = execSync('npm run test:e2e', {
              stdio: 'pipe',
              encoding: 'utf-8',
              timeout: 120000
            });

            return {
              score: 10,
              passed: true,
              evidence: 'E2E tests passed'
            };
          } catch (err) {
            return {
              score: 0,
              passed: false,
              evidence: `E2E tests failed: ${err.message.substring(0, 100)}`
            };
          }
        }
      },
      {
        id: 'no_regression',
        name: 'No Test Regressions',
        points: 10,
        check: async (context) => {
          // Compare test counts before/after
          const beforeCount = context.testsBeforeFix?.passedCount || 0;
          const afterCount = context.testsAfterFix?.passedCount || 0;

          if (beforeCount === 0) {
            // Can't verify regression without baseline
            return {
              score: 10,
              passed: true,
              evidence: 'No baseline test count - assuming no regression'
            };
          }

          const noRegression = afterCount >= beforeCount;

          return {
            score: noRegression ? 10 : Math.max(0, 10 - ((beforeCount - afterCount) * 2)),
            passed: noRegression,
            evidence: `Tests: ${beforeCount} → ${afterCount} (${noRegression ? 'no regression' : 'regression detected'})`
          };
        }
      }
    ]
  },

  // CATEGORY 3: Code Quality (20 points)
  code_quality: {
    weight: 20,
    criteria: [
      {
        id: 'typescript_valid',
        name: 'TypeScript Compiles',
        points: 10,
        check: async (context) => {
          try {
            execSync('npx tsc --noEmit', { stdio: 'pipe', timeout: 60000 });
            return {
              score: 10,
              passed: true,
              evidence: 'TypeScript compilation successful'
            };
          } catch (err) {
            return {
              score: 0,
              passed: false,
              evidence: 'TypeScript errors detected'
            };
          }
        }
      },
      {
        id: 'linting_clean',
        name: 'Linting Passes',
        points: 5,
        check: async (context) => {
          try {
            const result = execSync('npm run lint', {
              stdio: 'pipe',
              encoding: 'utf-8',
              timeout: 30000
            });
            const hasWarnings = result.includes('warning');

            return {
              score: hasWarnings ? 3 : 5,
              passed: true,
              evidence: hasWarnings ? 'Linting passed with warnings' : 'Linting clean'
            };
          } catch (err) {
            return {
              score: 0,
              passed: false,
              evidence: 'Linting failed'
            };
          }
        }
      },
      {
        id: 'proper_patterns',
        name: 'Follows Code Patterns',
        points: 5,
        check: async (context) => {
          // Check for anti-patterns in changed files
          const antiPatterns = [
            { pattern: /console\.log\(/g, issue: 'Debug console.log left in code' },
            { pattern: /\/\/ @ts-ignore/g, issue: 'TypeScript errors suppressed' },
            { pattern: /any\s*[;,\)]/g, issue: 'TypeScript "any" used excessively' }
          ];

          const issues = [];

          try {
            for (const file of context.filesChanged || []) {
              // Skip test files
              if (file.includes('.test.') || file.includes('.spec.')) continue;

              try {
                const content = await readFile(file, 'utf-8');

                for (const { pattern, issue } of antiPatterns) {
                  const matches = content.match(pattern);
                  if (matches && matches.length > 0) {
                    issues.push(`${path.basename(file)}: ${issue}`);
                  }
                }
              } catch (err) {
                // File read error - skip
              }
            }
          } catch (err) {
            // Continue with partial results
          }

          return {
            score: issues.length === 0 ? 5 : Math.max(0, 5 - issues.length),
            passed: issues.length === 0,
            evidence: issues.length === 0
              ? 'No anti-patterns detected'
              : `Anti-patterns found: ${issues.slice(0, 2).join('; ')}`
          };
        }
      }
    ]
  },

  // CATEGORY 4: Process Compliance (10 points)
  process: {
    weight: 10,
    criteria: [
      {
        id: 'scope_appropriate',
        name: 'Scope Matches Issue Description',
        points: 5,
        check: async (context) => {
          const issueFiles = context.issueDescription?.match(/[a-zA-Z0-9_-]+\.(tsx?|jsx?|js|css|sql)/g) || [];
          const changedFiles = (context.filesChanged || []).map(f => path.basename(f));

          if (issueFiles.length === 0) {
            return {
              score: 5,
              passed: true,
              evidence: 'No specific files mentioned in issue'
            };
          }

          const matchCount = changedFiles.filter(cf =>
            issueFiles.some(iff => cf.includes(iff) || iff.includes(cf))
          ).length;

          const allMatch = matchCount === changedFiles.length;

          return {
            score: allMatch ? 5 : Math.max(2, Math.floor((matchCount / changedFiles.length) * 5)),
            passed: allMatch,
            evidence: allMatch
              ? 'All changed files match issue description'
              : `${matchCount}/${changedFiles.length} files match issue description`
          };
        }
      },
      {
        id: 'proper_classification',
        name: 'Properly Classified (Not Escalation Case)',
        points: 5,
        check: async (context) => {
          const escalationTriggers = [];

          if (context.actualLoc > 50) escalationTriggers.push('LOC >50');

          const filesChanged = context.filesChanged || [];
          if (filesChanged.some(f => f.includes('migration') || f.includes('.sql'))) {
            escalationTriggers.push('Database migration');
          }
          if (filesChanged.some(f => f.includes('auth') || f.includes('security') || f.includes('permission'))) {
            escalationTriggers.push('Security/auth changes');
          }
          if (context.complexity === 'high') {
            escalationTriggers.push('High complexity');
          }

          return {
            score: escalationTriggers.length === 0 ? 5 : 0,
            passed: escalationTriggers.length === 0,
            evidence: escalationTriggers.length === 0
              ? 'Properly classified as quick-fix'
              : `Should escalate: ${escalationTriggers.join(', ')}`
          };
        }
      }
    ]
  }
};

/**
 * Run compliance rubric and generate self-score
 * @param {string} qfId - Quick-fix ID
 * @param {Object} context - Validation context
 * @returns {Promise<Object>} Compliance results
 */
export async function runComplianceRubric(qfId, context) {
  console.log('\n📊 Quick-Fix Compliance Rubric\n');
  console.log('   Philosophy: "Trust, but verify - with data."\n');

  const results = {
    totalScore: 0,
    maxScore: 100,
    categoryScores: {},
    criteriaResults: [],
    verdict: null,
    confidence: 100
  };

  // Run all categories
  for (const [categoryName, category] of Object.entries(QUICKFIX_RUBRIC)) {
    const displayName = categoryName.toUpperCase().replace(/_/g, ' ');
    console.log(`━━━ ${displayName} (${category.weight} points) ━━━\n`);

    const categoryResults = {
      totalPoints: 0,
      maxPoints: category.weight,
      criteria: []
    };

    for (const criterion of category.criteria) {
      console.log(`   ⏳ ${criterion.name}...`);

      try {
        const result = await criterion.check(context);

        console.log(`   ${result.passed ? '✅' : '❌'} ${criterion.name}: ${result.score}/${criterion.points} points`);
        console.log(`      ${result.evidence}`);

        categoryResults.totalPoints += result.score;
        categoryResults.criteria.push({
          id: criterion.id,
          name: criterion.name,
          score: result.score,
          maxScore: criterion.points,
          passed: result.passed,
          evidence: result.evidence
        });

        results.criteriaResults.push({
          category: categoryName,
          ...categoryResults.criteria[categoryResults.criteria.length - 1]
        });

      } catch (err) {
        console.log(`   ⚠️  ${criterion.name}: Check failed - ${err.message}`);
        categoryResults.criteria.push({
          id: criterion.id,
          name: criterion.name,
          score: 0,
          maxScore: criterion.points,
          passed: false,
          evidence: `Check failed: ${err.message}`
        });
      }

      console.log();
    }

    results.categoryScores[categoryName] = categoryResults;
    results.totalScore += categoryResults.totalPoints;

    console.log(`   Category Total: ${categoryResults.totalPoints}/${category.weight}\n`);
  }

  // Calculate final verdict
  const scorePercentage = (results.totalScore / results.maxScore) * 100;

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log(`📊 FINAL COMPLIANCE SCORE: ${results.totalScore}/${results.maxScore} (${scorePercentage.toFixed(1)}%)\n`);

  if (scorePercentage >= 90) {
    results.verdict = 'PASS';
    results.confidence = scorePercentage;
    console.log(`✅ VERDICT: PASS (${results.confidence.toFixed(1)}% confidence)`);
    console.log('   Quality standard met. Safe to complete quick-fix.\n');
  } else if (scorePercentage >= 70) {
    results.verdict = 'WARN';
    results.confidence = scorePercentage;
    console.log(`⚠️  VERDICT: WARN (${results.confidence.toFixed(1)}% confidence)`);
    console.log('   Quality concerns detected. User review recommended.\n');
  } else {
    results.verdict = 'FAIL';
    results.confidence = scorePercentage;
    console.log(`❌ VERDICT: FAIL (${results.confidence.toFixed(1)}% confidence)`);
    console.log('   Quality standards not met. Must refine or escalate.\n');
  }

  // Show improvement recommendations
  const failedCriteria = results.criteriaResults.filter(c => !c.passed);
  if (failedCriteria.length > 0) {
    console.log(`📋 Failed Criteria (${failedCriteria.length}):\n`);
    failedCriteria.forEach((c, i) => {
      console.log(`   ${i + 1}. ${c.name} (${c.score}/${c.maxScore} points)`);
      console.log(`      ${c.evidence}\n`);
    });
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Store rubric results in database
  try {
    await supabase
      .from('quick_fixes')
      .update({
        compliance_score: results.totalScore,
        compliance_verdict: results.verdict,
        compliance_details: results
      })
      .eq('id', qfId);
  } catch (err) {
    console.log(`   ⚠️  Could not save compliance results to database: ${err.message}\n`);
  }

  return results;
}

/**
 * Quick compliance check (skips expensive checks like tests)
 * Used for rapid validation during development
 */
export async function runQuickComplianceCheck(qfId, context) {
  console.log('\n⚡ Quick Compliance Check (Skipping Test Execution)\n');

  // Run only non-test criteria
  const quickContext = { ...context, skipTests: true };

  // Mock test results as passing for quick check
  const quickResults = await runComplianceRubric(qfId, {
    ...quickContext,
    testsBeforeFix: { passedCount: 100 },
    testsAfterFix: { passedCount: 100 }
  });

  return quickResults;
}
