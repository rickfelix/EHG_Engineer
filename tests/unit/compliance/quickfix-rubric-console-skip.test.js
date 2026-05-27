// QF-20260527-772: prevent regression of the anti-pattern CLI-script-skip
// rule in lib/quickfix-compliance-rubric.js. The blanket /console\.log\(/g
// pattern false-positived on 6 consecutive QFs in session 2026-05-27, all of
// which touched files under scripts/ that legitimately use console output as
// the user interface. The skip rule must exclude scripts/, bin/, cli/ trees
// and .cjs/.mjs files in addition to the prior .test./.spec. exclusion.
//
// Static-pattern assertions over the rubric source (same convention as
// other regression-pin tests this session: dedup-gate, sweep-stale-filter,
// generate-retrospective-filtered-existence, sub-agent-repo-resolution).

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, '../../../lib/quickfix-compliance-rubric.js');

describe('QF-20260527-772: rubric skips CLI-script paths in anti-pattern check', () => {
  const code = fs.readFileSync(SRC, 'utf8');

  it('skip rule excludes scripts/, bin/, cli/ path segments', () => {
    // Regex must match a directory boundary (start or path separator) followed
    // by one of the CLI-script directory names followed by another separator.
    expect(code).toMatch(/\(\^\|\[\\\\\/\]\)\(scripts\|bin\|cli\)\[\\\\\/\]/);
  });

  it('skip rule excludes .cjs and .mjs file extensions', () => {
    expect(code).toMatch(/\\\.\(cjs\|mjs\)\$/);
  });

  it('skip rule is positioned BEFORE the antiPatterns loop (skips before scanning)', () => {
    // The skip continue statements must precede the for-of antiPatterns block
    // so anti-pattern matching is never run on CLI-script files.
    const skipMatch = code.match(/scripts\|bin\|cli/);
    const antiLoopMatch = code.match(/for\s*\(\s*const\s*\{\s*pattern,\s*issue\s*\}\s*of\s*antiPatterns/);
    expect(skipMatch?.index).toBeGreaterThanOrEqual(0);
    expect(antiLoopMatch?.index).toBeGreaterThanOrEqual(0);
    expect(skipMatch.index).toBeLessThan(antiLoopMatch.index);
  });

  it('prior .test./.spec. skip is preserved (regression guard)', () => {
    expect(code).toMatch(/file\.includes\(['"]\.test\.['"]\)\s*\|\|\s*file\.includes\(['"]\.spec\.['"]\)/);
  });
});
