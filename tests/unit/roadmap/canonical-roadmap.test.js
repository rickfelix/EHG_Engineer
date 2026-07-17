/**
 * Unit tests — SD-LEO-INFRA-DISTILL-ROADMAP-SINGLE-001 (FR-1)
 * lib/roadmap/canonical-roadmap.js
 */
import { describe, it, expect } from 'vitest';
import { resolveCanonicalRoadmap } from '../../../lib/roadmap/canonical-roadmap.js';

function makeSupabase(rows, error = null) {
  return {
    from(table) {
      return {
        select() {
          return {
            eq(col, val) {
              const filtered = error ? null : rows.filter((r) => r[col] === val);
              return Promise.resolve({ data: filtered, error });
            },
          };
        },
      };
    },
  };
}

describe('resolveCanonicalRoadmap', () => {
  it('returns the single active roadmap regardless of current_baseline_version', () => {
    const rows = [
      { id: 'canonical-1', title: 'LEO Roadmap', status: 'active', current_baseline_version: 0 },
      { id: 'draft-1', title: 'EVA Intake Roadmap', status: 'draft', current_baseline_version: 0 },
    ];
    return resolveCanonicalRoadmap(makeSupabase(rows)).then((result) => {
      expect(result).toEqual(rows[0]);
    });
  });

  it('returns null when no active roadmap exists (bootstrap required)', () => {
    const rows = [{ id: 'draft-1', title: 'EVA Intake Roadmap', status: 'draft', current_baseline_version: 0 }];
    return resolveCanonicalRoadmap(makeSupabase(rows)).then((result) => {
      expect(result).toBeNull();
    });
  });

  it('throws (fails loud) when more than one active roadmap exists — never silently picks one', async () => {
    const rows = [
      { id: 'active-1', title: 'LEO Roadmap', status: 'active', current_baseline_version: 0 },
      { id: 'active-2', title: 'EVA Intake Roadmap', status: 'active', current_baseline_version: 0 },
    ];
    await expect(resolveCanonicalRoadmap(makeSupabase(rows))).rejects.toThrow(/ambiguous/);
    await expect(resolveCanonicalRoadmap(makeSupabase(rows))).rejects.toThrow(/active-1/);
    await expect(resolveCanonicalRoadmap(makeSupabase(rows))).rejects.toThrow(/active-2/);
  });

  it('propagates a query error rather than silently returning null', async () => {
    await expect(resolveCanonicalRoadmap(makeSupabase([], { message: 'db down' }))).rejects.toThrow(/db down/);
  });
});
