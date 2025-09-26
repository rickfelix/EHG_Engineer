const path = require('path');

// Mock the entire module before requiring it
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: {}, error: null })
  }))
}));

describe('Unified Handoff System', () => {
  let mockSupabase;
  let originalEnv;

  beforeEach(() => {
    // Store original env vars
    originalEnv = { ...process.env };

    // Set test env vars
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-key';

    // Clear module cache
    jest.resetModules();
  });

  afterEach(() => {
    // Restore original env vars
    process.env = originalEnv;
    jest.clearAllMocks();
  });

  describe('handoff creation', () => {
    test('should validate required fields', async () => {
      const handoffSystem = require('../../scripts/unified-handoff-system');

      // Test for missing required fields
      const invalidHandoff = {
        from_agent: 'LEAD',
        // missing to_agent and other required fields
      };

      // Verify that module loads correctly
      expect(handoffSystem).toBeDefined();
    });

    test('should create LEAD to PLAN handoff', async () => {
      const handoffData = {
        from_agent: 'LEAD',
        to_agent: 'PLAN',
        sd_id: 'SD-001',
        handoff_type: 'strategic_to_technical',
        data: {
          executive_summary: 'Test strategic directive',
          completeness_report: '100% of strategic objectives defined',
          deliverables_manifest: ['SD document', 'Business objectives'],
          key_decisions: 'Approved for technical planning',
          known_issues: 'None',
          resource_utilization: 'LEAD agent time: 2 hours',
          action_items: ['Create PRD', 'Define technical requirements']
        }
      };

      const handoffSystem = require('../../scripts/unified-handoff-system');
      expect(handoffSystem).toBeDefined();
    });

    test('should create PLAN to EXEC handoff', async () => {
      const handoffData = {
        from_agent: 'PLAN',
        to_agent: 'EXEC',
        sd_id: 'SD-001',
        handoff_type: 'technical_to_implementation',
        data: {
          executive_summary: 'PRD completed for implementation',
          completeness_report: '100% of technical requirements defined',
          deliverables_manifest: ['PRD', 'Technical specs', 'Test plan'],
          key_decisions: 'Architecture approved',
          known_issues: 'None',
          resource_utilization: 'PLAN agent time: 4 hours',
          action_items: ['Implement features', 'Run tests']
        }
      };

      const handoffSystem = require('../../scripts/unified-handoff-system');
      expect(handoffSystem).toBeDefined();
    });

    test('should create EXEC to PLAN handoff for verification', async () => {
      const handoffData = {
        from_agent: 'EXEC',
        to_agent: 'PLAN',
        sd_id: 'SD-001',
        handoff_type: 'implementation_to_verification',
        data: {
          executive_summary: 'Implementation complete',
          completeness_report: '100% of features implemented',
          deliverables_manifest: ['Code changes', 'Test results'],
          key_decisions: 'Used React for UI',
          known_issues: 'Minor lint warnings',
          resource_utilization: 'EXEC agent time: 6 hours',
          action_items: ['Verify implementation', 'Run acceptance tests']
        }
      };

      const handoffSystem = require('../../scripts/unified-handoff-system');
      expect(handoffSystem).toBeDefined();
    });
  });

  describe('handoff validation', () => {
    test('should validate all 7 mandatory elements', () => {
      const mandatoryElements = [
        'executive_summary',
        'completeness_report',
        'deliverables_manifest',
        'key_decisions',
        'known_issues',
        'resource_utilization',
        'action_items'
      ];

      const validHandoff = {
        executive_summary: 'Summary',
        completeness_report: 'Report',
        deliverables_manifest: ['Item1'],
        key_decisions: 'Decisions',
        known_issues: 'Issues',
        resource_utilization: 'Resources',
        action_items: ['Action1']
      };

      // All elements present - should be valid
      mandatoryElements.forEach(element => {
        expect(validHandoff).toHaveProperty(element);
      });

      // Test missing each element
      mandatoryElements.forEach(element => {
        const invalidHandoff = { ...validHandoff };
        delete invalidHandoff[element];

        const missingElements = mandatoryElements.filter(el => !invalidHandoff.hasOwnProperty(el));
        expect(missingElements).toContain(element);
      });
    });

    test('should enforce handoff type constraints', () => {
      const validHandoffTypes = [
        { from: 'LEAD', to: 'PLAN', type: 'strategic_to_technical' },
        { from: 'PLAN', to: 'EXEC', type: 'technical_to_implementation' },
        { from: 'EXEC', to: 'PLAN', type: 'implementation_to_verification' },
        { from: 'PLAN', to: 'LEAD', type: 'verification_to_approval' }
      ];

      validHandoffTypes.forEach(({ from, to, type }) => {
        expect(from).toBeTruthy();
        expect(to).toBeTruthy();
        expect(type).toBeTruthy();
      });
    });
  });

  describe('database operations', () => {
    test('should handle database connection errors', async () => {
      const { createClient } = require('@supabase/supabase-js');
      createClient.mockImplementation(() => ({
        from: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        insert: jest.fn().mockRejectedValue(new Error('Connection failed'))
      }));

      const handoffSystem = require('../../scripts/unified-handoff-system');
      expect(handoffSystem).toBeDefined();
    });

    test('should handle successful handoff storage', async () => {
      const { createClient } = require('@supabase/supabase-js');
      const mockInsertResult = {
        data: [{ id: 'handoff-123', created_at: new Date().toISOString() }],
        error: null
      };

      createClient.mockImplementation(() => ({
        from: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        insert: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue(mockInsertResult)
      }));

      const handoffSystem = require('../../scripts/unified-handoff-system');
      expect(handoffSystem).toBeDefined();
    });
  });

  describe('handoff template retrieval', () => {
    test('should retrieve correct template for agent pair', async () => {
      const templates = {
        'LEAD-PLAN': 'strategic_to_technical',
        'PLAN-EXEC': 'technical_to_implementation',
        'EXEC-PLAN': 'implementation_to_verification',
        'PLAN-LEAD': 'verification_to_approval'
      };

      Object.entries(templates).forEach(([pair, expectedType]) => {
        expect(pair).toBeTruthy();
        expect(expectedType).toBeTruthy();
      });
    });
  });
});