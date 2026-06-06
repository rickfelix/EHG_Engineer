/**
 * Regression coverage for SD-LEO-FIX-FIX-STAGE-CODE-001 (D1).
 *
 * capability-registry.js is ESM (package.json type:module). Before the fix,
 * probeModule() did `const fs = require('fs')` inside the function body, which
 * throws 'require is not defined' under ESM — so the (optional:false)
 * 'finding-writer' capability was caught by the surrounding try/catch and
 * falsely reported missing on EVERY venture, hard-failing the Stage 20
 * capability gate.
 *
 * IMPORTANT: this suite loads the module via a real ESM `import` (vitest is
 * ESM). It deliberately does NOT shell out to `node -e`, because CommonJS has
 * `require` as a global and would MASK the very bug under test.
 */

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import {
  probeModule,
  probeCli,
  probeEnv,
  CAPABILITIES,
} from '../../../../lib/eva/quality-findings/capability-registry.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Repo root is 4 levels up from tests/unit/eva/quality-findings/.
const REPO_ROOT = path.resolve(__dirname, '../../../..');
const REGISTRY_PATH = path.join(REPO_ROOT, 'lib/eva/quality-findings/capability-registry.js');

describe('SD-LEO-FIX-FIX-STAGE-CODE-001 D1 — probeModule resolves under ESM', () => {
  it('probeModule does not throw "require is not defined" and resolves an existing module', () => {
    // The writer.js module is the exact path the (optional:false) finding-writer
    // capability probes — it must resolve ok=true, not be caught as missing.
    const result = probeModule('lib/eva/quality-findings/writer.js');
    expect(result.ok).toBe(true);
    // No error surfaced from a thrown bare `require`.
    expect(result.error).toBeUndefined();
  });

  it('probeModule returns ok=false with a "module not found" error for a missing path (no require crash)', () => {
    const result = probeModule('lib/eva/quality-findings/__does_not_exist__.js');
    expect(result.ok).toBe(false);
    // The failure is the clean "module not found" branch — NOT a thrown
    // ReferenceError about `require` being undefined.
    expect(result.error).toMatch(/module not found/i);
    expect(result.error).not.toMatch(/require is not defined/i);
  });

  it('the finding-writer capability entry probes cleanly (the regression scenario)', () => {
    const findingWriter = CAPABILITIES.find((c) => c.name === 'finding-writer');
    expect(findingWriter).toBeDefined();
    expect(findingWriter.optional).toBe(false);
    const verdict = findingWriter.probe();
    expect(verdict.ok).toBe(true);
  });

  it('sibling probes still behave (probeCli + probeEnv unaffected by the require shim)', () => {
    // node should always be present in a vitest run environment.
    const node = probeCli('node');
    expect(node.ok).toBe(true);
    // An unset env var is a clean not-ok, never a thrown error.
    const missing = probeEnv('__CAP_REGISTRY_UNSET_ENV__');
    expect(missing.ok).toBe(false);
  });

  // NOTE: vitest runs under vite's SSR transform, which injects a `require`
  // shim into module scope — so a bare `require('fs')` would NOT throw here even
  // if the fix were reverted (the bug is masked in vitest). The two guards below
  // catch a regression to bare `require` despite that masking:
  //   1. a source-level assertion that the createRequire shim is established;
  //   2. a raw `node --input-type=module` subprocess that runs probeModule in
  //      the REAL production ESM runtime (no vite shim) — where the original
  //      bug actually manifested.

  it('source establishes a createRequire(import.meta.url) shim (static regression guard)', () => {
    const src = readFileSync(REGISTRY_PATH, 'utf8');
    expect(src).toMatch(/createRequire\(\s*import\.meta\.url\s*\)/);
    expect(src).toMatch(/import\s*\{\s*createRequire\s*\}\s*from\s*['"]node:module['"]/);
  });

  it('probeModule.ok===true under RAW Node ESM (production runtime, not the vite-shimmed vitest env)', () => {
    // This subprocess deliberately uses --input-type=module so there is NO vite
    // require shim. Reverting capability-registry.js to a bare `require` makes
    // this print {"ok":false,"error":"require is not defined"} and the assertion
    // fails — which the in-process vitest import test cannot detect.
    // On Windows an ESM import specifier must be a file:// URL, not a bare
    // C:\ path — convert via pathToFileURL (cross-platform safe).
    const registryUrl = pathToFileURL(REGISTRY_PATH).href;
    const script = [
      "import { probeModule } from " + JSON.stringify(registryUrl) + ";",
      "const r = probeModule('lib/eva/quality-findings/writer.js');",
      "process.stdout.write(JSON.stringify(r));",
    ].join('\n');
    const out = execFileSync(process.execPath, ['--input-type=module', '--eval', script], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });
    const parsed = JSON.parse(out);
    expect(parsed.ok).toBe(true);
    expect(parsed.error).toBeUndefined();
  });
});
