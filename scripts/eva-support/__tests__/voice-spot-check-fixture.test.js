import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { FLOWS } from '../_internal/system-prompt.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(__dirname, '../__fixtures__/voice-spot-check-tasks.json');

describe('voice-spot-check fixture', () => {
  let fixture;

  it('parses as JSON', () => {
    const raw = readFileSync(fixturePath, 'utf8');
    fixture = JSON.parse(raw);
    expect(fixture).toBeDefined();
  });

  it('contains exactly 5 tasks', () => {
    fixture ??= JSON.parse(readFileSync(fixturePath, 'utf8'));
    expect(fixture.tasks).toBeDefined();
    expect(Array.isArray(fixture.tasks)).toBe(true);
    expect(fixture.tasks.length).toBe(5);
  });

  it('every task has the required fields', () => {
    fixture ??= JSON.parse(readFileSync(fixturePath, 'utf8'));
    for (const t of fixture.tasks) {
      expect(typeof t.id).toBe('string');
      expect(typeof t.title).toBe('string');
      expect(typeof t.description).toBe('string');
      expect(FLOWS).toContain(t.expected_flow);
      expect(typeof t.expected_pushback_topic).toBe('string');
    }
  });

  it('expected_flow values cover at least 5 distinct flows', () => {
    fixture ??= JSON.parse(readFileSync(fixturePath, 'utf8'));
    const distinct = new Set(fixture.tasks.map((t) => t.expected_flow));
    expect(distinct.size).toBeGreaterThanOrEqual(5);
  });
});
