/**
 * QF-20260622-505 — auto-refill gate query must SELECT metadata so description-recovery works.
 *
 * refill-cron.mjs and refill-verify.mjs both query roadmap_wave_items and pass each row verbatim to
 * evaluateRefillCandidate. That predicate's substance check (hasRecoveredSubstance) reads
 * metadata.description — the field the BELT-001-PART-001 backfill recovered into 173 truncated-title
 * rows. If the SELECT list omits `metadata`, every row arrives with metadata=undefined, so
 * hasRecoveredSubstance() returns false and every recovered row is rejected substance_thin — the
 * backfill is inert. Same dropped-field class as the original BELT-001 bug.
 *
 * Two layers of guard:
 *  1. Behavioural — a row carrying metadata.description >= the floor clears substance_thin (the
 *     contract the SELECT must feed). Already covered for the predicate, re-pinned here as the
 *     end-state these queries must produce.
 *  2. Source pin — both live SELECT strings include `metadata`, so the dropped-field regression
 *     cannot silently return (a behavioural test alone can't see what the SELECT omits).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  evaluateRefillCandidate, REFILL_INVALID_REASONS, TITLE_TRUNCATION_CAP,
} from '../../../lib/sourcing-engine/refill-candidate-validity.js';

const truncatedTitle = ('x'.repeat(TITLE_TRUNCATION_CAP - 3) + '...');
const recoveredDescription =
  'The refill gate query dropped metadata, so recovered descriptions never reached the substance check.'; // >=40 chars

const cronSrc = readFileSync(
  fileURLToPath(new URL('../../../scripts/sourcing-engine/refill-cron.mjs', import.meta.url)), 'utf8');
const verifySrc = readFileSync(
  fileURLToPath(new URL('../../../scripts/sourcing-engine/refill-verify.mjs', import.meta.url)), 'utf8');

// Extract the roadmap_wave_items .select('...') arguments from a source string. Keyed on
// item_disposition (a roadmap_wave_items-only column) so the strategic_directives_v2 .select('title')
// query in refill-cron.mjs is not mistaken for a staged-candidate query.
const selectArgs = (src) =>
  [...src.matchAll(/\.select\(\s*'([^']*)'/g)].map((m) => m[1]).filter((s) => /item_disposition/.test(s));

describe('QF-20260622-505: refill SELECT carries metadata (description recovery is live)', () => {
  it('a recovered metadata.description row clears substance_thin (the SELECT must feed this)', () => {
    const row = {
      item_disposition: 'pending', promoted_to_sd_key: null, title: truncatedTitle,
      source_type: 'brainstorm', source_id: '22222222-2222-2222-2222-222222222222',
      lane: 'belt', metadata: { description: recoveredDescription },
    };
    expect(evaluateRefillCandidate(row)).toEqual({ valid: true, reason: null });
  });

  it('the SAME row WITHOUT metadata (the bug) is wrongly rejected substance_thin', () => {
    const row = {
      item_disposition: 'pending', promoted_to_sd_key: null, title: truncatedTitle,
      source_type: 'brainstorm', source_id: '22222222-2222-2222-2222-222222222222', lane: 'belt',
    };
    expect(evaluateRefillCandidate(row))
      .toEqual({ valid: false, reason: REFILL_INVALID_REASONS.SUBSTANCE_THIN });
  });

  it('refill-cron.mjs SELECTs metadata from roadmap_wave_items', () => {
    const args = selectArgs(cronSrc);
    expect(args.length).toBeGreaterThan(0);
    expect(args.every((a) => /\bmetadata\b/.test(a))).toBe(true);
  });

  it('refill-verify.mjs SELECTs metadata from roadmap_wave_items', () => {
    const args = selectArgs(verifySrc);
    expect(args.length).toBeGreaterThan(0);
    expect(args.every((a) => /\bmetadata\b/.test(a))).toBe(true);
  });
});
