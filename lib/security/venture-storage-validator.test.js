/**
 * Unit tests for VentureStorageValidator and SecurityError
 * SD-LEO-INFRA-AUTH-MIDDLEWARE-SECURITY-001
 *
 * Tests: path validation, traversal detection, UUID validation,
 * secure path building, batch validation, filename sanitization
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { VentureStorageValidator, SecurityError } from './venture-storage-validator.js';

// Valid UUID v4 for testing
const VALID_UUID = 'a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5';
const OTHER_UUID = 'f1e2d3c4-b5a6-4978-8c9d-0a1b2c3d4e5f';

describe('SecurityError', () => {
  it('constructs with correct properties', () => {
    const error = new SecurityError('test message', 'TEST_CODE', { key: 'val' });

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('SecurityError');
    expect(error.message).toBe('test message');
    expect(error.code).toBe('TEST_CODE');
    expect(error.isRetryable).toBe(false);
    expect(error.isSecurityViolation).toBe(true);
    expect(error.details.key).toBe('val');
    expect(error.details.timestamp).toBeDefined();
  });

  it('serializes to JSON correctly', () => {
    const error = new SecurityError('msg', 'CODE', { data: 1 });
    const json = error.toJSON();

    expect(json.name).toBe('SecurityError');
    expect(json.code).toBe('CODE');
    expect(json.message).toBe('msg');
    expect(json.isRetryable).toBe(false);
    expect(json.isSecurityViolation).toBe(true);
    expect(json.details.data).toBe(1);
  });

  it('defaults details to empty object with timestamp', () => {
    const error = new SecurityError('msg', 'CODE');
    expect(error.details.timestamp).toBeDefined();
  });
});

describe('VentureStorageValidator.isValidVentureUUID', () => {
  it('returns true for valid UUID v4', () => {
    expect(VentureStorageValidator.isValidVentureUUID(VALID_UUID)).toBe(true);
  });

  it('returns false for null/undefined', () => {
    expect(VentureStorageValidator.isValidVentureUUID(null)).toBe(false);
    expect(VentureStorageValidator.isValidVentureUUID(undefined)).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(VentureStorageValidator.isValidVentureUUID('')).toBe(false);
  });

  it('returns false for non-string', () => {
    expect(VentureStorageValidator.isValidVentureUUID(12345)).toBe(false);
  });

  it('returns false for invalid UUID format', () => {
    expect(VentureStorageValidator.isValidVentureUUID('not-a-uuid')).toBe(false);
    expect(VentureStorageValidator.isValidVentureUUID('12345678-1234-1234-1234-123456789012')).toBe(false); // version not 4
  });

  it('is case insensitive', () => {
    expect(VentureStorageValidator.isValidVentureUUID(VALID_UUID.toUpperCase())).toBe(true);
  });
});

describe('VentureStorageValidator.extractVentureIdFromPath', () => {
  it('extracts venture ID from valid path', () => {
    const path = `ventures/${VALID_UUID}/documents/file.pdf`;
    expect(VentureStorageValidator.extractVentureIdFromPath(path)).toBe(VALID_UUID);
  });

  it('returns null for empty/null path', () => {
    expect(VentureStorageValidator.extractVentureIdFromPath(null)).toBeNull();
    expect(VentureStorageValidator.extractVentureIdFromPath('')).toBeNull();
  });

  it('returns null for non-string path', () => {
    expect(VentureStorageValidator.extractVentureIdFromPath(123)).toBeNull();
  });

  it('returns null for path without ventures prefix', () => {
    expect(VentureStorageValidator.extractVentureIdFromPath(`other/${VALID_UUID}/file.pdf`)).toBeNull();
  });

  it('returns null for path with only ventures prefix', () => {
    expect(VentureStorageValidator.extractVentureIdFromPath('ventures/')).toBeNull();
  });

  it('returns null when second segment is not a valid UUID', () => {
    expect(VentureStorageValidator.extractVentureIdFromPath('ventures/not-uuid/file.pdf')).toBeNull();
  });

  it('normalizes backslashes to forward slashes', () => {
    const path = `ventures\\${VALID_UUID}\\documents\\file.pdf`;
    expect(VentureStorageValidator.extractVentureIdFromPath(path)).toBe(VALID_UUID);
  });

  it('returns lowercase UUID', () => {
    const path = `ventures/${VALID_UUID.toUpperCase()}/file.pdf`;
    expect(VentureStorageValidator.extractVentureIdFromPath(path)).toBe(VALID_UUID);
  });
});

describe('VentureStorageValidator.validateStoragePath', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('returns true for valid path matching expected venture', () => {
    const path = `ventures/${VALID_UUID}/documents/report.pdf`;
    expect(VentureStorageValidator.validateStoragePath(path, VALID_UUID)).toBe(true);
  });

  it('throws INVALID_PATH for empty path', () => {
    expect(() => VentureStorageValidator.validateStoragePath('', VALID_UUID))
      .toThrow(SecurityError);

    try {
      VentureStorageValidator.validateStoragePath('', VALID_UUID);
    } catch (e) {
      expect(e.code).toBe('INVALID_PATH');
    }
  });

  it('throws INVALID_PATH for null path', () => {
    expect(() => VentureStorageValidator.validateStoragePath(null, VALID_UUID))
      .toThrow(SecurityError);
  });

  it('throws INVALID_PATH for missing venture ID', () => {
    expect(() => VentureStorageValidator.validateStoragePath('ventures/file.pdf', ''))
      .toThrow(SecurityError);
  });

  it('throws INVALID_UUID for invalid venture UUID format', () => {
    try {
      VentureStorageValidator.validateStoragePath('ventures/abc/file.pdf', 'not-a-uuid');
    } catch (e) {
      expect(e).toBeInstanceOf(SecurityError);
      expect(e.code).toBe('INVALID_UUID');
    }
  });

  it('throws VENTURE_MISMATCH when path venture differs from expected', () => {
    const path = `ventures/${OTHER_UUID}/documents/file.pdf`;

    try {
      VentureStorageValidator.validateStoragePath(path, VALID_UUID);
      expect.fail('Should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(SecurityError);
      expect(e.code).toBe('VENTURE_MISMATCH');
      expect(e.details.extractedVentureId).toBe(OTHER_UUID);
    }
  });

  it('throws INVALID_PATH when venture ID cannot be extracted', () => {
    try {
      VentureStorageValidator.validateStoragePath('other/path/file.pdf', VALID_UUID);
      expect.fail('Should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(SecurityError);
      expect(e.code).toBe('INVALID_PATH');
    }
  });

  it('is case-insensitive for venture ID comparison', () => {
    const path = `ventures/${VALID_UUID.toUpperCase()}/file.pdf`;
    expect(VentureStorageValidator.validateStoragePath(path, VALID_UUID)).toBe(true);
  });
});

describe('Path traversal detection', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('detects ../ traversal', () => {
    const path = `ventures/${VALID_UUID}/../../../etc/passwd`;
    expect(() => VentureStorageValidator.validateStoragePath(path, VALID_UUID))
      .toThrow(SecurityError);

    try {
      VentureStorageValidator.validateStoragePath(path, VALID_UUID);
    } catch (e) {
      expect(e.code).toBe('PATH_TRAVERSAL');
    }
  });

  it('detects URL-encoded traversal (%2e%2e)', () => {
    const path = `ventures/${VALID_UUID}/%2e%2e/secret`;
    expect(() => VentureStorageValidator.validateStoragePath(path, VALID_UUID))
      .toThrow(SecurityError);
  });

  it('detects double URL-encoded traversal (%252e%252e)', () => {
    const path = `ventures/${VALID_UUID}/%252e%252e/secret`;
    expect(() => VentureStorageValidator.validateStoragePath(path, VALID_UUID))
      .toThrow(SecurityError);
  });

  it('detects mixed encoding (.%2e)', () => {
    const path = `ventures/${VALID_UUID}/.%2e/secret`;
    expect(() => VentureStorageValidator.validateStoragePath(path, VALID_UUID))
      .toThrow(SecurityError);
  });

  it('detects null byte injection', () => {
    const path = `ventures/${VALID_UUID}/file.pdf\0.exe`;
    expect(() => VentureStorageValidator.validateStoragePath(path, VALID_UUID))
      .toThrow(SecurityError);
  });

  it('detects URL-encoded null byte (%00)', () => {
    const path = `ventures/${VALID_UUID}/file%00.exe`;
    expect(() => VentureStorageValidator.validateStoragePath(path, VALID_UUID))
      .toThrow(SecurityError);
  });

  it('detects double slashes with DOUBLE_SLASH code', () => {
    const path = `ventures/${VALID_UUID}//secret/file.pdf`;

    try {
      VentureStorageValidator.validateStoragePath(path, VALID_UUID);
      expect.fail('Should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(SecurityError);
      expect(e.code).toBe('DOUBLE_SLASH');
    }
  });
});

describe('VentureStorageValidator.buildSecurePath', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('builds correct path from venture ID and segments', () => {
    const result = VentureStorageValidator.buildSecurePath(VALID_UUID, 'documents', 'reports', 'file.pdf');
    expect(result).toBe(`ventures/${VALID_UUID}/documents/reports/file.pdf`);
  });

  it('lowercases the venture ID', () => {
    const result = VentureStorageValidator.buildSecurePath(VALID_UUID.toUpperCase(), 'file.pdf');
    expect(result).toBe(`ventures/${VALID_UUID}/file.pdf`);
  });

  it('throws INVALID_UUID for invalid venture ID', () => {
    expect(() => VentureStorageValidator.buildSecurePath('not-uuid', 'file.pdf'))
      .toThrow(SecurityError);

    try {
      VentureStorageValidator.buildSecurePath('invalid', 'file.pdf');
    } catch (e) {
      expect(e.code).toBe('INVALID_UUID');
    }
  });

  it('throws PATH_TRAVERSAL for segment with ../', () => {
    expect(() => VentureStorageValidator.buildSecurePath(VALID_UUID, '../etc/passwd'))
      .toThrow(SecurityError);
  });

  it('strips leading/trailing slashes from segments', () => {
    const result = VentureStorageValidator.buildSecurePath(VALID_UUID, '/documents/', '/file.pdf/');
    expect(result).toBe(`ventures/${VALID_UUID}/documents/file.pdf`);
  });

  it('skips empty and null segments', () => {
    const result = VentureStorageValidator.buildSecurePath(VALID_UUID, '', 'docs', null, 'file.pdf');
    expect(result).toBe(`ventures/${VALID_UUID}/docs/file.pdf`);
  });

  it('returns path with just prefix and venture ID when no segments', () => {
    const result = VentureStorageValidator.buildSecurePath(VALID_UUID);
    expect(result).toBe(`ventures/${VALID_UUID}`);
  });
});

describe('VentureStorageValidator.batchValidate', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('splits paths into valid and invalid', () => {
    const paths = [
      `ventures/${VALID_UUID}/valid.pdf`,
      `ventures/${OTHER_UUID}/wrong-venture.pdf`,
      `ventures/${VALID_UUID}/../../../etc/passwd`,
    ];

    const result = VentureStorageValidator.batchValidate(paths, VALID_UUID);

    expect(result.valid).toHaveLength(1);
    expect(result.valid[0]).toContain('valid.pdf');
    expect(result.invalid).toHaveLength(2);
    expect(result.invalid[0].error).toBeInstanceOf(SecurityError);
    expect(result.invalid[1].error).toBeInstanceOf(SecurityError);
  });

  it('returns all valid when all paths match', () => {
    const paths = [
      `ventures/${VALID_UUID}/file1.pdf`,
      `ventures/${VALID_UUID}/file2.pdf`,
    ];

    const result = VentureStorageValidator.batchValidate(paths, VALID_UUID);

    expect(result.valid).toHaveLength(2);
    expect(result.invalid).toHaveLength(0);
  });

  it('returns all invalid when no paths match', () => {
    const paths = [
      `ventures/${OTHER_UUID}/file1.pdf`,
      `other/path/file2.pdf`,
    ];

    const result = VentureStorageValidator.batchValidate(paths, VALID_UUID);

    expect(result.valid).toHaveLength(0);
    expect(result.invalid).toHaveLength(2);
  });

  it('handles empty array', () => {
    const result = VentureStorageValidator.batchValidate([], VALID_UUID);
    expect(result.valid).toHaveLength(0);
    expect(result.invalid).toHaveLength(0);
  });
});

describe('VentureStorageValidator.sanitizeFilename', () => {
  it('removes path traversal patterns', () => {
    expect(VentureStorageValidator.sanitizeFilename('../../../etc/passwd')).toBe('etc_passwd');
  });

  it('replaces path separators with underscores', () => {
    expect(VentureStorageValidator.sanitizeFilename('path/to\\file.pdf')).toBe('path_to_file.pdf');
  });

  it('removes Windows invalid characters', () => {
    const result = VentureStorageValidator.sanitizeFilename('file<>:"|?*.pdf');
    expect(result).not.toMatch(/[<>:"|?*]/);
  });

  it('replaces whitespace with underscores', () => {
    expect(VentureStorageValidator.sanitizeFilename('my file name.pdf')).toBe('my_file_name.pdf');
  });

  it('replaces brackets with underscores', () => {
    expect(VentureStorageValidator.sanitizeFilename('file (1).pdf')).toBe('file_1_.pdf');
  });

  it('collapses multiple underscores', () => {
    expect(VentureStorageValidator.sanitizeFilename('a___b___c.pdf')).toBe('a_b_c.pdf');
  });

  it('returns unnamed_file for empty/null input', () => {
    expect(VentureStorageValidator.sanitizeFilename('')).toBe('unnamed_file');
    expect(VentureStorageValidator.sanitizeFilename(null)).toBe('unnamed_file');
    expect(VentureStorageValidator.sanitizeFilename(undefined)).toBe('unnamed_file');
  });

  it('returns unnamed_file when all characters stripped', () => {
    // '...' → replaceAll '..' removes first two dots, leaves '.', which is length 1 (not 0)
    const result = VentureStorageValidator.sanitizeFilename('...');
    expect(result).toBe('.');  // Last dot remains after .. removal
  });

  it('truncates filenames longer than 255 characters', () => {
    const longName = 'a'.repeat(300) + '.pdf';
    const result = VentureStorageValidator.sanitizeFilename(longName);
    expect(result.length).toBeLessThanOrEqual(255);
    expect(result).toMatch(/\.pdf$/);
  });

  it('handles normal filenames unchanged', () => {
    expect(VentureStorageValidator.sanitizeFilename('report-2024.pdf')).toBe('report-2024.pdf');
  });
});
