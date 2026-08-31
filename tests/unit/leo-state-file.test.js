import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { writeLeoStatusFile, clearLeoStatusFile } from '../../lib/leo-status-file.js';

describe('writeLeoStatusFile / clearLeoStatusFile (SD-LEO-INFRA-LEO-PHASE-TAGGED-001 FR-1)', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'leo-status-write-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('writes sd_key/leo_phase to a fresh state file', () => {
    const result = writeLeoStatusFile(tmpDir, { sdKey: 'SD-X-001', leoPhase: 'EXEC' });
    expect(result.ok).toBe(true);
    const written = JSON.parse(fs.readFileSync(path.join(tmpDir, '.leo-status.json'), 'utf8'));
    expect(written.sd_key).toBe('SD-X-001');
    expect(written.leo_phase).toBe('EXEC');
  });

  it('merges into an existing file instead of clobbering unrelated keys (e.g. autoProceed)', () => {
    fs.writeFileSync(path.join(tmpDir, '.leo-status.json'), JSON.stringify({ autoProceed: { isActive: true, phase: 'PLAN', progress: 40 } }));
    writeLeoStatusFile(tmpDir, { sdKey: 'SD-X-001', leoPhase: 'EXEC' });
    const written = JSON.parse(fs.readFileSync(path.join(tmpDir, '.leo-status.json'), 'utf8'));
    expect(written.autoProceed).toEqual({ isActive: true, phase: 'PLAN', progress: 40 });
    expect(written.sd_key).toBe('SD-X-001');
    expect(written.leo_phase).toBe('EXEC');
  });

  it('updates sd_key/leo_phase on a second write (subsequent phase transition)', () => {
    writeLeoStatusFile(tmpDir, { sdKey: 'SD-X-001', leoPhase: 'LEAD' });
    writeLeoStatusFile(tmpDir, { sdKey: 'SD-X-001', leoPhase: 'PLAN_PRD' });
    const written = JSON.parse(fs.readFileSync(path.join(tmpDir, '.leo-status.json'), 'utf8'));
    expect(written.leo_phase).toBe('PLAN_PRD');
  });

  it('does not leave a stray .tmp-* file behind after a successful write (atomic rename)', () => {
    writeLeoStatusFile(tmpDir, { sdKey: 'SD-X-001', leoPhase: 'EXEC' });
    const files = fs.readdirSync(tmpDir);
    expect(files).toEqual(['.leo-status.json']);
  });

  it('fails soft (returns ok:false, never throws) with missing required args', () => {
    expect(() => writeLeoStatusFile(tmpDir, { sdKey: null, leoPhase: 'EXEC' })).not.toThrow();
    const result = writeLeoStatusFile(tmpDir, { sdKey: null, leoPhase: 'EXEC' });
    expect(result.ok).toBe(false);
  });

  it('fails soft on an unwritable cwd (never throws)', () => {
    const result = writeLeoStatusFile('/definitely/does/not/exist/at/all', { sdKey: 'SD-X-001', leoPhase: 'EXEC' });
    expect(result.ok).toBe(false);
    expect(result.reason).toBeTruthy();
  });

  it('clearLeoStatusFile sets sd_key/leo_phase to null without deleting other fields', () => {
    writeLeoStatusFile(tmpDir, { sdKey: 'SD-X-001', leoPhase: 'LEAD_FINAL' });
    fs.writeFileSync(
      path.join(tmpDir, '.leo-status.json'),
      JSON.stringify({ ...JSON.parse(fs.readFileSync(path.join(tmpDir, '.leo-status.json'), 'utf8')), autoProceed: { isActive: false } })
    );
    const result = clearLeoStatusFile(tmpDir);
    expect(result.ok).toBe(true);
    const written = JSON.parse(fs.readFileSync(path.join(tmpDir, '.leo-status.json'), 'utf8'));
    expect(written.sd_key).toBeNull();
    expect(written.leo_phase).toBeNull();
    expect(written.autoProceed).toEqual({ isActive: false });
  });

  it('clearLeoStatusFile is a no-op on a file that already has no sd_key/leo_phase', () => {
    fs.writeFileSync(path.join(tmpDir, '.leo-status.json'), JSON.stringify({ autoProceed: { isActive: false } }));
    const result = clearLeoStatusFile(tmpDir);
    expect(result.ok).toBe(true);
    expect(result.reason).toBe('noop');
  });

  it('clearLeoStatusFile fails soft when no cwd is given', () => {
    const result = clearLeoStatusFile(undefined);
    expect(result.ok).toBe(false);
  });
});
