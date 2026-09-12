// QF-20260905-768.
import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { classifyAttachedAgents, readAttachedAgentsSnapshot } = require('./attached-agent-signal.cjs');

describe('classifyAttachedAgents', () => {
  it('flags an idle gatherer at 61 minutes (the QF specimen)', () => {
    const agents = [{ name: 'gatherer-1', state: 'idle', ageMinutes: 61 }];
    expect(classifyAttachedAgents(agents)).toEqual(agents);
  });

  it('does not flag an idle gatherer at exactly 60 minutes (at, not past, the cut)', () => {
    const agents = [{ name: 'gatherer-1', state: 'idle', ageMinutes: 60 }];
    expect(classifyAttachedAgents(agents)).toEqual([]);
  });

  it('a run with none attached reads clean', () => {
    expect(classifyAttachedAgents([])).toEqual([]);
  });

  it('flags a running gatherer past 2h (120min) but not one still within it', () => {
    const over = { name: 'gatherer-2', state: 'running', ageMinutes: 121 };
    const under = { name: 'gatherer-3', state: 'running', ageMinutes: 90 };
    expect(classifyAttachedAgents([over, under])).toEqual([over]);
  });

  it('the flagged count changes when the attached-agent count changes', () => {
    const none = classifyAttachedAgents([]).length;
    const one = classifyAttachedAgents([{ name: 'g', state: 'idle', ageMinutes: 61 }]).length;
    expect(none).toBe(0);
    expect(one).toBe(1);
    expect(one).not.toBe(none);
  });
});

describe('readAttachedAgentsSnapshot', () => {
  it('returns null (inconclusive) when the env var is unset', () => {
    expect(readAttachedAgentsSnapshot('SOLOMON_ATTACHED_AGENTS_FILE', {})).toBeNull();
  });

  it('returns null when the file is unreadable/malformed', () => {
    expect(readAttachedAgentsSnapshot('X', { X: '/no/such/path.json' })).toBeNull();
  });

  it('returns a real (possibly empty) array when the file is present and valid', () => {
    const dir = mkdtempSync(join(tmpdir(), 'attached-agents-'));
    const path = join(dir, 'snapshot.json');
    writeFileSync(path, '[]');
    try {
      expect(readAttachedAgentsSnapshot('X', { X: path })).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
