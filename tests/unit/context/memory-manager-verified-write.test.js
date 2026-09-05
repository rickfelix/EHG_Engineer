/**
 * QF-20260903-992: the context-compact skill's PREPARE step must assert its durable-state
 * write actually landed, not assume it. These tests cover the assertion primitive
 * (sectionLanded) and the throwing wrapper (updateSectionVerified) that make a silent
 * no-op write loud instead of invisible.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import MemoryManager, { sectionLanded } from '../../../lib/context/memory-manager.js';

describe('sectionLanded (pure)', () => {
  it('is true when the section body starts with the written content', () => {
    const md = '# State\n\n## Pre-Compaction Snapshot\nSD: SD-FOO-001, phase EXEC\n\n## Other\nx';
    expect(sectionLanded(md, 'Pre-Compaction Snapshot', 'SD: SD-FOO-001, phase EXEC')).toBe(true);
  });

  it('is false when the section is missing entirely', () => {
    const md = '# State\n\n## Other\nx';
    expect(sectionLanded(md, 'Pre-Compaction Snapshot', 'SD: SD-FOO-001')).toBe(false);
  });

  it('is false when the section exists but the write silently landed different content', () => {
    const md = '# State\n\n## Pre-Compaction Snapshot\nstale leftover text\n\n## Other\nx';
    expect(sectionLanded(md, 'Pre-Compaction Snapshot', 'SD: SD-FOO-001, phase EXEC')).toBe(false);
  });
});

describe('MemoryManager.updateSectionVerified', () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'memory-manager-verify-'));
    await fs.mkdir(path.join(tmpDir, '.claude'), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('resolves true and the read-back file actually contains the written content', async () => {
    const memory = new MemoryManager(tmpDir);
    await memory.startSession('SD-FOO-001', 'EXEC');

    await expect(memory.updateSectionVerified('Pre-Compaction Snapshot', 'unresolved: none; decisions: none')).resolves.toBe(true);

    const onDisk = await fs.readFile(memory.sessionFile, 'utf8');
    expect(onDisk).toContain('unresolved: none; decisions: none');
  });

  it('bootstraps a session file that does not exist yet, rather than failing on the ordinary case', async () => {
    // No startSession() call happened -- updateSectionVerified must not treat "no prior
    // session file" as a hard failure; it should create a minimal skeleton and proceed.
    const memory = new MemoryManager(tmpDir);
    await expect(memory.updateSectionVerified('Pre-Compaction Snapshot', 'bootstrapped')).resolves.toBe(true);
  });

  it('throws loudly instead of returning true when updateSection reports success but nothing actually landed', async () => {
    // Simulates the pathological case this method exists to catch: the underlying write
    // reports success without the content actually being on disk (e.g. a future regex
    // regression in updateSection). A boolean return alone cannot be trusted; the
    // read-back assertion must fail loudly instead of silently accepting the lie.
    const memory = new MemoryManager(tmpDir);
    await memory.startSession('SD-FOO-001', 'EXEC');
    memory.updateSection = async () => true;
    await expect(memory.updateSectionVerified('Pre-Compaction Snapshot', 'this text was never written')).rejects.toThrow(/read-back check failed/);
  });
});
