import { describe, it, expect } from 'vitest';
import { parseJsonResponse, hasRequiredKeys } from '../../../../lib/foresight/workflow/parse-json-response.js';

describe('parseJsonResponse', () => {
  it('parses a plain JSON object', () => {
    const result = parseJsonResponse('{"a": 1}');
    expect(result).toEqual({ ok: true, value: { a: 1 } });
  });

  it('strips a ```json fence before parsing', () => {
    const result = parseJsonResponse('```json\n{"a": 1}\n```');
    expect(result).toEqual({ ok: true, value: { a: 1 } });
  });

  it('strips a bare ``` fence (no json tag)', () => {
    const result = parseJsonResponse('```\n{"a": 1}\n```');
    expect(result).toEqual({ ok: true, value: { a: 1 } });
  });

  it('tolerates leading/trailing prose around the JSON object', () => {
    const result = parseJsonResponse('Here is the result:\n{"a": 1}\nLet me know if you need anything else.');
    expect(result).toEqual({ ok: true, value: { a: 1 } });
  });

  it('fails on an empty response', () => {
    expect(parseJsonResponse('')).toEqual({ ok: false, reason: 'empty_response' });
    expect(parseJsonResponse('   ')).toEqual({ ok: false, reason: 'empty_response' });
  });

  it('fails when no JSON object is found', () => {
    const result = parseJsonResponse('no braces here');
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('no_json_object_found');
  });

  it('fails on malformed JSON', () => {
    const result = parseJsonResponse('{"a": 1,}');
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/json_parse_error/);
  });

  it('fails when the parsed value is an array, not an object', () => {
    const result = parseJsonResponse('[1, 2, 3]');
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('no_json_object_found');
  });
});

describe('hasRequiredKeys', () => {
  it('returns true when all keys are present', () => {
    expect(hasRequiredKeys({ a: 1, b: 2 }, ['a', 'b'])).toBe(true);
  });

  it('returns false when a key is missing', () => {
    expect(hasRequiredKeys({ a: 1 }, ['a', 'b'])).toBe(false);
  });

  it('treats a key with value null as present (only undefined counts as missing)', () => {
    expect(hasRequiredKeys({ a: null }, ['a'])).toBe(true);
  });
});
