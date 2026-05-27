// QF-20260527-303: prevent regression of the over-aggressive ambiguity
// substring match in GATE2_IMPLEMENTATION_FIDELITY preflight.
//
// Pre-fix behavior: /ambiguous/gi matched 'no-ambiguous-locators' (ESLint
// rule name) even though that's a deliberate config string. The gate flagged
// the diff as "unresolved code ambiguity" and blocked EXEC-TO-PLAN, despite
// the rule line being unchanged config the worktree branch inherited from
// main. Witnessed blocking SD-EVA-SUPPORT-CLI-SKILL-ORCH-001-C.
//
// Post-fix: word-boundary lookarounds exclude letter/hyphen neighbors so
// hyphen-tokenized identifier contexts (kebab-case) no longer trigger.
// Genuine ambiguity language in comments (full-word usage) still matches.
//
// Static-pattern test reads the source patterns and verifies the regex
// shape AND tests each pattern against representative diff text to confirm
// the boundary works as intended.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(
  __dirname,
  '../../../scripts/modules/implementation-fidelity/preflight/index.js',
);

describe('QF-20260527-303: ambiguity patterns use word-boundary lookarounds', () => {
  const code = fs.readFileSync(SRC, 'utf8');

  it('source contains the tightened /ambiguous/ pattern with letter/hyphen boundary lookarounds', () => {
    // Pattern: (?<![a-z-])ambiguous(?![a-z-])
    expect(code).toMatch(/\(\?<!\[a-z-\]\)ambiguous\(\?!\[a-z-\]\)/);
  });

  it('source also tightens unclear/not sure/need to ask/don\'t know (consistent fix)', () => {
    expect(code).toMatch(/\(\?<!\[a-z-\]\)unclear\(\?!\[a-z-\]\)/);
    expect(code).toMatch(/\(\?<!\[a-z-\]\)not sure\(\?!\[a-z-\]\)/);
    expect(code).toMatch(/\(\?<!\[a-z-\]\)need to ask\(\?!\[a-z-\]\)/);
  });

  it('tightened /ambiguous/ regex does NOT match ESLint rule name no-ambiguous-locators', () => {
    // Use fresh regex per assertion (g flag advances lastIndex across test() calls — stateful gotcha).
    expect(/(?<![a-z-])ambiguous(?![a-z-])/i.test('"no-ambiguous-locators": "error"')).toBe(false);
  });

  it('tightened /ambiguous/ regex DOES match a real ambiguity comment (regression guard)', () => {
    expect(/(?<![a-z-])ambiguous(?![a-z-])/i.test('// TODO: this is ambiguous, clarify with PM')).toBe(true);
    expect(/(?<![a-z-])ambiguous(?![a-z-])/i.test('The behavior here is ambiguous.')).toBe(true);
  });

  it('tightened /unclear/ regex does NOT match unclearly-named (kebab identifier)', () => {
    expect(/(?<![a-z-])unclear(?![a-z-])/i.test('flag: unclearly-named')).toBe(false);
    expect(/(?<![a-z-])unclear(?![a-z-])/i.test('// the spec is unclear')).toBe(true);
  });

  it('legacy patterns without boundaries (TODO, FIXME, HACK, ???) still present', () => {
    // These are intentionally kept loose — they're upper-case identifier markers
    // that almost never appear inside config strings.
    expect(code).toMatch(/\/TODO:\.\*\\\?\/gi/);
    expect(code).toMatch(/\/FIXME\/gi/);
    expect(code).toMatch(/\/HACK\/gi/);
    expect(code).toMatch(/\/\\\?\\\?\\\?\/g/);
  });
});
