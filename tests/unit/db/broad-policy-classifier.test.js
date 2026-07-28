/**
 * SD-LEO-INFRA-DEFAULT-ANON-AUTHENTICATED-001 — the shared classifier (FR-3 + FR-4).
 *
 * ONE classifier serves both the migration-text lint and the live-database audit, so this suite is
 * where the shared contract is pinned. Two separately-authored classifiers would drift, and the
 * drift would be invisible because each would look correct alone.
 *
 * THE ::text CASE IS NOT DECORATION. It is a regression pin for a bug this SD actually shipped and
 * then caught: pg_policies renders the live qual as `auth.role() = 'authenticated'::text`, my first
 * pattern omitted the optional cast, the role term got stripped while its trailing `::text`
 * survived, and that residue read as "a real predicate" — so the classifier reported the ONE SHAPE
 * IT WAS BUILT TO CATCH as safe. It looked healthy doing it: 472 findings, all four negative
 * controls passing. Only the POSITIVE control exposed it.
 */
import { describe, it, expect } from 'vitest';
import { classifyPolicy, hasNarrowingPredicate, hasRecordedAudience } from '../../../lib/db/broad-policy-classifier.mjs';

describe('hasNarrowingPredicate — does the qual actually reduce what the audience reaches?', () => {
  it('NO for the shapes that narrow nothing', () => {
    expect(hasNarrowingPredicate('true')).toBe(false);
    expect(hasNarrowingPredicate('TRUE')).toBe(false);
    expect(hasNarrowingPredicate(null)).toBe(false);
    expect(hasNarrowingPredicate('')).toBe(false);
    expect(hasNarrowingPredicate("auth.role() = 'authenticated'")).toBe(false);
    expect(hasNarrowingPredicate("auth.role() = 'authenticated' OR auth.role() = 'service_role'")).toBe(false);
  });

  it('NO for the ::text-cast rendering — the regression pin', () => {
    // This is verbatim what pg_policies returns for research_intelligence_reference. The version
    // WITHOUT the cast already passed above; only this one caught the bug.
    expect(hasNarrowingPredicate("((auth.role() = 'authenticated'::text) OR (auth.role() = 'service_role'::text))")).toBe(false);
  });

  it('YES for predicates that genuinely narrow', () => {
    expect(hasNarrowingPredicate('fn_is_chairman()')).toBe(true);
    expect(hasNarrowingPredicate('auth.uid() = user_id')).toBe(true);
    expect(hasNarrowingPredicate('is_current = true')).toBe(true);
  });

  it('YES for a COMPOUND predicate that also mentions the role', () => {
    // The control that a substring match on auth.role() fails. Stripping the role term must leave
    // the real conjunct behind, not swallow it.
    expect(hasNarrowingPredicate("auth.role() = 'authenticated' AND auth.uid() = user_id")).toBe(true);
    expect(hasNarrowingPredicate("(auth.role() = 'authenticated'::text) AND (is_current = true)")).toBe(true);
  });
});

describe('classifyPolicy — broad principal AND no narrowing = violation', () => {
  const p = (over = {}) => ({ roles: '{authenticated}', cmd: 'SELECT', qual: 'true', ...over });

  it('flags a broad read with no predicate', () => {
    expect(classifyPolicy(p()).violation).toBe(true);
  });

  it('flags the role-restatement shape and NAMES it distinctly from qual=true', () => {
    const v = classifyPolicy(p({ qual: "auth.role() = 'authenticated'::text" }));
    expect(v.violation).toBe(true);
    // The two diagnoses are different and collapsing them would lose the distinction that makes
    // this shape worth a separate lint branch.
    expect(v.reason).toMatch(/RE-STATES/);
    expect(classifyPolicy(p()).reason).toMatch(/no predicate at all/);
  });

  it('does NOT flag a service_role-only policy', () => {
    expect(classifyPolicy(p({ roles: '{service_role}' })).violation).toBe(false);
  });

  it('does NOT flag a broad principal whose rows ARE narrowed', () => {
    expect(classifyPolicy(p({ qual: 'fn_is_chairman()' })).violation).toBe(false);
    expect(classifyPolicy(p({ qual: 'is_current = true' })).violation).toBe(false);
  });

  it('treats {public} as broad — the role name is not to be trusted', () => {
    // PostgREST resolves public to anon+authenticated; taking the label at face value is the
    // same class of error as inferring a table's audience from its name.
    expect(classifyPolicy(p({ roles: '{public}' })).violation).toBe(true);
  });

  it('ignores write-only policies — this is a read-confidentiality check', () => {
    expect(classifyPolicy(p({ cmd: 'INSERT' })).violation).toBe(false);
  });
});

describe('hasRecordedAudience — FR-1s convention', () => {
  it('detects the structured Audience: line', () => {
    expect(hasRecordedAudience('Some prose. Audience: chairman only. More prose.')).toBe(true);
  });

  it('is NOT satisfied by prose that merely discusses an audience', () => {
    // The point of a structured line is that it can be found mechanically. Prose about who reads
    // the table is exactly the informal state this SD is replacing.
    expect(hasRecordedAudience('Read by checkRateSoak() to enforce a rate cap.')).toBe(false);
    expect(hasRecordedAudience('Audience:')).toBe(false); // present but empty states nothing
    expect(hasRecordedAudience(null)).toBe(false);
  });
});
