/**
 * SD-LEO-INFRA-REFILL-SELECT-METADATA-001 — the auto-refill SELECTs MUST fetch `metadata`.
 *
 * The bug: refill-cron.mjs, refill-verify.mjs, and coordinator-charter-audit.mjs SELECTed
 * roadmap_wave_items WITHOUT the `metadata` field. So hasRecoveredSubstance read
 * item.metadata.description = undefined and the gate rejected every recovered row as
 * substance_thin — the belt promoted 0 even after the backfill wrote 173 descriptions.
 *
 * A PURE hasRecoveredSubstance test passes pre-fix and MISSES this entire class (the gate logic
 * was always correct — the QUERY was blind). So the primary guard is QUERY-SHAPED: assert each
 * roadmap_wave_items SELECT carries `metadata`. The behavioral test then proves the end-to-end:
 * a truncated-title row WITH metadata.description promotes; the same row WITHOUT it is rejected.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyStagedCandidates } from '../../lib/sourcing-engine/refill-dry-run-verifier.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const SELECT_SITES = [
  'scripts/sourcing-engine/refill-cron.mjs',
  'scripts/sourcing-engine/refill-verify.mjs',
  'scripts/coordinator-charter-audit.mjs',
];

describe('auto-refill query carries metadata (SD-LEO-INFRA-REFILL-SELECT-METADATA-001)', () => {
  // QUERY-SHAPED durability guard: every roadmap_wave_items .select() that reads the staged corpus
  // (identified by item_disposition) must include `metadata` — else the gate goes blind again.
  for (const f of SELECT_SITES) {
    it(`${f}: the staged roadmap_wave_items SELECT includes metadata`, () => {
      const src = read(f);
      const selectLines = src
        .split('\n')
        .filter((l) => /\.select\(/.test(l) && /item_disposition/.test(l));
      expect(selectLines.length, `expected a staged-corpus .select() in ${f}`).toBeGreaterThan(0);
      for (const line of selectLines) {
        expect(line, `${f}: staged .select() must carry metadata`).toMatch(/\bmetadata\b/);
      }
    });
  }

  // BEHAVIORAL: the gate honors recovered substance — a truncated-title row WITH metadata.description
  // promotes; the same row WITHOUT it is rejected substance_thin. Proves the SELECT fix is load-bearing.
  it('a truncated-title staged row promotes WITH metadata.description and is rejected WITHOUT it', () => {
    const truncated = 'x'.repeat(125) + '...'; // >=120 chars ending in an ellipsis = a substance_thin shell
    const recovered = 'A genuine recovered feedback description, comfortably over forty characters long.';
    const base = {
      id: 'rwi-test-1',
      title: truncated,
      source_type: 'manual_feedback',
      source_id: 'fb-test-1',
      item_disposition: 'pending',
    };
    const opts = { shippedTitleSet: new Set() };

    const withMeta = verifyStagedCandidates([{ ...base, metadata: { description: recovered } }], opts);
    const withoutMeta = verifyStagedCandidates([{ ...base, metadata: {} }], opts);

    expect(withMeta.validCount).toBe(1); // recovered substance present -> promotes
    expect(withoutMeta.validCount).toBe(0); // no recovered substance -> substance_thin reject
  });
});
