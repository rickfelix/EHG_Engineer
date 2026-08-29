// Tests for QF-20260829-847 — print-before-park.cjs v4 (bounded re-block)
//
// v3 defect (chairman-commissioned fix, live 2026-08-29): a single-fire block let a
// SECOND silent re-stop pass through unblocked (stop_hook_active===true), and the debt
// marker was then cleared by the NEXT turn's unrelated tick text — so the human's reply
// was never printed, 3x in one sitting (measured from session f27a883d ~13:07Z).
//
// v4 fix: bounded re-block up to MAX_BLOCKS_PER_TURN, keyed by the owed human message's
// uuid (turnKey) via readDebtRecord()/lastHumanKey().

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const HOOK_PATH = path.resolve(__dirname, '../print-before-park.cjs');
const {
  decide, isHumanPrompt, hasNonEmptyText, REMINDER,
  readDebtRecord, writeDebt, clearDebt, lastHumanKey, endsOnText, debtPath, MAX_BLOCKS_PER_TURN,
} = require(HOOK_PATH); // require.main guard -> main() does NOT run on require

// ── Synthetic replica of the real defect shape (session f27a883d, 2026-08-29T13:07:10Z) ──
// Structurally faithful to the real transcript (verified via direct read of the session
// f27a883d JSONL): a human `type='user'`+`origin.kind==='human'` entry, followed by an
// assistant turn that ends on a ScheduleWakeup tool_use with NO trailing text block --
// the exact silent-stop-after-arm pattern the chairman witnessed 3x.
const HUMAN_UUID = 'da83289f-02b1-4571-a2c4-0573c2ec8400'; // real uuid from the replayed transcript
function humanEntry(uuid = HUMAN_UUID, timestamp = '2026-08-29T13:07:10.475Z') {
  return {
    type: 'user',
    message: { role: 'user', content: "Adam, I'm here at the terminal. Do you need anything from me?" },
    uuid,
    timestamp,
    origin: { kind: 'human' },
    promptSource: 'typed',
  };
}
function silentToolUseEntry(uuid) {
  return {
    type: 'assistant',
    uuid,
    timestamp: '2026-08-29T13:07:28.922Z',
    message: { content: [{ type: 'tool_use', id: 'toolu_01x', name: 'ScheduleWakeup', input: { delaySeconds: 900 } }] },
  };
}
function textEntry(uuid, text = 'Here is the reply the human was waiting on.') {
  return {
    type: 'assistant',
    uuid,
    timestamp: '2026-08-29T13:07:40.000Z',
    message: { content: [{ type: 'text', text }] },
  };
}
function loopPromptEntry() {
  return { type: 'user', isMeta: true, promptSource: 'system', timestamp: '2026-08-29T13:10:34.245Z' };
}

// ── decide() over the replayed shape ─────────────────────────────────────────
describe('decide() — replayed transcript tail (session f27a883d ~13:07Z)', () => {
  it('BLOCKS a human-prompted turn ending on a silent ScheduleWakeup tool_use (the witnessed defect)', () => {
    const entries = [humanEntry(), silentToolUseEntry('a1')];
    expect(isHumanPrompt(entries[0])).toBe(true);
    expect(hasNonEmptyText(entries[1])).toBe(false);
    expect(decide(entries)).toEqual(expect.objectContaining({ block: true }));
  });

  it('does NOT block once the assistant turn ends on non-empty text', () => {
    const entries = [humanEntry(), textEntry('a2')];
    expect(decide(entries)).toEqual(expect.objectContaining({ block: false }));
  });
});

