/**
 * Marketing Engine & E2E Venture Verification Tests
 *
 * Tests for:
 * - Marketing content pipeline (multi-channel generation)
 * - PostHog analytics integration
 * - Marketing feedback loop (analytics → strategy adjustment)
 * - E2E venture stage progression verification
 * - Marketing dashboard metrics
 *
 * Part of SD-MAN-ORCH-EVA-CODEBASE-PLUS-001-L
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(import.meta.dirname, '../../..');

describe('Marketing Engine & E2E Venture Verification', () => {
  describe('Content Pipeline', () => {
    const pipelinePath = resolve(ROOT, 'lib/marketing/content-pipeline.js');

    it('exists', () => {
      expect(existsSync(pipelinePath)).toBe(true);
    });

    it('exports executePipeline', async () => {
      const mod = await import(pipelinePath);
      expect(typeof mod.executePipeline).toBe('function');
    });

    it('exports getAvailableChannels', async () => {
      const { getAvailableChannels } = await import(pipelinePath);
      const channels = getAvailableChannels();
      expect(Array.isArray(channels)).toBe(true);
      expect(channels.length).toBeGreaterThanOrEqual(2);
      // At least social and email channels
      const channelIds = channels.map(c => c.id);
      expect(channelIds).toContain('social');
      expect(channelIds).toContain('email');
    });

    it('exports PIPELINE_STATUS constants', async () => {
      const { PIPELINE_STATUS } = await import(pipelinePath);
      expect(PIPELINE_STATUS).toBeDefined();
      expect(PIPELINE_STATUS.PENDING).toBe('pending');
      expect(PIPELINE_STATUS.GENERATING).toBe('generating');
      expect(PIPELINE_STATUS.PUBLISHING).toBe('publishing');
      expect(PIPELINE_STATUS.PUBLISHED).toBe('published');
      expect(PIPELINE_STATUS.FAILED).toBe('failed');
    });

    it('exports getPipelineHistory', async () => {
      const mod = await import(pipelinePath);
      expect(typeof mod.getPipelineHistory).toBe('function');
    });

    it('channels have required fields', async () => {
      const { getAvailableChannels } = await import(pipelinePath);
      const channels = getAvailableChannels();
      for (const ch of channels) {
        expect(ch.id).toBeDefined();
        expect(ch.name).toBeDefined();
        expect(ch.contentType).toBeDefined();
        expect(Array.isArray(ch.platforms)).toBe(true);
        expect(ch.platforms.length).toBeGreaterThan(0);
      }
    });
  });

  describe('PostHog Analytics Integration', () => {
    const posthogPath = resolve(ROOT, 'lib/marketing/posthog-integration.js');

    it('exists', () => {
      expect(existsSync(posthogPath)).toBe(true);
    });

    it('exports createPostHogClient', async () => {
      const mod = await import(posthogPath);
      expect(typeof mod.createPostHogClient).toBe('function');
    });

    it('creates a client with capture/flush/shutdown methods', async () => {
      const { createPostHogClient } = await import(posthogPath);
      const client = createPostHogClient({ enabled: false });
      expect(typeof client.capture).toBe('function');
      expect(typeof client.flush).toBe('function');
      expect(typeof client.shutdown).toBe('function');
      expect(typeof client.getBufferSize).toBe('function');
      expect(typeof client.isConfigured).toBe('function');
    });

    it('capture buffers events', async () => {
      const { createPostHogClient } = await import(posthogPath);
      const client = createPostHogClient({ enabled: true, apiKey: '' });
      expect(client.getBufferSize()).toBe(0);
      client.capture('venture-1', 'test_event', { foo: 'bar' });
      expect(client.getBufferSize()).toBe(1);
      client.capture('venture-1', 'test_event_2');
      expect(client.getBufferSize()).toBe(2);
    });

    it('flush clears the buffer', async () => {
      const { createPostHogClient } = await import(posthogPath);
      const client = createPostHogClient({ enabled: true, apiKey: '' });
      client.capture('v1', 'ev1');
      client.capture('v1', 'ev2');
      expect(client.getBufferSize()).toBe(2);
      const result = await client.flush();
      expect(result.success).toBe(true);
      expect(result.eventsFlushed).toBe(2);
      expect(client.getBufferSize()).toBe(0);
    });

    it('exports VENTURE_EVENTS constants', async () => {
      const { VENTURE_EVENTS } = await import(posthogPath);
      expect(VENTURE_EVENTS).toBeDefined();
      expect(VENTURE_EVENTS.VENTURE_CREATED).toBe('venture_created');
      expect(VENTURE_EVENTS.STAGE_COMPLETED).toBe('stage_completed');
      expect(VENTURE_EVENTS.MARKETING_CONTENT_GENERATED).toBe('marketing_content_generated');
      expect(VENTURE_EVENTS.MARKETING_CONTENT_PUBLISHED).toBe('marketing_content_published');
      expect(VENTURE_EVENTS.FEEDBACK_RECEIVED).toBe('feedback_received');
    });

    it('exports venture event helper functions', async () => {
      const mod = await import(posthogPath);
      expect(typeof mod.trackVentureEvent).toBe('function');
      expect(typeof mod.trackStageTransition).toBe('function');
      expect(typeof mod.trackContentGenerated).toBe('function');
      expect(typeof mod.trackContentPublished).toBe('function');
    });

    it('trackStageTransition captures correct event', async () => {
      const { createPostHogClient, trackStageTransition, VENTURE_EVENTS } = await import(posthogPath);
      const client = createPostHogClient({ enabled: true, apiKey: '' });
      trackStageTransition(client, {
        ventureId: 'v-123',
        fromStage: 3,
        toStage: 4,
        durationMs: 5000,
      });
      expect(client.getBufferSize()).toBe(1);
    });

    it('isConfigured returns false without API key', async () => {
      const { createPostHogClient } = await import(posthogPath);
      const client = createPostHogClient({ apiKey: '' });
      expect(client.isConfigured()).toBe(false);
    });

    it('isConfigured returns true with API key', async () => {
      const { createPostHogClient } = await import(posthogPath);
      const client = createPostHogClient({ apiKey: 'phc_test_key' });
      expect(client.isConfigured()).toBe(true);
    });
  });

  describe('Marketing Feedback Loop', () => {
    const feedbackPath = resolve(ROOT, 'lib/marketing/feedback-loop.js');

    it('exists', () => {
      expect(existsSync(feedbackPath)).toBe(true);
    });

    it('exports analyzeAndAdjust', async () => {
      const mod = await import(feedbackPath);
      expect(typeof mod.analyzeAndAdjust).toBe('function');
    });

    it('exports FEEDBACK_ACTION constants', async () => {
      const { FEEDBACK_ACTION } = await import(feedbackPath);
      expect(FEEDBACK_ACTION).toBeDefined();
      expect(FEEDBACK_ACTION.INCREASE_BUDGET).toBe('increase_budget');
      expect(FEEDBACK_ACTION.DECREASE_BUDGET).toBe('decrease_budget');
      expect(FEEDBACK_ACTION.PAUSE_CHANNEL).toBe('pause_channel');
      expect(FEEDBACK_ACTION.ROTATE_CONTENT).toBe('rotate_content');
      expect(FEEDBACK_ACTION.NO_CHANGE).toBe('no_change');
    });

    it('exports evaluateChannel', async () => {
      const mod = await import(feedbackPath);
      expect(typeof mod.evaluateChannel).toBe('function');
    });

    it('evaluateChannel returns NO_CHANGE for insufficient data', async () => {
      const { evaluateChannel, FEEDBACK_ACTION } = await import(feedbackPath);
      const result = evaluateChannel({ impressions: 50 });
      expect(result.action).toBe(FEEDBACK_ACTION.NO_CHANGE);
      expect(result.reason).toBe('Insufficient data');
    });

    it('evaluateChannel returns PAUSE_CHANNEL for critically high CPA', async () => {
      const { evaluateChannel, FEEDBACK_ACTION } = await import(feedbackPath);
      const result = evaluateChannel({
        impressions: 1000,
        costPerAcquisition: 250, // Way above $100 threshold
      });
      expect(result.action).toBe(FEEDBACK_ACTION.PAUSE_CHANNEL);
    });

    it('evaluateChannel returns INCREASE_BUDGET for high conversion', async () => {
      const { evaluateChannel, FEEDBACK_ACTION } = await import(feedbackPath);
      const result = evaluateChannel({
        impressions: 5000,
        conversionRate: 0.08, // Above 0.05 high threshold
        costPerAcquisition: 15, // Low CPA (good)
      });
      expect(result.action).toBe(FEEDBACK_ACTION.INCREASE_BUDGET);
    });

    it('evaluateChannel returns ROTATE_CONTENT for low engagement', async () => {
      const { evaluateChannel, FEEDBACK_ACTION } = await import(feedbackPath);
      const result = evaluateChannel({
        impressions: 5000,
        engagementRate: 0.005, // Below 0.01 low threshold
        costPerAcquisition: 15,
      });
      expect(result.action).toBe(FEEDBACK_ACTION.ROTATE_CONTENT);
    });

    it('exports getFeedbackHistory', async () => {
      const mod = await import(feedbackPath);
      expect(typeof mod.getFeedbackHistory).toBe('function');
    });
  });

  describe('Marketing Dashboard', () => {
    const dashboardPath = resolve(ROOT, 'lib/marketing/dashboard.js');

    it('exists', () => {
      expect(existsSync(dashboardPath)).toBe(true);
    });

    it('exports buildDashboard', async () => {
      const mod = await import(dashboardPath);
      expect(typeof mod.buildDashboard).toBe('function');
    });

    it('exports getCampaigns', async () => {
      const mod = await import(dashboardPath);
      expect(typeof mod.getCampaigns).toBe('function');
    });

    it('exports METRIC_TYPE constants', async () => {
      const { METRIC_TYPE } = await import(dashboardPath);
      expect(METRIC_TYPE).toBeDefined();
      expect(METRIC_TYPE.CONTENT_GENERATED).toBe('content_generated');
      expect(METRIC_TYPE.IMPRESSIONS).toBe('impressions');
      expect(METRIC_TYPE.ROI).toBe('roi');
      expect(METRIC_TYPE.ENGAGEMENT_RATE).toBe('engagement_rate');
    });
  });

  describe('E2E Venture Stage Progression', () => {
    const orchestratorPath = resolve(ROOT, 'lib/eva/eva-orchestrator.js');
    const contractsPath = resolve(ROOT, 'lib/eva/contracts/stage-contracts.js');
    const posthogPath = resolve(ROOT, 'lib/marketing/posthog-integration.js');

    it('orchestrator integrates with stage contracts for validation', () => {
      const src = readFileSync(orchestratorPath, 'utf-8');
      expect(src).toContain('validatePreStage');
      expect(src).toContain('validatePostStage');
      expect(src).toContain('getContract');
    });

    it('stage contracts cover stages 1 through at least 3', async () => {
      const { getContract } = await import(contractsPath);
      for (let i = 1; i <= 3; i++) {
        const contract = getContract(i);
        expect(contract).toBeDefined();
        expect(contract.produces).toBeDefined();
      }
    });

    it('stage 1 produces required intake fields', async () => {
      const { getContract } = await import(contractsPath);
      const stage1 = getContract(1);
      expect(stage1.produces.description).toBeDefined();
    });

    it('stage 2 consumes stage 1 output', async () => {
      const { getContract } = await import(contractsPath);
      const stage2 = getContract(2);
      expect(stage2.consumes.length).toBeGreaterThan(0);
      expect(stage2.consumes[0].stage).toBe(1);
    });

    it('stage 3 consumes from stages 1 and 2', async () => {
      const { getContract } = await import(contractsPath);
      const stage3 = getContract(3);
      expect(stage3.consumes.length).toBeGreaterThanOrEqual(2);
      const consumedStages = stage3.consumes.map(c => c.stage);
      expect(consumedStages).toContain(1);
      expect(consumedStages).toContain(2);
    });

    it('PostHog can track stage transitions end-to-end', async () => {
      const { createPostHogClient, trackStageTransition } = await import(posthogPath);
      const client = createPostHogClient({ enabled: true, apiKey: '' });

      // Simulate venture progressing through stages 1→2→3
      trackStageTransition(client, { ventureId: 'v-e2e', fromStage: 0, toStage: 1, durationMs: 1000 });
      trackStageTransition(client, { ventureId: 'v-e2e', fromStage: 1, toStage: 2, durationMs: 2000 });
      trackStageTransition(client, { ventureId: 'v-e2e', fromStage: 2, toStage: 3, durationMs: 1500 });

      expect(client.getBufferSize()).toBe(3);
      const result = await client.flush();
      expect(result.eventsFlushed).toBe(3);
      expect(client.getBufferSize()).toBe(0);
    });

    it('orchestrator processes stages with event emission', () => {
      const src = readFileSync(orchestratorPath, 'utf-8');
      expect(src).toContain('emit');
      expect(src).toContain('stage_processing_completed');
    });

    it('orchestrator uses decision filter engine', () => {
      const src = readFileSync(orchestratorPath, 'utf-8');
      expect(src).toContain('evaluateDecision');
      expect(src).toContain('AUTO_PROCEED');
    });
  });

  describe('Marketing Module Index', () => {
    const indexPath = resolve(ROOT, 'lib/marketing/index.js');

    it('exists', () => {
      expect(existsSync(indexPath)).toBe(true);
    });

    it('exports content pipeline functions', () => {
      const src = readFileSync(indexPath, 'utf-8');
      expect(src).toContain('executePipeline');
      expect(src).toContain('getAvailableChannels');
    });

    it('exports PostHog integration', () => {
      const src = readFileSync(indexPath, 'utf-8');
      expect(src).toContain('createPostHogClient');
      expect(src).toContain('VENTURE_EVENTS');
    });

    it('exports feedback loop', () => {
      const src = readFileSync(indexPath, 'utf-8');
      expect(src).toContain('analyzeAndAdjust');
      expect(src).toContain('FEEDBACK_ACTION');
    });

    it('exports dashboard', () => {
      const src = readFileSync(indexPath, 'utf-8');
      expect(src).toContain('buildDashboard');
      expect(src).toContain('getCampaigns');
    });
  });
});
