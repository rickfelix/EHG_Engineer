#!/usr/bin/env node
/**
 * post-completion-tail-enforcement
 *
 * Stop hook: when an SD has just completed via LEAD-FINAL-APPROVAL and its
 * canonical post-completion tail (/document, /heal, /learn) has NOT yet run,
 * emit a high-visibility system reminder telling the model to run the
 * remaining steps NOW as CONTINUATION (not a pause point, not something to ask
 * permission for).
 *
 * The obligation is recorded by the LEAD-FINAL-APPROVAL executor populator
 * (scripts/modules/handoff/executors/lead-final-approval/hooks/post-completion-tail-populator.js)
 * into .claude/post-completion-pending.json. This hook reads that file, clears
 * steps for which evidence now exists (learning_runs row for /learn; a
 * /document, /heal, or /leo complete skill invocation in the transcript for the
 * others), rewrites/deletes the file, and reminds on whatever remains.
 *
 * Fail-safe contract (mirrors auto-proceed-pause-lint.cjs / post-ship-enforcement.cjs):
 *   - Never throws to the caller; all errors degrade to a no-op.
 *   - NEVER returns decision:block — reminder-only, so it can never trap a session.
 *   - Cheap on the common path: if the pending file is absent, exit 0 immediately
 *     with no DB query and no transcript read.
 *
 * Wired in .claude/settings.json under "Stop".
 *
 * SD-LEO-INFRA-AUTO-ENFORCE-POST-001 (FR-002).
 */

const fs = require('fs');
const path = require('path');

// The hook file physically lives at <main-repo>/scripts/hooks/, loaded by
// settings.json via ${CLAUDE_PROJECT_DIR}. So __dirname is ALWAYS the main
// repo's scripts/hooks — resolving the state path here is cwd-independent and
// needs no git call (keeps the common-path no-op cheap).
// POST_COMPLETION_TEST_ROOT overrides the repo-root anchor for hermetic tests.
const ROOT = process.env.POST_COMPLETION_TEST_ROOT || path.resolve(__dirname, '..', '..');
const STATE_FILE = path.join(ROOT, '.claude', 'post-completion-pending.json');

// Safety drain: a pending file older than this is considered abandoned (session
// crashed / moved on) and is cleared without nagging forever.
const MAX_AGE_MS = 6 * 60 * 60 * 1000; // 6h

// ── Clean shutdown — Windows libuv UV_HANDLE_CLOSING avoidance ────────────────
// When 'learn' is pending, learnRanInDb() opens an undici/fetch keep-alive socket
// (Supabase). Calling process.exit() afterward aborts on Windows: it forces libuv
// loop teardown while a socket/threadpool completion calls uv_async_send() on a
// handle already flagged UV_HANDLE_CLOSING → "Assertion failed: !(handle->flags &
// UV_HANDLE_CLOSING), file src\\win\\async.c, line 76". EMPIRICALLY this reproduces
// even after a setImmediate-deferred exit AND after dispatcher.close() if exit() is
// still called. The only reliable avoidance is to NOT call process.exit(): close
// undici's sockets, then let the event loop drain so the process exits on its own.
// Every exit path routes through this so the no-I/O fast paths stay uniform too.
let _shuttingDown = false;
async function shutdown() {
  if (_shuttingDown) return;
  _shuttingDown = true;
  // Backstop only: force-exit if the loop somehow fails to drain. unref'd so it
  // never delays a clean natural exit; if it ever fires (8s, under the hook's 10s
  // timeout) the sockets are already closed, so this exit can't race a live one.
  setTimeout(() => process.exit(0), 8000).unref();
  try { await require('undici').getGlobalDispatcher().close(); } catch { /* undici absent/already closed */ }
  // Deliberately NO process.exit() — returning lets Node exit once the loop drains.
}

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function autoProceedOn() {
  // Same cheap check auto-proceed-pause-lint.cjs uses. Absent file ⇒ ON (default).
  try {
    const p = path.join(ROOT, '.claude', 'auto-proceed-state.json');
    if (!fs.existsSync(p)) return true;
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    return j.auto_proceed !== false;
  } catch {
    return true;
  }
}

/**
 * Scan the transcript for evidence that the given ceremony skills ran AFTER the
 * SD completed. Detects: a Skill tool_use ({name:'Skill', input.skill:'document'}),
 * a slash-command in user/assistant text ('/document', '/heal', '/learn'), and
 * '/leo complete' (which runs the entire tail → satisfies all).
 * Tolerant: unreadable/malformed transcript ⇒ returns an empty set (we simply
 * don't clear those steps and re-remind next turn — safe).
 *
 * @returns {Set<string>} subset of ['document','heal','learn'] with evidence
 */
