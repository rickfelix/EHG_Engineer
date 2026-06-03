/**
 * Post-Completion Tail Populator
 * SD-LEO-INFRA-AUTO-ENFORCE-POST-001 (FR-001)
 *
 * Runs at LEAD-FINAL-APPROVAL completion. Records the canonical post-completion
 * "ceremony" tail (/document, /heal, /learn) that this SD type requires, into
 * <main-repo>/.claude/post-completion-pending.json, so the Stop hook
 * (scripts/hooks/post-completion-tail-enforcement.cjs) can nudge the session
 * to run whatever has not yet run — instead of the tail being silently dropped
 * on the raw `handoff.js execute LEAD-FINAL-APPROVAL` path (it only runs inside
 * the /leo complete skill flow).
 *
 * Single source of truth: the required steps come from
 * lib/utils/post-completion-requirements.js (getPostCompletionRequirementsFromSD),
 * NOT a hardcoded copy. That module already encodes type rules (document for all
 * non-orchestrator SDs; heal/learn for full-sequence types) and the
 * LEARN_SKIP_SOURCES / HEAL_SKIP_SOURCES recursion guards.
 *
 * Fail-safe: never throws; the caller wraps in try/catch and treats any error
 * as non-blocking. Writing nothing is always a safe outcome.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getPostCompletionRequirementsFromSD } from '../../../../../../lib/utils/post-completion-requirements.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CEREMONY_STEPS = ['document', 'heal', 'learn'];

/**
 * Resolve the MAIN repo root so the state file lands where the Stop hook reads
 * it (<main>/.claude/), regardless of whether the handoff ran from main or a
 * worktree. Order: CLAUDE_PROJECT_DIR → git common-dir parent → module walk-up.
 * @returns {string}
 */
function resolveMainRepoRoot() {
  if (process.env.POST_COMPLETION_TEST_ROOT) return process.env.POST_COMPLETION_TEST_ROOT; // hermetic tests
  if (process.env.CLAUDE_PROJECT_DIR) return process.env.CLAUDE_PROJECT_DIR;
  try {
    // From any worktree, --git-common-dir points at <main>/.git
    const { execSync } = require('node:child_process');
    const common = execSync('git rev-parse --git-common-dir', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 5000,
    }).trim();
    if (common) {
      const abs = path.isAbsolute(common) ? common : path.resolve(process.cwd(), common);
      return path.dirname(abs); // parent of .git
    }
  } catch {
    /* git unavailable — fall through */
  }
  // hooks → lead-final-approval → executors → handoff → modules → scripts → ROOT
  return path.resolve(__dirname, '..', '..', '..', '..', '..', '..');
}

/**
 * Is AUTO-PROCEED ON? Absent state file ⇒ ON (default), matching the hooks.
 * When OFF, continuation already pauses, so no nudge is recorded.
 */
function autoProceedOn(root) {
  try {
    const p = path.join(root, '.claude', 'auto-proceed-state.json');
    if (!fs.existsSync(p)) return true;
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    return j.auto_proceed !== false;
  } catch {
    return true;
  }
}

/**
 * @param {Object} sd - The completing SD (needs sd_type, source, scope, id, sd_key)
 * @param {Object} [_supabase] - unused; accepted for hook-signature symmetry
 * @returns {Promise<{written: boolean, pending: string[], reason?: string}>}
 */
export async function runPostCompletionTailPopulator(sd, _supabase) {
  const root = resolveMainRepoRoot();
  const stateFile = path.join(root, '.claude', 'post-completion-pending.json');

  // AUTO-PROCEED OFF ⇒ don't record a nudge (continuation pauses anyway).
  if (!autoProceedOn(root)) {
    return { written: false, pending: [], reason: 'auto_proceed_off' };
  }

  // Canonical required tail for this SD type/source (single source of truth).
  const reqs = getPostCompletionRequirementsFromSD(sd);
  const pending = CEREMONY_STEPS.filter((step) => reqs[step] === true);

  if (pending.length === 0) {
    // Nothing to nudge (e.g. orchestrator, or a skip-source SD). Clear any stale
    // file so we don't nag about a prior SD.
    try { if (fs.existsSync(stateFile)) fs.unlinkSync(stateFile); } catch { /* ignore */ }
    return { written: false, pending: [], reason: 'no_ceremony_steps' };
  }

  const record = {
    sd_key: sd.sd_key || sd.id || null,
    sd_id: sd.id || null,
    sd_type: (sd.sd_type || 'feature').toLowerCase(),
    completed_at: new Date().toISOString(),
    pending,
    session_id: process.env.CLAUDE_SESSION_ID || null,
  };

  try {
    fs.mkdirSync(path.dirname(stateFile), { recursive: true });
    fs.writeFileSync(stateFile, JSON.stringify(record, null, 2));
  } catch (err) {
    return { written: false, pending, reason: `write_failed:${err.message}` };
  }

  return { written: true, pending };
}

export default { runPostCompletionTailPopulator };
