/**
 * Modules that production imports must be loadable BY NODE, not merely by Vitest.
 * QF-20260807-145.
 *
 * THE DEFECT THIS EXISTS TO CATCH, measured: lib/quality/tuning-rules.js ended in
 * `module.exports = {...}` while package.json declares "type": "module". Node therefore parsed it
 * as ESM, the CommonJS assignment did nothing, and the module exported NOTHING —
 *     import { recommend } from './lib/quality/tuning-rules.js'
 *     -> SyntaxError: does not provide an export named 'recommend'
 * while `require()` of it returned `{}`.
 *
 * ITS OWN 18 TESTS PASSED THROUGHOUT. That is the whole reason this guard has to exist and the
 * reason it is written the way it is: Vitest resolves through Vite, whose transform supplies
 * CJS/ESM interop that the Node runtime does not. So an ordinary `import` inside a test file
 * exercises a path production never takes, and would have stayed green on the broken module.
 *
 * A TEST THAT IMPORTS THE MODULE NORMALLY CANNOT DETECT THIS. It has to leave the transform. So
 * this spawns a real `node` process and performs the import there — the axis the edit did not
 * target, and the only one that reflects what production does.
 *
 * Combined with zero production consumers, the break was invisible by construction: nobody
 * imported the module, so nobody discovered that it could not be imported.
 */

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import path from 'path';

const REPO = process.cwd();

/**
 * Modules that are specifications or shared libraries — things another module is expected to
 * import. Add to this list rather than writing a new bespoke test.
 */
const MUST_BE_ESM_LOADABLE = [
  { file: 'lib/quality/tuning-rules.js', named: ['recommend', 'changeIsEffective', 'RECOMMENDATION', 'MIN_SAMPLE', 'STEP'] }
];

/** Import `file` in a REAL node process (no Vite transform) and report what actually happened. */
function importInRealNode(file, named) {
  const spec = 'file:///' + path.resolve(REPO, file).replace(/\\/g, '/');
  const src = `import { ${named.join(', ')} } from ${JSON.stringify(spec)};`
    + `console.log(JSON.stringify(${JSON.stringify(named)}.map((n) => typeof eval(n))));`;
  try {
    return { ok: true, types: JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', src], { encoding: 'utf8', cwd: REPO }).trim()) };
  } catch (e) {
    return { ok: false, error: String(e.stderr || e.message || e) };
  }
}

describe('specification modules load in Node, not just in the test transform', () => {
  for (const { file, named } of MUST_BE_ESM_LOADABLE) {
    it(`${file} provides its named exports to a real node process`, () => {
      const res = importInRealNode(file, named);
      expect(
        res.ok,
        `${file} could not be imported by Node itself. The usual cause is a CommonJS `
        + `"module.exports = {...}" in a package whose package.json declares "type": "module" — `
        + `Node parses the file as ESM, the assignment is inert, and the module exports nothing. `
        + `Vitest hides this because Vite's transform adds interop that the runtime does not.\n\n${res.error}`
      ).toBe(true);
      expect(res.types, `${file} imported, but some named exports are undefined`).not.toContain('undefined');
    });
  }

  it('CONTROL: the probe genuinely FAILS on a module that lacks the export', () => {
    // Without this, importInRealNode returning ok for everything would make the assertions above
    // unfalsifiable — the same shape of blindness the guard exists to catch.
    const res = importInRealNode('lib/quality/tuning-rules.js', ['definitelyNotExported']);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/does not provide an export named/i);
  });
});
