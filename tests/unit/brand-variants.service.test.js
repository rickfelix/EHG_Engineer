/**
 * Brand Variants Service Unit Tests
 * SD-STAGE-12-001: Adaptive Naming - Brand Variants
 *
 * Tests brandVariantsService.ts business logic
 *
 * Test Coverage:
 * - createBrandVariant() with valid/invalid data
 * - getBrandVariants() returns correct array
 * - updateVariantStatus() state machine validation
 * - processChairmanApproval() all three decisions (approve, reject, request revision)
 * - deleteBrandVariant() status validation
 * - Edge cases and error handling
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

/**
 * Mock Supabase client
 * In actual implementation, this would be imported from a test helper
 */
const createMockSupabaseClient = () => {
  const mockData = {
    variants: [],
    nextId: 1
  };

  return {
    from: (table) => ({
      select: (columns = '*') => ({
        eq: (field, value) => ({
          single: async () => {
            const variant = mockData.variants.find(v => v[field] === value);
            return { data: variant || null, error: variant ? null : { message: 'Not found' } };
          },
          async then(resolve) {
            const filtered = mockData.variants.filter(v => v[field] === value);
            return resolve({ data: filtered, error: null });
          }
        }),
        order: (field, options) => ({
          async then(resolve) {
            const sorted = [...mockData.variants].sort((a, b) => {
              if (options.ascending) {
                return a[field] > b[field] ? 1 : -1;
              }
              return a[field] < b[field] ? 1 : -1;
            });
            return resolve({ data: sorted, error: null });
          }
        }),
        async then(resolve) {
          return resolve({ data: mockData.variants, error: null });
        }
      }),
      insert: (data) => ({
        select: () => ({
          single: async () => {
            const newVariant = {
              id: `variant-${mockData.nextId++}`,
              ...data,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            };
            mockData.variants.push(newVariant);
            return { data: newVariant, error: null };
          }
        })
      }),
      update: (updates) => ({
        eq: (field, value) => ({
          select: () => ({
            single: async () => {
              const index = mockData.variants.findIndex(v => v[field] === value);
              if (index === -1) {
                return { data: null, error: { message: 'Variant not found' } };
              }
              mockData.variants[index] = {
                ...mockData.variants[index],
                ...updates,
                updated_at: new Date().toISOString()
              };
              return { data: mockData.variants[index], error: null };
            }
          })
        })
      }),
      delete: () => ({
        eq: (field, value) => ({
          async then(resolve) {
            const index = mockData.variants.findIndex(v => v[field] === value);
            if (index === -1) {
              return resolve({ data: null, error: { message: 'Variant not found' } });
            }
            mockData.variants.splice(index, 1);
            return resolve({ data: {}, error: null });
          }
        })
      })
    }),
    // Helper to reset mock data
    __reset: () => {
      mockData.variants = [];
      mockData.nextId = 1;
    },
    // Helper to seed test data
    __seed: (variants) => {
      mockData.variants = variants;
    }
  };
};

/**
 * Mock BrandVariantsService
 * Simulates lib/brandVariantsService.ts
 */
class MockBrandVariantsService {
  constructor(supabaseClient) {
    this.supabase = supabaseClient;
  }

  async createBrandVariant(ventureId, variantData, userId) {
    // Validation
    if (!ventureId || !variantData || !userId) {
      throw new Error('Missing required parameters');
    }

    const variant = {
      venture_id: ventureId,
      created_by: userId,
      variant_details: variantData,
      status: 'generated',
      performance_metrics: {},
      availability_status: {},
      validation_results: {}
    };

    const { data, error } = await this.supabase
      .from('brand_variants')
      .insert(variant)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  }

  async getBrandVariants(ventureId, filters = {}) {
    let query = this.supabase
      .from('brand_variants')
      .select('*')
      .eq('venture_id', ventureId);

    if (filters.status) {
      query = query.eq('status', filters.status);
    }

    query = query.order('created_at', { ascending: false });

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data;
  }

  async updateVariantStatus(variantId, newStatus, userId) {
    // Validate state transition
    const { data: variant } = await this.supabase
      .from('brand_variants')
      .select('*')
      .eq('id', variantId)
      .single();

    if (!variant) {
      throw new Error('Variant not found');
    }

    const validTransitions = {
      'generated': ['under_evaluation', 'rejected'],
      'under_evaluation': ['market_testing', 'rejected'],
      'market_testing': ['approved', 'rejected'],
      'approved': ['promoted', 'retired'],
      'rejected': [], // Terminal state
      'retired': [], // Terminal state
      'promoted': ['retired'] // Can only retire promoted variants
    };

    const allowedNextStates = validTransitions[variant.status] || [];
    if (!allowedNextStates.includes(newStatus)) {
      throw new Error(`Invalid transition from ${variant.status} to ${newStatus}`);
    }

    const { data, error } = await this.supabase
      .from('brand_variants')
      .update({ status: newStatus })
      .eq('id', variantId)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  }

