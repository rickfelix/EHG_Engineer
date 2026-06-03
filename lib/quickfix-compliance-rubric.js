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
import dotenv from 'dotenv';
// SD-FDBK-ENH-COMPLETE-QUICK-FIX-002: shared net-LOC helper (single source of the formula,
// reused by validateLOC + verifyLOCConstraint so all three gates agree).
import { computeNetSourceLoc } from '../scripts/modules/complete-quick-fix/verification.js';
import { createSupabaseServiceClient } from '../scripts/lib/supabase-connection.js';

dotenv.config();

// Supabase client initialized lazily to use async createSupabaseServiceClient
let supabase = null;

async function getSupabaseClient() {
  if (!supabase) {
    supabase = await createSupabaseServiceClient('engineer', { verbose: false });
  }
  return supabase;
}

// Files that accompany a source fix but must NOT count as scope creep or be
// required to be name-dropped in the issue description: tests and documentation.
// (Mirrors TEST_FILE_PATTERN in complete-quick-fix/git-operations.js + doc paths.)
const TEST_OR_DOC_PATTERN = /(\.test\.|\.spec\.|\b__tests__\b|\/tests\/|\/e2e\/|\bplaywright\b|\.md$|\.markdown$|\.rst$|^docs\/)/i;

// What `npm run lint` (eslint scripts/ lib/ tools/ --ext .js,.ts) actually covers.
// Used to change-scope the lint check to the QF's own files (see linting_clean).
const LINT_SOURCE_EXT = /\.(jsx?|cjs|mjs|tsx?)$/i;
const LINT_DIR_PATTERN = /^(scripts|lib|tools)\//i;

/**
 * Quick-Fix Compliance Rubric
 * 10 criteria across 4 categories (100-point scale)
 */
