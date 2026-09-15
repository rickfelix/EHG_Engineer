/**
 * SD-LEO-INFRA-APPLY-STATE-VERIFIER-002 -- apply-state verifier regression replay corpus.
 *
 * Replays the verifier's own comparison (normalizeSqlBody / normalizeTriggerWhenClause) over a
 * frozen corpus of every function/trigger object currently owned by a known-applied migration,
 * proving the case-folding/implicit-cast/quote-scoping fix (SD-LEO-INFRA-APPLY-STATE-VERIFIER-001,
 * PR #8973 + 2 adversarial rounds) has not regressed. NO LIVE DATABASE CONNECTION -- the corpus is
 * frozen data (see scripts/db/apply-state-verifier-corpus-generator.mjs to regenerate).
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  normalizeSqlBody,
  normalizeTriggerWhenClause,
  extractTriggerWhenClause,
} from '../scripts/verify-migration-apply-state.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CORPUS_PATH = path.join(__dirname, 'fixtures', 'apply-state-verifier-corpus', 'corpus.json');
const corpus = JSON.parse(fs.readFileSync(CORPUS_PATH, 'utf8'));

function compare(entry) {
  if (entry.class === 'function') {
    return normalizeSqlBody(entry.file_text) === normalizeSqlBody(entry.live_text);
  }
  if (entry.class === 'trigger') {
    return (
      normalizeTriggerWhenClause(extractTriggerWhenClause(entry.file_text) ?? '') ===
      normalizeTriggerWhenClause(extractTriggerWhenClause(entry.live_text) ?? '')
    );
  }
  throw new Error(`unknown corpus entry class: ${entry.class}`);
}

describe('apply-state verifier regression corpus (fixture-driven, no live DB)', () => {
  it('the corpus fixture is present and internally consistent', () => {
    expect(Array.isArray(corpus.entries)).toBe(true);
    expect(corpus.entries.length).toBeGreaterThan(0);
    expect(corpus.entries.length).toBe(corpus.entry_count);
  });

  it('exactly one entry is the confirmed false positive (trg_sd_mutation_audit)', () => {
    const confirmed = corpus.entries.filter((e) => e.confirmed_false_positive);
    expect(confirmed.length).toBe(1);
    expect(confirmed[0].name).toBe('trg_sd_mutation_audit');
    expect(confirmed[0].class).toBe('trigger');
  });

  it('TS-1: the confirmed false positive classifies as a match (APPLIED, not BODY_MISMATCH)', () => {
    const entry = corpus.entries.find((e) => e.confirmed_false_positive);
    expect(compare(entry)).toBe(true);
  });

  it('TS-2: every known-applied function/trigger fixture classifies as a match', () => {
    const mismatches = corpus.entries.filter((e) => !compare(e));
    expect(mismatches.map((e) => e.id)).toEqual([]);
  });

  describe('TS-3: seeded mutations are caught on BOTH comparison paths (non-vacuity proof)', () => {
    it('a mutated FUNCTION entry flips to a divergence', () => {
      const original = corpus.entries.find((e) => e.class === 'function' && compare(e));
      expect(original).toBeDefined();
      expect(compare(original)).toBe(true);
      // NOT a `--` comment: normalizeSqlBody() strips SQL comments before comparing, so an
      // appended comment would be invisible to the check -- the mutation must be real content.
      const mutated = { ...original, live_text: `${original.live_text} __mutated_for_non_vacuity_proof__` };
      expect(compare(mutated)).toBe(false);
    });

    it('a mutated TRIGGER entry flips to a divergence', () => {
      const original = corpus.entries.find(
        (e) => e.class === 'trigger' && !e.confirmed_false_positive && /WHEN \(/i.test(e.live_text) && compare(e)
      );
      expect(original).toBeDefined();
      expect(compare(original)).toBe(true);
      const mutated = {
        ...original,
        live_text: original.live_text.replace(/WHEN \(/i, 'WHEN (old.__mutated_column_for_test IS NOT NULL AND '),
      };
      expect(compare(mutated)).toBe(false);
    });
  });

  it('this suite never imports a live-DB-connecting module', () => {
    const src = fs.readFileSync(fileURLToPath(import.meta.url), 'utf8');
    expect(src).not.toMatch(/supabase-connection\.js|@supabase\/supabase-js/);
  });
});