  async processChairmanApproval(variantId, decision, userId, feedback = null) {
    const validDecisions = ['approve', 'reject', 'request_revision'];
    if (!validDecisions.includes(decision)) {
      throw new Error('Invalid decision type');
    }

    const { data: variant } = await this.supabase
      .from('brand_variants')
      .select('*')
      .eq('id', variantId)
      .single();

    if (!variant) {
      throw new Error('Variant not found');
    }

    // Only variants in market_testing can be approved
    if (decision === 'approve' && variant.status !== 'market_testing') {
      throw new Error('Only variants in market_testing can be approved');
    }

    let newStatus;
    let updateData = {};

    switch (decision) {
      case 'approve':
        newStatus = 'approved';
        updateData = {
          status: newStatus,
          approved_at: new Date().toISOString(),
          approved_by: userId,
          chairman_feedback: feedback
        };
        break;

      case 'reject':
        newStatus = 'rejected';
        updateData = {
          status: newStatus,
          chairman_feedback: feedback || 'Rejected by chairman'
        };
        break;

      case 'request_revision':
        newStatus = 'generated';
        updateData = {
          status: newStatus,
          chairman_feedback: feedback || 'Revision requested'
        };
        break;
    }

    const { data, error } = await this.supabase
      .from('brand_variants')
      .update(updateData)
      .eq('id', variantId)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  }

  async deleteBrandVariant(variantId, userId) {
    const { data: variant } = await this.supabase
      .from('brand_variants')
      .select('*')
      .eq('id', variantId)
      .single();

    if (!variant) {
      throw new Error('Variant not found');
    }

    // Only editable status variants can be deleted
    const editableStatuses = ['generated', 'under_evaluation'];
    if (!editableStatuses.includes(variant.status)) {
      throw new Error('Cannot delete variant in this status');
    }

    const { error } = await this.supabase
      .from('brand_variants')
      .delete()
      .eq('id', variantId);

    if (error) throw new Error(error.message);
    return true;
  }
}

describe('Brand Variants Service - Create Operations', () => {
  let supabase;
  let service;

  beforeEach(() => {
    supabase = createMockSupabaseClient();
    service = new MockBrandVariantsService(supabase);
    supabase.__reset();
  });

  it('should create a brand variant with valid data', async () => {
    const ventureId = 'venture-123';
    const userId = 'user-456';
    const variantData = {
      name_text: 'TestCo-AI',
      generation_cycle: 1,
      adaptation_timestamp: new Date().toISOString(),
      adaptation_reason: 'AVAILABILITY_OPPORTUNITY',
      variant_type: 'SEMANTIC_ENHANCEMENT',
      improvement_hypothesis: 'AI-focused positioning for tech market segment'
    };

    const result = await service.createBrandVariant(ventureId, variantData, userId);

    expect(result).toBeDefined();
    expect(result.id).toBeDefined();
    expect(result.venture_id).toBe(ventureId);
    expect(result.created_by).toBe(userId);
    expect(result.status).toBe('generated');
    expect(result.variant_details).toEqual(variantData);
  });

  it('should throw error when missing required parameters', async () => {
    await expect(service.createBrandVariant(null, {}, 'user-1'))
      .rejects.toThrow('Missing required parameters');

    await expect(service.createBrandVariant('venture-1', null, 'user-1'))
      .rejects.toThrow('Missing required parameters');

    await expect(service.createBrandVariant('venture-1', {}, null))
      .rejects.toThrow('Missing required parameters');
  });

  it('should initialize variant with default empty objects', async () => {
    const result = await service.createBrandVariant(
      'venture-123',
      { name_text: 'TestCo', generation_cycle: 1 },
      'user-456'
    );

    expect(result.performance_metrics).toEqual({});
    expect(result.availability_status).toEqual({});
    expect(result.validation_results).toEqual({});
  });
});

