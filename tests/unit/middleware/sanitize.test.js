/**
 * Unit tests for XSS Input Sanitization Middleware
 * SD-MANUAL-INFRA-XSS-SANITIZE-001
 */

import { describe, it, expect, vi } from 'vitest';
import { sanitizeString, sanitizeValue, withSanitization } from '../../../lib/middleware/sanitize.ts';

describe('sanitizeString', () => {
  it('strips script tags and content', () => {
    expect(sanitizeString('<script>alert("XSS")</script>')).toBe('');
    expect(sanitizeString('Hello<script>alert(1)</script>World')).toBe('HelloWorld');
  });

  it('strips img onerror payloads', () => {
    const payload = '<img src=x onerror="alert(\'XSS\')">';
    expect(sanitizeString(payload)).not.toContain('onerror');
    expect(sanitizeString(payload)).not.toContain('<img');
  });

  it('strips SVG onload payloads', () => {
    const payload = '<svg onload="alert(1)">';
    expect(sanitizeString(payload)).not.toContain('onload');
    expect(sanitizeString(payload)).not.toContain('<svg');
  });

  it('strips iframe tags', () => {
    expect(sanitizeString('<iframe src="evil.com"></iframe>')).toBe('');
  });

  it('strips event handlers from any tag', () => {
    expect(sanitizeString('<div onclick="alert(1)">text</div>')).toBe('text');
    expect(sanitizeString('<a onmouseover="steal()">link</a>')).toBe('link');
  });

  it('strips javascript: URIs', () => {
    expect(sanitizeString('javascript:alert(1)')).toBe('alert(1)');
  });

  it('strips HTML-encoded XSS payloads', () => {
    const encoded = '&#60;script&#62;alert(1)&#60;/script&#62;';
    const result = sanitizeString(encoded);
    expect(result).not.toContain('<script');
  });

  it('strips hex-encoded XSS payloads', () => {
    const hexEncoded = '&#x3C;script&#x3E;alert(1)&#x3C;/script&#x3E;';
    const result = sanitizeString(hexEncoded);
    expect(result).not.toContain('<script');
  });

  it('preserves legitimate text content', () => {
    expect(sanitizeString('Hello World')).toBe('Hello World');
    expect(sanitizeString("Tom & Jerry's")).toBe("Tom & Jerry's");
    expect(sanitizeString('Price: $100')).toBe('Price: $100');
    expect(sanitizeString('Use "quotes" freely')).toBe('Use "quotes" freely');
  });

  it('preserves newlines and whitespace', () => {
    expect(sanitizeString('Line 1\nLine 2')).toBe('Line 1\nLine 2');
  });

  it('handles empty strings', () => {
    expect(sanitizeString('')).toBe('');
  });
});

describe('sanitizeValue', () => {
  it('sanitizes string values', () => {
    expect(sanitizeValue('<script>evil</script>')).toBe('');
  });

  it('passes through numbers', () => {
    expect(sanitizeValue(42)).toBe(42);
  });

  it('passes through booleans', () => {
    expect(sanitizeValue(true)).toBe(true);
  });

  it('passes through null', () => {
    expect(sanitizeValue(null)).toBe(null);
  });

  it('sanitizes nested objects recursively', () => {
    const input = {
      name: '<script>alert(1)</script>Real Name',
      count: 5,
      nested: {
        description: '<img onerror="alert(1)">Description'
      }
    };
    const result = sanitizeValue(input);
    expect(result.name).toBe('Real Name');
    expect(result.count).toBe(5);
    expect(result.nested.description).not.toContain('onerror');
  });

  it('sanitizes arrays of strings', () => {
    const input = ['<script>a</script>', 'safe', '<b>bold</b>'];
    const result = sanitizeValue(input);
    expect(result[0]).toBe('');
    expect(result[1]).toBe('safe');
    expect(result[2]).toBe('bold');
  });
});

describe('withSanitization', () => {
  it('sanitizes POST request bodies', async () => {
    const handler = vi.fn((req, res) => res.status(200).json({ ok: true }));
    const wrapped = withSanitization(handler);

    const req = {
      method: 'POST',
      body: { name: '<script>alert(1)</script>Test' }
    };
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };

    await wrapped(req, res);

    expect(handler).toHaveBeenCalled();
    expect(req.body.name).toBe('Test');
  });

  it('sanitizes PUT request bodies', async () => {
    const handler = vi.fn((req, res) => res.status(200).json({ ok: true }));
    const wrapped = withSanitization(handler);

    const req = {
      method: 'PUT',
      body: { justification: '<img src=x onerror="steal()">legit text' }
    };
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };

    await wrapped(req, res);

    expect(handler).toHaveBeenCalled();
    expect(req.body.justification).not.toContain('onerror');
  });

  it('does not modify GET request bodies', async () => {
    const handler = vi.fn((req, res) => res.status(200).json({ ok: true }));
    const wrapped = withSanitization(handler);

    const req = {
      method: 'GET',
      body: { query: '<script>test</script>' }
    };
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };

    await wrapped(req, res);

    expect(req.body.query).toBe('<script>test</script>');
  });

  it('handles requests with no body', async () => {
    const handler = vi.fn((req, res) => res.status(200).json({ ok: true }));
    const wrapped = withSanitization(handler);

    const req = { method: 'POST', body: null };
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };

    await wrapped(req, res);
    expect(handler).toHaveBeenCalled();
  });
});
