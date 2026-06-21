/**
 * INVOCATION_PATH_PROOF gate — LEAD-FINAL-APPROVAL.
 * SD-LEO-INFRA-INVOCATION-PATH-PROOF-001-C (FR-3).
 *
 * BLOCKS completion when an SD ships AUTONOMOUS-RUNNABLE code (per the FR-2 classifier) that has
 * NO live production trigger (per the FR-1 detector). This is the systemic catch for the
 * months-long "shipped + tested + completed but nothing ever fires it" (WIRED-TO-FIRE) class.
 *
 * Complements WIRE_CHECK_GATE: that gate proves a new file is statically REACHABLE from an entry
 * point; this gate proves an autonomous runner is actually INVOKED by a live trigger. Reachable
 * != invoked.
 *
 * Conservative by construction: the FR-2 classifier only flags genuine autonomous runners
 * (cron/clockwork dir, -loop/-cron/-sweep suffix, loop-contract entrypoint, in-code scheduling),
 * so libraries/tests/manual-CLIs are never flagged. Fail-OPEN on infra/diff errors (a new
 * blocking gate must not false-block on a git/load hiccup) — only a DETECTED violation blocks.
 *
 * Phase: LEAD-FINAL-APPROVAL
 */
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { detectInvocationPath, loadTriggerSources } from '../../../../../../lib/invocation-detector/index.js';
import { classifyRequiresInvocation } from '../../../../../../lib/invocation-detector/requires-invocation.js';
import { getMainRef } from '../../../shared-git-context.js';
import { isVentureRepo } from '../../../../../../lib/repo-paths.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../../../../../');

const GATE_NAME = 'INVOCATION_PATH_PROOF';

function safeRead(absPath) {
  try { return fs.readFileSync(absPath, 'utf8'); } catch { return ''; }
}

/**
 * PURE-ish core: for each changed file, flag a violation when it is autonomous-runnable (FR-2)
 * but has no live trigger (FR-1). Composes the two SSOTs; I/O is injected (readFile), so the
 * decision is unit-testable without git/fs. @returns {{violations:[], autonomousChecked:number}}
 *
 * @param {string[]} changedFiles - repo-relative paths
 * @param {Object} sources - loadTriggerSources() output (pkgScripts/workflows/settings/loopContracts/parentScripts)
 * @param {(file:string)=>string} readFile - returns file content for FR-2 content signals
 */
export function evaluateInvocationViolations(changedFiles, sources, readFile = () => '') {
  const violations = [];
  let autonomousChecked = 0;
  for (const f of changedFiles || []) {
    const content = readFile(f) || '';
    const requires = classifyRequiresInvocation(f, { content, loopContracts: sources?.loopContracts });
    if (!requires.requiresInvocation) continue;
    autonomousChecked++;
    const det = detectInvocationPath(f, sources || {});
    if (!det.invoked) violations.push({ file: f, requires_reason: requires.reason });
  }
  return { violations, autonomousChecked };
}

/**
 * Create the invocation-path proof gate.
 * @param {Object} _supabase - kept for gate-interface consistency (unused)
 * @returns {Object} Gate definition
 */
