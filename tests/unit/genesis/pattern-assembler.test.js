/**
 * Tests for Pattern Assembler
 * SD-GENESIS-V31-MASON-P2
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  substituteSlots,
  checkUnresolvedSlots,
  createTemplate,
  extractSlots,
  validateSlotValues,
  SLOT_PREFIX,
  SLOT_SUFFIX,
} from '../../../lib/genesis/pattern-assembler.js';

describe('Pattern Assembler', () => {
  describe('substituteSlots', () => {
    it('should substitute single slot', () => {
      const template = 'Hello {{name}}!';
      const result = substituteSlots(template, { name: 'World' });
      expect(result).toBe('Hello World!');
    });

    it('should substitute multiple slots', () => {
      const template = '{{greeting}} {{name}}, welcome to {{place}}!';
      const result = substituteSlots(template, {
        greeting: 'Hello',
        name: 'Alice',
        place: 'Genesis',
      });
      expect(result).toBe('Hello Alice, welcome to Genesis!');
    });

    it('should substitute same slot multiple times', () => {
      const template = '{{name}} said: "My name is {{name}}"';
      const result = substituteSlots(template, { name: 'Bob' });
      expect(result).toBe('Bob said: "My name is Bob"');
    });

    it('should handle empty values', () => {
      const template = 'Value: {{value}}';
      const result = substituteSlots(template, { value: '' });
      expect(result).toBe('Value: ');
    });

    it('should handle numeric values', () => {
      const template = 'Count: {{count}}';
      const result = substituteSlots(template, { count: 42 });
      expect(result).toBe('Count: 42');
    });

    it('should not use regex (no special char issues)', () => {
      const template = '{{pattern}} matches {{regex}}';
      const result = substituteSlots(template, {
        pattern: '.*',
        regex: '[a-z]+',
      });
      expect(result).toBe('.* matches [a-z]+');
    });

    it('should preserve unmatched slots', () => {
      const template = 'Hello {{name}}, {{unknown}}!';
      const result = substituteSlots(template, { name: 'World' });
      expect(result).toBe('Hello World, {{unknown}}!');
    });
  });

  describe('checkUnresolvedSlots', () => {
    it('should find no unresolved slots in clean text', () => {
      const result = checkUnresolvedSlots('Hello World');
      expect(result.hasUnresolved).toBe(false);
      expect(result.slots).toEqual([]);
    });

    it('should find single unresolved slot', () => {
      const result = checkUnresolvedSlots('Hello {{name}}');
      expect(result.hasUnresolved).toBe(true);
      expect(result.slots).toEqual(['name']);
    });

    it('should find multiple unresolved slots', () => {
      const result = checkUnresolvedSlots('{{greeting}} {{name}}');
      expect(result.hasUnresolved).toBe(true);
      expect(result.slots).toContain('greeting');
      expect(result.slots).toContain('name');
    });

    it('should not duplicate slots', () => {
      const result = checkUnresolvedSlots('{{name}} and {{name}}');
      expect(result.slots).toEqual(['name']);
    });
  });

  describe('createTemplate', () => {
    it('should convert variables to slots', () => {
      const code = 'function COMPONENT_NAME() {}';
      const result = createTemplate(code, ['COMPONENT_NAME']);
      expect(result).toBe('function {{COMPONENT_NAME}}() {}');
    });

    it('should handle multiple variables', () => {
      const code = 'const NAME = TYPE;';
      const result = createTemplate(code, ['NAME', 'TYPE']);
      expect(result).toBe('const {{NAME}} = {{TYPE}};');
    });
  });

  describe('extractSlots', () => {
    it('should extract slot names', () => {
      const template = '{{a}} {{b}} {{c}}';
      const slots = extractSlots(template);
      expect(slots).toContain('a');
      expect(slots).toContain('b');
      expect(slots).toContain('c');
    });
  });

  describe('validateSlotValues', () => {
    it('should validate when all slots have values', () => {
      const template = '{{name}} {{age}}';
      const result = validateSlotValues(template, { name: 'Alice', age: 30 });
      expect(result.valid).toBe(true);
      expect(result.missing).toEqual([]);
    });

    it('should report missing slot values', () => {
      const template = '{{name}} {{age}} {{city}}';
      const result = validateSlotValues(template, { name: 'Alice' });
      expect(result.valid).toBe(false);
      expect(result.missing).toContain('age');
      expect(result.missing).toContain('city');
    });
  });

  describe('constants', () => {
    it('should use double curly braces', () => {
      expect(SLOT_PREFIX).toBe('{{');
      expect(SLOT_SUFFIX).toBe('}}');
    });
  });
});
