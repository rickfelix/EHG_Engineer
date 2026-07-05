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
import { classifyMachineryClass } from '../../../../../../lib/machinery-class/classify.js';
import { isOrchestratorSync } from '../../../../../../lib/sd/type-detection.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../../../../../');

const GATE_NAME = 'INVOCATION_PATH_PROOF';

function safeRead(absPath) {
  try { return fs.readFileSync(absPath, 'utf8'); } catch { return ''; }
}

/**
 * SD-LEO-INFRA-INVOCATION-PATH-PROOF-001-D (FR-4): rollout mode resolver.
 * -C shipped the gate HARD-BLOCKING, which can mass-fail existing SDs on day one before the
 * wired-to-fire discipline is adopted. Resolve a warn-first ADVISORY default that surfaces
 * violations WITHOUT failing, promotable to BLOCK via INVOCATION_PATH_PROOF_MODE=block.
 * @param {object} [env] @returns {'advisory'|'block'}
 */
export function resolveInvocationMode(env = process.env) {
  return (env && env.INVOCATION_PATH_PROOF_MODE) === 'block' ? 'block' : 'advisory';
}

/**
 * SD-LEO-INFRA-DEFINITION-DONE-ACTIVATION-001 (G3, FR-1): activation-evidence rollout mode
 * resolver. Mirrors resolveInvocationMode's advisory-first precedent — a brand-new blocking
 * requirement must not mass-fail every in-flight machinery-class SD on day one. Advisory
 * (default) surfaces the finding as a warning; ACTIVATION_EVIDENCE_MODE=block promotes to a
 * hard fail once the classifier has been validated against real traffic (FR-6 retro sweep).
 * @param {object} [env] @returns {'advisory'|'block'}
 */
export function resolveActivationEvidenceMode(env = process.env) {
  return (env && env.ACTIVATION_EVIDENCE_MODE) === 'block' ? 'block' : 'advisory';
}

/**
 * G3 FR-1: classify a machinery-class SD's activation state.
 * - UNWIRED: machinery-class, not an orchestrator parent, no ACTIVATED evidence, no ARMED
 *   registration. The state the amended DoD blocks (in 'block' mode) or warns on (advisory).
 * - ACTIVATED: a real (non-replayed-fixture) event-processed evidence row exists.
 * - ARMED: no real-event evidence yet, but a liveness-watch registration exists (legitimate
 *   pre-fire state — the trigger structurally cannot have fired yet).
 * - not_applicable: non-machinery SD, or an orchestrator parent (FR-5 exemption).
 *
 * PURE: takes the classification + evidence booleans as arguments so the DB lookups
 * (checkActivationEvidence/checkArmedRegistration) can be injected/mocked in tests.
 *
 * @param {object} sd
 * @param {{ hasActivatedEvidence: boolean, hasArmedRegistration: boolean }} evidence
 * @returns {{ state: 'not_applicable'|'UNWIRED'|'ACTIVATED'|'ARMED', machineryKind: string }}
 */
export function evaluateActivationEvidence(sd, evidence = {}) {
  if (isOrchestratorSync(sd)) return { state: 'not_applicable', machineryKind: 'none', reason: 'orchestrator_parent_exempt' };
  const classification = classifyMachineryClass(sd);
  if (!classification.machineryClass) return { state: 'not_applicable', machineryKind: 'none', reason: 'not_machinery_class' };
  if (evidence.hasActivatedEvidence) return { state: 'ACTIVATED', machineryKind: classification.kind };
  if (evidence.hasArmedRegistration) return { state: 'ARMED', machineryKind: classification.kind };
  return { state: 'UNWIRED', machineryKind: classification.kind };
}

