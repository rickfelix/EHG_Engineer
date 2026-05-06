// SD-LEO-INFRA-BUILDDEFAULTSMOKETESTSTEPS-KEYWORD-DETECTOR-001
//
// Covers FR-1 (keyword expansion) + FR-2 (three-step fallback chain) + FR-3 (atomic INSERT)
// + FR-4 (named export) + FR-5 (>=12 vitest cases). 16 subtests + 1 regression guard for "gates".
//
// Direct-ESM-import pattern (mirrors sd-creation-roundtrip.test.js, NOT spawn-probe).
// FR-2 fallback chain is tested by re-implementing the verbatim resolution helper
// from scripts/leo-create-sd.js:1324 — if production drifts, this helper would also need to
// drift, so static assertions in TS-17 + FR-3 regression guard catch silent regressions.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { buildDefaultSmokeTestSteps } from '../leo-create-sd.js';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const SOURCE_PATH = path.resolve(__dirname, '../leo-create-sd.js');
const SOURCE = fs.readFileSync(SOURCE_PATH, 'utf8');

// Verbatim mirror of the call-site fallback at scripts/leo-create-sd.js:1324
// `options.scope ?? options.metadata?.scope ?? description`
function resolveScope(options, description) {
  return options.scope ?? options.metadata?.scope ?? description;
}

describe('FR-1: codeKeywords expansion (new keywords fire)', () => {
  for (const kw of ['flag', 'cli', 'wizard', 'detector', 'parser', 'helper', 'validator', 'hook']) {
    it(`TS new-keyword: "${kw}" triggers detection on infrastructure SD`, () => {
      const scope = `Adds a ${kw} to the harness.`;
      const steps = buildDefaultSmokeTestSteps('infrastructure', 'Untitled', scope);
      expect(steps).toHaveLength(3);
      expect(steps[0].instruction).toContain('Run the modified');
    });
  }
});

describe('FR-1: existing keyword regression', () => {
  it('TS-8: existing keyword ".js" still fires (no regression)', () => {
    const scope = 'Edits a .js source file.';
    const steps = buildDefaultSmokeTestSteps('infrastructure', 'Untitled', scope);
    expect(steps).toHaveLength(3);
  });
});

describe('FR-1: negative path (non-code scope returns [])', () => {
  it('TS-9: empty scope and non-code title returns []', () => {
    const steps = buildDefaultSmokeTestSteps('infrastructure', 'Update product roadmap copy', undefined);
    expect(steps).toEqual([]);
  });
});

describe('Type-routing regressions (lightweight types unaffected)', () => {
  it('TS-10: documentation type returns [] even when scope contains code keyword "script"', () => {
    const steps = buildDefaultSmokeTestSteps('documentation', 'Untitled', 'edits a script');
    expect(steps).toEqual([]);
  });
  it('TS-11: orchestrator type returns [] even when scope contains new keyword "flag"', () => {
    const steps = buildDefaultSmokeTestSteps('orchestrator', 'Untitled', 'adds a flag');
    expect(steps).toEqual([]);
  });
});

describe('FR-2: three-step fallback chain (options.scope ?? options.metadata?.scope ?? description)', () => {
  it('TS-13: options.metadata.scope path detected when options.scope undefined', () => {
    const scope = resolveScope({ metadata: { scope: 'add a wizard' } }, 'fallback description');
    const steps = buildDefaultSmokeTestSteps('infrastructure', 'Untitled', scope);
    expect(steps).toHaveLength(3);
  });
  it('TS-14: options.scope takes precedence over options.metadata.scope', () => {
    const scope = resolveScope({ scope: 'script change', metadata: { scope: 'nontriggering text' } }, 'fallback');
    const steps = buildDefaultSmokeTestSteps('infrastructure', 'Untitled', scope);
    expect(steps).toHaveLength(3);
  });
  it('FR-2 control: neither options.scope nor options.metadata.scope → falls back to description', () => {
    const scope = resolveScope({}, 'fixes a script bug');
    const steps = buildDefaultSmokeTestSteps('infrastructure', 'Untitled', scope);
    expect(steps).toHaveLength(3);
  });
});

describe('FR-4: named export shape', () => {
  it('buildDefaultSmokeTestSteps is exported and callable as a function', () => {
    expect(typeof buildDefaultSmokeTestSteps).toBe('function');
    expect(buildDefaultSmokeTestSteps.length).toBe(3); // (type, title, scope)
  });
});

describe('FR-3: atomic INSERT — additionalUpdates block carries only risks (static source check)', () => {
  it('TS-16: source no longer writes scope/key_changes via post-INSERT UPDATE for the plan-file path', () => {
    // Locate the additionalUpdates block (Step 13 in the plan-file builder)
    const blockMatch = SOURCE.match(/\/\/ Step 13:[\s\S]*?if \(Object\.keys\(additionalUpdates\)\.length > 0\) \{[\s\S]*?\n  \}/);
    expect(blockMatch, 'additionalUpdates Step 13 block must exist').toBeTruthy();
    const block = blockMatch[0];
    expect(block).not.toMatch(/additionalUpdates\.scope\s*=/);
    expect(block).not.toMatch(/additionalUpdates\.key_changes\s*=/);
    expect(block).toMatch(/additionalUpdates\.risks\s*=/);
  });
  it('FR-3 control: createOptions in plan-file builder now passes scope and key_changes', () => {
    // The plan-file createOptions builder must include scope and key_changes
    expect(SOURCE).toMatch(/scope:\s*scope\s*\|\|\s*null/);
    expect(SOURCE).toMatch(/key_changes:\s*keyChanges\.length\s*>\s*0\s*\?\s*keyChanges\s*:\s*null/);
  });
});

describe('Regression guards (validation-agent findings)', () => {
  it('TS-17: codeKeywords does NOT contain "gates" (substring-redundant with "gate")', () => {
    // FR-1 is implemented via an inline array literal inside buildDefaultSmokeTestSteps.
    // We assert by exercising the live function — if "gates" sneaks back as a literal
    // entry it would still be caught by `gate` substring-match, but the source-level
    // assertion below pins the literal away.
    const codeKeywordsSourceMatch = SOURCE.match(/const codeKeywords = \[([\s\S]*?)\];/);
    expect(codeKeywordsSourceMatch, 'codeKeywords array literal must exist').toBeTruthy();
    const arrayBody = codeKeywordsSourceMatch[1];
    // Match whole-word "gates" (not as part of "gate" or other identifiers)
    expect(arrayBody).not.toMatch(/['"]gates['"]/);
    expect(arrayBody).toMatch(/['"]gate['"]/); // existing entry preserved
  });
  it('FR-2 source guard: fallback chain at the buildDefault* call site uses three-step resolution', () => {
    expect(SOURCE).toMatch(/options\.scope\s*\?\?\s*options\.metadata\?\.scope\s*\?\?\s*description/);
  });
});
