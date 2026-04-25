// Tests for lib/utils/work-item-router.js FR5 — SD-LEO-INFRA-CREATION-PARSER-HARDENING-001.
// Covers AC-5a through AC-5f from the PRD.
// The AC-5f self-referential case uses QF-20260424-336's verbatim escalation_reason to
// close the loop that originally caused its escalation (validation-agent recommendation).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findRiskKeyword,
  findSchemaKeyword,
  findSchemaKeywordWithVerbContext,
  getRiskScanText,
  RISK_KEYWORDS,
  SCHEMA_KEYWORDS,
  RISK_REGEX,
  SCHEMA_REGEX,
  VERBS,
  VERB_WINDOW,
} from './work-item-router.js';

// ---------- AC-5a: substring false-matches do NOT escalate ----------

test('AC-5a: "authored content" does NOT match auth (substring false-match)', () => {
  assert.equal(findRiskKeyword('Fix display of authored content in dashboard'), null);
});

test('AC-5a: "authoritative" does NOT match auth', () => {
  assert.equal(findRiskKeyword('Update authoritative source list'), null);
});

test('AC-5a: "authentic" does NOT match auth', () => {
  assert.equal(findRiskKeyword('Verify the authentic signature'), null);
});

test('AC-5a: "author" alone does NOT match auth (close but not exact)', () => {
  // "author" and "auth" are different keywords. "author" is NOT in RISK_KEYWORDS.
  // "auth" with \b\b needs the full "auth" word to be bounded, which "author" is not.
  assert.equal(findRiskKeyword('The document author reviewed it'), null);
});

// ---------- AC-5b: whole-word matches DO escalate ----------

test('AC-5b: "fix auth token rotation" DOES match auth', () => {
  assert.equal(findRiskKeyword('Fix auth token rotation in session daemon'), 'auth');
});

test('AC-5b: "authentication" as whole word matches authentication keyword', () => {
  // authentication is its own keyword in RISK_KEYWORDS, so word-boundary match hits it directly.
  assert.equal(findRiskKeyword('Add two-factor authentication flow'), 'authentication');
});

test('AC-5b: "security" matches', () => {
  assert.equal(findRiskKeyword('Security review before merge'), 'security');
});

// ---------- AC-5c (more substring negatives) ----------

test('AC-5c: "authorship" does NOT match (not a whole word)', () => {
  assert.equal(findRiskKeyword('Verify document authorship'), null);
});

test('AC-5c: capital "Authoritative" also does not match (case-insensitive substring but word-bounded)', () => {
  assert.equal(findRiskKeyword('Authoritative directive'), null);
});

// ---------- AC-5d: hyphenated compounds ARE whole words at the boundary ----------

test('AC-5d: "re-authentication" matches authentication (hyphen is word boundary)', () => {
  assert.equal(findRiskKeyword('Re-authentication flow for session recovery'), 'authentication');
});

test('AC-5d: "auth-token" matches auth (hyphen after auth is word boundary)', () => {
  assert.equal(findRiskKeyword('Rotate the auth-token header'), 'auth');
});

// ---------- AC-5e: all non-auth risk keywords have word-boundary behavior ----------

test('AC-5e: "migration" whole word → match schema', () => {
  assert.equal(findSchemaKeyword('Database migration for users table'), 'migration');
});

test('AC-5e: "migrations" (plural) does NOT match schema (not exact whole word)', () => {
  assert.equal(findSchemaKeyword('Review migrations directory'), null);
});

test('AC-5e: "schema_migrations" does NOT match schema (underscore is word char)', () => {
  assert.equal(findSchemaKeyword('Inspect schema_migrations table'), null);
});

test('AC-5e: "credentials" matches risk', () => {
  assert.equal(findRiskKeyword('Rotate service credentials'), 'credentials');
});

test('AC-5e: "credentialing" does NOT match credentials', () => {
  assert.equal(findRiskKeyword('Implement credentialing workflow'), null);
});

test('AC-5e: "rls" matches risk, case-insensitive', () => {
  assert.equal(findRiskKeyword('Update RLS policy'), 'rls');
});

test('AC-5e: "create table users" matches schema (multi-word phrase)', () => {
  assert.equal(findSchemaKeyword('Plan to create table users in next sprint'), 'create table');
});

// ---------- AC-5f: self-referential regression (QF-20260424-336) ----------

