import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// Source-pin tests, matching the established convention for this file (see the sibling
// orchestrator-completion-guardian-children-count.test.js / -retro-shape.test.js) --
// the module-level `supabase` client (created at import time, not injected) makes
// runtime mocking impractical without a larger DI refactor out of this SD's scope.
const GUARDIAN = resolve(dirname(fileURLToPath(import.meta.url)), 'orchestrator-completion-guardian.js');
const SRC = readFileSync(GUARDIAN, 'utf8');

describe('SD-LEO-INFRA-COMPLETION-INTEGRITY-REPAIR-001 guardian fixes', () => {
  describe('createRetrospective() aggregation quality (feedback ea46e576)', () => {
    it('filters child retro aggregation to retro_type=SD_COMPLETION only', () => {
      expect(SRC).toMatch(/\.eq\('retro_type',\s*'SD_COMPLETION'\)/);
    });

    it('delegates aggregation to the extracted, runtime-unit-tested buildRetrospectiveContent() (see lib/quality/build-retrospective-content.test.js for full population/fallback/dedupe coverage, including the previously-uncovered action_items/improvement_areas fallback and key_learnings dedupe-by-value cases)', () => {
      expect(SRC).toMatch(/import\s*{\s*buildRetrospectiveContent\s*}\s*from\s*'\.\.\/\.\.\/\.\.\/lib\/quality\/build-retrospective-content\.js'/);
      expect(SRC).toMatch(/const content = buildRetrospectiveContent\(childRetros,/);
      expect(SRC).toMatch(/what_went_well:\s*content\.what_went_well,/);
      expect(SRC).toMatch(/action_items:\s*content\.action_items,/);
      expect(SRC).toMatch(/improvement_areas:\s*content\.improvement_areas,/);
    });
  });

  describe('completeDeliverable() verified_by (feedback 848c692a)', () => {
    it('no longer writes the 21-char value that violated VARCHAR(20)', () => {
      expect(SRC).not.toMatch(/verified_by:\s*'ORCHESTRATOR-GUARDIAN'/);
    });

    it("writes 'LEAD' instead", () => {
      expect(SRC).toMatch(/verified_by:\s*'LEAD'/);
    });
  });

  describe('recordPatternSuccess() (feedback 85faa739)', () => {
    it('no longer calls the nonexistent supabase.sql tagged-template method', () => {
      expect(SRC).not.toMatch(/occurrence_count:\s*supabase\.sql/);
      expect(SRC).not.toMatch(/success_rate:\s*supabase\.sql/);
    });

    it('fetches occurrence_count/success_rate, then delegates the could-not-check/not-found/update decision to the extracted, runtime-unit-tested resolvePatternSuccessUpdate() (all 3 branches covered in lib/quality/resolve-pattern-success-update.test.js, including the fetch-error branch that cannot be exercised without mocking the module-level supabase client)', () => {
      expect(SRC).toMatch(/\.select\('occurrence_count, success_rate'\)/);
      expect(SRC).toMatch(/import\s*{\s*resolvePatternSuccessUpdate\s*}\s*from\s*'\.\.\/\.\.\/\.\.\/lib\/quality\/resolve-pattern-success-update\.js'/);
      expect(SRC).toMatch(/const decision = resolvePatternSuccessUpdate\(\{ fetchError, pattern, outcomeScore \}\);/);
      expect(SRC).toMatch(/if \(decision\.action !== 'update'\) {/);
    });

    it("complete()'s call site wraps recordPatternSuccess() in try/catch (defense-in-depth beyond the method's own fail-soft internals)", () => {
      expect(SRC).toMatch(/try\s*{\s*await this\.recordPatternSuccess\(\);\s*}\s*catch \(patternError\)/);
    });
  });
});
