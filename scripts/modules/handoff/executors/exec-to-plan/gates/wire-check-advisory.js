/**
 * WIRE_CHECK_ADVISORY — Early (non-blocking) wire-reachability check
 * SD-FDBK-ENH-WIRE-CHECK-GATE-002
 *
 * The canonical WIRE_CHECK_GATE (AST call-graph reachability) is registered ONLY
 * in the lead-final-approval executor, so it fires exclusively at the FINAL
 * handoff. A worker that adds a new standalone CLI/script during EXEC but has not
 * yet wired it into package.json scripts or a static caller only discovers the gap
 * as a BLOCKING failure at LEAD-FINAL — forcing a wasteful 2nd PR to wire it in.
 *
 * This gate is the ADVISORY twin at EXEC-TO-PLAN: it runs the SAME reachability
 * analysis but is purely advisory (required:false AND always returns passed:true),
 * surfacing any unreachable new files as an early warning so the worker can wire
 * them in the SAME PR before the blocking LEAD-FINAL gate.
 *
 * Design note (intentional, low-risk): this file REUSES the exported analysis
 * helpers from wire-check-gate.js (discoverEntryPoints, getScopedJsFiles,
 * isExcludedFromWireCheck) and only re-implements the ~20-line orchestration
 * (git diff of new files + build graph + reachability) so that the canonical
 * BLOCKING gate is left completely unchanged (zero regression risk to fleet-wide
 * enforcement + the source-pin tests in tests/unit/gates/wire-check-gate.test.js).
 * The orchestration here must stay in sync with wire-check-gate.js. Follow-up:
 * extract a shared analyzeNewFileReachability() helper used by both gates.
 *
 * Phase: EXEC-TO-PLAN (advisory)
 */

import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildCallGraph } from '../../../../../../lib/static-analysis/call-graph-builder.js';
import { checkReachability } from '../../../../../../lib/static-analysis/reachability-checker.js';
import { getMainRef } from '../../../shared-git-context.js';
import { isVentureRepo } from '../../../../../../lib/repo-paths.js';
import {
  discoverEntryPoints,
  getScopedJsFiles,
  isExcludedFromWireCheck,
  // sibling-import-allowed: advisory leg consumes the CANONICAL wire-check engine whole — same implementation at two phases, no policy fork to drift (SD-PAT-FIX-WRITER-CONSUMER-ASYMMETRY-001)
} from '../../lead-final-approval/gates/wire-check-gate.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../../../../../');

const GATE_NAME = 'WIRE_CHECK_ADVISORY';

/**
 * Remediation message appended to every unreachable-file advisory warning.
 */
const REMEDIATION =
  'Wire each file into package.json scripts (e.g. "audit:x": "node scripts/x.js") ' +
  'or import it from a statically-reachable caller — in the SAME PR. Otherwise the ' +
  'blocking WIRE_CHECK_GATE will fail this SD at LEAD-FINAL and force a 2nd PR.';

/**
 * Create the advisory wire-check gate for EXEC-TO-PLAN.
 *
 * Always non-blocking: required:false (BaseExecutor will not block) and the
 * validator always returns passed:true (double-safe). Findings are surfaced via
 * console output + the warnings[] array (ValidationOrchestrator aggregates these).
 *
 * @param {Object} _supabase - Supabase client (unused; kept for gate interface consistency)
 * @returns {Object} Gate definition
 */
export function createWireCheckAdvisoryGate(_supabase) {
  return {
    name: GATE_NAME,
    required: false, // ADVISORY — never blocks the handoff
    validator: async (ctx) => {
      console.log('\n🔌 GATE: Wire Check (ADVISORY — early reachability warning)');
      console.log('-'.repeat(50));

      const cleanPass = (warnings = []) => ({
        passed: true,
        score: 100,
        max_score: 100,
        issues: [],
        warnings,
      });

      // Venture opt-out parity with the blocking gate: EHG_Engineer-rooted
      // reachability is not meaningful for a separate venture repo.
      const sd = ctx?.sd || {};
      if (isVentureRepo(sd.target_application) && sd?.metadata?.wiring_required !== true) {
        console.log(`   ⏭️  Venture SD (target_application=${sd.target_application}) — advisory wire-check skipped.`);
        return cleanPass();
      }

      const rootDir = ROOT_DIR;

      // Step 1: new files from git diff (added only), mirroring wire-check-gate.js.
      const refResult = getMainRef({ cwd: rootDir });
      const mainRef = refResult.ref;
      let newFiles = [];
      try {
        const diff = execSync(
          `git diff --name-only --diff-filter=A ${mainRef}...HEAD -- "*.js" "*.mjs" "*.cjs"`,
          { encoding: 'utf8', cwd: rootDir, timeout: 10000 }
        );
        newFiles = diff
          .split('\n')
          .map((f) => f.trim())
          .filter(Boolean)
          .filter((f) => f.startsWith('lib/') || f.startsWith('scripts/'))
          .filter((f) => !f.includes('/tmp-') && !f.includes('/.tmp-'))
          .map((f) => f.replace(/\\/g, '/'))
          .filter((f) => !isExcludedFromWireCheck(f));
      } catch (err) {
        // ADVISORY: unlike the blocking gate (which fails closed), a diff failure
        // here must NOT block — surface it as a warning and pass.
        const message = err?.message || String(err);
        console.log(`   ⚠️  Could not compute git diff against ${mainRef}: ${message} (advisory — passing)`);
        return cleanPass([`WIRE_CHECK_ADVISORY could not compute git diff against ${mainRef}: ${message}`]);
      }

      if (newFiles.length === 0) {
        console.log('   No new JS files in lib/ or scripts/ — nothing to advise.');
        return cleanPass();
      }

      console.log(`   New files to check: ${newFiles.length}`);

      // Step 2-4: discover entries, build graph, check reachability (reused helpers).
      const entryPoints = discoverEntryPoints(rootDir);
      const allFiles = getScopedJsFiles(rootDir);
      let graph;
      try {
        ({ graph } = buildCallGraph(allFiles, rootDir));
      } catch (err) {
        const message = err?.message || String(err);
        console.log(`   ⚠️  Call-graph build failed: ${message} (advisory — passing)`);
        return cleanPass([`WIRE_CHECK_ADVISORY could not build call graph: ${message}`]);
      }

      const absoluteNewFiles = newFiles.map((f) =>
        path.resolve(rootDir, f).replace(/\\/g, '/')
      );
      const { reachable, unreachable } = checkReachability(graph, entryPoints, absoluteNewFiles);

      console.log(`   Reachable: ${reachable.size}/${absoluteNewFiles.length}`);

      if (unreachable.size === 0) {
        console.log('   ✅ All new files are already reachable — no wiring needed.');
        return cleanPass();
      }

      const unreachableRelative = [...unreachable].map((f) =>
        path.relative(rootDir, f).replace(/\\/g, '/')
      );

      console.log(`   ⚠️  ADVISORY: ${unreachable.size} new file(s) not yet reachable from any entry point:`);
      for (const f of unreachableRelative) {
        console.log(`     - ${f}`);
      }
      console.log(`   → ${REMEDIATION}`);

      return cleanPass([
        `${unreachable.size} new file(s) not yet reachable from any entry point (advisory — will BLOCK at LEAD-FINAL if not wired):`,
        ...unreachableRelative.map((f) => `  - ${f}`),
        REMEDIATION,
      ]);
    },
  };
}