// ── v4 bounded re-block counter (unit-level, via exported helpers) ──────────
describe('v4 bounded re-block — counter semantics', () => {
  let tmpDir;
  let sid;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbp-test-'));
    fs.mkdirSync(path.join(tmpDir, '.claude', 'pids'), { recursive: true });
    process.env.CLAUDE_PROJECT_DIR = tmpDir;
    sid = `test-${Math.random().toString(36).slice(2)}`;
  });

  afterEach(() => {
    delete process.env.CLAUDE_PROJECT_DIR;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('MAX_BLOCKS_PER_TURN is 3 (source-pinned invariant this fix depends on)', () => {
    expect(MAX_BLOCKS_PER_TURN).toBe(3);
  });

  it('lastHumanKey() returns the owed human message uuid, stable across re-reads', () => {
    const entries = [humanEntry('h1'), silentToolUseEntry('a1')];
    expect(lastHumanKey(entries)).toBe('h1');
  });

  it('block / block / block / pass on the SAME turnKey — bounded escape after 3 blocks', () => {
    const turnKey = 'h-same-turn';
    expect(readDebtRecord(sid)).toBeNull();

    // Simulate 3 successive silent re-stops on the same owed human message.
    for (let i = 1; i <= MAX_BLOCKS_PER_TURN; i++) {
      const prior = readDebtRecord(sid);
      const sameTurn = prior && prior.turnKey === turnKey;
      const blocksSoFar = sameTurn ? (prior.blocks || 1) : 0;
      writeDebt(sid, 'silent re-stop', turnKey, blocksSoFar + 1);
      expect(readDebtRecord(sid).blocks).toBe(i);
    }

    // A 4th silent re-stop on the SAME turnKey has exhausted the bound -- main()'s own
    // pass-through condition (`stop_hook_active === true && blocksSoFar >= MAX_BLOCKS_PER_TURN`)
    // reads blocksSoFar from this exact record.
    const record = readDebtRecord(sid);
    expect(record.turnKey).toBe(turnKey);
    expect(record.blocks).toBeGreaterThanOrEqual(MAX_BLOCKS_PER_TURN);
  });

  it('counter RESETS when a new human message (new turnKey) arrives mid-debt', () => {
    const turnKeyA = 'h-first-message';
    writeDebt(sid, 'block 1', turnKeyA, 1);
    writeDebt(sid, 'block 2', turnKeyA, 2);
    writeDebt(sid, 'block 3', turnKeyA, 3);
    expect(readDebtRecord(sid).blocks).toBe(3);

    // A genuinely NEW human message arrives -- lastHumanKey() changes, so the counter
    // must restart at 1, not continue accumulating toward a stale bound.
    const turnKeyB = 'h-second-message';
    const prior = readDebtRecord(sid);
    const sameTurn = prior && prior.turnKey === turnKeyB;
    const blocksSoFar = sameTurn ? (prior.blocks || 1) : 0;
    writeDebt(sid, 'new turn', turnKeyB, blocksSoFar + 1);

    const record = readDebtRecord(sid);
    expect(record.turnKey).toBe(turnKeyB);
    expect(record.blocks).toBe(1); // reset, not 4
  });

  it('endsOnText() clears the debt regardless of how many blocks accumulated', () => {
    writeDebt(sid, 'block 1', 'h1', 1);
    writeDebt(sid, 'block 2', 'h1', 2);
    expect(readDebtRecord(sid)).not.toBeNull();

    const finalEntries = [humanEntry('h1'), textEntry('a-final')];
    expect(endsOnText(finalEntries)).toBe(true);
    clearDebt(sid);
    expect(readDebtRecord(sid)).toBeNull();
  });

  it('a turn ending on a non-text block does NOT clear the debt', () => {
    writeDebt(sid, 'block 1', 'h1', 1);
    const stillSilent = [humanEntry('h1'), silentToolUseEntry('a2')];
    expect(endsOnText(stillSilent)).toBe(false);
    expect(readDebtRecord(sid)).not.toBeNull();
  });

  it('debtPath() is scoped per sessionId (no cross-session collision)', () => {
    expect(debtPath('session-a')).not.toBe(debtPath('session-b'));
    expect(debtPath('session-a')).toContain('session-a');
  });
});

