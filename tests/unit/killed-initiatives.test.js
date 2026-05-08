import { describe, it, expect } from 'vitest';
import {
  KILLED_PATTERNS,
  isKilledVentureId,
  isKilledVentureName,
  isKilledSDKey,
} from '../../scripts/lib/killed-initiatives.cjs';

const PP_VENTURE_UUID = '08d20036-03c9-4a26-bbc5-f37a18dfdf23';

describe('killed-initiatives — KILLED_PATTERNS shape', () => {
  it('exposes the 4 expected sub-arrays/objects', () => {
    expect(Array.isArray(KILLED_PATTERNS.name_patterns)).toBe(true);
    expect(Array.isArray(KILLED_PATTERNS.sd_key_prefixes)).toBe(true);
    expect(Array.isArray(KILLED_PATTERNS.venture_uuids)).toBe(true);
    expect(Array.isArray(KILLED_PATTERNS.entries)).toBe(true);
  });

  it('contains PrivacyPatrol + CommitCraft display-name patterns', () => {
    expect(KILLED_PATTERNS.name_patterns).toContain('PrivacyPatrol');
    expect(KILLED_PATTERNS.name_patterns).toContain('CommitCraft');
  });

  it('contains the canonical SD-key prefixes', () => {
    expect(KILLED_PATTERNS.sd_key_prefixes).toContain('SD-PRIVACYPATROL-');
    expect(KILLED_PATTERNS.sd_key_prefixes).toContain('SD-COMMITCRAFT-');
  });

  it('contains the PrivacyPatrol AI venture UUID', () => {
    expect(KILLED_PATTERNS.venture_uuids).toContain(PP_VENTURE_UUID);
  });

  it('does NOT contain a CommitCraft UUID (no row exists in ventures or eva_ventures)', () => {
    // Database-agent evidence 459c01f2 confirmed CommitCraft has zero rows in
    // ventures or eva_ventures. The constants module must reflect that fact.
    const ccEntry = KILLED_PATTERNS.entries.find((e) => e.name === 'CommitCraft AI');
    expect(ccEntry).toBeDefined();
    expect(ccEntry.venture_uuid).toBeNull();
  });

  it('every entry has the required fields', () => {
    for (const e of KILLED_PATTERNS.entries) {
      expect(typeof e.name).toBe('string');
      expect(Array.isArray(e.display_name_patterns)).toBe(true);
      expect(typeof e.sd_key_prefix).toBe('string');
      // venture_uuid may be null (CommitCraft case) — no type assertion
      expect(typeof e.notes).toBe('string');
    }
  });
});

describe('killed-initiatives — isKilledVentureId', () => {
  it('returns true for the canonical PP venture UUID', () => {
    expect(isKilledVentureId(PP_VENTURE_UUID)).toBe(true);
  });

  it('returns false for an unknown UUID', () => {
    expect(isKilledVentureId('00000000-0000-0000-0000-000000000000')).toBe(false);
  });

  it('returns false for null', () => {
    expect(isKilledVentureId(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isKilledVentureId(undefined)).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isKilledVentureId('')).toBe(false);
  });

  it('returns false for non-string types', () => {
    expect(isKilledVentureId(123)).toBe(false);
    expect(isKilledVentureId({})).toBe(false);
    expect(isKilledVentureId([])).toBe(false);
  });
});

describe('killed-initiatives — isKilledVentureName', () => {
  it('matches case-insensitively on PrivacyPatrol and CommitCraft', () => {
    expect(isKilledVentureName('PrivacyPatrol AI')).toBe(true);
    expect(isKilledVentureName('privacypatrol ai')).toBe(true);
    expect(isKilledVentureName('CommitCraft AI')).toBe(true);
    expect(isKilledVentureName('commitcraft AI')).toBe(true);
  });

  it('matches when pattern appears as substring of larger text', () => {
    expect(isKilledVentureName('xyz CommitCraft xyz')).toBe(true);
    expect(isKilledVentureName('about PrivacyPatrol cleanup')).toBe(true);
  });

  it('returns false for non-matching names', () => {
    expect(isKilledVentureName('Stage17 cross-repo audit')).toBe(false);
    expect(isKilledVentureName('PrivPatr')).toBe(false); // partial doesn't match
  });

  it('returns false for null/undefined/empty', () => {
    expect(isKilledVentureName(null)).toBe(false);
    expect(isKilledVentureName(undefined)).toBe(false);
    expect(isKilledVentureName('')).toBe(false);
  });
});

describe('killed-initiatives — isKilledSDKey', () => {
  it('returns true for SD keys with known prefixes', () => {
    expect(isKilledSDKey('SD-PRIVACYPATROL-AI-LANDING-A1')).toBe(true);
    expect(isKilledSDKey('SD-COMMITCRAFT-V1-001')).toBe(true);
  });

  it('returns false for SD keys without known prefixes', () => {
    expect(isKilledSDKey('SD-LEO-INFRA-AUDIT-SHARED-TABLES-001')).toBe(false);
    expect(isKilledSDKey('SD-FEAT-001')).toBe(false);
  });

  it('returns false for null/undefined/empty', () => {
    expect(isKilledSDKey(null)).toBe(false);
    expect(isKilledSDKey(undefined)).toBe(false);
    expect(isKilledSDKey('')).toBe(false);
  });

  it('returns false for substring matches (must be prefix)', () => {
    expect(isKilledSDKey('SD-FEAT-PRIVACYPATROL-001')).toBe(false);
  });
});