/**
 * G3 FR-3: does this SD have >=1 REAL (not replayed-fixture) activation-evidence row in
 * scope_completion_chain? Reuses the existing generic completion-chain table (entity_type
 * IN ('sd','child_sd')) rather than bypass_ledger — bypass_ledger's every row represents an
 * actual bypass event (bypass_type/bypass_reason NOT NULL); forcing G3 evidence through it
 * would misuse a narrowly-scoped audit ledger for an unrelated purpose. Fail-open (false) on
 * any query error — a DB hiccup must not itself manufacture a false UNWIRED verdict beyond
 * what advisory mode already tolerates.
 * @param {object} supabase
 * @param {object} sd
 * @returns {Promise<boolean>}
 */
export async function checkActivationEvidence(supabase, sd) {
  try {
    // entity_id references strategic_directives_v2's own PRIMARY KEY (sd.id) — the canonical
    // UUID identity, not sd_key (TEXT) or the secondary uuid_id field.
    const entityId = sd?.id;
    if (!entityId) return false;
    const { data, error } = await supabase
      .from('scope_completion_chain')
      .select('id')
      .in('entity_type', ['sd', 'child_sd'])
      .eq('entity_id', entityId)
      .eq('evidence_kind', 'real_event')
      .not('runtime_observed_at', 'is', null)
      .limit(1);
    if (error) return false;
    return Array.isArray(data) && data.length > 0;
  } catch {
    return false;
  }
}

/**
 * G3 FR-4: does this SD have an ARMED liveness-watch registration in
 * periodic_process_registry? Reuses the existing table's liveness_source_ref JSONB column
 * for SD linkage — no new table, no schema change. Fail-open (false) on any query error.
 * periodic_process_registry's PRIMARY KEY is process_key (TEXT) — the table has NO `id`
 * column, so the select below must reference the real key.
 * @param {object} supabase
 * @param {object} sd
 * @returns {Promise<boolean>}
 */
export async function checkArmedRegistration(supabase, sd) {
  try {
    const sdKey = sd?.sd_key || sd?.id;
    if (!sdKey) return false;
    const { data, error } = await supabase
      .from('periodic_process_registry')
      .select('process_key')
      .contains('liveness_source_ref', { sd_key: sdKey })
      .limit(1);
    if (error) return false;
    return Array.isArray(data) && data.length > 0;
  } catch {
    return false;
  }
}

/**
 * PURE verdict resolver: turn a violations result + mode into the gate verdict.
 * - no violations  -> PASS (both modes)
 * - violations + advisory -> PASS, violations surfaced as WARNINGS (enforcement opt-in)
 * - violations + block    -> FAIL (passed:false) with issues + remediation (the -C behavior)
 * @param {{violations:Array, autonomousChecked:number}} evalResult
 * @param {'advisory'|'block'} mode
 * @param {string[]} remediation
 */