// ── Fail-open paths (unchanged by v4) ────────────────────────────────────────
describe('fail-open paths are unchanged', () => {
  it('decide() treats an empty/no-prompt tail as non-blocking', () => {
    expect(decide([])).toEqual(expect.objectContaining({ block: false }));
  });

  it('a loop-prompt turn with no recent human engagement permits silent NO-OP', () => {
    const entries = [loopPromptEntry(), silentToolUseEntry('a1')];
    expect(decide(entries)).toEqual(expect.objectContaining({ block: false }));
  });

  it('readDebtRecord() fails open (null) for a session with no marker file', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pbp-fail-open-'));
    process.env.CLAUDE_PROJECT_DIR = tmp;
    try {
      expect(readDebtRecord('never-seen-session')).toBeNull();
    } finally {
      delete process.env.CLAUDE_PROJECT_DIR;
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

// ── End-to-end replay: invoke main() via subprocess against a real-shaped transcript ──
// This is the "replayed transcript tail" verification the QF calls for: drive the actual
// hook script (not just its exported helpers) through the exact multi-invocation sequence
// Claude Code produces (stop_hook_active toggles false -> true on each re-stop) and assert
// the bounded escape actually fires end-to-end.
describe('end-to-end: main() replay against a synthetic session-f27a883d-shaped transcript', () => {
  let tmpDir;
  let transcriptPath;
  const sessionId = 'e2e-replay-session';

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbp-e2e-'));
    fs.mkdirSync(path.join(tmpDir, '.claude', 'pids'), { recursive: true });
    transcriptPath = path.join(tmpDir, 'transcript.jsonl');
    const entries = [humanEntry(), silentToolUseEntry('a1')];
    fs.writeFileSync(transcriptPath, entries.map((e) => JSON.stringify(e)).join('\n') + '\n');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function invoke(stopHookActive) {
    const payload = JSON.stringify({ session_id: sessionId, transcript_path: transcriptPath, stop_hook_active: stopHookActive });
    return execFileSync('node', [HOOK_PATH], {
      input: payload,
      encoding: 'utf8',
      env: { ...process.env, LEO_PRINT_BEFORE_PARK: 'on', CLAUDE_PROJECT_DIR: tmpDir },
    });
  }

  it('blocks up to MAX_BLOCKS_PER_TURN times, then passes through silently on the same silent turn', () => {
    // Invocation 1: fresh stop, stop_hook_active=false -> blocks (block #1).
    const out1 = invoke(false);
    expect(JSON.parse(out1)).toEqual(expect.objectContaining({ decision: 'block', reason: REMINDER }));

    // Invocations 2 and 3: the model re-stopped silently again (transcript unchanged),
    // Claude Code re-invokes with stop_hook_active=true -- still under the bound, blocks again.
    const out2 = invoke(true);
    expect(JSON.parse(out2)).toEqual(expect.objectContaining({ decision: 'block' }));
    const out3 = invoke(true);
    expect(JSON.parse(out3)).toEqual(expect.objectContaining({ decision: 'block' }));

    // Invocation 4: bound exhausted (blocksSoFar >= MAX_BLOCKS_PER_TURN) -- passes through
    // with NO stdout decision, so a genuinely wedged model cannot trap the session forever.
    const out4 = invoke(true);
    expect(out4.trim()).toBe('');
  });

  it('a reply that finally prints text clears the debt for the next turn', () => {
    invoke(false); // block #1
    invoke(true);  // block #2

    // The model finally prints the reply.
    fs.appendFileSync(transcriptPath, '\n' + JSON.stringify(textEntry('a-final')) + '\n');
    const outFinal = invoke(true);
    expect(outFinal.trim()).toBe(''); // decide() now says block:false -- nothing to print

    const record = readDebtRecordFromDisk(tmpDir, sessionId);
    expect(record).toBeNull(); // debt cleared by the text-final turn
  });

  function readDebtRecordFromDisk(root, sid) {
    const p = path.join(root, '.claude', 'pids', `print-debt-${sid}.json`);
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  }
});
