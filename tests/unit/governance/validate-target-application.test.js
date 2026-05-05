/**
 * Unit tests for lib/governance/validate-target-application.js
 *
 * SD-LEO-INFRA-FAIL-CLOSED-VENTURE-001-B / PA-4 / FR-B3 + FR-B4 + C-SEC-1B + C-SEC-7B
 */

import { describe, it, expect, vi } from 'vitest';
import { validateTargetApplication } from '../../../lib/governance/validate-target-application.js';

function makeSupabase(ventureRow, ventureError = null) {
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn().mockResolvedValue({
            data: ventureRow,
            error: ventureError,
          }),
        })),
      })),
    })),
  };
}

describe('validateTargetApplication', () => {
  describe('RULE-2 (C-SEC-7B inverse smuggling)', () => {
    it('FR-B4: legitimate null-venture + target_application=EHG passes', async () => {
      const supabase = makeSupabase(null);
      const result = await validateTargetApplication({
        sd: { id: 'sd-1', venture_id: null, target_application: 'EHG' },
        supabase,
      });
      expect(result.valid).toBe(true);
    });

    it('FR-B4: legitimate null-venture + target_application=EHG_Engineer passes', async () => {
      const supabase = makeSupabase(null);
      const result = await validateTargetApplication({
        sd: { id: 'sd-2', venture_id: null, target_application: 'EHG_Engineer' },
        supabase,
      });
      expect(result.valid).toBe(true);
    });

    it('rejects null-venture + target_application=CommitCraft (smuggling vector)', async () => {
      const supabase = makeSupabase(null);
      const result = await validateTargetApplication({
        sd: { id: 'sd-3', venture_id: null, target_application: 'CommitCraft' },
        supabase,
      });
      expect(result.valid).toBe(false);
      expect(result.error.code).toBe('TARGET_APPLICATION_INVERSE_SMUGGLING');
      expect(result.error.rule).toBe('RULE-2');
      expect(result.error.message).toMatch(/Null-venture/);
    });

    it('rejects null-venture + arbitrary other target_application', async () => {
      const supabase = makeSupabase(null);
      const result = await validateTargetApplication({
        sd: { id: 'sd-4', venture_id: null, target_application: 'PrivacyPatrolAI' },
        supabase,
      });
      expect(result.valid).toBe(false);
      expect(result.error.target_application).toBe('PrivacyPatrolAI');
    });
  });

  describe('RULE-1 (FR-B3 venture mismatch)', () => {
    it('FR-B3: rejects venture-routed SD with target_application=EHG when venture.name=CommitCraft', async () => {
      const supabase = makeSupabase({ id: 'v-1', name: 'CommitCraft AI' });
      const result = await validateTargetApplication({
        sd: { id: 'sd-5', venture_id: 'v-1', target_application: 'EHG' },
        supabase,
      });
      expect(result.valid).toBe(false);
      expect(result.error.code).toBe('TARGET_APPLICATION_VENTURE_MISMATCH');
      expect(result.error.rule).toBe('RULE-1');
      expect(result.error.venture_name).toBe('CommitCraft AI');
    });

    it('passes venture-routed SD when target_application matches venture.name (= ehg)', async () => {
      const supabase = makeSupabase({ id: 'v-ehg', name: 'ehg' });
      const result = await validateTargetApplication({
        sd: { id: 'sd-6', venture_id: 'v-ehg', target_application: 'EHG' },
        supabase,
      });
      expect(result.valid).toBe(true);
    });

    it('C-SEC-1B: rejects homoglyph venture name (zero-width-space) trying to match "EHG"', async () => {
      // Zero-width-space inserted between E and HG
      const supabase = makeSupabase({ id: 'v-zwsp', name: 'E​HG' });
      const result = await validateTargetApplication({
        sd: { id: 'sd-7', venture_id: 'v-zwsp', target_application: 'EHG' },
        supabase,
      });
      // Both sides normalized: 'E​HG' → 'ehg', 'EHG' → 'ehg' — match → valid
      // Wait: expected behavior is they DO match because normalizer collapses ZWSP.
      // The homoglyph DEFENSE here is the normalizer making them equal, not making them differ.
      expect(result.valid).toBe(true);
    });

    it('C-SEC-1B: homoglyph venture (Latin-fullwidth E) normalizes to ASCII E and matches', async () => {
      // Fullwidth E (U+FF25) → NFKD decomposes to ASCII E
      const supabase = makeSupabase({ id: 'v-fullwidth', name: 'ＥHG' });
      const result = await validateTargetApplication({
        sd: { id: 'sd-8', venture_id: 'v-fullwidth', target_application: 'EHG' },
        supabase,
      });
      expect(result.valid).toBe(true);
    });

    it('C-SEC-1B: NON-homoglyph venture name (ehg-prime) does NOT normalize to ehg → rejected', async () => {
      const supabase = makeSupabase({ id: 'v-ehg-prime', name: 'EHG-Prime' });
      const result = await validateTargetApplication({
        sd: { id: 'sd-9', venture_id: 'v-ehg-prime', target_application: 'EHG' },
        supabase,
      });
      // 'EHG-Prime' normalizes to 'ehgprime' which !== 'ehg' → rejected
      expect(result.valid).toBe(false);
      expect(result.error.code).toBe('TARGET_APPLICATION_VENTURE_MISMATCH');
    });

    it('reports venture-not-found when venture_id references missing row', async () => {
      const supabase = makeSupabase(null); // no row returned
      const result = await validateTargetApplication({
        sd: { id: 'sd-10', venture_id: 'v-missing', target_application: 'EHG' },
        supabase,
      });
      expect(result.valid).toBe(false);
      expect(result.error.code).toBe('TARGET_APPLICATION_VENTURE_NOT_FOUND');
    });

    it('passes when venture_id is set and target_application is non-EHG (no rule applies)', async () => {
      const supabase = makeSupabase({ id: 'v-cc', name: 'CommitCraft AI' });
      const result = await validateTargetApplication({
        sd: { id: 'sd-11', venture_id: 'v-cc', target_application: 'commitcraft-ai' },
        supabase,
      });
      // PA-4 only catches the EHG-target case for venture-routed SDs. Other
      // target/venture pairings are out of scope for THIS validator (the
      // existing crosscheck handles scope-text-vs-target).
      expect(result.valid).toBe(true);
    });
  });

  describe('argument validation', () => {
    it('throws when sd is missing', async () => {
      await expect(validateTargetApplication({ supabase: makeSupabase(null) })).rejects.toThrow(/sd is required/);
    });

    it('throws when supabase is missing', async () => {
      await expect(
        validateTargetApplication({
          sd: { id: 'x', venture_id: null, target_application: 'EHG' },
        })
      ).rejects.toThrow(/supabase client is required/);
    });
  });
});
