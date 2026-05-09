// QF-20260509-G2FID-SECTIONS: implementation-fidelity short-circuit branch
// (no DESIGN/DATABASE analysis) must populate validation.sections.A/B/C/D
// with bypassSection — otherwise downstream sub-validators read undefined
// → 0/100 while top-level GATE2 reports 100/100 (11x retry witnessed
// 2026-05-04 SD-PRIVACYPATROL-...-D3 EXEC-TO-PLAN). Closes feedback 7e2bd2a7.

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');

describe('QF-20260509-G2FID-SECTIONS: short-circuit branch source-level guard', () => {
  it('no-DESIGN-no-DATABASE branch sets validation.sections + sectionScores', () => {
    const src = fs.readFileSync(
      path.join(repoRoot, 'scripts/modules/implementation-fidelity/index.js'),
      'utf-8'
    );
    // Locate the short-circuit branch
    const idx = src.indexOf('No DESIGN or DATABASE analysis found');
    expect(idx).toBeGreaterThan(0);
    // Look forward ~1000 chars for the bypassSection wiring
    const block = src.slice(idx, idx + 1500);
    expect(block).toMatch(/bypassSection/);
    expect(block).toMatch(/validation\.sections\s*=/);
    expect(block).toMatch(/A:\s*bypassSection/);
    expect(block).toMatch(/B:\s*bypassSection/);
    expect(block).toMatch(/C:\s*bypassSection/);
    expect(block).toMatch(/D:\s*bypassSection/);
    expect(block).toMatch(/validation\.sectionScores\s*=/);
  });

  it('bypassSection shape matches docu-skip pattern at lines 82-99', () => {
    const src = fs.readFileSync(
      path.join(repoRoot, 'scripts/modules/implementation-fidelity/index.js'),
      'utf-8'
    );
    // Both blocks should declare bypassSection with score:100 + passed:true + issues + warnings
    const matches = src.match(/const bypassSection\s*=\s*{[\s\S]+?};/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(2);  // docu-skip + no-analysis
    matches.forEach(m => {
      expect(m).toMatch(/score:\s*100/);
      expect(m).toMatch(/passed:\s*true/);
      expect(m).toMatch(/issues:\s*\[\s*\]/);
      expect(m).toMatch(/warnings:/);
    });
  });

  it('short-circuit branch returns AFTER populating sections (not before)', () => {
    const src = fs.readFileSync(
      path.join(repoRoot, 'scripts/modules/implementation-fidelity/index.js'),
      'utf-8'
    );
    const startIdx = src.indexOf('No DESIGN or DATABASE analysis found');
    const block = src.slice(startIdx, startIdx + 1500);
    const sectionsIdx = block.indexOf('validation.sections =');
    const returnIdx = block.indexOf('return validation;');
    expect(sectionsIdx).toBeGreaterThan(0);
    expect(returnIdx).toBeGreaterThan(sectionsIdx);  // return AFTER sections set
  });
});