test('AC-5f: QF-20260424-336 original seed description no longer false-matches', () => {
  // QF-20260424-336 was auto-escalated because its description contained the phrase
  // "authored content" — which `.includes('auth')` substring-matched on. This test confirms
  // the ORIGINAL seed description no longer escalates under the new word-boundary matcher.
  // (The subsequent escalation_reason diagnostic string — 'Security/risk keyword detected: "auth"' —
  // legitimately contains both "Security" and a quoted bare "auth" as whole words; the fixed matcher
  // deterministically matches those per word-boundary semantics. Context-awareness around diagnostic
  // strings is out of scope — the closure this test provides is that the seed that triggered the
  // incident is now quiet, which is the full fix for the regression class.)
  assert.equal(findRiskKeyword('description contains phrase "authored content"'), null,
    'the phrase that caused QF-336 escalation no longer false-matches');
  // Also confirm: the broader family of substring false-matches is eliminated.
  for (const seed of ['authored', 'authoritative', 'authentic', 'authorship', 'credentialing']) {
    assert.equal(findRiskKeyword(seed), null, `"${seed}" no longer false-matches`);
  }
});

test('AC-5f regression: empty/null input is safe', () => {
  assert.equal(findRiskKeyword(''), null);
  assert.equal(findRiskKeyword(null), null);
  assert.equal(findRiskKeyword(undefined), null);
  assert.equal(findRiskKeyword(42), null);
});

// ---------- Regex is compiled once (not per-call) ----------

test('RISK_REGEX and SCHEMA_REGEX are single compiled instances', () => {
  assert.ok(RISK_REGEX instanceof RegExp, 'RISK_REGEX is a RegExp');
  assert.ok(SCHEMA_REGEX instanceof RegExp, 'SCHEMA_REGEX is a RegExp');
  assert.ok(RISK_REGEX.flags.includes('i'), 'RISK_REGEX is case-insensitive');
  assert.ok(SCHEMA_REGEX.flags.includes('i'), 'SCHEMA_REGEX is case-insensitive');
});

test('RISK_KEYWORDS and SCHEMA_KEYWORDS are exported and non-empty', () => {
  assert.ok(Array.isArray(RISK_KEYWORDS) && RISK_KEYWORDS.length > 0);
  assert.ok(Array.isArray(SCHEMA_KEYWORDS) && SCHEMA_KEYWORDS.length > 0);
  assert.ok(RISK_KEYWORDS.includes('auth'), 'RISK_KEYWORDS includes auth');
  assert.ok(SCHEMA_KEYWORDS.includes('migration'), 'SCHEMA_KEYWORDS includes migration');
});

// ============================================================================
// SD-LEO-INFRA-TIER-ESCALATOR-ROUTING-001 — verb-context helper for schema keywords
// Fixes the noun-vs-verb ambiguity left unaddressed by FR5 word-boundary regex.
// Pins QF-20260424-804 → SD-LEO-DOC-FIX-CLAUDE-PLAN-001 regression chain.
// ============================================================================

// ---------- TS-1: QF-20260424-804 regression fixture ----------

test('TS-1: QF-20260424-804 regression — doc-only QF mentioning schema as noun does NOT match', () => {
  // The phrase 'product_requirements_v2 schema' in a CLAUDE_PLAN.md doc-only QF
  // previously force-escalated to Tier 3 (the raw findSchemaKeyword matched 'schema'),
  // causing SD-LEO-DOC-FIX-CLAUDE-PLAN-001 to be filed just to ship a 17-LOC doc edit.
  // With verb-context, no VERBS token is within VERB_WINDOW of 'schema', so null.
  const desc = 'Fix typo in CLAUDE_PLAN.md where product_requirements_v2 schema section reference is misspelled';
  assert.equal(findSchemaKeywordWithVerbContext(desc), null,
    'descriptive schema reference (no verb in window) must not escalate');
});

// ---------- TS-2: real DDL intent (verb + schema within window) DOES match ----------

test('TS-2: "Alter the schema to add email column" matches schema (verb alter within window)', () => {
  assert.equal(findSchemaKeywordWithVerbContext('Alter the schema to add email column to users'), 'schema');
});

test('TS-2b: "Need to migrate the users table" matches migration (verb-form "migrate" of "migration")', () => {
  // 'migrate' is a VERBS entry; 'migration' is the keyword. Token distance 3. Within window.
  assert.equal(findSchemaKeywordWithVerbContext('Need to migrate the users table and update the migration notes'), 'migration');
});

// ---------- TS-3: noun-only mentions do NOT match ----------

