/**
 * Design Reference Security Utilities — Unit Tests
 * SD: SD-DYNAMIC-ARCHETYPEMATCHED-DESIGN-REFERENCE-ORCH-001-A
 *
 * Tests sanitization and seed salting for the design reference engine.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sanitizeDesignReference } from '../../lib/eva/utils/sanitize-design-reference.js';
import { generateDesignRefSeed } from '../../lib/eva/utils/design-ref-seed.js';

// ---------------------------------------------------------------------------
// sanitizeDesignReference
// ---------------------------------------------------------------------------

describe('sanitizeDesignReference', () => {
  it('returns empty string for null/undefined/empty input', () => {
    expect(sanitizeDesignReference(null)).toBe('');
    expect(sanitizeDesignReference(undefined)).toBe('');
    expect(sanitizeDesignReference('')).toBe('');
  });

  it('passes through clean text unchanged', () => {
    const text = 'A minimal SaaS dashboard with neutral tones';
    expect(sanitizeDesignReference(text)).toBe(text);
  });

  it('strips HTML tags', () => {
    const input = '<p>Bold <strong>typography</strong> with <em>serif</em> fonts</p>';
    expect(sanitizeDesignReference(input)).toBe('Bold typography with serif fonts');
  });

  it('removes script tags and content', () => {
    const input = 'Safe text<script>alert("xss")</script> more text';
    expect(sanitizeDesignReference(input)).toBe('Safe text more text');
  });

  it('removes event handlers', () => {
    const input = '<div onclick="alert(1)">Content</div>';
    const result = sanitizeDesignReference(input);
    expect(result).not.toContain('onclick');
    expect(result).not.toContain('alert');
    expect(result).toContain('Content');
  });

  it('neutralises SQL injection patterns', () => {
    const input = "Design style'; DROP TABLE design_reference_library;--";
    const result = sanitizeDesignReference(input);
    expect(result).not.toContain('DROP TABLE');
  });

  it('strips control characters', () => {
    const input = 'Clean\x00text\x07with\x1Fcontrol';
    expect(sanitizeDesignReference(input)).toBe('Cleantextwithcontrol');
  });

  it('collapses whitespace', () => {
    const input = 'Multiple   spaces   and\n\nnewlines';
    expect(sanitizeDesignReference(input)).toBe('Multiple spaces and newlines');
  });

  it('preserves design terminology', () => {
    const terms = 'Hero section with parallax scrolling, glassmorphism cards, gradient overlays, and monospace typography';
    expect(sanitizeDesignReference(terms)).toBe(terms);
  });

  it('truncates to maxLen', () => {
    const long = 'A'.repeat(3000);
    expect(sanitizeDesignReference(long, 100).length).toBe(100);
  });

  it('handles complex nested HTML', () => {
    const input = '<div class="hero"><h1 style="color:red">Title</h1><p>Desc</p></div>';
    expect(sanitizeDesignReference(input)).toBe('TitleDesc');
  });
});

// ---------------------------------------------------------------------------
// generateDesignRefSeed
// ---------------------------------------------------------------------------

describe('generateDesignRefSeed', () => {
  const savedEnv = process.env.DESIGN_REF_SALT;

  beforeEach(() => {
    delete process.env.DESIGN_REF_SALT;
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    if (savedEnv !== undefined) {
      process.env.DESIGN_REF_SALT = savedEnv;
    } else {
      delete process.env.DESIGN_REF_SALT;
    }
    vi.restoreAllMocks();
  });

  it('throws when UUID is missing', () => {
    expect(() => generateDesignRefSeed(null)).toThrow('UUID is required');
    expect(() => generateDesignRefSeed('')).toThrow('UUID is required');
  });

  it('produces deterministic output for same input', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    const salt = 'test-salt';
    const seed1 = generateDesignRefSeed(uuid, salt);
    const seed2 = generateDesignRefSeed(uuid, salt);
    expect(seed1).toBe(seed2);
  });

  it('produces different output for different UUIDs', () => {
    const salt = 'test-salt';
    const seed1 = generateDesignRefSeed('550e8400-e29b-41d4-a716-446655440000', salt);
    const seed2 = generateDesignRefSeed('660e8400-e29b-41d4-a716-446655440000', salt);
    expect(seed1).not.toBe(seed2);
  });

  it('produces different output for different salts', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    const seed1 = generateDesignRefSeed(uuid, 'salt-a');
    const seed2 = generateDesignRefSeed(uuid, 'salt-b');
    expect(seed1).not.toBe(seed2);
  });

  it('returns a valid 32-bit unsigned integer', () => {
    const seed = generateDesignRefSeed('550e8400-e29b-41d4-a716-446655440000', 'test');
    expect(Number.isInteger(seed)).toBe(true);
    expect(seed).toBeGreaterThanOrEqual(0);
    expect(seed).toBeLessThanOrEqual(0xFFFFFFFF);
  });

  it('uses DESIGN_REF_SALT env var when no salt argument provided', () => {
    process.env.DESIGN_REF_SALT = 'env-salt';
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    const seedFromEnv = generateDesignRefSeed(uuid);
    const seedFromArg = generateDesignRefSeed(uuid, 'env-salt');
    expect(seedFromEnv).toBe(seedFromArg);
  });

  it('warns and uses default salt when env var missing', () => {
    const seed = generateDesignRefSeed('550e8400-e29b-41d4-a716-446655440000');
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('DESIGN_REF_SALT not set')
    );
    expect(Number.isInteger(seed)).toBe(true);
  });
});
