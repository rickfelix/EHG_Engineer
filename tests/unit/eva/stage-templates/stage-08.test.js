import { describe, it, expect } from 'vitest';
import TEMPLATE, { BMC_BLOCKS, MIN_ITEMS, DEFAULT_MIN_ITEMS } from '../../../../lib/eva/stage-templates/stage-08.js';

describe('stage-08 — Business Model Canvas', () => {
  it('has correct id, slug, title, version', () => {
    expect(TEMPLATE.id).toBe('stage-08');
    expect(TEMPLATE.slug).toBe('bmc');
    expect(TEMPLATE.title).toBe('Business Model Canvas');
    expect(TEMPLATE.version).toBe('2.0.0');
  });

  it('defaultData has blocks matching BMC_BLOCKS', () => {
    const d = TEMPLATE.defaultData;
    for (const block of BMC_BLOCKS) {
      expect(d).toHaveProperty(block);
      expect(Array.isArray(d[block].items)).toBe(true);
    }
  });

  it('validate() returns invalid when data is empty', () => {
    const result = TEMPLATE.validate({});
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('exports BMC_BLOCKS as a non-empty array', () => {
    expect(Array.isArray(BMC_BLOCKS)).toBe(true);
    expect(BMC_BLOCKS.length).toBeGreaterThan(0);
  });

  it('exports MIN_ITEMS as an object and DEFAULT_MIN_ITEMS as a number', () => {
    expect(typeof MIN_ITEMS).toBe('object');
    expect(typeof DEFAULT_MIN_ITEMS).toBe('number');
  });
});
