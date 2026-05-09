// QF-20260509-393: 3-fix harness cluster (sd-start STUCK + .gitignore + WIRE_CHECK glob).

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');

describe('QF-20260509-393 #1: sd-start.js STUCK detector uses sd_id (UUID FK)', () => {
  it('STUCK detector queries sd_phase_handoffs by sd_id, not sd_key', () => {
    const src = fs.readFileSync(path.join(repoRoot, 'scripts/sd-start.js'), 'utf-8');
    // Locate the STUCK SD WARNING block — anchor on the warning text
    const warnIdx = src.indexOf('STUCK SD WARNING');
    expect(warnIdx).toBeGreaterThan(0);
    // Look back ~600 chars for the handoffs query that drives the warning
    const block = src.slice(Math.max(0, warnIdx - 600), warnIdx);
    expect(block).toMatch(/from\(['"]sd_phase_handoffs['"]\)/);
    expect(block).toMatch(/\.eq\(['"]sd_id['"]/);
    expect(block).not.toMatch(/\.eq\(['"]sd_key['"],\s*sd\.id\)/);
  });
});

describe('QF-20260509-393 #2: .gitignore documents the verify-* trap', () => {
  it('has explicit comment block above scripts/verify-* patterns', () => {
    const gi = fs.readFileSync(path.join(repoRoot, '.gitignore'), 'utf-8');
    const idx = gi.indexOf('scripts/verify-*.mjs');
    expect(idx).toBeGreaterThan(0);
    // Comment block must precede the patterns
    const before = gi.slice(Math.max(0, idx - 600), idx);
    expect(before).toMatch(/silently dropped/i);
    expect(before).toMatch(/!scripts\/verify-/);
  });
});

describe('QF-20260509-393 #3: WIRE_CHECK getScopedJsFiles includes flat scripts/', () => {
  it('git ls-files command uses directory pathspec, not glob, and has client-side extension filter', () => {
    const src = fs.readFileSync(
      path.join(repoRoot, 'scripts/modules/handoff/executors/lead-final-approval/gates/wire-check-gate.js'),
      'utf-8'
    );
    const idx = src.indexOf('function getScopedJsFiles');
    expect(idx).toBeGreaterThan(0);
    const block = src.slice(idx, idx + 1200);

    // The execSync git-ls-files call: extract the single-quoted string arg.
    // Use [\s\S] across newlines and a lazy match terminated by `'` immediately
    // followed by `,` (the next execSync arg).
    const cmdMatch = block.match(/execSync\(\s*'([\s\S]+?)',/);
    expect(cmdMatch).not.toBeNull();
    const command = cmdMatch[1];
    // Bad pattern (pre-fix): scripts/**/*.js (excludes flat scripts/*.js)
    expect(command).not.toMatch(/scripts\/\*\*\/\*\./);
    // Good pattern: directory pathspec
    expect(command).toMatch(/scripts\//);

    // Must have client-side extension filter (regex tests js|mjs|cjs)
    expect(block).toMatch(/js\|mjs\|cjs/);
  });
});
