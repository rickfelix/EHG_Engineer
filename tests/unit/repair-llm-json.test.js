/**
 * Repair LLM JSON — Unit Tests
 * SD: SD-MAN-FIX-PIPELINE-HEALTH-GAPS-ORCH-001-B
 */

import { describe, it, expect } from 'vitest';
import { repairLLMJson } from '../../lib/utils/repair-llm-json.js';

describe('repairLLMJson', () => {
  it('returns null for null/undefined input', () => {
    expect(repairLLMJson(null).parsed).toBeNull();
    expect(repairLLMJson(undefined).parsed).toBeNull();
    expect(repairLLMJson('').parsed).toBeNull();
  });

  it('parses valid JSON without repair', () => {
    const result = repairLLMJson('{"key": "value"}');
    expect(result.parsed).toEqual({ key: 'value' });
    expect(result.repaired).toBe(false);
  });

  it('strips markdown code fences', () => {
    const input = '```json\n{"revenue": 1000}\n```';
    const result = repairLLMJson(input);
    expect(result.parsed).toEqual({ revenue: 1000 });
    expect(result.repaired).toBe(false); // Stripping fences then parse succeeds
  });

  it('strips code fences without json label', () => {
    const input = '```\n{"data": true}\n```';
    const result = repairLLMJson(input);
    expect(result.parsed).toEqual({ data: true });
  });

  it('fixes trailing comma in object', () => {
    const input = '{"a": 1, "b": 2,}';
    const result = repairLLMJson(input);
    expect(result.parsed).toEqual({ a: 1, b: 2 });
    expect(result.repaired).toBe(true);
  });

  it('fixes trailing comma in array', () => {
    const input = '[1, 2, 3,]';
    const result = repairLLMJson(input);
    expect(result.parsed).toEqual([1, 2, 3]);
    expect(result.repaired).toBe(true);
  });

  it('fixes missing closing brace', () => {
    const input = '{"revenue": {"year1": 5000}';
    const result = repairLLMJson(input);
    expect(result.parsed).toEqual({ revenue: { year1: 5000 } });
    expect(result.repaired).toBe(true);
  });

  it('fixes missing closing bracket', () => {
    const input = '{"items": [1, 2, 3]';
    const result = repairLLMJson(input);
    expect(result.parsed).toEqual({ items: [1, 2, 3] });
    expect(result.repaired).toBe(true);
  });

  it('handles combined issues (fence + trailing comma)', () => {
    const input = '```json\n{"cost": 500, "timeline": "6mo",}\n```';
    const result = repairLLMJson(input);
    expect(result.parsed).toEqual({ cost: 500, timeline: '6mo' });
    expect(result.repaired).toBe(true);
  });

  it('returns error for completely unparseable input', () => {
    const result = repairLLMJson('This is not JSON at all');
    expect(result.parsed).toBeNull();
    expect(result.error).toBeTruthy();
  });

  it('handles deeply nested JSON', () => {
    const input = '{"forecast": {"revenue": {"y1": 1000, "y2": 5000}, "costs": {"y1": 800}}}';
    const result = repairLLMJson(input);
    expect(result.parsed.forecast.revenue.y2).toBe(5000);
    expect(result.repaired).toBe(false);
  });
});
