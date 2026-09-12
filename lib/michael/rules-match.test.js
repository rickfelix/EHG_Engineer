// SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-D / FR-1 — pure rule matchers (US-001).
import { describe, it, expect } from 'vitest';
import { matchGmailRule, matchKeywordBuckets, roleTagFor, matchKeyword, sortByPriority } from './rules-match.mjs';

const thread = { from: 'Exelon Alerts <alerts@Exelon.com>', subject: 'Weekly Outage Digest', listId: '<digest.exelon.com>', labelIds: ['INBOX', 'CATEGORY_UPDATES'] };

describe('matchGmailRule', () => {
  it('matches all-of predicates case-insensitively as substrings, returning rule_key, class and action', () => {
    const rule = { rule_key: 'gmail/exelon-digest', rule_json: { match: { from: 'alerts@exelon.com', subject: ['digest', 'summary'] }, class: 'newsletter', action: { verb: 'archive' } } };
    expect(matchGmailRule(rule, thread)).toEqual({ matched: true, rule_key: 'gmail/exelon-digest', class: 'newsletter', action: { verb: 'archive' } });
  });
  it('fails when any predicate misses (all-of), and honours list_id and label predicates', () => {
    expect(matchGmailRule({ rule_key: 'a', rule_json: { match: { from: 'exelon', subject: 'invoice' } } }, thread)).toBe(null);
    expect(matchGmailRule({ rule_key: 'b', rule_json: { match: { list_id: 'DIGEST.EXELON' } } }, thread)).toMatchObject({ matched: true, rule_key: 'b', class: null, action: null });
    expect(matchGmailRule({ rule_key: 'c', rule_json: { match: { label: ['category_updates'] } } }, thread)).toMatchObject({ matched: true });
    expect(matchGmailRule({ rule_key: 'd', rule_json: { match: { label: 'SPAM' } } }, thread)).toBe(null);
  });
  it('never matches vacuously: null rule_json, no match object, empty predicate set, or a bad thread', () => {
    expect(matchGmailRule({ rule_key: 'n', rule_json: null }, thread)).toBe(null);
    expect(matchGmailRule({ rule_key: 'n', rule_json: { class: 'fleet' } }, thread)).toBe(null);
    expect(matchGmailRule({ rule_key: 'n', rule_json: { match: {} } }, thread)).toBe(null);
    expect(matchGmailRule({ rule_key: 'n', rule_json: { match: { from: [] } } }, thread)).toBe(null);
    expect(matchGmailRule(null, thread)).toBe(null);
    expect(matchGmailRule({ rule_key: 'n', rule_json: { match: { from: 'x' } } }, null)).toBe(null);
  });
  it('whitespace-only, empty-string and non-string predicates are not predicates (never vacuous)', () => {
    const unrelated = { from: 'Someone <someone@example.org>', subject: 'Hello there', listId: null, labelIds: ['INBOX'] };
    expect(matchGmailRule({ rule_key: 'w', rule_json: { match: { from: ' ' }, action: { verb: 'archive' } } }, unrelated)).toBe(null);
    expect(matchGmailRule({ rule_key: 'w', rule_json: { match: { subject: ['', '  '] } } }, unrelated)).toBe(null);
    expect(matchGmailRule({ rule_key: 'w', rule_json: { match: { from: [null, undefined, 42] } } }, { ...unrelated, from: 'null@x undefined 42' })).toBe(null);
    expect(matchGmailRule({ rule_key: 'w', rule_json: { match: { from: [' ', 'someone@example.org '] } } }, unrelated)).toMatchObject({ matched: true });
    expect(roleTagFor([{ rule_key: 'r', rule_json: { role_tag: 'x', match: { project: ' ' } } }], { project_name: 'Anything', labels: [], content: '' })).toBe(null);
    // a PRESENT key that empties out fails CLOSED: the rule never widens to its remaining predicates
    const digest = { ...unrelated, subject: 'Weekly digest' };
    expect(matchGmailRule({ rule_key: 'w', rule_json: { match: { from: [null], subject: 'digest' }, action: { verb: 'archive' } } }, digest)).toBe(null);
    expect(matchGmailRule({ rule_key: 'w', rule_json: { match: { from: ' ', subject: 'digest' } } }, digest)).toBe(null);
    expect(matchGmailRule({ rule_key: 'w', rule_json: { match: { subject: 'digest' } } }, digest)).toMatchObject({ matched: true });
    expect(roleTagFor([{ rule_key: 'r', rule_json: { role_tag: 'x', match: { project: ' ', label: 'work' } } }], { project_name: 'Anything', labels: ['work'], content: '' })).toBe(null);
    expect(matchKeyword(['caf'], 'un café noir')).toBe(null);
    expect(matchKeyword(['café'], 'un café noir')).toBe('café');
  });
  it('accepts a bare rule_json object (rule_key then null)', () => {
    expect(matchGmailRule({ match: { subject: 'outage' } }, thread)).toEqual({ matched: true, rule_key: null, class: null, action: null });
  });
});

