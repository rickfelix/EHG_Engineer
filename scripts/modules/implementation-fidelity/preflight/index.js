/**
 * Preflight Checks for Implementation Fidelity Validation
 * Part of SD-LEO-REFACTOR-IMPL-FIDELITY-001
 *
 * Non-negotiable blockers that must pass before Phase 2 scoring.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { getSDSearchTerms, gitLogForSD, detectImplementationRepos, EHG_ENGINEER_ROOT, EHG_ROOT } from '../utils/index.js';

const execAsync = promisify(exec);

// SD-LEO-INFRA-PREFLIGHT-AMBIGUITY-LABEL-FP-001:
// The ambiguity patterns below guard 'unclear'/'ambiguous'/etc. with lookarounds that
// exclude only [a-z-] — NOT '/'. So the deliberate classification-label enum
// 'redundant/unclear/orphaned/adequate' (assessment vocabulary, used verbatim in review
// reports) false-trips the 'unclear' marker (harness_backlog f5090617 / 7d1401d8).
// CONSERVATIVELY neutralize ONLY a SLASH-delimited run of 2+ of these KNOWN labels before
// the scan — slash is unambiguous enum syntax. Comma-joined runs are intentionally NOT
// neutralized: a short comma run like 'unclear, redundant' overlaps real prose adjective
// lists, and neutralizing it would open a gate hole on genuine prose.
const CLASSIFICATION_LABELS = '(?:redundant|unclear|orphaned|adequate)';
const CLASSIFICATION_LABEL_ENUM_RE = new RegExp(
  CLASSIFICATION_LABELS + '(?:\\s*/\\s*' + CLASSIFICATION_LABELS + ')+',
  'gi'
);
const LABEL_ENUM_PLACEHOLDER = ' CLASSIFICATION_LABEL_ENUM ';

/**
 * Replace slash-delimited classification-label enum runs (2+ of
 * redundant/unclear/orphaned/adequate) with an inert placeholder so the ambiguity scan
 * does not false-trip on them. Pure: no I/O. A bare prose 'unclear'/'ambiguous' (not
 * inside such a slash run) is untouched and still trips the gate. Comma-joined runs are
 * deliberately left intact (prose-overlap / gate-hole risk).
 * @param {string} text
 * @returns {string}
 */
export function stripClassificationLabelEnums(text) {
  if (!text || typeof text !== 'string') return text;
  return text.replace(CLASSIFICATION_LABEL_ENUM_RE, LABEL_ENUM_PLACEHOLDER);
}

// SD-LEO-FIX-SHIP-ESCAPE-AUDIT-001 (3rd FP family in this scan, after QF-20260527-303
// identifier-case and LABEL-FP-001 classification enums): GENERATED artifact files carry
// third-party DATA, not this SD's decisions — e.g. database/schema-reference-snapshot.json
// reproduces every CHECK constraint in the database verbatim, so a PEER table's enum value
// ('ambiguous' in sms_inbound_log's outcome CHECK) false-trips any SD whose process
// mandates the same-PR snapshot regen. Exclude generated files' diff sections from the
// ambiguity scan; hand-written files are unaffected and still gate.
const AMBIGUITY_SCAN_EXEMPT_FILES = [
  'database/schema-reference-snapshot.json',
];

/**
 * Filter a unified diff down to ADDED lines ('+', excluding '+++' headers) while
 * dropping lines belonging to generated files exempt from the ambiguity scan.
 * File attribution follows '+++ b/<path>' section headers. Pure: no I/O.
 * @param {string} combinedDiff
 * @returns {string}
 */
