// SD-REFILL-00202Z4B — classify-quick-fix forbidden/risk keyword matching must be word-boundary, not
// naive substring. The prior `combined.includes('auth')` matched 'auth' INSIDE 'authoring'/'author'/
// 'authentic', force-escalating low-LOC doc QFs to a full SD (witnessed: QF-20260614-918, a documentation
// fix for the Adam contract, escalated because its description contained 'authoring'). matchesKeyword now
// anchors with \b on both sides while tolerating a plural/gerund suffix so genuinely-risky inflected forms
// (refactoring, databases, migrations, "breaking changes") still match.
import { describe, it, expect } from 'vitest';
import { matchesKeyword, analyzeDescription, CLASSIFICATION_RULES } from '../../scripts/classify-quick-fix.js';

describe('matchesKeyword — word-boundary keyword match (SD-REFILL-00202Z4B)', () => {
  it('does NOT match "auth" inside authoring/author/authentic (the false-escalation bug)', () => {
    expect(matchesKeyword('fix the adam authoring contract', 'auth')).toBe(false);
    expect(matchesKeyword('the author of the doc', 'auth')).toBe(false);
    expect(matchesKeyword('authentic content', 'auth')).toBe(false);
  });

  it('still matches "auth" as a standalone word', () => {
    expect(matchesKeyword('add an auth check', 'auth')).toBe(true);
    expect(matchesKeyword('AUTH middleware', 'auth')).toBe(true);
    expect(matchesKeyword('disable auth.', 'auth')).toBe(true); // punctuation boundary
  });

  it('matches the longer auth keywords as whole words', () => {
    expect(matchesKeyword('add authentication', 'authentication')).toBe(true);
    expect(matchesKeyword('change authorization rules', 'authorization')).toBe(true);
  });

  it('tolerates plural/gerund suffixes so risky inflected forms still match (no regression)', () => {
    expect(matchesKeyword('big refactoring effort', 'refactor')).toBe(true);
    expect(matchesKeyword('several refactors', 'refactor')).toBe(true);
    expect(matchesKeyword('touches two databases', 'database')).toBe(true);
    expect(matchesKeyword('run the migrations', 'migration')).toBe(true);
    expect(matchesKeyword('breaking changes ahead', 'breaking change')).toBe(true);
  });

  it('matches multi-word phrases on a word boundary', () => {
    expect(matchesKeyword('add a new table for x', 'new table')).toBe(true);
    expect(matchesKeyword('touches multiple files', 'multiple files')).toBe(true);
    expect(matchesKeyword('a renewable feature', 'new feature')).toBe(false); // not fooled by 'new' in 'renewable'
  });

  it('does NOT match unrelated substrings (security in "insecurity"? — boundary protects)', () => {
    expect(matchesKeyword('insecurity is not security', 'security')).toBe(true); // standalone 'security' present
    expect(matchesKeyword('feeling insecure today', 'security')).toBe(false);   // only inside 'insecure'
  });
});

describe('analyzeDescription — end-to-end (SD-REFILL-00202Z4B)', () => {
  it('does NOT flag a doc QF that merely mentions "authoring"', () => {
    const issues = analyzeDescription('Update the Adam authoring contract wording', 'Doc fix: authoring contract');
    expect(issues).toEqual([]);
  });

  it('still flags a real auth/security change', () => {
    // QF-20260912-358: analyzeDescription now delegates to findRiskKeywordWithContext (single
    // governed source), which returns the FIRST non-safe risk-class hit rather than every
    // matching keyword individually -- 'security' (earlier in title+description order) is an
    // equally valid representative hit as 'auth' was pre-consolidation; what matters is that
    // this genuinely risky input is still flagged at all.
    const issues = analyzeDescription('Add auth middleware and RLS policy', 'Security: auth gate');
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.some((i) => /security|auth|rls/i.test(i))).toBe(true);
  });

  it('still flags a refactor risk keyword', () => {
    const issues = analyzeDescription('Large refactor across modules', 'Refactor pass');
    expect(issues.some((i) => /refactor/i.test(i))).toBe(true);
  });

  // QF-20260912-358: security/auth stays default-escalate on ANY genuine mention (deliberately
  // unchanged, per SD-LEO-INFRA-CREATION-PATH-PRECISION-001's own safety reasoning).
  it('flags governed security keywords the old local list was missing (payments, credentials)', () => {
    expect(analyzeDescription('rotate the credentials for the payments sink', 'Ops task').length).toBeGreaterThan(0);
    expect(CLASSIFICATION_RULES.forbiddenKeywords).toContain('payments');
    expect(CLASSIFICATION_RULES.forbiddenKeywords).toContain('credentials');
    expect(CLASSIFICATION_RULES.forbiddenKeywords).toContain('create table');
    expect(CLASSIFICATION_RULES.forbiddenKeywords).toContain('drop table');
  });

  // QF-20260905-476: schema/migration keyword hits found ONLY in narrative description text
  // (no nearby change verb) no longer force escalation -- QF-20260904-844's exact false
  // positive (a Tier-1 client-option change whose description happened to name the
  // schema_migrations table and database-fidelity.js).
  it('does NOT escalate on a narrative-only schema/migration mention with no nearby change verb (QF-20260904-844)', () => {
    const issues = analyzeDescription(
      'Reads only the schema_migrations table name and database-fidelity.js filename for context; '
        + 'zero migration work here; a single client option was configured previously.',
      'One client option'
    );
    expect(issues).toEqual([]);
  });

  it('still escalates a genuine schema/migration change (a change verb near the keyword)', () => {
    const issues = analyzeDescription('Apply the pending migration to add a new column', 'Schema fix');
    expect(issues.length).toBeGreaterThan(0);
  });
});

// QF-20260720-415: the Supabase client classifyQuickFix() builds performs a privileged
// UPDATE (claimQuickFix's CAS) that RLS silently no-ops under the anon role — 0 rows
// affected, no error — which claimQuickFix then misreports as "a different holder owns
// it" regardless of the row's actual claim state. Every worker's claim attempt failed
// fleet-wide until this was caught. Static source check (classifyQuickFix itself is
// intentionally not exported — CLI-only per the file's own convention) so a future edit
// can't silently reintroduce the anon key here.
describe('classifyQuickFix Supabase client (QF-20260720-415)', () => {
  it('constructs its client from SUPABASE_SERVICE_ROLE_KEY, never an anon key', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const source = readFileSync(fileURLToPath(new URL('../../scripts/classify-quick-fix.js', import.meta.url)), 'utf8');
    expect(source).toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(source).not.toContain('ANON_KEY');
  });
});
