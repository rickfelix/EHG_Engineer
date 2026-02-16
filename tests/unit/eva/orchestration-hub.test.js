/**
 * Orchestration Hub & Contracts Tests
 *
 * Tests for:
 * - Trigger type system (3 channels: Events, Rounds, Priority Queue)
 * - YAML stage contracts
 * - Concurrent venture orchestrator
 * - Master scheduler interval configuration
 * - DLQ integration
 *
 * Part of SD-MAN-ORCH-EVA-CODEBASE-PLUS-001-K
 */

import { describe, it, expect, vi } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(import.meta.dirname, '../../..');

describe('Orchestration Hub & Contracts', () => {
  describe('Trigger Type System', () => {
    const triggerPath = resolve(ROOT, 'lib/eva/orchestrator-trigger-types.js');

    it('exists', () => {
      expect(existsSync(triggerPath)).toBe(true);
    });

    it('exports TRIGGER_TYPE constants', async () => {
      const mod = await import(triggerPath);
      expect(mod.TRIGGER_TYPE).toBeDefined();
      expect(mod.TRIGGER_TYPE.EVENT).toBe('event');
      expect(mod.TRIGGER_TYPE.ROUND).toBe('round');
      expect(mod.TRIGGER_TYPE.PRIORITY_QUEUE).toBe('priority_queue');
    });

    it('exports classifyEvent function', async () => {
      const { classifyEvent, TRIGGER_TYPE } = await import(triggerPath);
      expect(typeof classifyEvent).toBe('function');

      // Events (immediate)
      expect(classifyEvent('chairman.override')).toBe(TRIGGER_TYPE.EVENT);
      expect(classifyEvent('budget.exceeded')).toBe(TRIGGER_TYPE.EVENT);
      expect(classifyEvent('gate.failed')).toBe(TRIGGER_TYPE.EVENT);

      // Rounds (scheduled)
      expect(classifyEvent('stage.completed')).toBe(TRIGGER_TYPE.ROUND);
      expect(classifyEvent('health.check')).toBe(TRIGGER_TYPE.ROUND);

      // Priority Queue (planned)
      expect(classifyEvent('stage.progression')).toBe(TRIGGER_TYPE.PRIORITY_QUEUE);
      expect(classifyEvent('sd.created')).toBe(TRIGGER_TYPE.PRIORITY_QUEUE);

      // Unknown defaults to priority queue
      expect(classifyEvent('unknown.event')).toBe(TRIGGER_TYPE.PRIORITY_QUEUE);
    });

    it('exports getTriggerDefinition', async () => {
      const { getTriggerDefinition, TRIGGER_TYPE } = await import(triggerPath);
      const eventDef = getTriggerDefinition(TRIGGER_TYPE.EVENT);
      expect(eventDef).toBeDefined();
      expect(eventDef.urgency).toBe('immediate');
      expect(eventDef.maxLatencyMs).toBe(5_000);
      expect(eventDef.interruptible).toBe(true);

      const roundDef = getTriggerDefinition(TRIGGER_TYPE.ROUND);
      expect(roundDef.urgency).toBe('scheduled');

      const queueDef = getTriggerDefinition(TRIGGER_TYPE.PRIORITY_QUEUE);
      expect(queueDef.urgency).toBe('planned');
    });

    it('exports getUrgencyPriority with correct ordering', async () => {
      const { getUrgencyPriority, TRIGGER_TYPE } = await import(triggerPath);
      expect(getUrgencyPriority(TRIGGER_TYPE.EVENT)).toBe(0);
      expect(getUrgencyPriority(TRIGGER_TYPE.ROUND)).toBe(1);
      expect(getUrgencyPriority(TRIGGER_TYPE.PRIORITY_QUEUE)).toBe(2);
    });

    it('exports sortByUrgency', async () => {
      const { sortByUrgency, TRIGGER_TYPE } = await import(triggerPath);
      const items = [
        { triggerType: TRIGGER_TYPE.PRIORITY_QUEUE, id: 'c' },
        { triggerType: TRIGGER_TYPE.EVENT, id: 'a' },
        { triggerType: TRIGGER_TYPE.ROUND, id: 'b' },
      ];
      const sorted = sortByUrgency(items);
      expect(sorted[0].id).toBe('a'); // event first
      expect(sorted[1].id).toBe('b'); // round second
      expect(sorted[2].id).toBe('c'); // queue last
    });

    it('exports createDispatchRequest', async () => {
      const { createDispatchRequest, TRIGGER_TYPE } = await import(triggerPath);
      const req = createDispatchRequest({
        eventType: 'chairman.override',
        payload: { ventureId: 'v-123' },
      });
      expect(req.triggerType).toBe(TRIGGER_TYPE.EVENT);
      expect(req.urgency).toBe('immediate');
      expect(req.interruptible).toBe(true);
      expect(req.ventureId).toBe('v-123');
      expect(req.createdAt).toBeDefined();
    });
  });

  describe('YAML Stage Contracts', () => {
    const yamlPath = resolve(ROOT, 'lib/eva/contracts/stage-contracts.yaml');
    const loaderPath = resolve(ROOT, 'lib/eva/contracts/yaml-contract-loader.js');

    it('YAML file exists', () => {
      expect(existsSync(yamlPath)).toBe(true);
    });

    it('contains stage definitions', () => {
      const src = readFileSync(yamlPath, 'utf-8');
      expect(src).toContain('stages:');
      expect(src).toContain('name:');
      expect(src).toContain('consumes:');
      expect(src).toContain('produces:');
    });

    it('covers all 25 stages', () => {
      const src = readFileSync(yamlPath, 'utf-8');
      for (let i = 1; i <= 25; i++) {
        expect(src).toContain(`  ${i}:`);
      }
    });

    it('loader module exists', () => {
      expect(existsSync(loaderPath)).toBe(true);
    });

    it('loader exports loadContractsFromYaml', async () => {
      const mod = await import(loaderPath);
      expect(typeof mod.loadContractsFromYaml).toBe('function');
    });

    it('loadContractsFromYaml returns a Map', async () => {
      const { loadContractsFromYaml } = await import(loaderPath);
      const contracts = loadContractsFromYaml();
      expect(contracts).toBeInstanceOf(Map);
      expect(contracts.size).toBe(25);
    });

    it('YAML contracts have typed fields', async () => {
      const { loadContractsFromYaml } = await import(loaderPath);
      const contracts = loadContractsFromYaml();

      // Stage 1 produces description with minLength
      const stage1 = contracts.get(1);
      expect(stage1.produces.description.type).toBe('string');
      expect(stage1.produces.description.minLength).toBe(50);

      // Stage 2 consumes from stage 1
      const stage2 = contracts.get(2);
      expect(stage2.consumes.length).toBeGreaterThan(0);
      expect(stage2.consumes[0].stage).toBe(1);
    });

    it('loader exports compareContracts', async () => {
      const mod = await import(loaderPath);
      expect(typeof mod.compareContracts).toBe('function');
    });
  });

  describe('Concurrent Venture Orchestrator', () => {
    const concurrentPath = resolve(ROOT, 'lib/eva/concurrent-venture-orchestrator.js');

    it('exists', () => {
      expect(existsSync(concurrentPath)).toBe(true);
    });

    it('exports ConcurrentVentureOrchestrator class', async () => {
      const mod = await import(concurrentPath);
      expect(typeof mod.ConcurrentVentureOrchestrator).toBe('function');
    });

    it('tracks active ventures', async () => {
      const { ConcurrentVentureOrchestrator } = await import(concurrentPath);
      const orch = new ConcurrentVentureOrchestrator({
        logger: { log: () => {}, warn: () => {}, error: () => {} },
      });
      expect(orch.activeCount).toBe(0);
      expect(orch.pendingCount).toBe(0);
      expect(orch.isActive('non-existent')).toBe(false);
    });

    it('getStatus returns complete status', async () => {
      const { ConcurrentVentureOrchestrator } = await import(concurrentPath);
      const orch = new ConcurrentVentureOrchestrator({
        logger: { log: () => {}, warn: () => {}, error: () => {} },
      });
      const status = orch.getStatus();
      expect(status.instanceId).toBeDefined();
      expect(status.activeCount).toBe(0);
      expect(status.pendingCount).toBe(0);
      expect(status.maxConcurrent).toBe(5);
      expect(status.totalDispatched).toBe(0);
      expect(status.totalCompleted).toBe(0);
      expect(status.totalFailed).toBe(0);
      expect(status.activeVentures).toEqual([]);
    });

    it('respects maxConcurrent config', async () => {
      const { ConcurrentVentureOrchestrator } = await import(concurrentPath);
      const orch = new ConcurrentVentureOrchestrator({
        config: { maxConcurrent: 3 },
        logger: { log: () => {}, warn: () => {}, error: () => {} },
      });
      expect(orch.maxConcurrent).toBe(3);
    });
  });

  describe('EVA Orchestrator', () => {
    const orchestratorPath = resolve(ROOT, 'lib/eva/eva-orchestrator.js');

    it('exists', () => {
      expect(existsSync(orchestratorPath)).toBe(true);
    });

    it('exports processStage', () => {
      const src = readFileSync(orchestratorPath, 'utf-8');
      expect(src).toContain('export async function processStage');
    });

    it('uses stage contracts', () => {
      const src = readFileSync(orchestratorPath, 'utf-8');
      expect(src).toContain('stage-contracts');
      expect(src).toContain('getContract');
      expect(src).toContain('validatePreStage');
      expect(src).toContain('validatePostStage');
    });

    it('integrates with decision filter engine', () => {
      const src = readFileSync(orchestratorPath, 'utf-8');
      expect(src).toContain('evaluateDecision');
      expect(src).toContain('AUTO_PROCEED');
      expect(src).toContain('REQUIRE_REVIEW');
      expect(src).toContain('STOP');
    });

    it('integrates with event bus', () => {
      const src = readFileSync(orchestratorPath, 'utf-8');
      expect(src).toContain('emit');
      expect(src).toContain('shared-services');
    });
  });

  describe('Master Scheduler', () => {
    const schedulerPath = resolve(ROOT, 'lib/eva/eva-master-scheduler.js');

    it('exists', () => {
      expect(existsSync(schedulerPath)).toBe(true);
    });

    it('exports EvaMasterScheduler class', () => {
      const src = readFileSync(schedulerPath, 'utf-8');
      expect(src).toContain('export class EvaMasterScheduler');
    });

    it('supports configurable intervals', () => {
      const src = readFileSync(schedulerPath, 'utf-8');
      expect(src).toContain('pollIntervalMs');
      expect(src).toContain('EVA_SCHEDULER_POLL_INTERVAL_SECONDS');
    });

    it('supports circuit breaker', () => {
      const src = readFileSync(schedulerPath, 'utf-8');
      expect(src).toContain('circuitBreaker');
      expect(src).toContain('OPEN');
    });

    it('dispatches in batches', () => {
      const src = readFileSync(schedulerPath, 'utf-8');
      expect(src).toContain('dispatchBatchSize');
      expect(src).toContain('EVA_SCHEDULER_DISPATCH_BATCH_SIZE');
    });
  });

  describe('DLQ Integration', () => {
    const routerPath = resolve(ROOT, 'lib/eva/event-bus/event-router.js');

    it('event router exists', () => {
      expect(existsSync(routerPath)).toBe(true);
    });

    it('routes failed events to DLQ', () => {
      const src = readFileSync(routerPath, 'utf-8');
      expect(src).toContain('routeToDLQ');
      expect(src).toContain('eva_events_dlq');
    });

    it('captures retry metadata', () => {
      const src = readFileSync(routerPath, 'utf-8');
      expect(src).toContain('attemptCount');
      expect(src).toContain('failureReason');
      expect(src).toContain('errorMessage');
      expect(src).toContain('errorStack');
    });

    it('supports DLQ replay', () => {
      const src = readFileSync(routerPath, 'utf-8');
      expect(src).toContain('replayDLQEntry');
      expect(src).toContain('replayed');
    });
  });

  describe('JS Stage Contracts', () => {
    const contractsPath = resolve(ROOT, 'lib/eva/contracts/stage-contracts.js');

    it('exists', () => {
      expect(existsSync(contractsPath)).toBe(true);
    });

    it('exports getContract, validatePreStage, validatePostStage', async () => {
      const mod = await import(contractsPath);
      expect(typeof mod.getContract).toBe('function');
      expect(typeof mod.validatePreStage).toBe('function');
      expect(typeof mod.validatePostStage).toBe('function');
    });

    it('defines contracts for multiple stages', async () => {
      const { getContract } = await import(contractsPath);
      // Check a few key stages
      expect(getContract(1)).toBeDefined();
      expect(getContract(1).produces).toBeDefined();
      expect(getContract(3)).toBeDefined();
      expect(getContract(5)).toBeDefined();
    });

    it('stage contracts have consume/produce specs', async () => {
      const { getContract } = await import(contractsPath);
      const stage3 = getContract(3);
      expect(stage3.consumes.length).toBeGreaterThan(0);
      expect(stage3.produces).toBeDefined();
      expect(stage3.produces.decision).toBeDefined();
    });
  });
});
