/**
 * Tests for Blueprint Agent Factory
 *
 * Validates registry completeness, agent module contracts,
 * dependency integrity, and topological execution order.
 */

import { describe, it, expect } from 'vitest';
import {
  agentRegistry,
  ARTIFACT_TYPES,
  getAgent,
} from '../../../lib/eva/blueprint-agents/index.js';
import { resolveExecutionOrder, orchestrate } from '../../../lib/eva/blueprint-coordinator.js';

// ── Registry completeness ────────────────────────────────────

describe('Blueprint Agent Registry', () => {
  const EXPECTED_TYPES = [
    'data_model',
    'erd_diagram',
    'technical_architecture',
    'api_contract',
    'schema_spec',
    'user_story_pack',
    'risk_register',
    'financial_projection',
    'launch_readiness',
    'sprint_plan',
    'promotion_gate',
  ];

  it('exports all 11 artifact types', () => {
    expect(ARTIFACT_TYPES).toHaveLength(11);
    for (const type of EXPECTED_TYPES) {
      expect(ARTIFACT_TYPES).toContain(type);
    }
  });

  it('registry contains all 11 agents', () => {
    expect(agentRegistry.size).toBe(11);
    for (const type of EXPECTED_TYPES) {
      expect(agentRegistry.has(type)).toBe(true);
    }
  });

  it('getAgent returns the correct agent for each type', () => {
    for (const type of EXPECTED_TYPES) {
      const agent = getAgent(type);
      expect(agent).toBeDefined();
      expect(agent.artifactType).toBe(type);
    }
  });

  it('getAgent returns undefined for unknown types', () => {
    expect(getAgent('nonexistent_type')).toBeUndefined();
  });
});

// ── Agent module contracts ───────────────────────────────────

describe('Agent Module Contracts', () => {
  for (const [type, agent] of agentRegistry) {
    describe(`${type}`, () => {
      it('exports artifactType as a string', () => {
        expect(typeof agent.artifactType).toBe('string');
        expect(agent.artifactType.length).toBeGreaterThan(0);
      });

      it('exports systemPrompt as a non-empty string', () => {
        expect(typeof agent.systemPrompt).toBe('string');
        expect(agent.systemPrompt.length).toBeGreaterThan(50);
      });

      it('exports dependencies as an array of strings', () => {
        expect(Array.isArray(agent.dependencies)).toBe(true);
        for (const dep of agent.dependencies) {
          expect(typeof dep).toBe('string');
        }
      });

      it('exports description as a string', () => {
        expect(typeof agent.description).toBe('string');
        expect(agent.description.length).toBeGreaterThan(0);
      });
    });
  }
});

// ── Dependency integrity ─────────────────────────────────────

describe('Dependency Integrity', () => {
  it('every dependency references an existing artifact type', () => {
    for (const [type, agent] of agentRegistry) {
      for (const dep of agent.dependencies) {
        expect(
          agentRegistry.has(dep),
          `Agent "${type}" depends on "${dep}" which does not exist in the registry`
        ).toBe(true);
      }
    }
  });

  it('no agent depends on itself', () => {
    for (const [type, agent] of agentRegistry) {
      expect(
        agent.dependencies.includes(type),
        `Agent "${type}" has a self-dependency`
      ).toBe(false);
    }
  });
});

// ── Topological execution order ──────────────────────────────

describe('resolveExecutionOrder', () => {
  it('returns all 11 artifact types', () => {
    const order = resolveExecutionOrder();
    expect(order).toHaveLength(11);
    expect(new Set(order).size).toBe(11);
  });

  it('places every agent after its dependencies', () => {
    const order = resolveExecutionOrder();
    const indexOf = new Map(order.map((type, i) => [type, i]));

    for (const [type, agent] of agentRegistry) {
      for (const dep of agent.dependencies) {
        expect(
          indexOf.get(dep),
          `"${dep}" should appear before "${type}" in execution order`
        ).toBeLessThan(indexOf.get(type));
      }
    }
  });

  it('places root agents (no dependencies) first', () => {
    const order = resolveExecutionOrder();
    const roots = ARTIFACT_TYPES.filter(
      (t) => getAgent(t).dependencies.length === 0
    );
    // All roots should appear before any non-root
    const firstNonRootIndex = order.findIndex(
      (t) => getAgent(t).dependencies.length > 0
    );
    for (const root of roots) {
      expect(order.indexOf(root)).toBeLessThan(firstNonRootIndex);
    }
  });
});

// ── Orchestrate (dry run) ────────────────────────────────────

describe('orchestrate', () => {
  it('returns a Map with all 11 artifact types when no executeAgent provided', async () => {
    const results = await orchestrate({ name: 'Test Venture' });
    expect(results.size).toBe(11);
    for (const type of ARTIFACT_TYPES) {
      expect(results.has(type)).toBe(true);
      expect(results.get(type).planned).toBe(true);
    }
  });

  it('calls executeAgent for each artifact in dependency order', async () => {
    const callOrder = [];
    const executeAgent = async (agent, context) => {
      callOrder.push(agent.artifactType);
      return { generated: true, type: agent.artifactType };
    };

    const results = await orchestrate({ name: 'Test' }, { executeAgent });

    expect(callOrder).toHaveLength(11);
    // Verify dependency ordering in call sequence
    const indexOf = new Map(callOrder.map((type, i) => [type, i]));
    for (const [type, agent] of agentRegistry) {
      for (const dep of agent.dependencies) {
        expect(indexOf.get(dep)).toBeLessThan(indexOf.get(type));
      }
    }
  });

  it('passes upstream results to dependent agents', async () => {
    const receivedContexts = new Map();
    const executeAgent = async (agent, context) => {
      receivedContexts.set(agent.artifactType, context);
      return { result: agent.artifactType };
    };

    await orchestrate({ name: 'Test' }, { executeAgent });

    // erd_diagram depends on data_model — verify it received that upstream result
    const erdContext = receivedContexts.get('erd_diagram');
    expect(erdContext.upstream.data_model).toEqual({ result: 'data_model' });

    // promotion_gate depends on launch_readiness and financial_projection
    const gateContext = receivedContexts.get('promotion_gate');
    expect(gateContext.upstream.launch_readiness).toEqual({ result: 'launch_readiness' });
    expect(gateContext.upstream.financial_projection).toEqual({ result: 'financial_projection' });

    // data_model has no dependencies — upstream should be empty
    const dmContext = receivedContexts.get('data_model');
    expect(Object.keys(dmContext.upstream)).toHaveLength(0);
  });
});
