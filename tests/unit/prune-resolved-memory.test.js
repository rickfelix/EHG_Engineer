/**
 * Unit tests for pruneResolvedMemory()
 * SD-LEO-INFRA-MEMORY-PATTERN-LIFECYCLE-001
 */

import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { pruneResolvedMemory } from '../../scripts/modules/handoff/executors/lead-final-approval/helpers.js';

// We only test pruneResolvedMemory — other helpers require full Supabase setup
const FIXTURE_DIR = path.join(os.tmpdir(), 'prune-memory-tests');

function writeFixture(name, content) {
  fs.mkdirSync(FIXTURE_DIR, { recursive: true });
  const filePath = path.join(FIXTURE_DIR, name);
  fs.writeFileSync(filePath, content, 'utf8');
  return filePath;
}

function readFixture(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : null;
}

afterEach(() => {
  fs.rmSync(FIXTURE_DIR, { recursive: true, force: true });
});

describe('pruneResolvedMemory()', () => {
  it('TS-1: removes tagged section when its pattern is resolved', async () => {
    const content = [
      '# EHG_Engineer Memory\n\n',
      '## Gate Return Schema [PAT-AUTO-0042]\n- Use {passed, score, maxScore}\n\n',
      '## User Preferences\n- Auto-proceed ON\n',
    ].join('');
    const filePath = writeFixture('memory1.md', content);

    await pruneResolvedMemory(['PAT-AUTO-0042'], filePath);

    const result = readFixture(filePath);
    expect(result).not.toContain('[PAT-AUTO-0042]');
    expect(result).not.toContain('Use {passed, score, maxScore}');
    expect(result).toContain('## User Preferences');
    expect(result).toContain('Auto-proceed ON');
  });

  it('TS-2: noop when no tagged entry matches resolved pattern', async () => {
    const content = '# Memory\n\n## User Preferences\n- Auto-proceed ON\n';
    const filePath = writeFixture('memory2.md', content);
    const before = readFixture(filePath);

    await pruneResolvedMemory(['PAT-AUTO-9999'], filePath);

    expect(readFixture(filePath)).toBe(before);
  });

  it('TS-3: fail-safe when MEMORY.md does not exist', async () => {
    const nonExistent = path.join(FIXTURE_DIR, 'does-not-exist.md');
    // Should not throw
    await expect(pruneResolvedMemory(['PAT-AUTO-0001'], nonExistent)).resolves.toBeUndefined();
  });

  it('TS-4: removes only matching tagged sections, leaves others intact', async () => {
    const content = [
      '# Memory\n\n',
      '## Pattern A [PAT-AUTO-A]\n- content A\n\n',
      '## Pattern B [PAT-AUTO-B]\n- content B\n\n',
      '## Pattern C [PAT-AUTO-C]\n- content C\n',
    ].join('');
    const filePath = writeFixture('memory4.md', content);

    await pruneResolvedMemory(['PAT-AUTO-A', 'PAT-AUTO-B'], filePath);

    const result = readFixture(filePath);
    expect(result).not.toContain('[PAT-AUTO-A]');
    expect(result).not.toContain('[PAT-AUTO-B]');
    expect(result).toContain('[PAT-AUTO-C]');
    expect(result).toContain('content C');
  });

  it('TS-5: noop when resolvedPatternIds is empty', async () => {
    const content = '# Memory\n\n## Section [PAT-AUTO-0001]\n- content\n';
    const filePath = writeFixture('memory5.md', content);
    const before = readFixture(filePath);

    await pruneResolvedMemory([], filePath);

    expect(readFixture(filePath)).toBe(before);
  });

  it('TS-6: noop when resolvedPatternIds is null/undefined', async () => {
    const content = '# Memory\n\n## Section [PAT-AUTO-0001]\n- content\n';
    const filePath = writeFixture('memory6.md', content);
    const before = readFixture(filePath);

    await pruneResolvedMemory(null, filePath);
    await pruneResolvedMemory(undefined, filePath);

    expect(readFixture(filePath)).toBe(before);
  });
});
