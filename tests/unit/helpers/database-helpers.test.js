/**
 * Database Helpers Unit Tests
 *
 * Part of Phase 1 Testing Infrastructure (B1.3)
 * Tests: 5 unit tests (integration tests with real database)
 */

import { describe, it, expect, afterEach } from '@jest/globals';
import {
  createTestDirective,
  deleteTestDirective,
  createTestPRD,
  getDirectiveWithRelations,
  updateDirectiveStatus,
} from '../../helpers/database-helpers.js';

describe.skipIf(!process.env.SUPABASE_URL)('Database Helpers', () => {
  const createdIds = [];

  afterEach(async () => {
    // Cleanup all created test data
    for (const id of createdIds) {
      try {
        await deleteTestDirective(id);
      } catch (error) {
        // Ignore cleanup errors
      }
    }
    createdIds.length = 0;
  });

  it('should create test directive with default values', async () => {
    const directive = await createTestDirective();
    createdIds.push(directive.id);

    expect(directive.id).toBeTruthy();
    expect(directive.title).toBeTruthy();
    expect(directive.description).toBeTruthy();
    expect(directive.status).toBe('draft');
    expect(directive.priority).toBe('medium');
    expect(directive.phase).toBe('LEAD');
  });

  it('should create test directive with custom values', async () => {
    const directive = await createTestDirective({
      title: 'Custom Test Directive',
      description: 'Custom description',
      status: 'active',
      priority: 'high',
      phase: 'PLAN',
    });
    createdIds.push(directive.id);

    expect(directive.title).toBe('Custom Test Directive');
    expect(directive.description).toBe('Custom description');
    expect(directive.status).toBe('active');
    expect(directive.priority).toBe('high');
    expect(directive.phase).toBe('PLAN');
  });

  it('should create test PRD associated with directive', async () => {
    const directive = await createTestDirective();
    createdIds.push(directive.id);

    const prd = await createTestPRD(directive.id, {
      title: 'Test PRD',
      overview: 'Test overview',
    });

    expect(prd.id).toBeTruthy();
    expect(prd.strategic_directive_id).toBe(directive.id);
    expect(prd.title).toBe('Test PRD');
    expect(prd.overview).toBe('Test overview');
  });

  it('should get directive with all relations', async () => {
    const directive = await createTestDirective({
      title: 'Directive with Relations',
    });
    createdIds.push(directive.id);

    const prd = await createTestPRD(directive.id, {
      title: 'Related PRD',
    });

    const fullDirective = await getDirectiveWithRelations(directive.id);

    expect(fullDirective.id).toBe(directive.id);
    expect(fullDirective.title).toBe('Directive with Relations');
    expect(fullDirective.prd).toBeTruthy();
    expect(fullDirective.prd.title).toBe('Related PRD');
  });

  it('should update directive status', async () => {
    const directive = await createTestDirective({
      status: 'draft',
    });
    createdIds.push(directive.id);

    await updateDirectiveStatus(directive.id, 'active');

    const updated = await getDirectiveWithRelations(directive.id);
    expect(updated.status).toBe('active');
  });
});