describe('QF-20260908-964: anchored (`=`-prefixed) whole-address needles', () => {
  const shipping = { rule_key: 'shipping', rule_json: { class: 'shipping', match: { from: ['=no-reply@amazon.com'] } } };
  const transactional = { rule_key: 'transactional', rule_json: { class: 'transactional', match: { from: ['digital-no-reply@amazon.com'] } } };

  it('REGRESSION (the live defect): an anchored needle no longer captures a longer address that merely contains it as a substring', () => {
    const kindle = { from: '"Amazon.com" <digital-no-reply@amazon.com>', subject: 'Your Kindle receipt' };
    expect(matchGmailRule(shipping, kindle)).toBe(null);
    // the sibling (unanchored) rule still correctly claims it
    expect(matchGmailRule(transactional, kindle)).toMatchObject({ matched: true, class: 'transactional' });
  });
  it('an anchored needle still matches the address it names exactly, regardless of display-name wrapping', () => {
    const shipped = { from: '"Amazon.com" <no-reply@amazon.com>', subject: 'Your package has shipped' };
    expect(matchGmailRule(shipping, shipped)).toMatchObject({ matched: true, class: 'shipping' });
    // a bare address (no <...> wrapper) is also handled -- extractAddress falls back to the whole trimmed string
    expect(matchGmailRule(shipping, { from: 'no-reply@amazon.com', subject: 'x' })).toMatchObject({ matched: true });
  });
  it('is case-insensitive and unaffected by surrounding whitespace, exactly like unanchored needles', () => {
    expect(matchGmailRule(shipping, { from: '<NO-REPLY@AMAZON.COM>', subject: 'x' })).toMatchObject({ matched: true });
  });
  it('unprefixed (plain) needles are completely unaffected -- this is additive, not a behavior change', () => {
    const plain = { rule_key: 'plain', rule_json: { match: { from: ['amazon.com'] } } };
    expect(matchGmailRule(plain, { from: '"Amazon.com" <digital-no-reply@amazon.com>', subject: 'x' })).toMatchObject({ matched: true });
  });
});

describe('QF-20260908-964: sortByPriority', () => {
  it('rules without a declared priority keep their given (created_at-ascending) relative order unchanged', () => {
    const rules = [{ rule_key: 'a', rule_json: {} }, { rule_key: 'b', rule_json: {} }, { rule_key: 'c', rule_json: {} }];
    expect(sortByPriority(rules).map((r) => r.rule_key)).toEqual(['a', 'b', 'c']);
  });
  it('a rule with a declared priority sorts before an earlier-created rule with no declared priority', () => {
    const rules = [
      { rule_key: 'created-first-no-priority', rule_json: {} },
      { rule_key: 'created-second-priority-1', rule_json: { priority: 1 } },
    ];
    expect(sortByPriority(rules).map((r) => r.rule_key)).toEqual(['created-second-priority-1', 'created-first-no-priority']);
  });
  it('lower priority numbers sort first; ties fall back to given order (stable sort)', () => {
    const rules = [
      { rule_key: 'p5', rule_json: { priority: 5 } },
      { rule_key: 'p1-first', rule_json: { priority: 1 } },
      { rule_key: 'p1-second', rule_json: { priority: 1 } },
      { rule_key: 'no-priority', rule_json: {} },
    ];
    expect(sortByPriority(rules).map((r) => r.rule_key)).toEqual(['p1-first', 'p1-second', 'p5', 'no-priority']);
  });
  it('is defensive against non-array input and rules with null/malformed rule_json', () => {
    expect(sortByPriority(null)).toBe(null);
    expect(sortByPriority('not-an-array')).toBe('not-an-array');
    const rules = [{ rule_key: 'ok', rule_json: { priority: 1 } }, { rule_key: 'null-json', rule_json: null }, { rule_key: 'bare', match: {} }];
    expect(sortByPriority(rules).map((r) => r.rule_key)).toEqual(['ok', 'null-json', 'bare']);
  });
});