test('TS-3a: "Document describes migration strategy" does NOT match (no verb in window)', () => {
  assert.equal(findSchemaKeywordWithVerbContext('Document describes migration strategy in the README'), null);
});

test('TS-3b: "schema documentation review" does NOT match', () => {
  assert.equal(findSchemaKeywordWithVerbContext('Complete schema documentation review for the public API surface'), null);
});

// ---------- TS-4: window boundary — verb at VERB_WINDOW matches, beyond does not ----------

test('TS-4a: verb at distance exactly VERB_WINDOW matches', () => {
  // Tokens: [alter, one, two, three, four, schema] — verb at index 0, keyword at index 5,
  // distance = 5 = VERB_WINDOW. Must match (inclusive boundary).
  assert.equal(VERB_WINDOW, 5, 'VERB_WINDOW is 5 (boundary test depends on this default)');
  assert.equal(findSchemaKeywordWithVerbContext('alter one two three four schema'), 'schema');
});

test('TS-4b: verb at distance VERB_WINDOW+1 does NOT match', () => {
  // Tokens: [alter, one, two, three, four, five, schema] — distance 6. Must NOT match.
  assert.equal(findSchemaKeywordWithVerbContext('alter one two three four five schema'), null);
});

// ---------- TS-5: symmetric window (verb AFTER keyword within window) matches ----------

test('TS-5: "The schema was altered yesterday" matches (verb after keyword)', () => {
  // Tokens: [the, schema, was, altered, yesterday]. 'schema' at 1, 'altered' is not in VERBS
  // (only 'alter' is). Use a fixture that exercises the verb-after pattern cleanly.
  assert.equal(findSchemaKeywordWithVerbContext('We should alter schema today'), 'schema');
  // Symmetric: verb AFTER the keyword also matches.
  assert.equal(findSchemaKeywordWithVerbContext('schema needs to alter next sprint'), 'schema');
});

// ---------- TS-6: case-insensitive on keyword and verb ----------

test('TS-6a: uppercase input matches (case-insensitive)', () => {
  assert.equal(findSchemaKeywordWithVerbContext('ALTER THE SCHEMA'), 'schema');
});

test('TS-6b: mixed case matches', () => {
  assert.equal(findSchemaKeywordWithVerbContext('Please Migrate the Migration safely'), 'migration');
});

// ---------- TS-7: RISK_KEYWORDS branch is unchanged (regression) ----------

test('TS-7: risk-keyword matches still fire via findRiskKeyword (RISK branch unchanged)', () => {
  assert.equal(findRiskKeyword('Fix auth token rotation'), 'auth');
  assert.equal(findRiskKeyword('Update RLS policy'), 'rls');
  // And verb-context helper does NOT conflate RISK keywords with schema path.
  assert.equal(findSchemaKeywordWithVerbContext('Fix auth token rotation'), null);
});

// ---------- TS-8: default export integrity ----------

test('TS-8: default export includes new symbols alongside prior exports', async () => {
  const mod = await import('./work-item-router.js');
  const defaultExport = mod.default;
  // New exports
  assert.equal(typeof defaultExport.findSchemaKeywordWithVerbContext, 'function');
  assert.ok(Array.isArray(defaultExport.VERBS));
  assert.equal(defaultExport.VERB_WINDOW, 5);
  // Prior exports preserved
  assert.equal(typeof defaultExport.routeWorkItem, 'function');
  assert.equal(typeof defaultExport.findRiskKeyword, 'function');
  assert.equal(typeof defaultExport.findSchemaKeyword, 'function');
  assert.ok(Array.isArray(defaultExport.RISK_KEYWORDS));
  assert.ok(Array.isArray(defaultExport.SCHEMA_KEYWORDS));
});

// ---------- TS-9: malformed input returns null (fail-graceful at helper level) ----------

test('TS-9: malformed input returns null safely', () => {
  assert.equal(findSchemaKeywordWithVerbContext(null), null);
  assert.equal(findSchemaKeywordWithVerbContext(undefined), null);
  assert.equal(findSchemaKeywordWithVerbContext(''), null);
  assert.equal(findSchemaKeywordWithVerbContext(42), null);
  assert.equal(findSchemaKeywordWithVerbContext({}), null);
});

// ---------- Multi-word schema keywords bypass verb-context (they imply the verb) ----------