export function resolveInvocationVerdict(evalResult, mode, remediation = []) {
  const violations = (evalResult && evalResult.violations) || [];
  const autonomousChecked = (evalResult && evalResult.autonomousChecked) || 0;
  if (violations.length === 0) {
    return { passed: true, score: 100, max_score: 100, issues: [], warnings: [], details: { mode, autonomousChecked, violations: 0 } };
  }
  const lines = violations.map((v) => `  - ${v.file} (${v.requires_reason})`);
  const headline = `${violations.length} autonomous-runnable file(s) ship without a live production trigger:`;
  if (mode === 'block') {
    return {
      passed: false, score: 0, max_score: 100,
      issues: [headline, ...lines, ...remediation],
      warnings: [],
      details: { mode, autonomousChecked, violations: violations.length, violationFiles: violations.map((v) => v.file) },
    };
  }
  // advisory (default): warn, do not fail — so the gate cannot mass-fail existing SDs during rollout.
  return {
    passed: true, score: 100, max_score: 100,
    issues: [],
    warnings: [
      `[ADVISORY] ${headline}`,
      ...lines,
      'Enforcement is opt-in: set INVOCATION_PATH_PROOF_MODE=block to FAIL on these. See docs/protocol/invocation-path-proof.md.',
    ],
    details: { mode, autonomousChecked, violations: violations.length, violationFiles: violations.map((v) => v.file) },
  };
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
 * G3 FR-1: merge the (always-computed) activation-evidence verdict into whichever
 * early-return path the existing invocation-path logic takes below. Additive only —
 * never removes an existing issue/warning, never flips passed:true to false unless the
 * activation verdict itself blocks.
 * @param {{passed:boolean, score:number, max_score:number, issues:string[], warnings:string[], details?:object}} base
 * @param {{passed:boolean, issues:string[], warnings:string[], details?:object}} activation
 */
function mergeActivationVerdict(base, activation) {
  if (!activation || (activation.issues.length === 0 && activation.warnings.length === 0)) return base;
  return {
    ...base,
    passed: base.passed && activation.passed,
    score: activation.passed ? base.score : 0,
    issues: [...base.issues, ...activation.issues],
    warnings: [...base.warnings, ...activation.warnings],
    details: { ...(base.details || {}), activationEvidence: activation.details },
  };
}

/**
 * G3 FR-1/FR-3/FR-4/FR-5: compute the activation-evidence verdict for this SD. Runs
 * independently of the file-diff logic below (a machinery-class SD may need this check
 * even on a PR that touches no scripts/lib files, e.g. a wiring-only follow-up). Async
 * DB lookups are fail-open (never throw); advisory mode never fails the gate.
 * @param {object} supabase
 * @param {object} sd
 * @returns {Promise<{passed:boolean, issues:string[], warnings:string[], details:object}>}
 */
async function computeActivationEvidenceVerdict(supabase, sd) {
  const evaluation = evaluateActivationEvidence(sd, {});
  if (evaluation.state === 'not_applicable') {
    return { passed: true, issues: [], warnings: [], details: { state: 'not_applicable', reason: evaluation.reason } };
  }
  let hasActivatedEvidence = false;
  let hasArmedRegistration = false;
  if (supabase) {
    [hasActivatedEvidence, hasArmedRegistration] = await Promise.all([
      checkActivationEvidence(supabase, sd),
      checkArmedRegistration(supabase, sd),
    ]);
  }
  const finalState = evaluateActivationEvidence(sd, { hasActivatedEvidence, hasArmedRegistration });
  const mode = resolveActivationEvidenceMode();
  console.log(`   Machinery-class (${finalState.machineryKind}): activation state = ${finalState.state}`);
  if (finalState.state !== 'UNWIRED') {
    return { passed: true, issues: [], warnings: [], details: finalState };
  }
  const headline = `Machinery-class deliverable (${finalState.machineryKind}) has no ACTIVATED evidence and no ARMED registration (G3 Definition-of-Done amendment).`;
  const remediation = 'Record a scope_completion_chain evidence row (evidence_kind=real_event, runtime_observed_at set) once a real event is processed, OR register a periodic_process_registry row (liveness_source_ref.sd_key) with a named activation trigger if real events cannot occur yet.';
  if (mode === 'block') {
    return { passed: false, issues: [headline, remediation], warnings: [], details: finalState };
  }
  return { passed: true, issues: [], warnings: [`[ADVISORY] ${headline} ${remediation} Set ACTIVATION_EVIDENCE_MODE=block to enforce.`], details: finalState };
}

/**
 * Create the invocation-path proof gate.
 * @param {Object} supabase - service-role client; used by the G3 activation-evidence check
 * @returns {Object} Gate definition
 */
export function createInvocationPathGate(supabase) {
  return {
    name: GATE_NAME,
    validator: async (ctx) => {
      console.log('\n🔌 GATE: Invocation-Path Proof (autonomous code must be wired to fire)');
      console.log('-'.repeat(50));

      const sd = ctx?.sd || {};
      const activationVerdict = await computeActivationEvidenceVerdict(supabase, sd);

      // Venture opt-out: the detector's trigger sources (GHA workflows, package.json, the
      // loop-contract registry) are EHG_Engineer-rooted, so a venture-targeted SD's separate repo
      // would not resolve meaningfully here. Opt out unless the SD forces wiring. (Mirrors WIRE_CHECK.)
      // The G3 activation-evidence check above is NOT repo-scoped (its DB tables are
      // EHG_Engineer-native regardless of target_application), so it still applies here.
      if (isVentureRepo(sd.target_application) && sd?.metadata?.wiring_required !== true) {
        console.log(`   ⏭️  Venture SD (target_application=${sd.target_application}) — INVOCATION_PATH_PROOF opted out (set metadata.wiring_required=true to force).`);
        return mergeActivationVerdict(
          { passed: true, score: 100, max_score: 100, issues: [], warnings: [`INVOCATION_PATH_PROOF skipped for venture target_application=${sd.target_application}`], details: { skipped: 'venture_opt_out' } },
          activationVerdict
        );
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
        return mergeActivationVerdict(
          { passed: true, score: 100, max_score: 100, issues: [], warnings: [`INVOCATION_PATH_PROOF could not compute git diff (fail-open): ${message}`], details: { mainRef, error: message } },
          activationVerdict
        );
      }

      if (changed.length === 0) {
        console.log('   No changed JS in scripts/ or lib/ — auto-pass');
        return mergeActivationVerdict({ passed: true, score: 100, max_score: 100, issues: [], warnings: [] }, activationVerdict);
      }

      // Step 2: load the live trigger sources ONCE, then classify+detect per file.
      let sources;
      try {
        sources = await loadTriggerSources(ROOT_DIR, { includeParentShell: true });
      } catch (err) {
        const message = err?.message || String(err);
        console.log(`   ⚠️  trigger-source load failed — fail-open (advisory): ${message}`);
        return mergeActivationVerdict(
          { passed: true, score: 100, max_score: 100, issues: [], warnings: [`INVOCATION_PATH_PROOF could not load trigger sources (fail-open): ${message}`], details: { error: message } },
          activationVerdict
        );
      }

      const { violations, autonomousChecked } = evaluateInvocationViolations(
        changed, sources, (f) => safeRead(path.resolve(ROOT_DIR, f))
      );
      for (const v of violations) console.log(`   🚩 ${v.file} — autonomous (${v.requires_reason}) but NO live trigger`);

      console.log(`   Autonomous runners checked: ${autonomousChecked} | violations: ${violations.length}`);

      const remediation = [
        'This SD ships autonomous-runnable code with no live production trigger (WIRED-TO-FIRE). Wire each file with ONE of:',
        '  • A scheduled GitHub Actions workflow (.github/workflows/*.yml with `on: schedule: cron`) whose run: step invokes it (directly or via `npm run`).',
        '  • A loop-contract registry entry (lib/loops/loop-contract-registry.js) PAIRED with a scheduled workflow that wires its entrypoint.',
        '  • A .claude hook registration (.claude/settings.json) if it is a lifecycle hook.',
        '  • A parent script that shells it, or an npm script + workflow.',
        'If the file is NOT actually autonomous (a library/manual CLI/helper), it should not match the FR-2 classifier — verify its name/location (avoid -loop/-cron/-sweep suffix, cron/clockwork dirs, and in-code setInterval/cron unless it truly runs autonomously).',
      ];

      // SD-LEO-INFRA-INVOCATION-PATH-PROOF-001-D (FR-4): advisory-by-default rollout. Advisory surfaces
      // violations as warnings (passed:true); INVOCATION_PATH_PROOF_MODE=block restores -C's hard fail.
      const mode = resolveInvocationMode();
      if (violations.length > 0) console.log(`   Mode: ${mode}${mode === 'advisory' ? ' (advisory — warns, does not fail; set INVOCATION_PATH_PROOF_MODE=block to enforce)' : ' (BLOCKING)'}`);
      return mergeActivationVerdict(resolveInvocationVerdict({ violations, autonomousChecked }, mode, remediation), activationVerdict);
    },
    required: true,
  };
}
