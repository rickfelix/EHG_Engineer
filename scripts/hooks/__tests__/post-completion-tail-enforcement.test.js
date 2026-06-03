// Tests for SD-LEO-INFRA-AUTO-ENFORCE-POST-001
//   FR-001 — post-completion-tail-populator (import)
//   FR-002 — post-completion-tail-enforcement Stop hook (subprocess spawn)
//
// Hermetic: POST_COMPLETION_TEST_ROOT redirects the .claude/ anchor to a temp
// dir; POST_COMPLETION_SKIP_DB=1 skips the learning_runs query.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

import { runPostCompletionTailPopulator } from '../../modules/handoff/executors/lead-final-approval/hooks/post-completion-tail-populator.js';

const HOOK = path.resolve(__dirname, '../post-completion-tail-enforcement.cjs').replace(/\\/g, '/');

function mkRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pctail-'));
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true });
  return dir;
}
function stateFile(root) { return path.join(root, '.claude', 'post-completion-pending.json'); }
function writeState(root, obj) { fs.writeFileSync(stateFile(root), JSON.stringify(obj)); }
function readState(root) { return JSON.parse(fs.readFileSync(stateFile(root), 'utf8')); }
function exists(root) { return fs.existsSync(stateFile(root)); }

function spawnHook(payload, root, extraEnv = {}) {
  const { spawn } = require('node:child_process');
  const p = spawn('node', [HOOK], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, POST_COMPLETION_TEST_ROOT: root, POST_COMPLETION_SKIP_DB: '1', ...extraEnv },
  });
  p.stdin.end(payload == null ? '' : JSON.stringify(payload));
  return new Promise((resolve) => {
    let stdout = ''; let stderr = '';
    p.stdout.on('data', (c) => { stdout += c; });
    p.stderr.on('data', (c) => { stderr += c; });
    p.on('close', (code) => resolve({ stdout, stderr, code }));
  });
}

describe('FR-002 post-completion-tail-enforcement Stop hook', () => {
  let root;
  beforeEach(() => { root = mkRoot(); });
  afterEach(() => { try { fs.rmSync(root, { recursive: true, force: true }); } catch {} });

  it('is a cheap no-op when the pending file is absent', async () => {
    const r = await spawnHook({ session_id: 'S1' }, root);
    expect(r.code).toBe(0);
    expect(r.stderr).toBe('');
  });

  it('reminds (continuation framing) when steps are pending', async () => {
    writeState(root, { sd_key: 'SD-X', sd_id: 'u1', pending: ['document'], completed_at: new Date().toISOString(), session_id: 'S1' });
    const r = await spawnHook({ session_id: 'S1' }, root);
    expect(r.code).toBe(0);
    expect(r.stderr).toContain('post-completion-tail-enforcement');
    expect(r.stderr).toContain('/document');
    expect(r.stderr.toUpperCase()).toContain('CONTINUATION');
  });

  it('never blocks: a malformed pending file degrades to a no-op and is dropped', async () => {
    fs.writeFileSync(stateFile(root), '{ not json');
    const r = await spawnHook({ session_id: 'S1' }, root);
    expect(r.code).toBe(0);
    expect(r.stderr).toBe('');
    expect(exists(root)).toBe(false);
  });

  it('ignores another session\'s obligation (session mismatch)', async () => {
    writeState(root, { sd_key: 'SD-X', sd_id: 'u1', pending: ['document'], completed_at: new Date().toISOString(), session_id: 'OTHER' });
    const r = await spawnHook({ session_id: 'MINE' }, root);
    expect(r.code).toBe(0);
    expect(r.stderr).toBe('');
    expect(exists(root)).toBe(true); // untouched — not ours to clear
  });

  it('does not remind when AUTO-PROCEED is OFF', async () => {
    fs.writeFileSync(path.join(root, '.claude', 'auto-proceed-state.json'), JSON.stringify({ auto_proceed: false }));
    writeState(root, { sd_key: 'SD-X', sd_id: 'u1', pending: ['document'], completed_at: new Date().toISOString(), session_id: 'S1' });
    const r = await spawnHook({ session_id: 'S1' }, root);
    expect(r.code).toBe(0);
    expect(r.stderr).toBe('');
  });

  it('clears a step when the transcript shows the skill ran after completion', async () => {
    const completedAt = new Date(Date.now() - 60000).toISOString();
    const transcript = path.join(root, 'transcript.jsonl');
    fs.writeFileSync(transcript, [
      JSON.stringify({ type: 'assistant', timestamp: new Date().toISOString(), message: { content: [{ type: 'tool_use', name: 'Skill', input: { skill: 'document' } }] } }),
    ].join('\n'));
    writeState(root, { sd_key: 'SD-X', sd_id: 'u1', pending: ['document'], completed_at: completedAt, session_id: 'S1' });
    const r = await spawnHook({ session_id: 'S1', transcript_path: transcript }, root);
    expect(r.code).toBe(0);
    expect(r.stderr).toBe('');           // nothing left to remind about
    expect(exists(root)).toBe(false);    // file removed once fully satisfied
  });

  it('drains a stale (>6h old) pending file without nagging', async () => {
    writeState(root, { sd_key: 'SD-OLD', sd_id: 'u9', pending: ['document'], completed_at: new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString(), session_id: 'S1' });
    const r = await spawnHook({ session_id: 'S1' }, root);
    expect(r.code).toBe(0);
    expect(r.stderr).toBe('');
    expect(exists(root)).toBe(false);
  });

  it('keeps /learn pending without evidence and clears it when transcript shows /learn', async () => {
    const completedAt = new Date(Date.now() - 60000).toISOString();
    // No evidence → learn stays pending → reminder.
    writeState(root, { sd_key: 'SD-F', sd_id: 'u2', pending: ['learn'], completed_at: completedAt, session_id: 'S1' });
    const r1 = await spawnHook({ session_id: 'S1' }, root);
    expect(r1.stderr).toContain('/learn');

    // Transcript shows /leo complete (runs the whole tail) → learn cleared.
    const transcript = path.join(root, 't2.jsonl');
    fs.writeFileSync(transcript, JSON.stringify({ type: 'user', timestamp: new Date().toISOString(), message: { content: '/leo complete' } }));
    writeState(root, { sd_key: 'SD-F', sd_id: 'u2', pending: ['learn'], completed_at: completedAt, session_id: 'S1' });
    const r2 = await spawnHook({ session_id: 'S1', transcript_path: transcript }, root);
    expect(r2.stderr).toBe('');
    expect(exists(root)).toBe(false);
  });
});