describe('matchKeyword and matchKeywordBuckets', () => {
  it('matches whole words only, case-insensitively, and escapes regex metacharacters', () => {
    expect(matchKeyword(['call', 'email'], 'Please CALL the dentist')).toBe('call');
    expect(matchKeyword(['call'], 'recall the order')).toBe(null);
    expect(matchKeyword(['c++'], 'learn C++ today')).toBe('c++');
    expect(matchKeyword([], 'anything')).toBe(null);
    expect(matchKeyword(['  '], 'anything')).toBe(null);
  });
  it('routes to the first declared bucket that matches and reports the keyword', () => {
    const rule = { rule_key: 'tasks/four-bucket', rule_json: { buckets: { ehg: ['venture', 'leo'], exelon: ['outage', 'shift'], home: ['dentist', 'car'], errand: ['buy', 'pick up'] } } };
    expect(matchKeywordBuckets(rule, 'Buy milk and book the dentist')).toEqual({ matched: true, rule_key: 'tasks/four-bucket', bucket: 'home', keyword: 'dentist' });
    expect(matchKeywordBuckets(rule, 'pick up the car')).toMatchObject({ bucket: 'home', keyword: 'car' });
    expect(matchKeywordBuckets(rule, 'Review the LEO roadmap')).toMatchObject({ bucket: 'ehg', keyword: 'leo' });
    expect(matchKeywordBuckets(rule, 'nothing routable here')).toBe(null);
  });
  it('is null for a missing or malformed buckets object or non-string text', () => {
    expect(matchKeywordBuckets({ rule_key: 'x', rule_json: null }, 'text')).toBe(null);
    expect(matchKeywordBuckets({ rule_key: 'x', rule_json: { buckets: ['a'] } }, 'a')).toBe(null);
    expect(matchKeywordBuckets({ rule_key: 'x', rule_json: { buckets: {} } }, 'a')).toBe(null);
    expect(matchKeywordBuckets({ rule_key: 'x', rule_json: { buckets: { a: ['a'] } } }, undefined)).toBe(null);
  });
});

describe('roleTagFor', () => {
  const rules = [
    { rule_key: 'todoist/ehg-project', rule_json: { role_tag: 'ehg', match: { project: ['EHG', 'Ventures'] } } },
    { rule_key: 'todoist/exelon-label', rule_json: { role_tag: 'exelon', match: { label: 'work', keyword: ['outage', 'shift'] } } },
    { rule_key: 'todoist/prompt-only', rule_json: null },
    { rule_key: 'todoist/no-tag', rule_json: { match: { project: 'Home' } } },
  ];
  it('returns the first rule (row order) whose predicates all hold', () => {
    expect(roleTagFor(rules, { project_name: 'EHG Chairman', labels: [], content: 'anything' })).toEqual({ matched: true, rule_key: 'todoist/ehg-project', role_tag: 'ehg' });
    expect(roleTagFor(rules, { project_name: 'Inbox', labels: ['Work'], content: 'cover the night shift' })).toEqual({ matched: true, rule_key: 'todoist/exelon-label', role_tag: 'exelon' });
  });
  it('skips null rule_json, rules without role_tag, partial matches, and returns null when nothing matches', () => {
    expect(roleTagFor(rules, { project_name: 'Inbox', labels: ['work'], content: 'buy milk' })).toBe(null);
    expect(roleTagFor(rules, { project_name: 'Home', labels: [], content: 'x' })).toBe(null);
    expect(roleTagFor([], { project_name: 'EHG', labels: [], content: '' })).toBe(null);
    expect(roleTagFor(rules, null)).toBe(null);
    expect(roleTagFor(null, { project_name: 'EHG' })).toBe(null);
  });
});
