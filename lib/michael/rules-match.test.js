// SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-D / FR-1 — pure rule matchers (US-001).
import { describe, it, expect } from 'vitest';
import { matchGmailRule, matchKeywordBuckets, roleTagFor, matchKeyword } from './rules-match.mjs';

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
  it('accepts a bare rule_json object (rule_key then null)', () => {
    expect(matchGmailRule({ match: { subject: 'outage' } }, thread)).toEqual({ matched: true, rule_key: null, class: null, action: null });
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
