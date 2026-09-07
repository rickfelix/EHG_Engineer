// SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-F / FR-2, FR-6, TS-2, TS-7.
import { describe, it, expect } from 'vitest';
import { parseRuleFile, parseLabelTable, parseClosures, parseFeedbackLedger, RULE_DOMAINS } from './cowork-parse.mjs';

describe('parseRuleFile', () => {
  it('parses a gmail rule with a json directive and reports no unparsed content', () => {
    const text = `### gmail: newsletter-archive
Archive newsletters from a known list-id automatically after triage.
json: {"match":{"list_id":"news.example.com"},"class":"newsletter","action":{"verb":"archive"}}
`;
    const { rules, unparsed } = parseRuleFile(text);
    expect(rules).toHaveLength(1);
    expect(rules[0]).toMatchObject({ domain: 'gmail', rule_key: 'newsletter-archive' });
    expect(rules[0].rule_json).toEqual({ match: { list_id: 'news.example.com' }, class: 'newsletter', action: { verb: 'archive' } });
    expect(rules[0].rule_text).toContain('Archive newsletters');
    expect(unparsed).toEqual([]);
  });

  it('parses a tasks rule with buckets and projects rule_json', () => {
    const text = `### tasks: four-bucket-routing
Route captured items into one of four project buckets by keyword.
json: {"buckets":{"ehg":["ehg","chairman"],"exelon":["exelon","office"],"home":["home","errand"],"errand":["pickup","drop off"]},"projects":{"ehg":"P_EHG","exelon":"P_EXELON","home":"P_HOME","errand":"P_ERRAND"}}
`;
    const { rules } = parseRuleFile(text);
    expect(rules[0].domain).toBe('tasks');
    expect(rules[0].rule_json.buckets.ehg).toEqual(['ehg', 'chairman']);
    expect(rules[0].rule_json.projects.errand).toBe('P_ERRAND');
  });

  it('a rule with no rule_text is reported as unparsed, not silently dropped', () => {
    const text = `### gmail: empty-rule
json: {"match":{}}
`;
    const { rules, unparsed } = parseRuleFile(text);
    expect(rules).toHaveLength(0);
    expect(unparsed[0]).toContain('empty-rule');
  });

  it('an unrecognized domain is reported as unparsed', () => {
    const text = '### bogus: some-rule\nText here.\n';
    const { rules, unparsed } = parseRuleFile(text);
    expect(rules).toHaveLength(0);
    expect(unparsed[0]).toContain('unrecognized domain');
  });

  it('malformed json directive is reported as unparsed, rule_text still captured', () => {
    const text = '### gmail: bad-json\nSome text.\njson: {not valid json}\n';
    const { rules, unparsed } = parseRuleFile(text);
    expect(rules).toHaveLength(1);
    expect(rules[0].rule_json).toBeNull();
    expect(unparsed[0]).toContain('malformed json directive');
  });

  it('preamble content before the first heading is reported as unparsed', () => {
    const text = 'Some stray note before any rule.\n### gmail: r1\nText.\n';
    const { unparsed } = parseRuleFile(text);
    expect(unparsed.some((u) => u.includes('stray note'))).toBe(true);
  });

  it('RULE_DOMAINS matches the michael_rules CHECK constraint exactly', () => {
    expect(RULE_DOMAINS).toEqual(['gmail', 'todoist', 'calendar', 'tasks', 'body', 'brief', 'capture', 'youtube']);
  });
});

describe('parseLabelTable', () => {
  it('parses a markdown table into label rows', () => {
    const text = '| label_id | name | class | keep_in_inbox | summarize |\n|---|---|---|---|---|\n| Label_1 | Newsletters | newsletter | false | true |\n| Label_2 | Fleet | fleet | true | false |\n';
    const { labels, unparsed } = parseLabelTable(text);
    expect(labels).toHaveLength(2);
    expect(labels[0]).toEqual({ label_id: 'Label_1', name: 'Newsletters', class: 'newsletter', keep_in_inbox: false, summarize: true });
    expect(labels[1].keep_in_inbox).toBe(true);
    expect(unparsed).toEqual([]);
  });

  it('a row with no label_id is unparsed', () => {
    const text = '| label_id | name |\n|---|---|\n| | Missing id |\n';
    const { labels, unparsed } = parseLabelTable(text);
    expect(labels).toHaveLength(0);
    expect(unparsed).toHaveLength(1);
  });

  it('no table found reports the whole text as unparsed', () => {
    const { labels, unparsed } = parseLabelTable('just some prose, no table');
    expect(labels).toEqual([]);
    expect(unparsed).toHaveLength(1);
  });
});

describe('parseClosures', () => {
  it('parses a closure with keywords/scope/expires_at', () => {
    const text = '### closure: onboarding-flow-decided\ntopic: onboarding flow\nkeywords: onboarding, flow, signup\nscope: product\nexpires_at: 2026-06-01\nWe decided the onboarding flow ships without a wizard.\n';
    const { closures, unparsed } = parseClosures(text);
    expect(closures).toHaveLength(1);
    expect(closures[0]).toMatchObject({ closure_key: 'onboarding-flow-decided', topic: 'onboarding flow', scope: 'product', expires_at: '2026-06-01' });
    expect(closures[0].keywords).toEqual(['onboarding', 'flow', 'signup']);
    expect(closures[0].closure_text).toContain('without a wizard');
    expect(unparsed).toEqual([]);
  });

  it('missing topic or body is reported as unparsed', () => {
    const text = '### closure: incomplete\nkeywords: a, b\n';
    const { closures, unparsed } = parseClosures(text);
    expect(closures).toHaveLength(0);
    expect(unparsed[0]).toContain('incomplete');
  });
});

describe('parseFeedbackLedger', () => {
  it('parses a dated entry with all four directives', () => {
    const text = '### 2026-01-15\nlanded: brief was on time and accurate.\nfriction: none.\noutcome_vs_jobs: matched expectations.\nacted: true\n';
    const { entries, unparsed } = parseFeedbackLedger(text);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual({ et_date: '2026-01-15', landed: 'brief was on time and accurate.', friction: 'none.', outcome_vs_jobs: 'matched expectations.', acted: true });
    expect(unparsed).toEqual([]);
  });

  it('a dated block with no recognized directive is unparsed', () => {
    const text = '### 2026-01-16\njust some free text with no colons\n';
    const { entries, unparsed } = parseFeedbackLedger(text);
    expect(entries).toHaveLength(0);
    expect(unparsed.some((u) => u.includes('2026-01-16'))).toBe(true);
  });

  it('an unrecognized line inside a valid block is named individually', () => {
    const text = '### 2026-01-17\nlanded: yes\nsome stray unlabeled line\n';
    const { entries, unparsed } = parseFeedbackLedger(text);
    expect(entries).toHaveLength(1);
    expect(unparsed[0]).toContain('stray unlabeled line');
  });
});