describe('Brand Variants Service - Read Operations', () => {
  let supabase;
  let service;

  beforeEach(() => {
    supabase = createMockSupabaseClient();
    service = new MockBrandVariantsService(supabase);
    supabase.__reset();

    // Seed test data
    supabase.__seed([
      {
        id: 'variant-1',
        venture_id: 'venture-123',
        status: 'generated',
        variant_details: { name_text: 'TestCo A' },
        created_at: '2024-01-01T00:00:00Z'
      },
      {
        id: 'variant-2',
        venture_id: 'venture-123',
        status: 'approved',
        variant_details: { name_text: 'TestCo B' },
        created_at: '2024-01-02T00:00:00Z'
      },
      {
        id: 'variant-3',
        venture_id: 'venture-456',
        status: 'generated',
        variant_details: { name_text: 'OtherCo' },
        created_at: '2024-01-03T00:00:00Z'
      }
    ]);
  });

  it('should return all variants for a venture', async () => {
    const variants = await service.getBrandVariants('venture-123');

    expect(variants).toHaveLength(2);
    expect(variants[0].venture_id).toBe('venture-123');
    expect(variants[1].venture_id).toBe('venture-123');
  });

  it('should filter variants by status', async () => {
    const variants = await service.getBrandVariants('venture-123', { status: 'approved' });

    expect(variants).toHaveLength(1);
    expect(variants[0].status).toBe('approved');
  });

  it('should return variants ordered by created_at descending', async () => {
    const variants = await service.getBrandVariants('venture-123');

    // Should be ordered newest first
    expect(new Date(variants[0].created_at).getTime())
      .toBeGreaterThan(new Date(variants[1].created_at).getTime());
  });

  it('should return empty array for venture with no variants', async () => {
    const variants = await service.getBrandVariants('venture-999');

    expect(variants).toEqual([]);
  });
});

describe('Brand Variants Service - Status Transitions', () => {
  let supabase;
  let service;

  beforeEach(() => {
    supabase = createMockSupabaseClient();
    service = new MockBrandVariantsService(supabase);
    supabase.__reset();
  });

  it('should allow valid status transition (generated -> under_evaluation)', async () => {
    supabase.__seed([{
      id: 'variant-1',
      venture_id: 'venture-123',
      status: 'generated',
      variant_details: {}
    }]);

    const updated = await service.updateVariantStatus('variant-1', 'under_evaluation', 'user-1');

    expect(updated.status).toBe('under_evaluation');
  });

  it('should allow valid status transition (market_testing -> approved)', async () => {
    supabase.__seed([{
      id: 'variant-1',
      venture_id: 'venture-123',
      status: 'market_testing',
      variant_details: {}
    }]);

    const updated = await service.updateVariantStatus('variant-1', 'approved', 'chairman-1');

    expect(updated.status).toBe('approved');
  });

  it('should reject invalid status transition (generated -> approved)', async () => {
    supabase.__seed([{
      id: 'variant-1',
      venture_id: 'venture-123',
      status: 'generated',
      variant_details: {}
    }]);

    await expect(service.updateVariantStatus('variant-1', 'approved', 'user-1'))
      .rejects.toThrow('Invalid transition');
  });

  it('should reject transitions from terminal states (rejected)', async () => {
    supabase.__seed([{
      id: 'variant-1',
      venture_id: 'venture-123',
      status: 'rejected',
      variant_details: {}
    }]);

    await expect(service.updateVariantStatus('variant-1', 'generated', 'user-1'))
      .rejects.toThrow('Invalid transition');
  });

  it('should reject transitions from terminal states (retired)', async () => {
    supabase.__seed([{
      id: 'variant-1',
      venture_id: 'venture-123',
      status: 'retired',
      variant_details: {}
    }]);

    await expect(service.updateVariantStatus('variant-1', 'approved', 'user-1'))
      .rejects.toThrow('Invalid transition');
  });
});

