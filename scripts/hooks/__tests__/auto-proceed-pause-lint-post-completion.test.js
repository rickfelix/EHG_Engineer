// Tests for SD-LEO-INFRA-AUTO-ENFORCE-POST-001 FR-003 — auto-proceed-pause-lint
// recognizes post-completion confirmation-fishing ("say the word if you want
// me to run /document and /learn") without false-positiving on benign reports.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const HOOK = path.resolve(__dirname, '../auto-proceed-pause-lint.cjs').replace(/\\/g, '/');

let cwd;
beforeEach(() => { cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'pauselint-')); fs.mkdirSync(path.join(cwd, '.claude'), { recursive: true }); });
afterEach(() => { try { fs.rmSync(cwd, { recursive: true, force: true }); } catch {} });

function writeTranscript(text) {
  const p = path.join(cwd, 't.jsonl');
  fs.writeFileSync(p, JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text }] } }));
  return p;
}

function spawnLint(assistantText, { autoProceedOff = false } = {}) {
  if (autoProceedOff) fs.writeFileSync(path.join(cwd, '.claude', 'auto-proceed-state.json'), JSON.stringify({ auto_proceed: false }));
  const transcript = writeTranscript(assistantText);
  const { spawn } = require('node:child_process');
  const p = spawn('node', [HOOK], { stdio: ['pipe', 'pipe', 'pipe'], cwd, env: { ...process.env } });
  p.stdin.end(JSON.stringify({ transcript_path: transcript }));
  return new Promise((resolve) => {
    let stderr = '';
    p.stderr.on('data', (c) => { stderr += c; });
    p.on('close', (code) => resolve({ stderr, code }));
  });
}

describe('FR-003 post-completion confirmation-fishing detection', () => {
  it('flags "say the word if you want me to run /document and /learn"', async () => {
    const r = await spawnLint('The retro and memory are already written. Say the word if you want me to run /document and /learn.');
    expect(r.stderr).toContain('PROTOCOL VIOLATION');
    expect(r.stderr).toContain('CONTINUATION');
  });

  it('flags "I did not run /document and /learn" (paired with offering)', async () => {
    const r = await spawnLint('I did not run /document and /learn yet. Let me know if you want them.');
    expect(r.stderr).toContain('PROTOCOL VIOLATION');
  });

  it('flags "didn\'t run the post-completion tail"', async () => {
    const r = await spawnLint("I didn't run the post-completion tail.");
    expect(r.stderr).toContain('PROTOCOL VIOLATION');
  });

  it('does NOT flag a benign completion report', async () => {
    const r = await spawnLint('Done — I ran /document and /learn; PR #4198 merged. Recommend /compact next.');
    expect(r.stderr).toBe('');
  });

  it('does NOT flag unrelated prose', async () => {
    const r = await spawnLint('The populator records the pending tail and the Stop hook reminds until evidence exists.');
    expect(r.stderr).toBe('');
  });

  it('still flags the pre-existing generic pause phrasing (no regression)', async () => {
    const r = await spawnLint('This is a good stopping point — want me to continue?');
    expect(r.stderr).toContain('PROTOCOL VIOLATION');
  });

  it('does not flag even fishing phrasing when AUTO-PROCEED is OFF', async () => {
    const r = await spawnLint('Say the word if you want me to run /document and /learn.', { autoProceedOff: true });
    expect(r.stderr).toBe('');
  });
});
