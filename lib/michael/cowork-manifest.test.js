// SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-F / FR-1, TS-1.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { scanFolder, aggregateHash, buildManifest, diffManifest } from './cowork-manifest.mjs';

let dir;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'michael-cowork-manifest-test-'));
  fs.writeFileSync(path.join(dir, 'gmail.md'), '### gmail: r1\nsome text\n');
  fs.mkdirSync(path.join(dir, 'memory'));
  fs.writeFileSync(path.join(dir, 'memory', 'closures.md'), '### closure: c1\ntopic: x\nbody\n');
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('scanFolder', () => {
  it('recursively walks and hashes every file, sorted by relative path', () => {
    const files = scanFolder(dir);
    expect(files.map((f) => f.path)).toEqual(['gmail.md', 'memory/closures.md']);
    expect(files[0].hash_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(files[0].size_bytes).toBeGreaterThan(0);
  });
});

describe('aggregateHash', () => {
  it('is deterministic for the same file set and changes when a hash changes', () => {
    const files = scanFolder(dir);
    const h1 = aggregateHash(files);
    expect(aggregateHash(scanFolder(dir))).toBe(h1);
    const mutated = files.map((f, i) => (i === 0 ? { ...f, hash_sha256: '0'.repeat(64) } : f));
    expect(aggregateHash(mutated)).not.toBe(h1);
  });
});

describe('buildManifest / diffManifest', () => {
  it('verifies clean against an unchanged folder', () => {
    const prior = buildManifest(dir);
    const current = buildManifest(dir);
    expect(diffManifest(prior, current)).toEqual({ drifted: false, added: [], removed: [], changed: [] });
  });

  it('detects a changed file by name', () => {
    const prior = buildManifest(dir);
    fs.writeFileSync(path.join(dir, 'gmail.md'), '### gmail: r1\nDIFFERENT text\n');
    const current = buildManifest(dir);
    const diff = diffManifest(prior, current);
    expect(diff.drifted).toBe(true);
    expect(diff.changed).toEqual(['gmail.md']);
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
  });

  it('detects an added file and a removed file', () => {
    const prior = buildManifest(dir);
    fs.rmSync(path.join(dir, 'gmail.md'));
    fs.writeFileSync(path.join(dir, 'todoist.md'), '### todoist: r1\ntext\n');
    const current = buildManifest(dir);
    const diff = diffManifest(prior, current);
    expect(diff.drifted).toBe(true);
    expect(diff.added).toEqual(['todoist.md']);
    expect(diff.removed).toEqual(['gmail.md']);
  });
});