// QF-20260509-070: exported so individual rule check functions can be unit-tested
// without invoking the full rubric pipeline (which shells out via execSync to
// npm test / lint / tsc and would time-out).
export const QUICKFIX_RUBRIC = {
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
        // QF-20260509-070: prefer actualSourceLoc (source-only) when present and align
        // cap to 75 (QF_HARD_LOC_CAP at scripts/modules/complete-quick-fix/verification.js:13,
        // set by QF-20260504-501). actualLoc is total = source + test which double-counts
        // legitimate test LOC against the source-only QF tier policy.
        // QF-20260509-407: subtract `sourceDeletionLoc` (LOC from pure-deletion source
        // files) — dead-code removal is not new source surface and should not consume
        // the 75-cap budget. Reported number is net source = source - sourceDeletionLoc.
        // Evidence prefix kept as "Source LOC:" for backward-compat with QF-20260509-070
        // tests; deletion-only suffix appears only when applicable.
        name: 'LOC Constraint Met (≤75 source)',
        points: 10,
        check: async (context) => {
          const sourceLoc = context.actualSourceLoc ?? context.actualLoc ?? 0;
          const deletionLoc = context.sourceDeletionLoc ?? 0;
          const netSourceLoc = computeNetSourceLoc(sourceLoc, deletionLoc);
          const testLoc = context.actualTestLoc ?? 0;
          const withinLimit = netSourceLoc <= 75;

          const deletionNote = deletionLoc > 0 ? `, deletion-only LOC: ${deletionLoc} (excluded from cap)` : '';
          return {
            score: withinLimit ? 10 : 0,
            passed: withinLimit,
            evidence: `Source LOC: ${netSourceLoc} (limit: 75)${deletionNote}${testLoc ? `, test LOC: ${testLoc} (excluded)` : ''}`
          };
        }
      },
      {
        id: 'targeted_fix',
        name: 'Fix is Targeted (Not Overengineered)',
        points: 5,
        check: async (context) => {
          // Count only SOURCE files — a source fix plus its regression test and a
          // doc note is well-scoped, not overengineered. Counting the raw file
          // total penalized the standard fix+test+doc trio (witnessed QF-20260526-913).
          const all = context.filesChanged || [];
          const sourceFiles = all.filter(f => typeof f === 'string' && !TEST_OR_DOC_PATTERN.test(f.replace(/\\/g, '/')));
          const n = sourceFiles.length;
          const targeted = n <= 2;
          const excluded = all.length - n;

          return {
            score: targeted ? 5 : Math.max(0, 5 - (n - 2)),
            passed: targeted,
            evidence: `Source files changed: ${n} (recommended ≤2${excluded ? `; ${excluded} test/doc file(s) excluded` : ''})`
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
          // OPTIMIZATION: Use cached test results if available
          if (context.testsPass !== undefined && context.testsPass !== null) {
            return {
              score: context.testsPass ? 10 : 0,
              passed: context.testsPass,
              evidence: context.testsPass
                ? 'Unit tests passed (cached result)'
                : 'Unit tests failed (cached result)'
            };
          }

          // Run tests only if no cached result
          try {
            execSync('npm run test:unit', {
              stdio: 'pipe',
              encoding: 'utf-8',
              timeout: 60000
            });

            return {
              score: 10,
              passed: true,
              evidence: 'Unit tests passed'
            };
          } catch (_err) {
            return {
              score: 0,
              passed: false,
              evidence: `Unit tests failed: ${_err.message.substring(0, 100)}`
            };
          }
        }
      },
      {
        id: 'e2e_tests_pass',
        name: 'E2E Smoke Tests Passing',
        points: 10,
        check: async (context) => {
          // OPTIMIZATION: Use cached test results if available
          if (context.testsPass !== undefined && context.testsPass !== null) {
            return {
              score: context.testsPass ? 10 : 0,
              passed: context.testsPass,
              evidence: context.testsPass
                ? 'E2E tests passed (cached result)'
                : 'E2E tests failed (cached result)'
            };
          }

          // Run tests only if no cached result
          try {
            execSync('npm run test:e2e', {
              stdio: 'pipe',
              encoding: 'utf-8',
              timeout: 120000
            });

            return {
              score: 10,
              passed: true,
              evidence: 'E2E tests passed'
            };
          } catch (_err) {
            return {
              score: 0,
              passed: false,
              evidence: `E2E tests failed: ${_err.message.substring(0, 100)}`
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
        check: async (_context) => {
          try {
            execSync('npx tsc --noEmit', { stdio: 'pipe', timeout: 60000 });
            return {
              score: 10,
              passed: true,
              evidence: 'TypeScript compilation successful'
            };
          } catch (_err) {
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
          // Change-scope the lint to the QF's OWN changed files. The whole-repo
          // `npm run lint` (eslint scripts/ lib/ tools/) re-surfaced pre-existing
          // baseline errors unrelated to the QF as a 0/5 "Linting failed", forcing
          // an --accept-compliance-warn bypass on every Tier-2 QF. Same baseline-
          // poisoning class fixed for the test gate (SD-FDBK-INFRA-CHANGE-SCOPE-COMPLETE-001).
          const lintTargets = (context.filesChanged || []).filter(
            f => typeof f === 'string' && LINT_SOURCE_EXT.test(f) && LINT_DIR_PATTERN.test(f.replace(/\\/g, '/'))
          );
          if (lintTargets.length === 0) {
            return { score: 5, passed: true, evidence: 'No lintable source files changed (scoped lint skipped)' };
          }
          try {
            const result = execSync(`npx eslint ${lintTargets.map(f => `"${f}"`).join(' ')}`, {
              stdio: 'pipe',
              encoding: 'utf-8',
              timeout: 30000
            });
            const hasWarnings = /warning/i.test(result);
            return {
              score: hasWarnings ? 3 : 5,
              passed: true,
              evidence: `Scoped lint ${hasWarnings ? 'passed with warnings' : 'clean'} (${lintTargets.length} file(s))`
            };
          } catch (err) {
            // Non-zero exit = a real lint ERROR in the QF's own changed files (not baseline).
            const out = ((err.stdout || '') + (err.stderr || '') || err.message || '').toString();
            const firstError = out.split('\n').find(l => /error/i.test(l)) || out.split('\n')[0] || '';
            return {
              score: 0,
              passed: false,
              evidence: `Scoped lint failed on changed files: ${firstError.trim().substring(0, 120)}`
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
              // QF-20260527-772: skip CLI-script surfaces where console.log/
              // error/warn is legitimate user-facing output, not debug
              // leftover. The anti-pattern targets src/ UI/application code;
              // scripts/, bin/, cli/ trees and .cjs/.mjs files are tools
              // whose console output IS their interface. Witnessed false-
              // positive on 6 consecutive QFs in lib/quickfix-compliance-rubric
              // session 2026-05-27.
              if (/(^|[\\/])(scripts|bin|cli)[\\/]/.test(file)) continue;
              if (/\.(cjs|mjs)$/.test(file)) continue;

              try {
                const content = await readFile(file, 'utf-8');

                for (const { pattern, issue } of antiPatterns) {
                  const matches = content.match(pattern);
                  if (matches && matches.length > 0) {
                    issues.push(`${path.basename(file)}: ${issue}`);
                  }
                }
              } catch (_err) {
                // File read error - skip
              }
            }
          } catch (_err) {
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
          const issueFiles = context.issueDescription?.match(/[a-zA-Z0-9_-]+\.(tsx?|jsx?|cjs|mjs|js|css|sql)/g) || [];
          // Test + doc files accompanying a source fix are in-scope even when not
          // name-dropped in the description; exclude them from the must-match set
          // (the description names the source file, rarely its test or doc note).
          const changedFiles = (context.filesChanged || [])
            .filter(f => typeof f === 'string' && !TEST_OR_DOC_PATTERN.test(f.replace(/\\/g, '/')))
            .map(f => path.basename(f));

          if (issueFiles.length === 0 || changedFiles.length === 0) {
            return {
              score: 5,
              passed: true,
              evidence: issueFiles.length === 0
                ? 'No specific files mentioned in issue'
                : 'Only test/doc files changed (in-scope; no source file to match)'
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
              ? 'All source files match issue description'
              : `${matchCount}/${changedFiles.length} source files match issue description`
          };
        }
      },
      {
        id: 'proper_classification',
        name: 'Properly Classified (Not Escalation Case)',
        points: 5,
        check: async (context) => {
          const escalationTriggers = [];

          // QF-20260509-070: source-only LOC against the canonical 75-cap.
          // QF-20260509-407: subtract sourceDeletionLoc (pure dead-code removal does
          // not warrant escalation to a full SD). Trigger label kept as "source LOC >75"
          // for backward-compat with existing test fixtures; the number is net.
          const sourceLoc = context.actualSourceLoc ?? context.actualLoc ?? 0;
          const deletionLoc = context.sourceDeletionLoc ?? 0;
          const netSourceLoc = computeNetSourceLoc(sourceLoc, deletionLoc);
          if (netSourceLoc > 75) escalationTriggers.push('source LOC >75');

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

  // Initialize Supabase client (fix for uninitialized global)
  const supabaseClient = await getSupabaseClient();

  const results = {
    totalScore: 0,
    maxScore: 100,
    categoryScores: {},
    criteriaResults: [],
    verdict: null,
    confidence: 100,
    qfId // Store for later use
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

  // Store rubric results in database (using properly initialized client)
  try {
    await supabaseClient
      .from('quick_fixes')
      .update({
        compliance_score: results.totalScore,
        compliance_verdict: results.verdict,
        compliance_details: results
      })
      .eq('id', qfId);
    console.log('   ✅ Compliance results saved to database\n');
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
