/**
 * Base Factory Unit Tests
 *
 * Part of Phase 1 Testing Infrastructure (B1.3)
 * Tests: 5 unit tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { BaseFactory, Sequence, DataGenerators } from '../../factories/base-factory.js';

describe('BaseFactory', () => {
  let factory;

  beforeEach(() => {
    factory = new BaseFactory();
  });

  it('should set and get attributes using fluent API', () => {
    const result = factory
      .set('name', 'Test')
      .set('value', 42);

    expect(result).toBe(factory); // Fluent API returns this
    expect(factory.get('name')).toBe('Test');
    expect(factory.get('value')).toBe(42);
  });

  it('should set multiple attributes at once', () => {
    factory.setAttributes({
      name: 'Test',
      value: 42,
      active: true,
    });

    expect(factory.get('name')).toBe('Test');
    expect(factory.get('value')).toBe(42);
    expect(factory.get('active')).toBe(true);
  });

  it('should generate unique IDs with prefix', () => {
    const id1 = factory.uniqueId('test');
    const id2 = factory.uniqueId('test');

    expect(id1).toMatch(/^test-\d+-[a-z0-9]+$/);
    expect(id2).toMatch(/^test-\d+-[a-z0-9]+$/);
    expect(id1).not.toBe(id2); // Should be unique
  });

  it('should generate random integers within range', () => {
    const results = [];
    for (let i = 0; i < 100; i++) {
      const num = factory.randomInt(1, 10);
      results.push(num);
      expect(num).toBeGreaterThanOrEqual(1);
      expect(num).toBeLessThanOrEqual(10);
    }

    // Should have variety (not all the same)
    const unique = new Set(results);
    expect(unique.size).toBeGreaterThan(1);
  });

  it('should clone factory with attributes', () => {
    factory.set('name', 'Original');
    factory.set('value', 100);

    const cloned = factory.clone();

    expect(cloned.get('name')).toBe('Original');
    expect(cloned.get('value')).toBe(100);
    expect(cloned).not.toBe(factory); // Different instance

    // Modifying clone shouldn't affect original
    cloned.set('name', 'Cloned');
    expect(factory.get('name')).toBe('Original');
    expect(cloned.get('name')).toBe('Cloned');
  });
});

describe('Sequence', () => {
  it('should generate sequential values', () => {
    const seq = new Sequence('item', 1);

    expect(seq.next()).toBe('item-1');
    expect(seq.next()).toBe('item-2');
    expect(seq.next()).toBe('item-3');
  });

  it('should reset to start value', () => {
    const seq = new Sequence('item', 5);

    seq.next(); // item-5
    seq.next(); // item-6
    seq.reset();

    expect(seq.next()).toBe('item-5');
  });
});

describe('DataGenerators', () => {
  it('should generate realistic titles', () => {
    const title = DataGenerators.title('Feature');

    expect(title).toContain('Feature:');
    expect(title.length).toBeGreaterThan(10);
  });

  it('should generate realistic emails', () => {
    const email = DataGenerators.email('testuser');

    expect(email).toMatch(/^testuser\.[a-z0-9]+@[a-z]+\.com$/);
  });

  it('should generate realistic names', () => {
    const name = DataGenerators.name();

    expect(name).toMatch(/^\w+ \w+$/); // First Last
    expect(name.length).toBeGreaterThan(5);
  });
});
