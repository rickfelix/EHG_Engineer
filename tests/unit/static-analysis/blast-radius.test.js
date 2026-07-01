/**
 * Blast Radius — Unit Tests
 * SD-LEO-INFRA-FIRST-PARTY-CODEBASE-STRUCTURAL-ANALYSIS-001 (TS-3)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { computeBlastRadius, formatReport } from '../../../lib/static-analysis/blast-radius.js';

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf-8' });
}

function initRepo(tmpDir) {
  git(['init', '-q'], tmpDir);
  git(['config', 'user.email', 'test@example.com'], tmpDir);
  git(['config', 'user.name', 'Test'], tmpDir);
}

describe('blast-radius', () => {
  let tmpDir;
  let libDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'blast-radius-test-'));
    initRepo(tmpDir);
    // discoverTrackedSourceFiles is scoped to lib/, scripts/, server/ (this repo's convention).
    libDir = path.join(tmpDir, 'lib');
    fs.mkdirSync(libDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('flags a consumer not touched in the same diff, distinct from one that was updated (TS-3)', () => {
    fs.writeFileSync(path.join(libDir, 'lib-a.js'), 'export function doThing() { return 1; }\n');
    fs.writeFileSync(path.join(libDir, 'consumer1.js'), "import { doThing } from './lib-a.js';\ndoThing();\n");
    fs.writeFileSync(path.join(libDir, 'consumer2.js'), "import { doThing } from './lib-a.js';\ndoThing();\n");
    git(['add', '.'], tmpDir);
    git(['commit', '-q', '-m', 'base'], tmpDir);
    const baseRef = git(['rev-parse', 'HEAD'], tmpDir).trim();

    // Change doThing's behavior. Update consumer1 in the same diff; leave consumer2 untouched.
    fs.writeFileSync(path.join(libDir, 'lib-a.js'), 'export function doThing() { return 2; }\n');
    fs.writeFileSync(path.join(libDir, 'consumer1.js'), "import { doThing } from './lib-a.js';\ndoThing(); // updated for new behavior\n");
    git(['add', '.'], tmpDir);
    git(['commit', '-q', '-m', 'change doThing'], tmpDir);

    const { report, warnings, changedFiles } = computeBlastRadius(baseRef, tmpDir);
    expect(warnings).toEqual([]);
    expect(changedFiles.sort()).toEqual(['lib/consumer1.js', 'lib/lib-a.js']);

    expect(report).toHaveLength(1);
    const entry = report[0];
    expect(entry.file).toBe('lib/lib-a.js');
    expect(entry.exportName).toBe('doThing');
    expect(entry.changeType).toBe('modified');

    const consumerFiles = entry.consumers.map((c) => c.file).sort();
    expect(consumerFiles).toEqual(['lib/consumer1.js', 'lib/consumer2.js']);

    expect(entry.untouchedConsumers).toHaveLength(1);
    expect(entry.untouchedConsumers[0].file).toBe('lib/consumer2.js');

    const rendered = formatReport(report, baseRef, changedFiles);
    expect(rendered).toContain('lib/consumer2.js');
    expect(rendered).toContain('NOT touched in this diff');
  });

  it('returns an empty report when no exported symbols changed', () => {
    fs.writeFileSync(path.join(libDir, 'lib-a.js'), 'export function doThing() { return 1; }\n');
    git(['add', '.'], tmpDir);
    git(['commit', '-q', '-m', 'base'], tmpDir);
    const baseRef = git(['rev-parse', 'HEAD'], tmpDir).trim();

    // Non-export-affecting change: add an internal (non-exported) helper.
    fs.writeFileSync(
      path.join(libDir, 'lib-a.js'),
      'function helper() { return 0; }\nexport function doThing() { return 1; }\n'
    );
    git(['add', '.'], tmpDir);
    git(['commit', '-q', '-m', 'internal change'], tmpDir);

    const { report } = computeBlastRadius(baseRef, tmpDir);
    expect(report).toEqual([]);
  });

  it('flags removed-export consumers as blast radius too', () => {
    fs.writeFileSync(path.join(libDir, 'lib-a.js'), 'export function doThing() { return 1; }\n');
    fs.writeFileSync(path.join(libDir, 'consumer1.js'), "import { doThing } from './lib-a.js';\ndoThing();\n");
    git(['add', '.'], tmpDir);
    git(['commit', '-q', '-m', 'base'], tmpDir);
    const baseRef = git(['rev-parse', 'HEAD'], tmpDir).trim();

    fs.writeFileSync(path.join(libDir, 'lib-a.js'), '// doThing removed\n');
    git(['add', '.'], tmpDir);
    git(['commit', '-q', '-m', 'remove doThing'], tmpDir);

    const { report } = computeBlastRadius(baseRef, tmpDir);
    expect(report).toHaveLength(1);
    expect(report[0].changeType).toBe('removed');
    expect(report[0].untouchedConsumers.map((c) => c.file)).toEqual(['lib/consumer1.js']);
  });
});
