import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { checkNodeModulesFreshness } = require('../../../lib/fleet/node-modules-freshness.cjs');

let tmpDir;

function writeLock(fileName, packages) {
  fs.writeFileSync(path.join(tmpDir, fileName), JSON.stringify({ lockfileVersion: 3, packages }), 'utf8');
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nm-freshness-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('checkNodeModulesFreshness (QF-20260901-083)', () => {
  it('reports fresh when no package-lock.json exists (nothing to compare)', () => {
    const result = checkNodeModulesFreshness(tmpDir);
    expect(result.fresh).toBe(true);
    expect(result.installCommand).toBeNull();
  });

  it('reports drift and names `npm install` when node_modules has no install snapshot at all', () => {
    writeLock('package-lock.json', { '': {}, 'node_modules/imapflow': { version: '1.7.7' } });
    const result = checkNodeModulesFreshness(tmpDir);
    expect(result.fresh).toBe(false);
    expect(result.installCommand).toBe('npm install');
  });

  it('reports fresh when declared and installed versions match', () => {
    fs.mkdirSync(path.join(tmpDir, 'node_modules'));
    writeLock('package-lock.json', { '': {}, 'node_modules/imapflow': { version: '1.7.7' } });
    writeLock(path.join('node_modules', '.package-lock.json'), { '': {}, 'node_modules/imapflow': { version: '1.7.7' } });
    const result = checkNodeModulesFreshness(tmpDir);
    expect(result.fresh).toBe(true);
    expect(result.drifted).toEqual([]);
  });

  it('QF-20260901-083: reports drift when a declared package is locked but never installed (the witnessed symptom)', () => {
    fs.mkdirSync(path.join(tmpDir, 'node_modules'));
    writeLock('package-lock.json', {
      '': {},
      'node_modules/imapflow': { version: '1.7.7' },
      'node_modules/mailparser': { version: '3.6.5' },
    });
    // Installed snapshot predates the lockfile addition -- imapflow/mailparser never installed.
    writeLock(path.join('node_modules', '.package-lock.json'), { '': {} });
    const result = checkNodeModulesFreshness(tmpDir);
    expect(result.fresh).toBe(false);
    expect(result.drifted).toEqual(expect.arrayContaining(['imapflow', 'mailparser']));
    expect(result.installCommand).toBe('npm install');
  });

  it('reports drift on a version mismatch, not just presence/absence', () => {
    fs.mkdirSync(path.join(tmpDir, 'node_modules'));
    writeLock('package-lock.json', { '': {}, 'node_modules/imapflow': { version: '1.7.7' } });
    writeLock(path.join('node_modules', '.package-lock.json'), { '': {}, 'node_modules/imapflow': { version: '1.6.0' } });
    const result = checkNodeModulesFreshness(tmpDir);
    expect(result.fresh).toBe(false);
    expect(result.drifted).toEqual(['imapflow']);
  });

  it('fails open (fresh: true) on an unparsable lockfile, never a false alarm', () => {
    fs.mkdirSync(path.join(tmpDir, 'node_modules'));
    fs.writeFileSync(path.join(tmpDir, 'package-lock.json'), '{not valid json', 'utf8');
    fs.writeFileSync(path.join(tmpDir, 'node_modules', '.package-lock.json'), '{}', 'utf8');
    const result = checkNodeModulesFreshness(tmpDir);
    expect(result.fresh).toBe(true);
  });
});
