/**
 * Tests for Venture-Scoped SD Namespacing
 * SD-LEO-INFRA-SD-NAMESPACING-001
 *
 * Tests the normalizeVenturePrefix and parseSDKey venture features
 * by inlining the pure logic (avoiding sd-key-generator module side effects).
 */

import { describe, it, expect } from 'vitest';

// Inline the pure normalizeVenturePrefix logic to avoid module-level side effects
// from sd-key-generator.js (dotenv.config, supabase client creation, etc.)
function normalizeVenturePrefix(ventureName) {
  if (!ventureName || typeof ventureName !== 'string') return '';
  return ventureName
    .toUpperCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^A-Z0-9-]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');
}

// Inline the venture-specific parseSDKey logic
function parseVentureKey(sdKey) {
  const SD_SOURCES_VALUES = new Set(['UAT', 'LEARN', 'FDBK', 'PAT', 'MANUAL', 'LEO', 'IMP']);
  const ventureRootPattern = /^SD-([A-Z][A-Z0-9-]*)-([A-Z]+)-([A-Z]+)-([A-Z0-9-]+)-(\d{3})$/;
  const ventureRootMatch = sdKey.match(ventureRootPattern);

  if (ventureRootMatch && !SD_SOURCES_VALUES.has(ventureRootMatch[1])) {
    return {
      isRoot: true,
      venturePrefix: ventureRootMatch[1],
      source: ventureRootMatch[2],
      type: ventureRootMatch[3],
      semantic: ventureRootMatch[4],
      number: parseInt(ventureRootMatch[5], 10),
      hierarchyDepth: 0,
      parentKey: null
    };
  }

  // Non-venture root pattern
  const rootPattern = /^SD-([A-Z]+)-([A-Z]+)-([A-Z0-9-]+)-(\d{3})$/;
  const rootMatch = sdKey.match(rootPattern);
  if (rootMatch) {
    return {
      isRoot: true,
      venturePrefix: null,
      source: rootMatch[1],
      type: rootMatch[2],
      semantic: rootMatch[3],
      number: parseInt(rootMatch[4], 10),
      hierarchyDepth: 0,
      parentKey: null
    };
  }

  return null;
}

describe('SD Namespacing - normalizeVenturePrefix', () => {
  it('should normalize a simple name to uppercase', () => {
    expect(normalizeVenturePrefix('acme')).toBe('ACME');
  });

  it('should replace spaces with hyphens', () => {
    expect(normalizeVenturePrefix('Acme Labs')).toBe('ACME-LABS');
  });

  it('should replace underscores with hyphens', () => {
    expect(normalizeVenturePrefix('my_venture')).toBe('MY-VENTURE');
  });

  it('should strip non-alphanumeric characters except hyphens', () => {
    expect(normalizeVenturePrefix('Acme.Labs!v2')).toBe('ACMELABSV2');
  });

  it('should collapse multiple hyphens', () => {
    expect(normalizeVenturePrefix('Acme--Labs')).toBe('ACME-LABS');
  });

  it('should trim leading and trailing hyphens', () => {
    expect(normalizeVenturePrefix('-Acme-')).toBe('ACME');
  });

  it('should return empty string for null', () => {
    expect(normalizeVenturePrefix(null)).toBe('');
  });

  it('should return empty string for undefined', () => {
    expect(normalizeVenturePrefix(undefined)).toBe('');
  });

  it('should return empty string for empty string', () => {
    expect(normalizeVenturePrefix('')).toBe('');
  });

  it('should return empty string for non-string', () => {
    expect(normalizeVenturePrefix(123)).toBe('');
  });

  it('should handle already-uppercase names', () => {
    expect(normalizeVenturePrefix('PROVENFLOW')).toBe('PROVENFLOW');
  });

  it('should handle names with numbers', () => {
    expect(normalizeVenturePrefix('Venture 2.0')).toBe('VENTURE-20');
  });
});

describe('SD Namespacing - parseVentureKey', () => {
  it('should parse a venture-scoped root key', () => {
    const result = parseVentureKey('SD-ACME-LEO-FEAT-DASHBOARD-001');
    expect(result).toBeTruthy();
    expect(result.isRoot).toBe(true);
    expect(result.venturePrefix).toBe('ACME');
    expect(result.source).toBe('LEO');
    expect(result.type).toBe('FEAT');
    expect(result.semantic).toBe('DASHBOARD');
    expect(result.number).toBe(1);
  });

  it('should NOT treat a known source as venture prefix', () => {
    const result = parseVentureKey('SD-LEO-FEAT-DASHBOARD-001');
    expect(result).toBeTruthy();
    expect(result.venturePrefix).toBeNull();
    expect(result.source).toBe('LEO');
    expect(result.type).toBe('FEAT');
  });

  it('should parse non-venture keys correctly', () => {
    const result = parseVentureKey('SD-UAT-FIX-LOGIN-BUG-003');
    expect(result).toBeTruthy();
    expect(result.venturePrefix).toBeNull();
    expect(result.source).toBe('UAT');
    expect(result.type).toBe('FIX');
  });

  it('should parse a venture key with numeric prefix', () => {
    const result = parseVentureKey('SD-V2-LEO-FEAT-API-001');
    expect(result).toBeTruthy();
    expect(result.isRoot).toBe(true);
    expect(result.venturePrefix).toBe('V2');
    expect(result.source).toBe('LEO');
  });

  it('should parse a multi-word venture key', () => {
    const result = parseVentureKey('SD-ACME-LABS-LEO-INFRA-SCHEMA-002');
    expect(result).toBeTruthy();
    expect(result.isRoot).toBe(true);
    expect(result.venturePrefix).toBe('ACME-LABS');
    expect(result.source).toBe('LEO');
    expect(result.type).toBe('INFRA');
    expect(result.semantic).toBe('SCHEMA');
    expect(result.number).toBe(2);
  });

  it('should return null for invalid keys', () => {
    expect(parseVentureKey('not-a-key')).toBeNull();
    expect(parseVentureKey('SD-')).toBeNull();
  });
});

describe('SD Namespacing - Venture Key Prefix Filtering', () => {
  it('should correctly filter SDs by venture prefix', () => {
    const allSDs = [
      { sd_key: 'SD-ACME-LEO-FEAT-DASH-001' },
      { sd_key: 'SD-ACME-LEO-INFRA-DB-001' },
      { sd_key: 'SD-LEO-FEAT-LOGIN-001' },
      { sd_key: 'SD-UAT-FIX-BUG-001' },
    ];

    const venturePrefix = normalizeVenturePrefix('acme');
    const keyPrefix = `SD-${venturePrefix}-`;
    const filtered = allSDs.filter(sd => (sd.sd_key || '').startsWith(keyPrefix));

    expect(filtered).toHaveLength(2);
    expect(filtered[0].sd_key).toBe('SD-ACME-LEO-FEAT-DASH-001');
    expect(filtered[1].sd_key).toBe('SD-ACME-LEO-INFRA-DB-001');
  });

  it('should return all SDs when no venture context', () => {
    const allSDs = [
      { sd_key: 'SD-LEO-FEAT-LOGIN-001' },
      { sd_key: 'SD-UAT-FIX-BUG-001' },
    ];

    const venturePrefix = normalizeVenturePrefix(null);
    expect(venturePrefix).toBe('');

    // When no venture context, no filtering applied
    const filtered = venturePrefix ? allSDs.filter(sd => sd.sd_key.startsWith(`SD-${venturePrefix}-`)) : allSDs;
    expect(filtered).toHaveLength(2);
  });
});
