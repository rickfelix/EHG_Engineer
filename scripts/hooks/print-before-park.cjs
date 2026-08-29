#!/usr/bin/env node
/**
 * Stop hook — PRINT BEFORE PARK: never let a HUMAN-prompted turn end on a tool call.
 *
 * Chairman-directed 2026-08-02 (verbal at terminal, to Adam): witnessed ~6 times — the
 * model does the work, arms a ScheduleWakeup (whose tool result reads "nothing more to
 * do this turn"), and ends the turn WITHOUT printing the reply the human is waiting on.
 * The wakeup result's phrasing is about the LOOP being satisfied, not the reply; the
 * two get conflated exactly when a human message arrived mid-turn during a loop tick.
 *
 * DISCRIMINATOR (measured against a real transcript, session ae67c8af, 2026-08-02 —
 * do not "simplify" to text matching):
 *   - human prompts:       type='user' + origin.kind==='human'   (typed / suggestion_accepted)
 *   - MID-TURN human msgs: type='attachment' + attachment.type==='queued_command'
 *                          + attachment.origin.kind==='human'  (these NEVER become user
 *                          entries — the exact class every witnessed failure fell into)
 *   - loop/wakeup prompts: type='user' + isMeta=true + promptSource==='system'
 *   - tool results:        type='user', origin=null, content contains tool_result blocks
 * RULE: let P = the LAST human event (user entry OR queued_command attachment) vs the
 * LAST loop prompt, whichever is later. If P is HUMAN and the last assistant entry after
 * P carries no non-empty text block (turn ending on tool_use/thinking), BLOCK once with
 * a print reminder. A turn whose P is a loop prompt keeps its silent NO-OP right.
 *
 * SAFETY (mirrors stop-loop-wakeup-reminder.cjs):
 *   - Flag-gated: LEO_PRINT_BEFORE_PARK (default off; enabled via .claude/settings.json env).
 *   - Anti-loop: never blocks when stop_hook_active is true (reminded once, let through).
 *   - Fail-open: missing/unreadable transcript, parse errors, anything → allow stop.
 *   - No network, no DB: pure filesystem tail-read; plain exit is safe (no undici sockets).
 */

'use strict';

const fs = require('fs');

const TAIL_BYTES = 512 * 1024; // transcripts grow large; the live turn is always in the tail

function isFlagEnabled() {
  const v = (process.env.LEO_PRINT_BEFORE_PARK || 'off').toLowerCase();
  return v === 'on' || v === '1' || v === 'true';
}

/** Tail-read a JSONL file and parse to entries (drops the first partial line). */
function readTailEntries(filePath) {
  const stat = fs.statSync(filePath);
  const start = Math.max(0, stat.size - TAIL_BYTES);
  const fd = fs.openSync(filePath, 'r');
  let raw;
  try {
    const buf = Buffer.alloc(stat.size - start);
    fs.readSync(fd, buf, 0, buf.length, start);
    raw = buf.toString('utf8');
  } finally {
    fs.closeSync(fd);
  }
  const lines = raw.split('\n');
  if (start > 0) lines.shift(); // first line may be partial
  const entries = [];
  for (const l of lines) {
    if (!l) continue;
    try { entries.push(JSON.parse(l)); } catch { /* partial/corrupt line — skip */ }
  }
  return entries;
}

function isHumanPrompt(e) {
  if (!e) return false;
  if (e.type === 'user' && e.origin && e.origin.kind === 'human') return true;
  // Mid-turn arrivals are recorded ONLY as queued_command attachments (measured 2026-08-02;
  // they never appear as user entries) — the class every witnessed silent-stop fell into.
  if (e.type === 'attachment' && e.attachment
      && e.attachment.type === 'queued_command'
      && e.attachment.origin && e.attachment.origin.kind === 'human') return true;
  return false;
}

function isLoopPrompt(e) {
  return e && e.type === 'user' && e.isMeta === true && e.promptSource === 'system';
}

function hasNonEmptyText(e) {
  const c = e && e.message && e.message.content;
  if (typeof c === 'string') return c.trim().length > 0;
  if (!Array.isArray(c)) return false;
  return c.some((b) => b && b.type === 'text' && typeof b.text === 'string' && b.text.trim().length > 0);
}

/**
 * Pure decision over parsed transcript entries: should this stop be blocked?
 * Exported for tests. Returns { block: boolean, why: string }.
 */
