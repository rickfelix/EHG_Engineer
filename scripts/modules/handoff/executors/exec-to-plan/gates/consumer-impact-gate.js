/**
 * CONSUMER_IMPACT_ADVISORY — Blast-radius consumer-impact check (Phase 1)
 * SD-LEO-INFRA-FIRST-PARTY-CODEBASE-STRUCTURAL-ANALYSIS-001
 *
 * Given the diff for this handoff, finds every cross-file consumer of
 * modified/removed exported symbols and warns when a consumer was NOT
 * touched in the same diff -- surfacing likely-missed call sites during
 * PR review. Advisory only (required:false, always returns passed:true):
 * a false-positive here must never block a handoff. Mirrors the
 * WIRE_CHECK_ADVISORY / WIRE_CHECK_GATE pairing pattern (freshness,
 * venture opt-out, fail-open on tool errors).
 *
 * Phase: EXEC-TO-PLAN (advisory)
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { computeBlastRadius, formatReport } from '../../../../../../lib/static-analysis/blast-radius.js';
import { getMainRef } from '../../../shared-git-context.js';
import { isVentureRepo } from '../../../../../../lib/repo-paths.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../../../../../');

const GATE_NAME = 'CONSUMER_IMPACT_ADVISORY';

/**
 * Create the advisory consumer-impact gate for EXEC-TO-PLAN.
 *
 * Always non-blocking: required:false (BaseExecutor will not block) and the
 * validator always returns passed:true (double-safe, same convention as
 * WIRE_CHECK_ADVISORY). Findings surface via console output + warnings[].
 *
 * @param {Object} _supabase - Supabase client (unused; kept for gate interface consistency)
 * @returns {Object} Gate definition
 */
export function createConsumerImpactGate(_supabase) {
  return {
    name: GATE_NAME,
    required: false, // ADVISORY — never blocks the handoff
    validator: async (ctx) => {
      console.log('\n🎯 GATE: Consumer Impact (ADVISORY — blast-radius of modified exports)');
      console.log('-'.repeat(50));

      const cleanPass = (warnings = []) => ({
        passed: true,
        score: 100,
        max_score: 100,
        issues: [],
        warnings,
      });

      // Venture opt-out parity with WIRE_CHECK_ADVISORY: this repo's own
      // lib/scripts/server scope isn't meaningful for a separate venture repo.
      const sd = ctx?.sd || {};
      if (isVentureRepo(sd.target_application) && sd?.metadata?.wiring_required !== true) {
        console.log(`   ⏭️  Venture SD (target_application=${sd.target_application}) — consumer-impact check skipped.`);
        return cleanPass();
      }

      const rootDir = ROOT_DIR;
      const refResult = getMainRef({ cwd: rootDir });
      const mainRef = refResult.ref;

      let result;
      try {
        result = computeBlastRadius(mainRef, rootDir);
      } catch (err) {
        // ADVISORY: a tool failure must never block — surface it and pass.
        const message = err?.message || String(err);
        console.log(`   ⚠️  Could not compute blast radius vs ${mainRef}: ${message} (advisory — passing)`);
        return cleanPass([`CONSUMER_IMPACT_ADVISORY could not compute blast radius vs ${mainRef}: ${message}`]);
      }

      const { report, warnings: analysisWarnings, changedFiles } = result;

      if (report.length === 0) {
        console.log('   No modified/removed exported symbols detected — nothing to advise.');
        return cleanPass(analysisWarnings);
      }

      const totalUntouched = report.reduce((sum, e) => sum + e.untouchedConsumers.length, 0);
      console.log(formatReport(report, mainRef, changedFiles));

      if (totalUntouched === 0) {
        console.log('   ✅ All consumers of modified/removed symbols were touched in this diff.');
        return cleanPass(analysisWarnings);
      }

      const flaggedLines = report
        .filter((e) => e.untouchedConsumers.length > 0)
        .flatMap((e) => e.untouchedConsumers.map(
          (c) => `  - ${e.file}::${e.exportName} (${e.changeType}) consumed by ${c.file}:${c.line} [${c.kind}], not touched in this diff`
        ));

      return cleanPass([
        `${totalUntouched} consumer(s) of modified/removed exported symbols were NOT touched in this diff — review before merging:`,
        ...flaggedLines,
        ...analysisWarnings,
      ]);
    },
  };
}
