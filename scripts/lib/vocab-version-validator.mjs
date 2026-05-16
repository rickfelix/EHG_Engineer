// scripts/lib/vocab-version-validator.mjs
// Sibling B FR-B-6: (contract_schema_version, vocabulary_version) tuple validator.
// Closes RISK B-03 priority 12: distinct CONTRACT_MALFORMED vs CONTRACT_MISSING.

export const REQUIRED_SCHEMA_VERSION = '1.0.0';
export const GRACE_WINDOW_DAYS = 30;
const GRACE_MS = GRACE_WINDOW_DAYS * 86400 * 1000;

export function validateVocabTuple({ schema_version, vocabulary_version, vocab, now = new Date() }) {
  if (!vocab || (Array.isArray(vocab?.terms) && vocab.terms.length === 0)) {
    return { valid: false, verdict: 'CONTRACT_MISSING', reason: 'vocab is empty or null' };
  }

  if (schema_version !== REQUIRED_SCHEMA_VERSION) {
    return { valid: false, verdict: 'CONTRACT_MALFORMED', reason: `schema_version must be ${REQUIRED_SCHEMA_VERSION}, got ${schema_version}` };
  }

  if (!vocabulary_version || typeof vocabulary_version !== 'string') {
    return { valid: false, verdict: 'CONTRACT_MALFORMED', reason: 'vocabulary_version required (non-empty string)' };
  }

  const terms = Array.isArray(vocab?.terms) ? vocab.terms : [];
  const nowMs = now.getTime();
  const newTerms = terms.filter(t => {
    if (!t?.added_at) return false;
    const addedMs = new Date(t.added_at).getTime();
    if (Number.isNaN(addedMs)) return false;
    return (nowMs - addedMs) < GRACE_MS;
  });

  if (newTerms.length > 0) {
    return {
      valid: true,
      verdict: 'PASS',
      grace_warning: true,
      reason: `${newTerms.length} term(s) within ${GRACE_WINDOW_DAYS}-day grace window`,
      new_terms: newTerms.map(t => t.term),
    };
  }

  return { valid: true, verdict: 'PASS' };
}