function decide(entries) {
  // P = last prompt-like user entry (human or loop). Other user entries (tool results,
  // local-command echoes, hook injections) never move P.
  let pIdx = -1;
  let pKind = null;
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i];
    if (isHumanPrompt(e)) { pIdx = i; pKind = 'human'; break; }
    if (isLoopPrompt(e)) { pIdx = i; pKind = 'loop'; break; }
  }
  if (pIdx === -1) return { block: false, why: 'no prompt-like entry in tail window' };
  if (pKind !== 'human') {
    // v3 ENGAGED MODE (8th witnessed instance, 2026-08-02): a loop turn can complete
    // chairman-relevant work (e.g. sourcing his ratified SD) and end silently — the
    // NO-OP silence right only makes sense when no operator is watching. While a
    // human message has arrived within the last ENGAGED_WINDOW_MS, EVERY turn must
    // end on text (a one-line tick summary suffices); true silent ticks resume once
    // the operator has been quiet for the window.
    const ENGAGED_WINDOW_MS = 30 * 60 * 1000;
    let lastHumanTs = 0;
    for (let i = entries.length - 1; i >= 0; i--) {
      if (isHumanPrompt(entries[i])) {
        const ts = new Date(entries[i].timestamp || 0).getTime();
        if (ts) lastHumanTs = ts;
        break;
      }
    }
    if (!lastHumanTs || Date.now() - lastHumanTs > ENGAGED_WINDOW_MS) {
      return { block: false, why: 'loop turn, operator not recently engaged — silent NO-OP permitted' };
    }
    // engaged: fall through to the ends-on-text requirement below
  }

  // Human turn: the LAST assistant entry after P must carry non-empty text.
  let lastAssistant = null;
  for (let i = entries.length - 1; i > pIdx; i--) {
    if (entries[i].type === 'assistant') { lastAssistant = entries[i]; break; }
  }
  if (!lastAssistant) return { block: true, why: 'human prompt with no assistant output at all' };
  if (hasNonEmptyText(lastAssistant)) return { block: false, why: 'turn ends on assistant text' };
  return { block: true, why: 'human-prompted turn ending on a non-text assistant block' };
}

const REMINDER = [
  'PRINT BEFORE PARK: this turn was prompted by a HUMAN message (or one arrived mid-turn),',
  'and it is ending on a tool call — the user sees NO reply. A ScheduleWakeup result saying',
  '"nothing more to do this turn" satisfies the LOOP, not the human.',
  'Write the final text message NOW, as the last thing in the turn:',
  '  - if the wakeup hook also wants an arm, arm it FIRST, then write the text — in that',
  '    order both hooks pass; NEVER end the turn on the arm itself;',
  '  - lead with the outcome the human is waiting on;',
  '  - restate anything you only said mid-turn or in thinking — assume they did not see it;',
  '  - if you genuinely owe nothing, print one line saying exactly that.',
  '(This reminder re-fires on a silent re-stop, up to 3 times, before letting the turn end.)',
].join('\n');