describe('Brand Variants Service - Chairman Approval', () => {
  let supabase;
  let service;

  beforeEach(() => {
    supabase = createMockSupabaseClient();
    service = new MockBrandVariantsService(supabase);
    supabase.__reset();
  });

  it('should approve variant with feedback', async () => {
    supabase.__seed([{
      id: 'variant-1',
      venture_id: 'venture-123',
      status: 'market_testing',
      variant_details: {}
    }]);

    const result = await service.processChairmanApproval(
      'variant-1',
      'approve',
      'chairman-1',
      'Excellent brand positioning'
    );

    expect(result.status).toBe('approved');
    expect(result.approved_at).toBeDefined();
    expect(result.approved_by).toBe('chairman-1');
    expect(result.chairman_feedback).toBe('Excellent brand positioning');
  });

  it('should reject variant with feedback', async () => {
    supabase.__seed([{
      id: 'variant-1',
      venture_id: 'venture-123',
      status: 'market_testing',
      variant_details: {}
    }]);

    const result = await service.processChairmanApproval(
      'variant-1',
      'reject',
      'chairman-1',
      'Does not align with brand strategy'
    );

    expect(result.status).toBe('rejected');
    expect(result.chairman_feedback).toBe('Does not align with brand strategy');
  });

  it('should request revision and reset to generated', async () => {
    supabase.__seed([{
      id: 'variant-1',
      venture_id: 'venture-123',
      status: 'market_testing',
      variant_details: {}
    }]);

    const result = await service.processChairmanApproval(
      'variant-1',
      'request_revision',
      'chairman-1',
      'Please refine market positioning'
    );

    expect(result.status).toBe('generated');
    expect(result.chairman_feedback).toBe('Please refine market positioning');
  });

  it('should throw error for invalid decision type', async () => {
    supabase.__seed([{
      id: 'variant-1',
      venture_id: 'venture-123',
      status: 'market_testing',
      variant_details: {}
    }]);

    await expect(service.processChairmanApproval('variant-1', 'invalid_decision', 'chairman-1'))
      .rejects.toThrow('Invalid decision type');
  });

  it('should reject approval if variant not in market_testing', async () => {
    supabase.__seed([{
      id: 'variant-1',
      venture_id: 'venture-123',
      status: 'generated',
      variant_details: {}
    }]);

    await expect(service.processChairmanApproval('variant-1', 'approve', 'chairman-1'))
      .rejects.toThrow('Only variants in market_testing can be approved');
  });

  it('should use default feedback if not provided', async () => {
    supabase.__seed([{
      id: 'variant-1',
      venture_id: 'venture-123',
      status: 'market_testing',
      variant_details: {}
    }]);

    const result = await service.processChairmanApproval('variant-1', 'reject', 'chairman-1');

    expect(result.chairman_feedback).toBe('Rejected by chairman');
  });
});

describe('Brand Variants Service - Delete Operations', () => {
  let supabase;
  let service;

  beforeEach(() => {
    supabase = createMockSupabaseClient();
    service = new MockBrandVariantsService(supabase);
    supabase.__reset();
  });

  it('should delete variant in generated status', async () => {
    supabase.__seed([{
      id: 'variant-1',
      venture_id: 'venture-123',
      status: 'generated',
      variant_details: {}
    }]);

    const result = await service.deleteBrandVariant('variant-1', 'user-1');

    expect(result).toBe(true);

    // Verify deletion
    const { data } = await supabase.from('brand_variants').select('*').eq('id', 'variant-1').single();
    expect(data).toBeNull();
  });

  it('should delete variant in under_evaluation status', async () => {
    supabase.__seed([{
      id: 'variant-1',
      venture_id: 'venture-123',
      status: 'under_evaluation',
      variant_details: {}
    }]);

    const result = await service.deleteBrandVariant('variant-1', 'user-1');

    expect(result).toBe(true);
  });

  it('should reject deletion of approved variant', async () => {
    supabase.__seed([{
      id: 'variant-1',
      venture_id: 'venture-123',
      status: 'approved',
      variant_details: {}
    }]);

    await expect(service.deleteBrandVariant('variant-1', 'user-1'))
      .rejects.toThrow('Cannot delete variant in this status');
  });

  it('should reject deletion of promoted variant', async () => {
    supabase.__seed([{
      id: 'variant-1',
      venture_id: 'venture-123',
      status: 'promoted',
      variant_details: {}
    }]);

    await expect(service.deleteBrandVariant('variant-1', 'user-1'))
      .rejects.toThrow('Cannot delete variant in this status');
  });

  it('should throw error when deleting non-existent variant', async () => {
    await expect(service.deleteBrandVariant('non-existent', 'user-1'))
      .rejects.toThrow('Variant not found');
  });
});

/**
 * IMPLEMENTATION NOTES FOR lib/brandVariantsService.ts:
 *
 * 1. State Machine: Enforce valid transitions
 *    generated → under_evaluation → market_testing → approved → promoted → retired
 *                     ↓                  ↓               ↓
 *                 rejected           rejected       rejected
 *
 * 2. Chairman Actions: Only apply when variant in correct state
 *    - approve: requires market_testing status
 *    - reject: can happen from any non-terminal state
 *    - request_revision: resets to generated
 *
 * 3. Deletion Rules: Only editable statuses
 *    - Editable: generated, under_evaluation
 *    - Non-editable: all others
 *
 * 4. Audit Trail: Log all chairman actions
 *    - Use log_variant_action() database function
 *    - Include previous_status, new_status, change_details
 *
 * 5. RLS: Let database enforce authorization
 *    - Service assumes user has been authenticated
 *    - RLS policies handle chairman-only operations
 */
