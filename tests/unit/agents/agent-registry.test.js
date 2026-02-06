/**
 * Agent Registry Unit Tests
 *
 * Part of Phase 1 Testing Infrastructure (B1.3)
 * Tests: 5 unit tests
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { AgentRegistry } from '../../../lib/agents/registry.cjs';

describe('Agent Registry', () => {
  let registry;

  beforeAll(async () => {
    registry = new AgentRegistry();
    await registry.initialize();
  });

  it('should initialize with all agents from database', () => {
    expect(registry.initialized).toBe(true);
    expect(registry.agents.size).toBeGreaterThan(0);
  });

  it('should get agent by code', () => {
    const validation = registry.getAgent('VALIDATION');

    expect(validation).toBeTruthy();
    expect(validation.code).toBe('VALIDATION');
    expect(validation.name).toBeTruthy();
    expect(validation.capabilities).toBeDefined();
    expect(Array.isArray(validation.capabilities)).toBe(true);
  });

  it('should search agents by keyword', () => {
    const results = registry.searchByKeyword('security');

    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThan(0);

    // All results should contain 'security' in searchable fields
    results.forEach(agent => {
      const searchable = [
        agent.name,
        agent.description,
        ...agent.capabilities,
        ...agent.trigger_keywords,
      ].join(' ').toLowerCase();

      expect(searchable).toContain('security');
    });
  });

  it('should get all agents', () => {
    const allAgents = registry.getAllAgents();

    expect(Array.isArray(allAgents)).toBe(true);
    expect(allAgents.length).toBeGreaterThan(0);

    // Each agent should have required fields
    allAgents.forEach(agent => {
      expect(agent.code).toBeTruthy();
      expect(agent.name).toBeTruthy();
      expect(agent.capabilities).toBeDefined();
    });
  });

  it('should get registry statistics', () => {
    const stats = registry.getStats();

    expect(stats.totalAgents).toBeGreaterThan(0);
    expect(stats.totalCapabilities).toBeGreaterThan(0);
    expect(stats.avgCapabilitiesPerAgent).toBeTruthy();
    expect(Array.isArray(stats.phases)).toBe(true);
    expect(Array.isArray(stats.categories)).toBe(true);
  });
});
