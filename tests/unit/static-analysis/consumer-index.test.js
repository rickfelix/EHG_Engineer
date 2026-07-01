/**
 * Consumer Index — Unit Tests
 * SD-LEO-INFRA-FIRST-PARTY-CODEBASE-STRUCTURAL-ANALYSIS-001 (TS-1, TS-4)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { buildConsumerIndex, findConsumers } from '../../../lib/static-analysis/consumer-index.js';

describe('consumer-index', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'consumer-index-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function write(relPath, content) {
    const abs = path.join(tmpDir, relPath);
    fs.writeFileSync(abs, content);
    return abs;
  }

  it('resolves named-import consumers across a multi-file fixture (TS-1)', () => {
    const libA = write('lib-a.js', [
      'export function foo() { return 1; }',
      'export const bar = 2;',
      'export default function baz() { return 3; }',
    ].join('\n'));
    const consumerNamed = write('consumer-named.js', "import { foo } from './lib-a.js';\nfoo();\n");
    const consumerNamespace = write('consumer-namespace.js', "import * as A from './lib-a.js';\nA.bar;\n");
    const consumerRequire = write('consumer-require.js', "const libA = require('./lib-a.js');\n");
    write('consumer-unrelated.js', "import { unrelated } from './other.js';\n");

    const filePaths = [libA, consumerNamed, consumerNamespace, consumerRequire,
      path.join(tmpDir, 'consumer-unrelated.js')];
    const { index, warnings } = buildConsumerIndex(filePaths, tmpDir);
    expect(warnings).toEqual([]);

    const libAAbs = libA.replace(/\\/g, '/');
    const fooConsumers = findConsumers(index, libAAbs, 'foo');
    const fooFiles = fooConsumers.map((c) => c.file);

    expect(fooFiles).toContain('consumer-named.js');
    // Whole-module (namespace/require) consumers are conservatively included
    // for every export of the module, since they could reference anything.
    expect(fooFiles).toContain('consumer-namespace.js');
    expect(fooFiles).toContain('consumer-require.js');
    expect(fooFiles).not.toContain('consumer-unrelated.js');

    const namedConsumer = fooConsumers.find((c) => c.file === 'consumer-named.js');
    expect(namedConsumer.kind).toBe('named');
    expect(namedConsumer.line).toBe(1);
  });

  it('captures namespace/import-star/require consumers in the whole-module bucket', () => {
    const libA = write('lib-a.js', 'export const x = 1;\n');
    write('ns.js', "import * as A from './lib-a.js';\n");
    write('req.js', "require('./lib-a.js');\n");

    const filePaths = [libA, path.join(tmpDir, 'ns.js'), path.join(tmpDir, 'req.js')];
    const { index } = buildConsumerIndex(filePaths, tmpDir);
    const libAAbs = libA.replace(/\\/g, '/');

    const wholeModuleConsumers = index.wholeModule.get(libAAbs) || [];
    const kinds = wholeModuleConsumers.map((c) => c.kind).sort();
    expect(kinds).toEqual(['namespace', 'require']);
  });

  it('does not resolve external/bare package specifiers into the index', () => {
    const consumer = write('consumer.js', "import { readFile } from 'fs/promises';\n");
    const { index, warnings } = buildConsumerIndex([consumer], tmpDir);
    expect(warnings).toEqual([]);
    expect(index.named.size).toBe(0);
    expect(index.wholeModule.size).toBe(0);
  });

  it('skips an oversized file and still indexes the others (TS-4)', () => {
    const libA = write('lib-a.js', 'export const x = 1;\n');
    const oversized = path.join(tmpDir, 'huge.js');
    // 2MB cap + 1 byte over
    fs.writeFileSync(oversized, `// ${'a'.repeat(2 * 1024 * 1024 + 1)}\n`);
    const consumer = write('consumer.js', "import { x } from './lib-a.js';\n");

    const { index, warnings } = buildConsumerIndex([libA, oversized, consumer], tmpDir);

    expect(warnings.some((w) => w.includes('huge.js') && w.includes('cap'))).toBe(true);
    const libAAbs = libA.replace(/\\/g, '/');
    expect(findConsumers(index, libAAbs, 'x').map((c) => c.file)).toContain('consumer.js');
  });

  it('isolates a malformed file with a syntax error and continues indexing others', () => {
    const libA = write('lib-a.js', 'export const x = 1;\n');
    write('broken.js', 'export const = = = syntax error {{{');
    const consumer = write('consumer.js', "import { x } from './lib-a.js';\n");

    const { index, warnings } = buildConsumerIndex(
      [libA, path.join(tmpDir, 'broken.js'), consumer],
      tmpDir
    );

    expect(warnings.some((w) => w.includes('broken.js'))).toBe(true);
    const libAAbs = libA.replace(/\\/g, '/');
    expect(findConsumers(index, libAAbs, 'x').map((c) => c.file)).toContain('consumer.js');
  });
});
