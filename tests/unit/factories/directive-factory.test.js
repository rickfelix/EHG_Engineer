/**
 * Directive Factory Unit Tests
 *
 * Part of Phase 1 Testing Infrastructure (B1.3)
 * Tests: 5 unit tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DirectiveFactory } from '../../factories/directive-factory.js';

describe('DirectiveFactory', () => {
  let factory;

  beforeEach(() => {
    factory = DirectiveFactory.create();
  });

  afterEach(async () => {
    // Cleanup any created test data
    if (factory) {
      await factory.cleanup();
    }
  });

  it('should create factory with default attributes', () => {
    expect(factory.get('status')).toBe('draft');
    expect(factory.get('priority')).toBe('medium');
    expect(factory.get('phase')).toBe('LEAD');
    expect(factory.get('title')).toBeTruthy();
    expect(factory.get('description')).toBeTruthy();
  });

  it('should use fluent API to set attributes', () => {
    const result = factory
      .withTitle('Test Directive')
      .inPlanPhase()
      .withHighPriority()
      .asDraft();

    expect(result).toBe(factory); // Fluent API
    expect(factory.get('title')).toBe('Test Directive');
    expect(factory.get('phase')).toBe('PLAN');
    expect(factory.get('priority')).toBe('high');
    expect(factory.get('status')).toBe('draft');
  });

  it('should have convenience methods for phases', () => {
    factory.inLeadPhase();
    expect(factory.get('phase')).toBe('LEAD');

    factory.inPlanPhase();
    expect(factory.get('phase')).toBe('PLAN');

    factory.inExecPhase();
    expect(factory.get('phase')).toBe('EXEC');

    factory.inVerifyPhase();
    expect(factory.get('phase')).toBe('VERIFY');
  });

  it('should have convenience methods for priorities', () => {
    factory.withLowPriority();
    expect(factory.get('priority')).toBe('low');

    factory.withMediumPriority();
    expect(factory.get('priority')).toBe('medium');

    factory.withHighPriority();
    expect(factory.get('priority')).toBe('high');

    factory.withCriticalPriority();
    expect(factory.get('priority')).toBe('critical');
  });

  it.skipIf(!process.env.SUPABASE_URL)('should create and track directive in database', async () => {
    const directive = await factory
      .withTitle('Integration Test Directive')
      .inPlanPhase()
      .build();

    expect(directive.id).toBeTruthy();
    expect(directive.title).toBe('Integration Test Directive');
    expect(directive.phase).toBe('PLAN');

    // Verify cleanup tracking
    expect(factory.createdRecords.length).toBe(1);
    expect(factory.createdRecords[0].table).toBe('strategic_directives_v2');
    expect(factory.createdRecords[0].id).toBe(directive.id);
  });
});