function skillsEvidencedSince(transcriptPath, sinceMs) {
  const found = new Set();
  if (!transcriptPath || !fs.existsSync(transcriptPath)) return found;
  let lines;
  try {
    lines = fs.readFileSync(transcriptPath, 'utf8').split('\n');
  } catch {
    return found;
  }
  const CEREMONY = ['document', 'heal', 'learn'];
  for (const line of lines) {
    if (!line.trim()) continue;
    let obj;
    try { obj = JSON.parse(line); } catch { continue; }
    // Honor the completion boundary when the entry carries a timestamp; if it
    // has none, fall through and inspect it (better to over-clear than to miss).
    const ts = obj.timestamp ? Date.parse(obj.timestamp) : NaN;
    if (!Number.isNaN(ts) && ts < sinceMs) continue;

    const content = obj?.message?.content;
    const blocks = Array.isArray(content) ? content : (content ? [content] : []);
    for (const b of blocks) {
      // Structured Skill tool_use
      if (b && b.type === 'tool_use' && (b.name === 'Skill' || b.name === 'skill')) {
        const skill = String(b.input?.skill || b.input?.command || '').toLowerCase();
        if (skill.includes('leo') && skill.includes('complete')) { CEREMONY.forEach(c => found.add(c)); }
        for (const c of CEREMONY) if (skill.includes(c)) found.add(c);
      }
      // Slash-command in text (user-typed or echoed)
      const text = typeof b === 'string' ? b : (b && b.type === 'text' ? String(b.text || '') : '');
      if (text) {
        const t = text.toLowerCase();
        if (t.includes('/leo complete')) CEREMONY.forEach(c => found.add(c));
        for (const c of CEREMONY) if (t.includes('/' + c)) found.add(c);
      }
    }
  }
  return found;
}

/**
 * Authoritative DB check: a learning_runs row (completed/success) for this SD
 * proves /learn ran. Only called when 'learn' is still pending (lazy). Any
 * failure ⇒ returns false (don't clear; re-remind — safe).
 */
async function learnRanInDb(sdId) {
  if (!sdId) return false;
  if (process.env.POST_COMPLETION_SKIP_DB === '1') return false; // hermetic tests
  try {
    const dotenv = await import('dotenv');
    dotenv.config();
    const { createClient } = await import('@supabase/supabase-js');
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return false;
    const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data, error } = await supabase
      .from('learning_runs')
      .select('id')
      .eq('sd_id', sdId)
      .in('status', ['completed', 'success'])
      .limit(1)
      .maybeSingle();
    if (error) return false;
    return !!data;
  } catch {
    return false;
  }
}

function clearStateFile() {
  try { fs.unlinkSync(STATE_FILE); } catch { /* already gone */ }
}

async function main() {
  // Cheap common-path no-op: absent file ⇒ nothing pending.
  if (!fs.existsSync(STATE_FILE)) { return shutdown(); }

  let payload = {};
  try { payload = JSON.parse(readStdin() || '{}'); } catch {}

  let state;
  try {
    state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    // Malformed ⇒ drop it (no-op).
    clearStateFile();
    return shutdown();
  }

  const pending = Array.isArray(state.pending) ? state.pending.slice() : [];
  if (pending.length === 0) { clearStateFile(); return shutdown(); }

  // Safety drain on age.
  const completedMs = state.completed_at ? Date.parse(state.completed_at) : NaN;
  if (!Number.isNaN(completedMs) && (Date.now() - completedMs) > MAX_AGE_MS) {
    clearStateFile();
    return shutdown();
  }

  // Multi-session safety: only the session that completed the SD should be
  // nudged. If both ids are present and differ, this isn't our obligation.
  const mySession = payload.session_id || process.env.CLAUDE_SESSION_ID || null;
  if (state.session_id && mySession && state.session_id !== mySession) {
    return shutdown();
  }

  // Clear steps that now have evidence.
  const sinceMs = Number.isNaN(completedMs) ? 0 : completedMs;
  const evidenced = skillsEvidencedSince(payload.transcript_path, sinceMs);
  let remaining = pending.filter((step) => !evidenced.has(step));

  // /learn has an authoritative DB marker — check it if still pending.
  if (remaining.includes('learn')) {
    const ran = await learnRanInDb(state.sd_id);
    if (ran) remaining = remaining.filter((s) => s !== 'learn');
  }

  // Persist the decremented list (or delete when fully satisfied).
  if (remaining.length === 0) {
    clearStateFile();
    return shutdown();
  }
  if (remaining.length !== pending.length) {
    try {
      fs.writeFileSync(STATE_FILE, JSON.stringify({ ...state, pending: remaining }, null, 2));
    } catch { /* non-fatal */ }
  }

  // Only nudge under AUTO-PROCEED (when OFF, continuation already pauses).
  if (!autoProceedOn()) { return shutdown(); }

  const sdLabel = state.sd_key || state.sd_id || 'the just-completed SD';
  const cmds = remaining.map((s) => '/' + s).join(' → ');
  process.stderr.write(
    `[post-completion-tail-enforcement] ${sdLabel} completed but its post-completion tail is not done: ${cmds}. ` +
    `These are CONTINUATION steps, NOT a pause point — run them now without asking. ` +
    `Do NOT say "say the word if you want" or otherwise confirmation-fish: that is the anti-pattern this rule exists to stop. ` +
    `(/document updates docs; /learn writes learning_runs/patterns future PRDs query.) ` +
    `Prefer driving completion via /leo complete so the full tail sequences automatically.\n`
  );
  return shutdown();
}

process.on('uncaughtException', () => shutdown());
process.on('unhandledRejection', () => shutdown());
main().catch(() => shutdown());