export function addedLinesForAmbiguityScan(combinedDiff) {
  if (!combinedDiff || typeof combinedDiff !== 'string') return '';
  const kept = [];
  let inExemptFile = false;
  for (const line of combinedDiff.split(/\r?\n/)) {
    if (line.startsWith('+++')) {
      const filePath = line.replace(/^\+\+\+ [ab]\//, '').trim();
      inExemptFile = AMBIGUITY_SCAN_EXEMPT_FILES.some((f) => filePath === f || filePath.endsWith(`/${f}`));
      continue;
    }
    if (line.startsWith('+') && !inExemptFile) kept.push(line);
  }
  return kept.join('\n');
}

/**
 * Run all preflight checks
 *
 * @param {string} sd_id - Strategic Directive ID
 * @param {Object} validation - Validation object to populate
 * @param {Object} supabase - Supabase client
 * @returns {Promise<boolean>} - true if all preflight checks pass
 */
export async function runPreflightChecks(sd_id, validation, supabase) {
  console.log('\n[PHASE 1] Non-Negotiable Blockers...');
  console.log('-'.repeat(60));

  // Check 1: App Directory
  if (!await checkAppDirectory(validation)) {
    return false;
  }

  // Check 2: Ambiguity Resolution
  if (!await checkAmbiguityResolution(sd_id, validation, supabase)) {
    return false;
  }

  // Check 3: Server Restart (skip for bugfix/cosmetic)
  if (!validation.details.bugfix_mode && !validation.details.cosmetic_refactor_mode) {
    if (!await checkServerRestart(sd_id, validation, supabase)) {
      return false;
    }
  } else {
    const skipReason = validation.details.bugfix_mode ? 'Bugfix SD' : 'Cosmetic Refactor SD';
    console.log(`   ℹ️  ${skipReason} - TESTING sub-agent verification SKIPPED`);
    validation.warnings.push(`[PREFLIGHT] TESTING verification skipped for ${skipReason.toLowerCase()}`);
  }

  // Check 4: Stubbed Code (skip for cosmetic)
  if (!validation.details.cosmetic_refactor_mode) {
    if (!await checkStubbedCode(sd_id, validation, supabase)) {
      return false;
    }
  } else {
    console.log('   ℹ️  Cosmetic Refactor SD - Stub detection SKIPPED');
    validation.warnings.push('[PREFLIGHT] Stub detection skipped for cosmetic refactor SD');
  }

  console.log('   ✅ All Phase 1 blockers passed - proceeding to Phase 2 scoring');
  return true;
}

/**
 * Check application directory (NON-NEGOTIABLE #10)
 */
async function checkAppDirectory(validation) {
  console.log('\n[PHASE 1-A] Verifying application directory...');

  try {
    const { stdout: gitRoot } = await execAsync('git rev-parse --show-toplevel');
    const workingDirectory = gitRoot.trim();

    if (workingDirectory === EHG_ROOT) {
      validation.issues.push('[PREFLIGHT] CRITICAL: EXEC worked in wrong codebase (ehg instead of EHG_Engineer)');
      validation.failed_gates.push('APP_DIR_VERIFICATION');
      console.log(`   ❌ Wrong codebase detected: ${workingDirectory}`);
      console.log(`   ⚠️  Expected: ${EHG_ENGINEER_ROOT}`);
      console.log('   ⚠️  NON-NEGOTIABLE: EXEC must work in correct application directory');
      validation.passed = false;
      return false;
    } else if (workingDirectory === EHG_ENGINEER_ROOT) {
      console.log(`   ✅ Correct application directory verified: ${workingDirectory}`);
    } else {
      validation.warnings.push(`[PREFLIGHT] Unexpected working directory: ${workingDirectory}`);
      console.log(`   ⚠️  Unexpected directory: ${workingDirectory}`);
    }
    return true;
  } catch (error) {
    validation.warnings.push(`[PREFLIGHT] Cannot verify application directory: ${error.message}`);
    console.log(`   ⚠️  Cannot verify directory: ${error.message}`);
    return true; // Don't block on verification failure
  }
}

/**
 * Check ambiguity resolution (NON-NEGOTIABLE #11)
 */
async function checkAmbiguityResolution(sd_id, validation, supabase) {
  console.log('\n[PREFLIGHT] Checking for unresolved ambiguities...');

  try {
    const searchTerms = await getSDSearchTerms(sd_id, supabase);
    const implementationRepos = await detectImplementationRepos(sd_id, supabase);
    let combinedDiff = '';
    for (const repo of implementationRepos) {
      try {
        const gitLog = await gitLogForSD(
          `git -C "${repo}" log --all --grep="\${TERM}" --format="%H" -n 1`,
          searchTerms,
          { timeout: 10000 }
        );
        const hash = gitLog.trim().split('\n')[0];
        if (hash) {
          const { stdout: d } = await execAsync(`git -C "${repo}" show ${hash}`);
          combinedDiff += d;
        }
      } catch (_) { /* skip repos without matching commits */ }
    }

    if (combinedDiff) {
      // FR-4 (SD-LEO-INFRA-VENTURE-AWARE-COMPLETION-001): scan ADDED ('+') diff lines
      // ONLY — excluding '+++' file headers — so a marker word present only in a removed
      // or context line no longer false-positives this preflight check.
      // CRLF-safe (crongenius autocrlf=true). Multi-repo combinedDiff handled (concatenated).
      // SD-LEO-FIX-SHIP-ESCAPE-AUDIT-001: generated-artifact file sections (schema
      // snapshot) are excluded — their content is reproduced database DATA, not decisions.
      const diff = addedLinesForAmbiguityScan(combinedDiff);

      // QF-20260527-303: tighten ambiguity patterns to avoid identifier-context
      // false positives. The prior /ambiguous/gi matched ESLint rule names like
      // 'no-ambiguous-locators' even though those are deliberate config strings,
      // not ambiguity markers. Word-boundary lookarounds exclude hyphen and
      // letter neighbors so identifier-cased usages (kebab-case, camelCase,
      // snake_case via `_` not present in `[a-z-]`) no longer trigger. Witnessed
      // blocking SD-EVA-SUPPORT-CLI-SKILL-ORCH-001-C EXEC-TO-PLAN.
      const ambiguityPatterns = [
        /TODO:.*\?/gi,
        /FIXME/gi,
        /HACK/gi,
        /(?<![a-z-])not sure(?![a-z-])/gi,
        /(?<![a-z-])unclear(?![a-z-])/gi,
        /(?<![a-z-])ambiguous(?![a-z-])/gi,
        /\?\?\?/g,
        /(?<![a-z-])need to ask(?![a-z-])/gi,
        /(?<![a-z-])don't know(?![a-z-])/gi
      ];

      // SD-LEO-INFRA-PREFLIGHT-AMBIGUITY-LABEL-FP-001: neutralize slash-delimited
      // classification-label enums before scanning, so a deliberate assessment-vocabulary
      // run (e.g. redundant/unclear/orphaned/adequate) no longer false-trips. Bare prose
      // 'unclear'/'ambiguous' (and comma-joined runs) are untouched and still gate.
      const scannableDiff = stripClassificationLabelEnums(diff);

      const foundAmbiguities = [];
      for (const pattern of ambiguityPatterns) {
        const matches = scannableDiff.match(pattern);
        if (matches) {
          foundAmbiguities.push(...matches);
        }
      }

      if (foundAmbiguities.length > 0) {
        validation.issues.push(`[PREFLIGHT] CRITICAL: Unresolved ambiguities found in code (${foundAmbiguities.length} instances)`);
        validation.failed_gates.push('AMBIGUITY_RESOLUTION');
        validation.details.unresolved_ambiguities = foundAmbiguities;
        console.log(`   ❌ Found ${foundAmbiguities.length} unresolved ambiguity marker(s)`);
        console.log(`   Examples: ${foundAmbiguities.slice(0, 3).join(', ')}`);
        console.log('   ⚠️  NON-NEGOTIABLE: All ambiguities must be resolved before handoff');
        validation.passed = false;
        return false;
      } else {
        console.log('   ✅ No unresolved ambiguity markers found in implementation');
      }
    } else {
      validation.warnings.push('[PREFLIGHT] Cannot find commit for SD - skipping ambiguity check');
      console.log('   ⚠️  Cannot find commit for ambiguity verification');
    }
    return true;
  } catch (error) {
    validation.warnings.push(`[PREFLIGHT] Cannot verify ambiguity resolution: ${error.message}`);
    console.log(`   ⚠️  Cannot verify ambiguity resolution: ${error.message}`);
    return true;
  }
}

/**
 * Check server restart verification (NON-NEGOTIABLE #14)
 */
async function checkServerRestart(sd_id, validation, supabase) {
  console.log('\n[PREFLIGHT] Verifying server restart and manual testing...');

  try {
    const { data: testingResults, error: testingError } = await supabase
      .from('sub_agent_execution_results')
      .select('verdict, metadata, created_at')
      .eq('sd_id', sd_id)
      .eq('sub_agent_code', 'TESTING')
      .order('created_at', { ascending: false })
      .limit(1);

    if (testingError) {
      validation.warnings.push('[PREFLIGHT] Cannot query TESTING sub-agent for server verification');
      console.log('   ⚠️  Cannot verify server restart (TESTING query failed)');
    } else if (!testingResults || testingResults.length === 0) {
      validation.issues.push('[PREFLIGHT] CRITICAL: No TESTING execution found - cannot verify server was restarted and working');
      validation.failed_gates.push('SERVER_RESTART_VERIFICATION');
      console.log('   ❌ TESTING sub-agent not executed - server restart not verified');
      console.log('   ⚠️  NON-NEGOTIABLE: EXEC must restart server, run tests, and verify implementation works');
      validation.passed = false;
      return false;
    } else {
      const testingResult = testingResults[0];

      if (testingResult.verdict === 'PASS') {
        console.log('   ✅ Server verified operational (TESTING sub-agent passed)');
        console.log(`   ✅ Tests executed at: ${testingResult.created_at}`);
      } else if (testingResult.verdict === 'BLOCKED') {
        validation.issues.push('[PREFLIGHT] CRITICAL: TESTING failed - server may not be working correctly');
        validation.failed_gates.push('SERVER_RESTART_VERIFICATION');
        console.log('   ❌ TESTING failed - implementation not verified as working');
        console.log('   ⚠️  NON-NEGOTIABLE: EXEC must ensure server restarts cleanly and tests pass');
        validation.passed = false;
        return false;
      } else {
        validation.warnings.push('[PREFLIGHT] TESTING verdict is CONDITIONAL_PASS - server verification incomplete');
        console.log('   ⚠️  TESTING inconclusive - server restart verification unclear');
      }
    }
    return true;
  } catch (error) {
    validation.warnings.push(`[PREFLIGHT] Cannot verify server restart: ${error.message}`);
    console.log(`   ⚠️  Cannot verify server restart: ${error.message}`);
    return true;
  }
}

/**
 * Check for stubbed/incomplete code (NON-NEGOTIABLE #20)
 */
async function checkStubbedCode(sd_id, validation, supabase) {
  console.log('\n[PREFLIGHT] Checking for stubbed/incomplete code...');

  try {
    const searchTerms = await getSDSearchTerms(sd_id, supabase);
    const implementationRepos = await detectImplementationRepos(sd_id, supabase);
    let combinedDiff = '';
    for (const repo of implementationRepos) {
      try {
        const gitLog = await gitLogForSD(
          `git -C "${repo}" log --all --grep="\${TERM}" --format="%H" -n 1`,
          searchTerms,
          { timeout: 10000 }
        );
        const hash = gitLog.trim().split('\n')[0];
        if (hash) {
          const { stdout: d } = await execAsync(`git -C "${repo}" show ${hash}`);
          combinedDiff += d;
        }
      } catch (_) { /* skip repos without matching commits */ }
    }

    if (combinedDiff) {
      // FR-4 (SD-LEO-INFRA-VENTURE-AWARE-COMPLETION-001): same added-lines-only fix as the
      // scan above — a commit that REMOVES a stub marker must not false-positive on the
      // removed line. Scan '+' added lines only (exclude '+++' headers).
      // SD-LEO-FIX-SHIP-ESCAPE-AUDIT-001: generated-artifact file sections (schema
      // snapshot) are excluded — their content is reproduced database DATA, not decisions.
      const diff = addedLinesForAmbiguityScan(combinedDiff);

      const stubbedCodePatterns = [
        /throw new Error\(['"]not implemented/gi,
        /throw new Error\(['"]TODO/gi,
        /return null;?\s*\/\/\s*TODO/gi,
        /return undefined;?\s*\/\/\s*TODO/gi,
        /TODO:\s*implement/gi,
        /stub(bed)?Function/gi,
        /(?<!=["'])\bplaceholder\b(?:\s+(?:function|implementation|code|data|value)|$)/gi,
        /temporary implementation/gi,
        /console\.log\(['"]TODO/gi,
        /\/\/\s*STUB:/gi,
        /\/\*\s*STUB\s*\*\//gi,
        /function\s+\w+\([^)]*\)\s*\{\s*\}/g,
        /const\s+\w+\s*=\s*\([^)]*\)\s*=>\s*\{\s*\}/g,
        /return\s*\{\s*\};?\s*\/\/\s*(stub|todo|placeholder)/gi
      ];

      const foundStubs = [];
      const foundLines = new Set();

      for (const pattern of stubbedCodePatterns) {
        const matches = diff.match(pattern);
        if (matches) {
          for (const match of matches) {
            const lines = diff.split('\n');
            for (const line of lines) {
              if (line.startsWith('+') && line.includes(match.trim())) {
                const cleanedLine = line.substring(1).trim();
                if (!foundLines.has(cleanedLine)) {
                  foundLines.add(cleanedLine);
                  foundStubs.push(cleanedLine);
                }
              }
            }
          }
        }
      }

      if (foundStubs.length > 0) {
        validation.issues.push(`[PREFLIGHT] CRITICAL: Stubbed/incomplete code detected (${foundStubs.length} instances)`);
        validation.failed_gates.push('STUBBED_CODE_DETECTION');
        validation.details.stubbed_code = foundStubs;
        console.log(`   ❌ Found ${foundStubs.length} stubbed/incomplete code pattern(s)`);
        console.log(`   Examples: ${foundStubs.slice(0, 3).join(' | ')}`);
        console.log('   ⚠️  NON-NEGOTIABLE: All code must be fully implemented before handoff');
        validation.passed = false;
        return false;
      } else {
        console.log('   ✅ No stubbed or incomplete code patterns detected');
      }
    } else {
      validation.warnings.push('[PREFLIGHT] Cannot find commit for SD - skipping stub detection');
      console.log('   ⚠️  Cannot find commit for stub detection');
    }
    return true;
  } catch (error) {
    validation.warnings.push(`[PHASE 1] Cannot detect stubbed code: ${error.message}`);
    console.log(`   ⚠️  Cannot detect stubbed code: ${error.message}`);
    return true;
  }
}
