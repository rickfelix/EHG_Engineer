import { describe, it, expect } from 'vitest';
import { validateVocabTuple } from '../../scripts/lib/vocab-version-validator.mjs';

describe('vocab-version-validator', () => {
  it('CONTRACT_MISSING for empty vocab', () => {
    expect(validateVocabTuple({ vocab: null }).verdict).toBe('CONTRACT_MISSING');
    expect(validateVocabTuple({ vocab: { terms: [] } }).verdict).toBe('CONTRACT_MISSING');
  });

  it('CONTRACT_MALFORMED for wrong schema_version', () => {
    expect(validateVocabTuple({ schema_version: '2.0.0', vocabulary_version: '1.0.0', vocab: { terms: [{}] } }).verdict).toBe('CONTRACT_MALFORMED');
  });

  it('CONTRACT_MALFORMED for missing vocabulary_version', () => {
    expect(validateVocabTuple({ schema_version: '1.0.0', vocab: { terms: [{}] } }).verdict).toBe('CONTRACT_MALFORMED');
  });

  it('PASS for valid vocab + old terms', () => {
    const oldDate = new Date('2025-01-01').toISOString();
    const r = validateVocabTuple({ schema_version: '1.0.0', vocabulary_version: '1.0.0', vocab: { terms: [{ term: 'old', added_at: oldDate }] } });
    expect(r.verdict).toBe('PASS');
    expect(r.grace_warning).toBeUndefined();
  });

  it('PASS with grace_warning for terms in 30-day window', () => {
    const recent = new Date().toISOString();
    const r = validateVocabTuple({ schema_version: '1.0.0', vocabulary_version: '1.0.0', vocab: { terms: [{ term: 'new', added_at: recent }] } });
    expect(r.verdict).toBe('PASS');
    expect(r.grace_warning).toBe(true);
    expect(r.new_terms).toContain('new');
  });
});
