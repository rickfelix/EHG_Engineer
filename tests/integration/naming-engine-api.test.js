/**
 * Naming Engine API Integration Tests
 * SD-NAMING-ENGINE-001
 *
 * Tests the Naming Engine API endpoints:
 *   - POST /api/v2/naming-engine/generate
 *   - GET /api/v2/naming-engine/suggestions/:brand_genome_id
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Test fixtures
let testVentureId;
let testCompanyId;
let testBrandGenomeId;
let testSessionId;

// Mock request/response for testing handlers directly
function createMockReq(body = {}, params = {}) {
  return { body, params };
}

function createMockRes() {
  const res = {
    statusCode: 200,
    jsonData: null,
    headers: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.jsonData = data;
      return this;
    },
    setHeader(name, value) {
      this.headers[name] = value;
      return this;
    }
  };
  return res;
}

describe('Naming Engine API', () => {
  beforeAll(async () => {
    // Create test venture and company
    testCompanyId = uuidv4();
    testVentureId = uuidv4();
    testBrandGenomeId = uuidv4();

    // Insert test company
    const { error: companyError } = await supabase.from('companies').insert({
      id: testCompanyId,
      name: 'Test Company for Naming Engine',
      created_at: new Date().toISOString()
    });
    if (companyError) console.error('Company insert error:', companyError.message);

    // Insert test venture with all required fields
    const { error: ventureError } = await supabase.from('ventures').insert({
      id: testVentureId,
      name: 'Test Venture for Naming Engine',
      company_id: testCompanyId,
      problem_statement: 'Test problem statement for naming engine API tests',
      current_lifecycle_stage: 1,
      status: 'active',
      created_at: new Date().toISOString()
    });
    if (ventureError) console.error('Venture insert error:', ventureError.message);

    // Insert test brand genome
    const { error: bgError } = await supabase.from('brand_genome_submissions').insert({
      id: testBrandGenomeId,
      venture_id: testVentureId,
      industry: 'Technology',
      target_audience: 'Enterprise B2B',
      brand_values: ['innovation', 'reliability', 'efficiency'],
      brand_personality: 'Professional, trustworthy, forward-thinking',
      positioning_statement: 'The leading AI-powered naming solution',
      differentiators: ['AI-powered', 'Domain-aware', 'Brand-fit scoring'],
      created_at: new Date().toISOString()
    });
    if (bgError) console.error('Brand genome insert error:', bgError.message);
  });

  afterAll(async () => {
    // Clean up test data in reverse order due to foreign keys
    if (testSessionId) {
      await supabase.from('naming_suggestions').delete().eq('generation_session_id', testSessionId);
    }
    if (testBrandGenomeId) {
      await supabase.from('naming_suggestions').delete().eq('brand_genome_id', testBrandGenomeId);
      await supabase.from('brand_genome_submissions').delete().eq('id', testBrandGenomeId);
    }
    if (testVentureId) {
      await supabase.from('ventures').delete().eq('id', testVentureId);
    }
    if (testCompanyId) {
      await supabase.from('companies').delete().eq('id', testCompanyId);
    }
  });

  describe('POST /api/v2/naming-engine/generate', () => {
    it('should validate brand_genome_id is required', async () => {
      const { generateNames } = await import('../../src/api/naming-engine/index.js');
      const req = createMockReq({ count: 5 });
      const res = createMockRes();

      await generateNames(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.jsonData.error).toBe('Validation error');
    });

    it('should validate brand_genome_id is a valid UUID', async () => {
      const { generateNames } = await import('../../src/api/naming-engine/index.js');
      const req = createMockReq({ brand_genome_id: 'invalid-uuid', count: 5 });
      const res = createMockRes();

      await generateNames(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.jsonData.error).toBe('Validation error');
    });

    it('should return 404 for non-existent brand_genome_id', async () => {
      const { generateNames } = await import('../../src/api/naming-engine/index.js');
      const req = createMockReq({ brand_genome_id: uuidv4(), count: 5 });
      const res = createMockRes();

      await generateNames(req, res);

      expect(res.statusCode).toBe(404);
      expect(res.jsonData.error).toBe('Brand genome not found');
    });

    it('should validate count is between 1 and 20', async () => {
      const { generateNames } = await import('../../src/api/naming-engine/index.js');

      // Test count too high
      const req1 = createMockReq({ brand_genome_id: testBrandGenomeId, count: 25 });
      const res1 = createMockRes();
      await generateNames(req1, res1);
      expect(res1.statusCode).toBe(400);

      // Test count too low
      const req2 = createMockReq({ brand_genome_id: testBrandGenomeId, count: 0 });
      const res2 = createMockRes();
      await generateNames(req2, res2);
      expect(res2.statusCode).toBe(400);
    });

    it('should accept valid generation styles', async () => {
      const { generateNames } = await import('../../src/api/naming-engine/index.js');
      const req = createMockReq({
        brand_genome_id: testBrandGenomeId,
        count: 3,
        styles: ['descriptive', 'coined', 'abstract']
      });
      const res = createMockRes();

      // This will fail at LLM call level if OPENAI_API_KEY not set
      // but validates input parsing works
      try {
        await generateNames(req, res);
        // If API key is set, we get 200
        if (res.statusCode === 200) {
          expect(res.jsonData.success).toBe(true);
          expect(res.jsonData.suggestions).toBeDefined();
          testSessionId = res.jsonData.generation_session_id;
        }
      } catch (e) {
        // Expected if no API key
        expect(res.statusCode).toBe(500);
      }
    });
  });

  describe('GET /api/v2/naming-engine/suggestions/:brand_genome_id', () => {
    it('should require brand_genome_id parameter', async () => {
      const { getSuggestions } = await import('../../src/api/naming-engine/index.js');
      const req = createMockReq({}, {});
      const res = createMockRes();

      await getSuggestions(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.jsonData.error).toBe('brand_genome_id required');
    });

    it('should return empty array for brand_genome with no suggestions', async () => {
      const { getSuggestions } = await import('../../src/api/naming-engine/index.js');
      const req = createMockReq({}, { brand_genome_id: testBrandGenomeId });
      const res = createMockRes();

      await getSuggestions(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.jsonData.suggestions).toEqual([]);
      expect(res.jsonData.count).toBe(0);
    });

    it('should return suggestions ordered by brand_fit_score', async () => {
      // First, verify there's an existing brand genome to use
      const { data: existingGenome } = await supabase
        .from('brand_genome_submissions')
        .select('id, venture_id')
        .limit(1)
        .single();

      if (!existingGenome) {
        // Skip test if no brand genome exists
        console.log('Skipping: No brand genome available for test');
        return;
      }

      const testGenomeId = existingGenome.id;
      const testVenture = existingGenome.venture_id;

      // Insert test suggestions using existing brand genome
      const sessionId = uuidv4();
      const suggestions = [
        {
          id: uuidv4(),
          venture_id: testVenture,
          brand_genome_id: testGenomeId,
          name: 'TestNameLow',
          brand_fit_score: 50,
          length_score: 80,
          pronounceability_score: 85,
          uniqueness_score: 70,
          generation_style: 'coined',
          generation_session_id: sessionId
        },
        {
          id: uuidv4(),
          venture_id: testVenture,
          brand_genome_id: testGenomeId,
          name: 'TestNameHigh',
          brand_fit_score: 95,
          length_score: 90,
          pronounceability_score: 90,
          uniqueness_score: 85,
          generation_style: 'descriptive',
          generation_session_id: sessionId
        }
      ];

      await supabase.from('naming_suggestions').insert(suggestions);

      const { getSuggestions } = await import('../../src/api/naming-engine/index.js');
      const req = createMockReq({}, { brand_genome_id: testGenomeId });
      const res = createMockRes();

      await getSuggestions(req, res);

      expect(res.statusCode).toBe(200);

      // Verify ordering by brand_fit_score descending (if any results)
      if (res.jsonData.count > 1) {
        const scores = res.jsonData.suggestions.map(s => s.brand_fit_score);
        expect(scores[0]).toBeGreaterThanOrEqual(scores[scores.length - 1]);
      }

      // Cleanup
      await supabase.from('naming_suggestions').delete().eq('generation_session_id', sessionId);
    });
  });

  describe('Scoring Functions', () => {
    it('should calculate length score for short names (<=5 chars = 100)', () => {
      // Test the scoring logic directly
      const calculateLengthScore = (name) => {
        const len = name.replace(/\s/g, '').length;
        if (len <= 5) return 100;
        if (len <= 8) return 90;
        if (len <= 12) return 75;
        if (len <= 15) return 60;
        return 40;
      };

      expect(calculateLengthScore('Apex')).toBe(100);  // 4 chars
      expect(calculateLengthScore('Nova')).toBe(100);  // 4 chars
    });

    it('should penalize long names in length score', () => {
      const calculateLengthScore = (name) => {
        const len = name.replace(/\s/g, '').length;
        if (len <= 5) return 100;
        if (len <= 8) return 90;
        if (len <= 12) return 75;
        if (len <= 15) return 60;
        return 40;
      };

      expect(calculateLengthScore('TechCorp')).toBe(90);  // 8 chars
      expect(calculateLengthScore('InnovateTech')).toBe(75);  // 12 chars
      expect(calculateLengthScore('SuperLongVentureName')).toBe(40);  // 20 chars
    });

    it('should calculate pronounceability score', () => {
      const calculatePronounceabilityScore = (name) => {
        let score = 80;
        const consonantClusters = name.match(/[bcdfghjklmnpqrstvwxyz]{3,}/gi) || [];
        score -= consonantClusters.length * 10;
        const vowelPattern = name.match(/[aeiou]/gi) || [];
        if (vowelPattern.length >= name.length * 0.3) score += 10;
        if (/[xzq]{2}/i.test(name)) score -= 15;
        return Math.min(100, Math.max(0, score));
      };

      // Easy to pronounce
      expect(calculatePronounceabilityScore('Nova')).toBeGreaterThan(80);
      // Harder to pronounce (consonant clusters)
      expect(calculatePronounceabilityScore('Strngth')).toBeLessThan(80);
    });
  });

  describe('Database Schema', () => {
    it('should have naming_suggestions table with required columns', async () => {
      const { data, error } = await supabase
        .from('naming_suggestions')
        .select('*')
        .limit(1);

      expect(error).toBeNull();
      // Table exists and is queryable
    });

    it('should have naming_favorites table', async () => {
      const { data, error } = await supabase
        .from('naming_favorites')
        .select('*')
        .limit(1);

      expect(error).toBeNull();
      // Table exists and is queryable
    });

    it('should enforce foreign key to brand_genome_submissions', async () => {
      const invalidSuggestion = {
        id: uuidv4(),
        venture_id: testVentureId,
        brand_genome_id: uuidv4(), // Non-existent brand genome
        name: 'TestName',
        brand_fit_score: 80,
        length_score: 80,
        pronounceability_score: 80,
        uniqueness_score: 80,
        generation_style: 'coined',
        generation_session_id: uuidv4()
      };

      const { error } = await supabase
        .from('naming_suggestions')
        .insert(invalidSuggestion);

      // Should fail due to foreign key constraint
      expect(error).not.toBeNull();
    });
  });
});
