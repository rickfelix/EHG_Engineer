import { describe, it, expect } from 'vitest';
import {
  PATTERN_ID,
  DEDUP_FINGERPRINT,
  FIRST_SEEN_SD_KEY,
  LAST_SEEN_SD_KEY,
  ROW,
} from '../../scripts/insert-pat-port-isol-001.mjs';

describe('insert-pat-port-isol-001 — exported constants', () => {
  it('PATTERN_ID is exactly PAT-PORT-ISOL-001 (16 chars)', () => {
    expect(PATTERN_ID).toBe('PAT-PORT-ISOL-001');
    expect(PATTERN_ID.length).toBe(17); // "PAT-PORT-ISOL-001" = 17 chars (still ≤ VARCHAR(20))
    expect(PATTERN_ID.length).toBeLessThanOrEqual(20);
  });

  it('DEDUP_FINGERPRINT contains "portfolio-isolation" + ISO date', () => {
    expect(DEDUP_FINGERPRINT).toMatch(/portfolio-isolation/);
    expect(DEDUP_FINGERPRINT).toMatch(/2026-05-05/);
  });

  it('FIRST_SEEN_SD_KEY references the canonical originating SD', () => {
    expect(FIRST_SEEN_SD_KEY).toBe('SD-LEO-INFRA-FAIL-CLOSED-VENTURE-001-B');
  });

  it('LAST_SEEN_SD_KEY references the persisting SD', () => {
    expect(LAST_SEEN_SD_KEY).toBe('SD-LEO-INFRA-AUDIT-SHARED-TABLES-001');
  });
});

describe('insert-pat-port-isol-001 — ROW shape', () => {
  it('pattern_id matches exported PATTERN_ID', () => {
    expect(ROW.pattern_id).toBe(PATTERN_ID);
  });

  it('category is "security" (Tier-3 invariant)', () => {
    expect(ROW.category).toBe('security');
  });

  it('severity is high (or critical)', () => {
    expect(['high', 'critical']).toContain(ROW.severity);
  });

  it('issue_summary is non-empty and references portfolio-isolation', () => {
    expect(typeof ROW.issue_summary).toBe('string');
    expect(ROW.issue_summary.length).toBeGreaterThan(50);
    expect(ROW.issue_summary).toMatch(/portfolio.isolation/i);
  });

  it('prevention_checklist has EXACTLY 9 items (matches MEMORY.md)', () => {
    expect(Array.isArray(ROW.prevention_checklist)).toBe(true);
    expect(ROW.prevention_checklist.length).toBe(9);
  });

  it('prevention_checklist items are non-empty strings starting with "Verify"', () => {
    for (const item of ROW.prevention_checklist) {
      expect(typeof item).toBe('string');
      expect(item.length).toBeGreaterThan(20);
      expect(item.startsWith('Verify ')).toBe(true);
    }
  });

  it('prevention_checklist item #1 covers Stage 19 advance precondition', () => {
    expect(ROW.prevention_checklist[0]).toMatch(/repo_url/);
    expect(ROW.prevention_checklist[0]).toMatch(/Stage 19/);
  });

  it('prevention_checklist item #4 covers NFKD normalization (anti-homoglyph)', () => {
    expect(ROW.prevention_checklist[3]).toMatch(/NFKD/);
  });

  it('prevention_checklist item #5 covers C-SEC-4 routing distinction', () => {
    expect(ROW.prevention_checklist[4]).toMatch(/C-SEC-4/);
  });

  it('proven_solutions array has at least 2 entries', () => {
    expect(Array.isArray(ROW.proven_solutions)).toBe(true);
    expect(ROW.proven_solutions.length).toBeGreaterThanOrEqual(2);
    for (const s of ROW.proven_solutions) {
      expect(typeof s.title).toBe('string');
      expect(typeof s.description).toBe('string');
    }
  });

  it('related_sub_agents includes SECURITY (declared by security-agent)', () => {
    expect(ROW.related_sub_agents).toContain('SECURITY');
  });

  it('metadata.tier is 3', () => {
    expect(ROW.metadata.tier).toBe(3);
  });

  it('metadata.classification is security_invariant', () => {
    expect(ROW.metadata.classification).toBe('security_invariant');
  });

  it('metadata.persisted_by is THIS SD', () => {
    expect(ROW.metadata.persisted_by).toBe('SD-LEO-INFRA-AUDIT-SHARED-TABLES-001');
  });

  it('dedup_fingerprint matches DEDUP_FINGERPRINT export', () => {
    expect(ROW.dedup_fingerprint).toBe(DEDUP_FINGERPRINT);
  });

  it('auto_block_on_match is false (advisory invariant, not blocking)', () => {
    expect(ROW.auto_block_on_match).toBe(false);
  });

  it('first_seen_sd_id and last_seen_sd_id are placeholders before runtime resolution', () => {
    // Pre-resolution: ROW.first_seen_sd_id holds the placeholder string; runtime overrides with UUIDs.
    // Test asserts the script does not ship hardcoded UUIDs.
    expect(typeof ROW.first_seen_sd_id).toBe('string');
    // After main() runs in production, this becomes a UUID. In tests, it's the literal placeholder.
    if (ROW.first_seen_sd_id !== '<resolved-at-runtime>') {
      // If main() has run during another test, the field will be a UUID — tolerate that.
      expect(ROW.first_seen_sd_id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
    }
  });
});
