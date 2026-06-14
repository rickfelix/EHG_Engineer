import { describe, it, expect } from 'vitest';
import { classify } from '../../../lib/intake/triage-classifier.js';

const sd = (sd_key, title, extra = {}) => ({ sd_key, title, scope: '', description: '', key_changes: [], ...extra });

describe('triage-classifier (pure, rule-based) — every verdict path', () => {
  it('action_type review -> dismissed/advisory_review', () => {
    const v = classify({ title: 'Look into X', action_type: 'review' }, { existingSds: [] });
    expect(v.disposition).toBe('dismissed');
    expect(v.triage_verdict).toBe('advisory_review');
    expect(v.dismiss_reason).toBe('advisory_review_not_sd_candidate');
    expect(v.promote).toBe(false);
  });

  it('action_type research -> dismissed/research_directive', () => {
    const v = classify({ title: 'Research Y', action_type: 'research' }, { existingSds: [] });
    expect(v.disposition).toBe('dismissed');
    expect(v.triage_verdict).toBe('research_directive');
  });

  it('proposed key already materialized -> merged_duplicate/already_materialized (runs before action_type)', () => {
    const v = classify(
      { title: 'whatever', action_type: 'create_sd', source_external_id: 'SD-LEO-X-001' },
      { existingSds: [], existingSdKeys: new Set(['SD-LEO-X-001']) }
    );
    expect(v.disposition).toBe('merged_duplicate');
    expect(v.triage_verdict).toBe('already_materialized');
    expect(v.dedup_match_sd_key).toBe('SD-LEO-X-001');
    expect(v.dedup_score).toBe(1.0);
  });

  it('exact title match -> merged_duplicate/exact_duplicate score 1.0', () => {
    const v = classify(
      { title: 'Unify intake pools', action_type: 'create_sd' },
      { existingSds: [sd('SD-DUP-001', 'Unify intake pools')] }
    );
    expect(v.disposition).toBe('merged_duplicate');
    expect(v.triage_verdict).toBe('exact_duplicate');
    expect(v.dedup_match_sd_key).toBe('SD-DUP-001');
    expect(v.dedup_score).toBe(1.0);
  });

  it('Jaccard >= 0.5 -> merged_duplicate/jaccard_duplicate', () => {
    const v = classify(
      { title: 'payment webhook signature verification idempotent', action_type: 'create_sd' },
      { existingSds: [sd('SD-JAC-001', 'payment webhook signature verification idempotent capture')] }
    );
    expect(v.disposition).toBe('merged_duplicate');
    expect(v.triage_verdict).toBe('jaccard_duplicate');
    expect(v.dedup_match_sd_key).toBe('SD-JAC-001');
    expect(v.dedup_score).toBeGreaterThanOrEqual(0.5);
  });

  it('capability coverage -> dismissed/covered_by_capability', () => {
    const v = classify(
      { title: 'conversion ledger backlog metric query', action_type: 'create_sd' },
      { existingSds: [], capabilities: [{ name: 'conversion ledger backlog metric', description: 'query' }] }
    );
    expect(v.disposition).toBe('dismissed');
    expect(v.triage_verdict).toBe('covered_by_capability');
  });

  it('generic title weakly matching many SDs -> deferred/ambiguous_generic (conservative guard)', () => {
    const existingSds = [
      sd('SD-A', 'alpha charlie'), sd('SD-B', 'alpha delta'),
      sd('SD-C', 'alpha echo'), sd('SD-D', 'alpha foxtrot'),
    ];
    const v = classify({ title: 'alpha bravo', action_type: 'create_sd' }, { existingSds });
    expect(v.disposition).toBe('deferred');
    expect(v.triage_verdict).toBe('ambiguous_generic');
    expect(v.promote).toBe(false);
  });

  it('novel + create_sd -> promote (converted intended)', () => {
    const v = classify(
      { title: 'Quantum flux capacitor orchestration subsystem', action_type: 'create_sd' },
      { existingSds: [sd('SD-OTHER', 'completely unrelated payroll module')] }
    );
    expect(v.promote).toBe(true);
    expect(v.disposition).toBe('converted');
    expect(v.triage_verdict).toBe('novel_promote');
  });

  it('is idempotent — same input yields same verdict', () => {
    const item = { title: 'payment webhook signature verification idempotent', action_type: 'create_sd' };
    const ctx = { existingSds: [sd('SD-JAC-001', 'payment webhook signature verification idempotent capture')] };
    expect(classify(item, ctx)).toEqual(classify(item, ctx));
  });
});