export function createInvocationPathGate(_supabase) {
  return {
    name: GATE_NAME,
    validator: async (ctx) => {
      console.log('\n🔌 GATE: Invocation-Path Proof (autonomous code must be wired to fire)');
      console.log('-'.repeat(50));

      // Venture opt-out: the detector's trigger sources (GHA workflows, package.json, the
      // loop-contract registry) are EHG_Engineer-rooted, so a venture-targeted SD's separate repo
      // would not resolve meaningfully here. Opt out unless the SD forces wiring. (Mirrors WIRE_CHECK.)
      const sd = ctx?.sd || {};
      if (isVentureRepo(sd.target_application) && sd?.metadata?.wiring_required !== true) {
        console.log(`   ⏭️  Venture SD (target_application=${sd.target_application}) — INVOCATION_PATH_PROOF opted out (set metadata.wiring_required=true to force).`);
        return { passed: true, score: 100, max_score: 100, issues: [], warnings: [`INVOCATION_PATH_PROOF skipped for venture target_application=${sd.target_application}`], details: { skipped: 'venture_opt_out' } };
      }

      // Step 1: ADDED JS in scripts/ & lib/ vs origin/main. Fail-OPEN on diff error.
      // --diff-filter=A (added only, mirrors WIRE_CHECK): a violation must be one this SD
      // INTRODUCED. Flagging a merely-MODIFIED pre-existing un-wired runner would false-block an
      // innocent SD for a wiring gap it did not cause (adversarial HIGH).
      const mainRef = getMainRef({ cwd: ROOT_DIR }).ref;
      let changed = [];
      try {
        const diff = execSync(
          `git diff --name-only --diff-filter=A ${mainRef}...HEAD -- "*.js" "*.mjs" "*.cjs"`,
          { encoding: 'utf8', cwd: ROOT_DIR, timeout: 10000 }
        );
        changed = diff.split('\n').map((f) => f.trim()).filter(Boolean)
          .filter((f) => f.startsWith('scripts/') || f.startsWith('lib/'))
          .filter((f) => !f.includes('/tmp-') && !f.includes('/.tmp-'))
          .map((f) => f.replace(/\\/g, '/'));
      } catch (err) {
        const message = err?.message || String(err);
        console.log(`   ⚠️  git diff against ${mainRef} failed — fail-open (advisory): ${message}`);
        return { passed: true, score: 100, max_score: 100, issues: [], warnings: [`INVOCATION_PATH_PROOF could not compute git diff (fail-open): ${message}`], details: { mainRef, error: message } };
      }

      if (changed.length === 0) {
        console.log('   No changed JS in scripts/ or lib/ — auto-pass');
        return { passed: true, score: 100, max_score: 100, issues: [], warnings: [] };
      }

      // Step 2: load the live trigger sources ONCE, then classify+detect per file.
      let sources;
      try {
        sources = await loadTriggerSources(ROOT_DIR, { includeParentShell: true });
      } catch (err) {
        const message = err?.message || String(err);
        console.log(`   ⚠️  trigger-source load failed — fail-open (advisory): ${message}`);
        return { passed: true, score: 100, max_score: 100, issues: [], warnings: [`INVOCATION_PATH_PROOF could not load trigger sources (fail-open): ${message}`], details: { error: message } };
      }

      const { violations, autonomousChecked } = evaluateInvocationViolations(
        changed, sources, (f) => safeRead(path.resolve(ROOT_DIR, f))
      );
      for (const v of violations) console.log(`   🚩 ${v.file} — autonomous (${v.requires_reason}) but NO live trigger`);

      console.log(`   Autonomous runners checked: ${autonomousChecked} | violations: ${violations.length}`);

      if (violations.length === 0) {
        return { passed: true, score: 100, max_score: 100, issues: [], warnings: [], details: { autonomousChecked, violations: 0 } };
      }

      const remediation = [
        'This SD ships autonomous-runnable code with no live production trigger (WIRED-TO-FIRE). Wire each file with ONE of:',
        '  • A scheduled GitHub Actions workflow (.github/workflows/*.yml with `on: schedule: cron`) whose run: step invokes it (directly or via `npm run`).',
        '  • A loop-contract registry entry (lib/loops/loop-contract-registry.js) PAIRED with a scheduled workflow that wires its entrypoint.',
        '  • A .claude hook registration (.claude/settings.json) if it is a lifecycle hook.',
        '  • A parent script that shells it, or an npm script + workflow.',
        'If the file is NOT actually autonomous (a library/manual CLI/helper), it should not match the FR-2 classifier — verify its name/location (avoid -loop/-cron/-sweep suffix, cron/clockwork dirs, and in-code setInterval/cron unless it truly runs autonomously).',
      ];

      return {
        passed: false,
        score: 0,
        max_score: 100,
        issues: [
          `${violations.length} autonomous-runnable file(s) ship without a live production trigger:`,
          ...violations.map((v) => `  - ${v.file} (${v.requires_reason})`),
          ...remediation,
        ],
        warnings: [],
        details: { autonomousChecked, violations: violations.length, violationFiles: violations.map((v) => v.file) },
      };
    },
    required: true,
  };
}
