/**
 * UTM Parameter Tests
 * SD-EVA-FEAT-MARKETING-FOUNDATION-001
 */

import { describe, it, expect } from 'vitest';
import { generateUTMParams, buildUTMQueryString, appendUTMToUrl } from '../../../lib/marketing/utm.js';

describe('UTM Parameter Generation', () => {
  it('should generate basic UTM params', () => {
    const utm = generateUTMParams({
      source: 'x',
      medium: 'social',
      campaign: 'launch-2026'
    });

    expect(utm.utm_source).toBe('x');
    expect(utm.utm_medium).toBe('social');
    expect(utm.utm_campaign).toBe('launch-2026');
    expect(utm.utm_content).toBeUndefined();
  });

  it('should include optional content and term params', () => {
    const utm = generateUTMParams({
      source: 'bluesky',
      medium: 'social',
      campaign: 'test',
      content: 'variant_a',
      term: 'startup tools'
    });

    expect(utm.utm_content).toBe('variant_a');
    expect(utm.utm_term).toBe('startup-tools');
  });

  it('should sanitize params (lowercase, replace spaces)', () => {
    const utm = generateUTMParams({
      source: 'Blue Sky',
      medium: 'Social Media',
      campaign: 'My Campaign 2026'
    });

    expect(utm.utm_source).toBe('blue-sky');
    expect(utm.utm_medium).toBe('social-media');
    expect(utm.utm_campaign).toBe('my-campaign-2026');
  });

  it('should build query string', () => {
    const utm = generateUTMParams({ source: 'x', medium: 'social', campaign: 'test' });
    const qs = buildUTMQueryString(utm);

    expect(qs).toContain('utm_source=x');
    expect(qs).toContain('utm_medium=social');
    expect(qs).toContain('utm_campaign=test');
  });

  it('should append UTM to URL without existing params', () => {
    const utm = generateUTMParams({ source: 'x', medium: 'social', campaign: 'test' });
    const result = appendUTMToUrl('https://example.com', utm);

    expect(result).toMatch(/^https:\/\/example\.com\?utm_source=x/);
  });

  it('should append UTM to URL with existing params', () => {
    const utm = generateUTMParams({ source: 'x', medium: 'social', campaign: 'test' });
    const result = appendUTMToUrl('https://example.com?page=1', utm);

    expect(result).toMatch(/^https:\/\/example\.com\?page=1&utm_source=x/);
  });
});
