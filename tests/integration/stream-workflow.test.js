/**
 * Stream Workflow Integration Tests
 * SD-LEO-STREAMS-001: Design & Architecture Streams for PLAN Phase
 *
 * Tests stream requirement lookup, conditional activation, and completion validation.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import {
  getStreamRequirements,
  evaluateConditionalStreams,
  validateStreamCompletion,
  getApplicableStreams
} from '../../scripts/modules/sd-type-checker.js';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

describe('Stream Requirements', () => {
  describe('getStreamRequirements', () => {
    it('should return 8 streams for feature SD type', async () => {
      const streams = await getStreamRequirements('feature', supabase);
      expect(streams).toHaveLength(8);
    });

    it('should return streams with correct structure', async () => {
      const streams = await getStreamRequirements('feature', supabase);
      const stream = streams[0];

      expect(stream).toHaveProperty('stream_name');
      expect(stream).toHaveProperty('stream_category');
      expect(stream).toHaveProperty('requirement_level');
      expect(stream).toHaveProperty('conditional_keywords');
      expect(stream).toHaveProperty('minimum_depth');
    });

    it('should have required streams for feature type', async () => {
      const streams = await getStreamRequirements('feature', supabase);
      const required = streams.filter(s => s.requirement_level === 'required');

      expect(required.length).toBeGreaterThanOrEqual(4);
      expect(required.map(s => s.stream_name)).toContain('information_architecture');
      expect(required.map(s => s.stream_name)).toContain('ux_design');
      expect(required.map(s => s.stream_name)).toContain('ui_design');
      expect(required.map(s => s.stream_name)).toContain('data_models');
    });

    it('should have different requirements for database SD type', async () => {
      const streams = await getStreamRequirements('database', supabase);
      const required = streams.filter(s => s.requirement_level === 'required');

      // Database SDs should have data_models, api_design, security_design, performance_design required
      expect(required.map(s => s.stream_name)).toContain('data_models');
      expect(required.map(s => s.stream_name)).toContain('api_design');
      expect(required.map(s => s.stream_name)).toContain('security_design');
      expect(required.map(s => s.stream_name)).toContain('performance_design');

      // But NOT IA, UX, UI
      const skipped = streams.filter(s => s.requirement_level === 'skip');
      expect(skipped.map(s => s.stream_name)).toContain('information_architecture');
      expect(skipped.map(s => s.stream_name)).toContain('ux_design');
      expect(skipped.map(s => s.stream_name)).toContain('ui_design');
    });
  });

  describe('evaluateConditionalStreams', () => {
    it('should activate API stream with 2+ keyword matches', async () => {
      const prdText = 'This feature adds a REST endpoint for webhook integrations';
      const activated = await evaluateConditionalStreams(prdText, 'feature', supabase);

      expect(activated.length).toBeGreaterThanOrEqual(1);
      const apiStream = activated.find(s => s.stream_name === 'api_design');
      expect(apiStream).toBeDefined();
      expect(apiStream.match_count).toBeGreaterThanOrEqual(2);
    });

    it('should NOT activate with only 1 keyword match', async () => {
      const prdText = 'This feature improves the endpoint performance';
      const activated = await evaluateConditionalStreams(prdText, 'feature', supabase);

      // Only 'endpoint' matches - should not activate (requires 2+)
      const apiStream = activated.find(s => s.stream_name === 'api_design');
      expect(apiStream).toBeUndefined();
    });

    it('should return empty for no keyword matches', async () => {
      const prdText = 'This is a simple UI update with no special requirements';
      const activated = await evaluateConditionalStreams(prdText, 'feature', supabase);

      expect(activated).toHaveLength(0);
    });
  });

  describe('getApplicableStreams', () => {
    it('should categorize streams into design and architecture', async () => {
      const result = await getApplicableStreams('feature', '', supabase);

      expect(result.design).toBeDefined();
      expect(result.architecture).toBeDefined();
      expect(result.design.length).toBe(4); // IA, UX, UI, Data Models
      expect(result.architecture.length).toBe(4); // Tech, API, Security, Performance
    });

    it('should calculate correct summary', async () => {
      const result = await getApplicableStreams('feature', '', supabase);

      expect(result.summary).toBeDefined();
      expect(result.summary.required).toBeGreaterThanOrEqual(4);
      expect(result.summary.skip).toBe(0);
    });

    it('should mark conditional streams as activated when keywords match', async () => {
      const prdText = 'REST endpoint for webhook integration with graphql';
      const result = await getApplicableStreams('feature', prdText, supabase);

      const apiStream = result.architecture.find(s => s.name === 'api_design');
      expect(apiStream.activated).toBe(true);
      expect(apiStream.effective_level).toBe('required');
    });
  });

  describe('validateStreamCompletion', () => {
    it('should return completion status for an SD', async () => {
      // Use a test SD that we know exists
      const result = await validateStreamCompletion('SD-LEO-STREAMS-001', supabase);

      expect(result).toHaveProperty('complete');
      expect(result).toHaveProperty('score');
      expect(result).toHaveProperty('missing');
      expect(result).toHaveProperty('totalRequired');
      expect(typeof result.score).toBe('number');
    });

    it('should return error for non-existent SD', async () => {
      const result = await validateStreamCompletion('SD-NONEXISTENT-999', supabase);

      expect(result.error).toBeDefined();
      expect(result.complete).toBe(false);
    });
  });
});

describe('Stream Database Tables', () => {
  it('should have sd_stream_requirements table with data', async () => {
    const { count, error } = await supabase
      .from('sd_stream_requirements')
      .select('*', { count: 'exact', head: true });

    expect(error).toBeNull();
    expect(count).toBeGreaterThanOrEqual(80); // 10 SD types × 8 streams
  });

  it('should have sd_stream_completions table', async () => {
    const { error } = await supabase
      .from('sd_stream_completions')
      .select('id')
      .limit(1);

    expect(error).toBeNull();
  });
});