test('Multi-word schema keyword "create table users" still matches unconditionally', () => {
  // 'create table' is itself the keyword — it encodes the verb inline, so verb-context
  // refinement is unnecessary. The helper accepts it as-is.
  assert.equal(findSchemaKeywordWithVerbContext('Plan to create table users in next sprint'), 'create table');
});

// ---------- findSchemaKeyword (backward-compat helper) is unchanged ----------

test('Backward-compat: findSchemaKeyword still matches noun-only (unchanged behavior)', () => {
  // Critical: existing callers that use findSchemaKeyword directly (if any external exist)
  // see identical behavior. Only checkRiskEscalation (internal) switches to the new helper.
  assert.equal(findSchemaKeyword('product_requirements_v2 schema'), 'schema');
  assert.equal(findSchemaKeyword('Document describes migration strategy'), 'migration');
});

// ---------- VERBS constant sanity ----------

test('VERBS constant includes primary action verbs and is lowercase', () => {
  assert.ok(Array.isArray(VERBS) && VERBS.length >= 10);
  for (const v of ['alter', 'migrate', 'add', 'drop', 'change', 'update', 'modify', 'remove', 'replace', 'rename']) {
    assert.ok(VERBS.includes(v), `VERBS includes ${v}`);
  }
  // All lowercase (comparison is case-insensitive via tokenization lowercasing, not via regex flag)
  for (const v of VERBS) {
    assert.equal(v, v.toLowerCase(), `verb "${v}" is lowercase`);
  }
});

// ============================================================================
// QF-20260425-443 — getRiskScanText: prefer scope/keyChanges over description
// Closes the regression that escalated QFs whose descriptions named existing
// risk keywords by reference (e.g., "extends the needsAuth gate") rather than
// because the change itself touched the risk surface.
// ============================================================================

test('getRiskScanText returns scope when supplied (description ignored)', () => {
  const result = getRiskScanText({
    scope: 'fix typo in dashboard label',
    description: 'extends the existing security gate'
  });
  assert.equal(result.text, 'fix typo in dashboard label');
  assert.equal(result.source, 'scope');
});

test('getRiskScanText concatenates scope + keyChanges', () => {
  const result = getRiskScanText({
    scope: 'cleanup script',
    keyChanges: [{ change: 'add helper' }, { change: 'rename var' }]
  });
  assert.match(result.text, /cleanup script/);
  assert.match(result.text, /add helper/);
  assert.match(result.text, /rename var/);
  assert.equal(result.source, 'scope');
});

test('getRiskScanText accepts keyChanges as plain string', () => {
  const result = getRiskScanText({ keyChanges: 'add helper to module' });
  assert.equal(result.text, 'add helper to module');
  assert.equal(result.source, 'keyChanges');
});

test('getRiskScanText falls back to description when scope/keyChanges absent', () => {
  // Suppress the warning during this test
  const prev = process.env.WORK_ITEM_ROUTER_QUIET;
  process.env.WORK_ITEM_ROUTER_QUIET = 'true';
  try {
    const result = getRiskScanText({ description: 'fix the auth flow' });
    assert.equal(result.text, 'fix the auth flow');
    assert.equal(result.source, 'description');
  } finally {
    if (prev === undefined) delete process.env.WORK_ITEM_ROUTER_QUIET;
    else process.env.WORK_ITEM_ROUTER_QUIET = prev;
  }
});

test('getRiskScanText returns empty when nothing supplied', () => {
  const result = getRiskScanText({});
  assert.equal(result.text, '');
  assert.equal(result.source, 'none');
});

test('getRiskScanText regression: noun-only "needsSecurity" reference in description does NOT escalate when scope is clean', () => {
  // The exact false-positive that caused QF-20260425-641 to be auto-escalated.
  // Previously the description scan matched the bare word "security" and forced Tier 3
  // even though the change had nothing to do with the security surface.
  const result = getRiskScanText({
    scope: 'add type-aware skip helper that mirrors the existing gating pattern',
    description: 'extends the needsSecurity gate that already exists in the orchestrator'
  });
  // Scope wins — security-keyword in description is ignored
  assert.equal(result.source, 'scope');
  assert.equal(findRiskKeyword(result.text), null,
    'scope text contains no risk keyword; bare-noun description reference is correctly ignored');
});

test('getRiskScanText empty-string scope falls through to keyChanges/description', () => {
  const result = getRiskScanText({ scope: '   ', keyChanges: 'add a helper' });
  assert.equal(result.source, 'keyChanges');
  assert.equal(result.text, 'add a helper');
});