function readStdinPayload(timeoutMs = 2000) {
  return new Promise((resolve) => {
    let data = '';
    let settled = false;
    let timer = null;
    const finish = () => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      try { resolve(JSON.parse(data || '{}')); } catch { resolve({}); }
    };
    try {
      process.stdin.setEncoding('utf8');
      process.stdin.on('data', (c) => { data += c; });
      process.stdin.on('end', finish);
      process.stdin.on('error', () => finish());
      timer = setTimeout(finish, timeoutMs);
    } catch { resolve({}); }
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── v2: PRINT-DEBT CARRYOVER (witnessed 3× on 2026-08-02) ────────────────────
// v1 boundary: once a LOOP prompt lands after an unanswered human message, P
// becomes the loop prompt and the hook goes blind — the debt from a blocked
// turn silently survives into the next tick turn. v2 persists a debt marker
// when a block fires; while the marker exists, EVERY turn (loop included) must
// end on assistant text; the marker clears the moment any turn does.
const DEBT_MAX_AGE_MS = 24 * 60 * 60 * 1000; // staleness cap — never wedge a loop on an old marker
const MAX_BLOCKS_PER_TURN = 3; // v4 bounded re-block cap — lifted to module scope for testability

function debtPath(sessionId) {
  const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  return require('path').join(root, '.claude', 'pids', `print-debt-${sessionId || 'unknown'}.json`);
}
function readDebt(sessionId) {
  try {
    const d = readDebtRecord(sessionId);
    return d !== null;
  } catch { return false; }
}
/** Full marker record (or null) — v4 adds turnKey/blocks for the bounded re-block counter. */
function readDebtRecord(sessionId) {
  try {
    const p = debtPath(sessionId);
    if (!fs.existsSync(p)) return null;
    const d = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (!d.at || Date.now() - new Date(d.at).getTime() > DEBT_MAX_AGE_MS) { fs.unlinkSync(p); return null; }
    return d;
  } catch { return null; }
}
function writeDebt(sessionId, why, turnKey, blocks) {
  try {
    fs.writeFileSync(debtPath(sessionId), JSON.stringify({
      at: new Date().toISOString(), why, turnKey: turnKey || null, blocks: blocks || 1,
    }));
  } catch { /* fail-open */ }
}
function clearDebt(sessionId) {
  try { const p = debtPath(sessionId); if (fs.existsSync(p)) fs.unlinkSync(p); } catch { /* fail-open */ }
}

/** Did the turn end on assistant text? (last assistant entry carries non-empty text) */
function endsOnText(entries) {
  for (let i = entries.length - 1; i >= 0; i--) {
    if (entries[i].type === 'assistant') return hasNonEmptyText(entries[i]);
  }
  return false;
}

/** Stable key for "the human message this turn owes a reply to" — uuid preferred, ts fallback. */
function lastHumanKey(entries) {
  for (let i = entries.length - 1; i >= 0; i--) {
    if (isHumanPrompt(entries[i])) {
      return entries[i].uuid || entries[i].timestamp || `idx-${i}`;
    }
  }
  return null;
}

async function main() {
  try {
    if (!isFlagEnabled()) return;                       // default-OFF fast path
    const payload = await readStdinPayload();
    const sessionId = payload.session_id || process.env.CLAUDE_SESSION_ID || '';
    const transcriptPath = payload.transcript_path;
    if (!transcriptPath || !fs.existsSync(transcriptPath)) return; // fail-open
    // FLUSH-RACE GUARD (witnessed live 2026-08-02, first firing): the final assistant text
    // entry can flush to the JSONL *after* the Stop hook starts reading — a block verdict
    // from a single read false-positives on a turn that DID end with text. Re-read for up
    // to ~2.5s (well under the 10s hook timeout) before letting a block stand; a genuine
    // silent stop stays blocked, a racing text flip flips the verdict to allow.
    let entries = readTailEntries(transcriptPath);
    let verdict = decide(entries);
    const debtOwed = readDebt(sessionId);
    const blockWorthy = () => verdict.block || (debtOwed && !endsOnText(entries));
    const deadline = Date.now() + 2500;
    while (blockWorthy() && Date.now() < deadline) {
      await sleep(400);
      if (!fs.existsSync(transcriptPath)) return;       // fail-open if it vanished
      entries = readTailEntries(transcriptPath);
      verdict = decide(entries);
    }
    if (endsOnText(entries)) clearDebt(sessionId);      // debt is paid by any text-final turn
    if (!blockWorthy()) return;
    // ── v4 BOUNDED RE-BLOCK (chairman-directed 2026-08-29, witnessed 3× that day) ──
    // v3's anti-loop (`stop_hook_active → pass through`) was the swallow path: block #1
    // fired, the model re-stopped silently (typically right after a ScheduleWakeup arm,
    // when a SECOND stop hook's louder checkin wall displaced the print demand), and the
    // pass-through ended the turn with the human's reply never printed. The debt marker
    // then got cleared by the NEXT turn's unrelated tick text, so the human saw nothing,
    // three sittings in a row. Bound the escape instead of removing it: re-block the SAME
    // turn up to MAX_BLOCKS_PER_TURN times (turn identity = the human message owed a
    // reply, keyed by its uuid), then pass through so a genuinely wedged model cannot
    // trap the session. Fail-open paths above are unchanged.
    const turnKey = lastHumanKey(entries);
    const prior = readDebtRecord(sessionId);
    const sameTurn = prior && turnKey && prior.turnKey === turnKey;
    const blocksSoFar = sameTurn ? (prior.blocks || 1) : 0;
    writeDebt(sessionId,
      verdict.block ? verdict.why : 'carryover: prior blocked turn never printed',
      turnKey, blocksSoFar + 1);
    if (payload.stop_hook_active === true && blocksSoFar >= MAX_BLOCKS_PER_TURN) return;
    process.stdout.write(JSON.stringify({ decision: 'block', reason: REMINDER }));
  } catch (e) {
    process.stderr.write(`[print-before-park] ${e.message}\n`); // fail-open, never trap a stop
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  decide, isHumanPrompt, isLoopPrompt, hasNonEmptyText, readTailEntries, REMINDER,
  // QF-20260829-847 (v4 bounded re-block): exported for unit testing the counter logic.
  readDebtRecord, writeDebt, clearDebt, lastHumanKey, endsOnText, debtPath, MAX_BLOCKS_PER_TURN,
};
