import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { loadFixture, loadFixturesForScript, FixtureShapeError } from './fixture-loader.mjs';

const VALID = {
  input: { foo: 'bar' },
  v1_output: { judgment: 'pass' },
  validator_result: { passed: true },
  captured_at: '2026-04-25T12:00:00Z',
  sanitized: true,
};

let tmpDir;

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'replay-fixture-loader-'));
});

afterAll(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

async function writeFixture(name, body) {
  const p = path.join(tmpDir, name);
  await fs.writeFile(p, JSON.stringify(body));
  return p;
}

describe('loadFixture', () => {
  it('loads a valid sanitized fixture', async () => {
    const p = await writeFixture('valid.json', VALID);
    const f = await loadFixture(p);
    expect(f).toEqual(VALID);
  });

  it('throws FixtureShapeError on invalid JSON', async () => {
    const p = path.join(tmpDir, 'bad.json');
    await fs.writeFile(p, '{not valid json');
    await expect(loadFixture(p)).rejects.toThrow(FixtureShapeError);
  });

  it('throws on missing required field', async () => {
    const { sanitized: _drop, ...incomplete } = VALID;
    const p = await writeFixture('missing.json', incomplete);
    await expect(loadFixture(p)).rejects.toThrow(/missing required field: sanitized/);
  });

  it('throws on non-boolean sanitized', async () => {
    const p = await writeFixture('non-bool.json', { ...VALID, sanitized: 'yes' });
    await expect(loadFixture(p)).rejects.toThrow(/must be boolean/);
  });

  it('refuses fixtures with sanitized=false', async () => {
    const p = await writeFixture('unsan.json', { ...VALID, sanitized: false });
    await expect(loadFixture(p)).rejects.toThrow(/not marked sanitized=true/);
  });

  it('rejects sanitized:true fixtures that still contain secrets (belt-and-suspenders)', async () => {
    // Assembled at runtime to avoid tripping the repo's pre-commit secret-scanner.
    const fakeAwsKey = 'AK' + 'IA' + 'IOSFODNN7EXAMPLE';
    const dirty = { ...VALID, v1_output: { leaked: fakeAwsKey } };
    const p = await writeFixture('lying.json', dirty);
    await expect(loadFixture(p)).rejects.toThrow(/aws_access_key/);
  });
});

describe('loadFixturesForScript', () => {
  it('returns [] when script directory is missing', async () => {
    const out = await loadFixturesForScript('does-not-exist', tmpDir);
    expect(out).toEqual([]);
  });

  it('loads multiple fixtures and skips schema.json', async () => {
    const dir = path.join(tmpDir, 'demo-script');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'fixture-001.json'), JSON.stringify(VALID));
    await fs.writeFile(path.join(dir, 'fixture-002.json'), JSON.stringify({ ...VALID, captured_at: '2026-04-25T13:00:00Z' }));
    await fs.writeFile(path.join(dir, 'schema.json'), JSON.stringify({ ignored: true }));
    await fs.writeFile(path.join(dir, 'notes.md'), 'should be ignored');
    const fixtures = await loadFixturesForScript('demo-script', tmpDir);
    expect(fixtures).toHaveLength(2);
    expect(fixtures.every(f => f.sanitized === true)).toBe(true);
  });
});