describe('FR-001 post-completion-tail-populator', () => {
  let root;
  beforeEach(() => { root = mkRoot(); process.env.POST_COMPLETION_TEST_ROOT = root; delete process.env.CLAUDE_PROJECT_DIR; });
  afterEach(() => { delete process.env.POST_COMPLETION_TEST_ROOT; try { fs.rmSync(root, { recursive: true, force: true }); } catch {} });

  it('records the full ceremony tail for a feature SD', async () => {
    const res = await runPostCompletionTailPopulator({ sd_type: 'feature', id: 'u1', sd_key: 'SD-FEAT', source: '' });
    expect(res.written).toBe(true);
    expect(res.pending).toEqual(['document', 'heal', 'learn']);
    expect(readState(root).pending).toEqual(['document', 'heal', 'learn']);
  });

  it('records only /document for an infrastructure SD (canonical source rules)', async () => {
    const res = await runPostCompletionTailPopulator({ sd_type: 'infrastructure', id: 'u2', sd_key: 'SD-INFRA', source: '' });
    expect(res.written).toBe(true);
    expect(res.pending).toEqual(['document']);
  });

  it('writes nothing for an orchestrator SD (no ceremony steps)', async () => {
    const res = await runPostCompletionTailPopulator({ sd_type: 'orchestrator', id: 'u3', sd_key: 'SD-ORCH', source: '' });
    expect(res.written).toBe(false);
    expect(res.pending).toEqual([]);
    expect(exists(root)).toBe(false);
  });

  it('honors LEARN_SKIP_SOURCES (source=learn excludes /learn)', async () => {
    const res = await runPostCompletionTailPopulator({ sd_type: 'feature', id: 'u4', sd_key: 'SD-LEARN', source: 'learn' });
    expect(res.pending).toContain('document');
    expect(res.pending).not.toContain('learn');
  });

  it('does not record a nudge when AUTO-PROCEED is OFF', async () => {
    fs.writeFileSync(path.join(root, '.claude', 'auto-proceed-state.json'), JSON.stringify({ auto_proceed: false }));
    const res = await runPostCompletionTailPopulator({ sd_type: 'feature', id: 'u5', sd_key: 'SD-OFF', source: '' });
    expect(res.written).toBe(false);
    expect(res.reason).toBe('auto_proceed_off');
    expect(exists(root)).toBe(false);
  });
});
