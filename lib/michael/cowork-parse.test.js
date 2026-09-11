// SD-LEO-FIX-COWORK-IMPORTER-CANNOT-001 — parsers rewritten to match the REAL Dropbox _Cowork
// corpus format (verified live, 2026-09-07), replacing the invented "### domain: key" convention
// these tests previously exercised.
import { describe, it, expect } from 'vitest';
import { parseRuleFile, parseLabelTable, parseClosures, parseFeedbackLedger, parseDoctrine, slugify, RULE_DOMAINS } from './cowork-parse.mjs';

describe('slugify', () => {
  it('lowercases and hyphenates, trimming leading/trailing hyphens', () => {
    expect(slugify('Fleet (auto-label + archive)')).toBe('fleet-auto-label-archive');
    expect(slugify('"For Processing" containers are sacred (B1)')).toBe('for-processing-containers-are-sacred-b1');
  });
});

describe('parseRuleFile', () => {
  const GMAIL_FIXTURE = [
    '## Daily triage automation',
    '',
    'Some automation notes.',
    '',
    '## Triage rules',
    '',
    '### Fleet (auto-label + archive + mark read + summarize) — added 2026-06-07',
    '',
    'The onboarding@resend.dev sender is labelled Fleet and archived automatically.',
    'json: {"match":{"sender":"onboarding@resend.dev"},"action":{"verb":"archive"}}',
    '',
    '### Newsletters (auto-label + archive)',
    '',
    'Known newsletter senders are archived after labelling.',
    '',
    '## Change log',
    '',
    '### 2026-06-08 — seven sender rules formalized in one batch',
    '',
    'This is historical prose, not a rule, and must never be imported as one.',
    '',
  ].join('\n');

  it('extracts real gmail.md-shaped headings scoped to the Triage rules section, deriving domain/rule_key correctly', () => {
    const { rules, unparsed } = parseRuleFile(GMAIL_FIXTURE, { domain: 'gmail', sectionHeadingRe: /^##\s+Triage rules/i });
    expect(rules).toHaveLength(2);
    expect(rules[0]).toMatchObject({ domain: 'gmail', rule_key: 'fleet-auto-label-archive-mark-read-summarize-added-2026-06-07' });
    expect(rules[0].rule_json).toEqual({ match: { sender: 'onboarding@resend.dev' }, action: { verb: 'archive' } });
    expect(rules[1]).toMatchObject({ domain: 'gmail', rule_key: 'newsletters-auto-label-archive' });
  });

  it('never walks the Change log section — the changelog-trap this SD exists to close', () => {
    const { rules } = parseRuleFile(GMAIL_FIXTURE, { domain: 'gmail', sectionHeadingRe: /^##\s+Triage rules/i });
    expect(rules.some((r) => r.rule_key.includes('seven-sender'))).toBe(false);
  });

  it('a heading with a json directive that fails to parse is reported unparsed, rule_text still captured', () => {
    const text = '## Triage rules\n\n### Bad json case\nSome text.\njson: {not valid json}\n';
    const { rules, unparsed } = parseRuleFile(text, { domain: 'gmail', sectionHeadingRe: /^##\s+Triage rules/i });
    expect(rules).toHaveLength(1);
    expect(rules[0].rule_json).toBeNull();
    expect(unparsed[0]).toContain('malformed json directive');
  });

  it('a heading with no rule_text (directives only) is reported as unparsed, not silently dropped', () => {
    const text = '## Triage rules\n\n### Empty rule\njson: {"a":1}\n';
    const { rules, unparsed } = parseRuleFile(text, { domain: 'gmail', sectionHeadingRe: /^##\s+Triage rules/i });
    expect(rules).toHaveLength(0);
    expect(unparsed[0]).toContain('Empty rule');
  });

  it('an unrecognized domain is refused up front', () => {
    const { rules, unparsed } = parseRuleFile('## X\n\n### y\ntext\n', { domain: 'bogus', sectionHeadingRe: /^##\s+X/ });
    expect(rules).toHaveLength(0);
    expect(unparsed[0]).toContain('unrecognized domain');
  });

  it('no domain/sectionHeadingRe (body-section.md and CLAUDE.md, the 2 files with no known heading convention) reports the whole text as unparsed, never guesses a structure', () => {
    const text = '## Quick facts (read these first)\n\n- Rick is on Eastern time.\n- Another fact.\n';
    const { rules, unparsed } = parseRuleFile(text);
    expect(rules).toEqual([]);
    expect(unparsed).toEqual(['- Rick is on Eastern time.', '- Another fact.']);
  });

  it('a domain without a sectionHeadingRe (or vice versa) also reports unparsed rather than partially guessing', () => {
    const { rules } = parseRuleFile('## Triage rules\n\n### X\ntext\n', { domain: 'gmail' });
    expect(rules).toEqual([]);
  });

  it('section not found reports a distinct unparsed marker, not a false-empty pass', () => {
    const { rules, unparsed } = parseRuleFile('## Some other section\n\ntext\n', { domain: 'gmail', sectionHeadingRe: /^##\s+Triage rules/i });
    expect(rules).toEqual([]);
    expect(unparsed[0]).toContain('section not found');
  });

  it('RULE_DOMAINS matches the michael_rules CHECK constraint exactly', () => {
    expect(RULE_DOMAINS).toEqual(['gmail', 'todoist', 'calendar', 'tasks', 'body', 'brief', 'capture', 'youtube']);
  });

  // QF-20260907-610: todoist.md's real "## Effort + energy budget model" parent, shape verified
  // live against the Dropbox _Cowork corpus (2026-09-07) -- 7 rule headings plus a changelog
  // heading that lives OUTSIDE this section entirely, in a separate "## Change log" section, so
  // extractSection's own next-"## "-heading boundary excludes it without any special-casing.
  const TODOIST_FIXTURE = [
    '## Effort + energy budget model (Phase 4/4b — added 2026-05-30)',
    '',
    "### Rick's review process (hard rule)",
    '',
    'Rick reviews every estimate before it is trusted.',
    '',
    '### Capacity budgets',
    '',
    'Weekday budget is 6 focus-hours.',
    '',
    '## Change log',
    '',
    '### 2026-05-14 — initial setup',
    '',
    'This is historical prose, not a rule, and must never be imported as one.',
    '',
  ].join('\n');

  it('QF-20260907-610: todoist.md-shaped single-section headings parse, the Change log section is excluded by the next-## boundary', () => {
    const { rules } = parseRuleFile(TODOIST_FIXTURE, { domain: 'todoist', sectionHeadingRe: /^##\s+Effort \+ energy budget model/i });
    expect(rules.map((r) => r.rule_key)).toEqual(['rick-s-review-process-hard-rule', 'capacity-budgets']);
    expect(rules.every((r) => r.domain === 'todoist')).toBe(true);
    expect(rules.some((r) => r.rule_key.includes('initial-setup'))).toBe(false);
  });

  // morning-brief-distillation.md's real shape: 8 rule-shaped headings spread across THREE
  // separate "## " parents (measured live) -- the case an array sectionHeadingRe exists for.
  const BRIEF_FIXTURE = [
    '## Structural decisions (LOCKED)',
    '',
    '### Two-zone "newspaper" layout — CONFIRMED',
    '',
    'The brief uses a two-zone layout.',
    '',
    '## Section-by-section decisions',
    '',
    '### Heads-up banner — DECIDED',
    '',
    'The banner shows only urgent items.',
    '',
    '## Todoist intelligence — effort + energy-aware prioritization (Rick\'s direction, 2026-05-30)',
    '',
    '### Effort-budget model (Rick\'s refinement, 2026-05-30)',
    '',
    'Effort budgets feed the morning brief too.',
    '',
  ].join('\n');

  it('QF-20260907-610: an array sectionHeadingRe unions rules from every listed section, in order', () => {
    const { rules, unparsed } = parseRuleFile(BRIEF_FIXTURE, {
      domain: 'brief',
      sectionHeadingRe: [/^##\s+Structural decisions/i, /^##\s+Section-by-section decisions/i, /^##\s+Todoist intelligence/i],
    });
    expect(rules.map((r) => r.rule_key)).toEqual([
      'two-zone-newspaper-layout-confirmed',
      'heads-up-banner-decided',
      'effort-budget-model-rick-s-refinement-2026-05-30',
    ]);
    expect(rules.every((r) => r.domain === 'brief')).toBe(true);
    expect(unparsed).toEqual([]);
  });

  it('QF-20260907-610: a single RegExp still behaves exactly as before (backward compatible, not silently wrapped into a 1-element array meaning)', () => {
    const single = parseRuleFile(GMAIL_FIXTURE, { domain: 'gmail', sectionHeadingRe: /^##\s+Triage rules/i });
    const arrayOfOne = parseRuleFile(GMAIL_FIXTURE, { domain: 'gmail', sectionHeadingRe: [/^##\s+Triage rules/i] });
    expect(arrayOfOne).toEqual(single);
  });
});

describe('parseLabelTable (retained for gmail label rows, no longer wired to SOURCE_FILES)', () => {
  it('parses a markdown table into label rows', () => {
    const text = '| label_id | name | class | keep_in_inbox | summarize |\n|---|---|---|---|---|\n| Label_1 | Newsletters | newsletter | false | true |\n';
    const { labels, unparsed } = parseLabelTable(text);
    expect(labels).toHaveLength(1);
    expect(labels[0]).toEqual({ label_id: 'Label_1', name: 'Newsletters', class: 'newsletter', keep_in_inbox: false, summarize: true });
    expect(unparsed).toEqual([]);
  });
});

describe('parseClosures', () => {
  const REAL_ENTRY = [
    '### 2026-05-21 — Mother\'s Day 2026 gift for Patria',
    '',
    '- **Keywords:** patria gift, mother\'s day gift, mom gift',
    '- **Closure:** Gift was already given to Patria for Mother\'s Day 2026.',
    '- **Expires:** 2026-12-31 (clear at year-end; 2027 is a fresh decision)',
    '- **Scope:** all surfacing slots',
    '',
  ].join('\n');

  it('parses the real closures.md heading + bold-field shape, deriving closure_key from date+topic', () => {
    const { closures, unparsed } = parseClosures(REAL_ENTRY);
    expect(closures).toHaveLength(1);
    expect(closures[0]).toMatchObject({
      closure_key: '2026-05-21-mother-s-day-2026-gift-for-patria',
      topic: 'Mother\'s Day 2026 gift for Patria',
      scope: 'all surfacing slots',
      expires_at: '2026-12-31',
    });
    expect(closures[0].keywords).toEqual(['patria gift', "mother's day gift", 'mom gift']);
    expect(closures[0].closure_text).toContain('already given to Patria');
    expect(unparsed).toEqual([]);
  });

  it('"permanent" expiry maps to null (a nullable timestamptz column, not the literal word)', () => {
    const text = '### 2026-05-21 — Stale task consolidated\n\n- **Keywords:** stale, task\n- **Closure:** consolidated elsewhere.\n- **Expires:** permanent (the stale ID is never coming back)\n';
    const { closures } = parseClosures(text);
    expect(closures[0].expires_at).toBeNull();
  });

  it('missing the Closure: field is reported as unparsed, not silently dropped', () => {
    const text = '### 2026-05-21 — Incomplete entry\n\n- **Keywords:** a, b\n';
    const { closures, unparsed } = parseClosures(text);
    expect(closures).toHaveLength(0);
    expect(unparsed[0]).toContain('Incomplete entry');
  });

  it('the old invented "### closure: <key>" heading no longer matches anything', () => {
    const { closures, unparsed } = parseClosures('### closure: onboarding-flow-decided\ntopic: onboarding flow\n');
    expect(closures).toEqual([]);
  });
});

describe('parseFeedbackLedger', () => {
  const REAL_ENTRY = [
    '### 2026-06-08 (Monday)',
    '- **Landed:** Clean full-approval morning.',
    '- **Friction:** None Rick-facing.',
    '- **Dispositions (proposed → chosen):** Gmail: proposed seven senders → approved verbatim.',
    '- **Outcome vs 3 jobs:** Gmail tamed · Todoist moved · Distraction protected.',
    '- **Acted:** gmail.md — 7 sender rules + changelog + header stamp.',
    '',
  ].join('\n');

  it('parses the real "(Day)"-suffixed heading and bold field shape (the old $-anchored regex rejected this)', () => {
    const { entries, unparsed } = parseFeedbackLedger(REAL_ENTRY);
    expect(entries).toHaveLength(1);
    expect(entries[0].et_date).toBe('2026-06-08');
    expect(entries[0].landed).toContain('Clean full-approval morning');
    expect(unparsed).toEqual([]);
  });

  it('acted is a real (non-empty, non-dash) free-text value -> boolean true, never coerced to the literal text', () => {
    const { entries } = parseFeedbackLedger(REAL_ENTRY);
    expect(entries[0].acted).toBe(true);
  });

  it('an em-dash Acted value maps to false (nothing happened)', () => {
    const text = '### 2026-06-05 (Friday)\n- **Landed:** ok\n- **Acted:** —\n';
    const { entries } = parseFeedbackLedger(text);
    expect(entries[0].acted).toBe(false);
  });

  it('the Dispositions line is captured as a non-null jsonb-compatible value', () => {
    const { entries } = parseFeedbackLedger(REAL_ENTRY);
    expect(entries[0].dispositions).toEqual([{ note: 'Gmail: proposed seven senders → approved verbatim.' }]);
  });

  it('an entry with no Dispositions line reports dispositions as null, not a fabricated value', () => {
    const text = '### 2026-06-05 (Friday)\n- **Landed:** ok\n- **Acted:** —\n';
    const { entries } = parseFeedbackLedger(text);
    expect(entries[0].dispositions).toBeNull();
  });

  it('a dated block with no recognized directive is unparsed', () => {
    const text = '### 2026-01-16 (Friday)\njust some free text with no bold markers\n';
    const { entries, unparsed } = parseFeedbackLedger(text);
    expect(entries).toHaveLength(0);
    expect(unparsed.some((u) => u.includes('2026-01-16'))).toBe(true);
  });

  it('the old invented "### YYYY-MM-DD" (no day-name suffix) heading still matches, since the new regex is a superset', () => {
    // Guards against accidentally narrowing the heading match while fixing the day-name bug.
    const text = '### 2026-01-15 (Thursday)\n- **Landed:** fine\n';
    const { entries } = parseFeedbackLedger(text);
    expect(entries).toHaveLength(1);
  });
});

describe('parseDoctrine', () => {
  const DOCTRINE_FIXTURE = [
    '## Architecture & system preferences',
    '',
    '### Some architecture rule (A1)',
    '',
    'Architecture text that must never be imported.',
    '',
    '## Operating principles',
    '',
    '### "For Processing" containers are sacred (B1)',
    '',
    'Never auto-triage items inside a container named "For Processing".',
    '',
    '## Distinctions Rick draws',
    '',
    '### Four task modes (C2)',
    '',
    'action / chore / journal / reference.',
    '',
    '## Strategic instincts',
    '',
    '### Build in triangles (D1)',
    '',
    'Input -> brain -> output. Must be excluded.',
    '',
    '### Re-baseline rather than let things drift (D2)',
    '',
    'One re-baselining decision, not eleven micro-rescues.',
    '',
    '## Behavioral loops Cowork has noticed',
    '',
    '### Mid-task course correction (E2)',
    '',
    'Observed pattern text.',
    '',
    '## Values',
    '',
    'Not a rule section at all.',
    '',
  ].join('\n');

  it('imports B/C/E-block principles and D2 alone, excluding A entirely and D1 specifically', () => {
    const { principles, unparsed } = parseDoctrine(DOCTRINE_FIXTURE);
    const keys = principles.map((p) => p.key);
    expect(keys).toContain('for-processing-containers-are-sacred-b1');
    expect(keys).toContain('four-task-modes-c2');
    expect(keys).toContain('re-baseline-rather-than-let-things-drift-d2');
    expect(keys).toContain('mid-task-course-correction-e2');
    expect(keys.some((k) => k.includes('build-in-triangles'))).toBe(false);
    expect(keys.some((k) => k.includes('some-architecture-rule'))).toBe(false);
  });

  it('never imports the Values or Change log sections', () => {
    const { principles } = parseDoctrine(DOCTRINE_FIXTURE);
    expect(principles.some((p) => p.body_text.includes('Not a rule section'))).toBe(false);
  });

  it('a genuine changelog-heading trap (dated ### under a real doctrine.md Change log section) is never imported', () => {
    const text = DOCTRINE_FIXTURE + '\n## Change log\n\n### 2026-05-28 — A6 corollary + A7 added\n\nHistorical prose, not a rule.\n';
    const { principles } = parseDoctrine(text);
    expect(principles.some((p) => p.body_text.includes('Historical prose'))).toBe(false);
  });
});
