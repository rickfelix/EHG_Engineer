/**
 * Validator Context Factory
 * SD-LEO-INFRA-HANDOFF-VALIDATOR-REGISTRY-001
 *
 * Generates test contexts for handoff gate validators.
 * Provides defaults that pass validation, with override support for testing failures.
 */

/**
 * Create a mock SD record with sensible defaults.
 * @param {Object} overrides - Fields to override
 * @returns {Object} SD record
 */
export function createMockSD(overrides = {}) {
  return {
    id: 'SD-TEST-001',
    sd_key: 'SD-TEST-001',
    uuid_id: '00000000-0000-0000-0000-000000000001',
    title: 'Test Strategic Directive',
    description: 'A comprehensive test directive that validates the handoff system behavior across multiple phases with sufficient detail to pass word count requirements for all SD types.',
    sd_type: 'infrastructure',
    priority: 'high',
    status: 'draft',
    current_phase: 'LEAD',
    target_application: 'EHG_Engineer',
    scope: 'scripts/modules/handoff/',
    success_criteria: [
      { criterion: 'All validators pass', measure: 'Gate score >= 80%' },
      { criterion: 'Tests created', measure: 'Coverage > 80%' },
    ],
    key_changes: [
      { change: 'Add unit test files', impact: 'Improved test coverage' },
      { change: 'Create test fixtures', impact: 'Reusable test infrastructure' },
    ],
    strategic_objectives: [
      { objective: 'Improve gate reliability', target: '100% validator coverage' },
    ],
    dependencies: [],
    risks: [
      { risk: 'Test flakiness', mitigation: 'Mock all external calls' },
    ],
    delivers_capabilities: [],
    parent_sd_id: null,
    progress: 0,
    ...overrides,
  };
}

/**
 * Create a mock PRD record.
 * @param {Object} overrides - Fields to override
 * @returns {Object} PRD record
 */
export function createMockPRD(overrides = {}) {
  return {
    id: '00000000-0000-0000-0000-000000000002',
    directive_id: 'SD-TEST-001',
    sd_id: 'SD-TEST-001',
    title: 'Test PRD',
    status: 'approved',
    executive_summary: 'Test PRD for unit testing handoff validators.',
    functional_requirements: [
      { id: 'FR-001', title: 'Test requirement', description: 'A test', acceptance_criteria: ['works'], priority: 'critical' },
    ],
    technical_requirements: [
      { id: 'TR-001', title: 'Vitest', description: 'Use vitest for testing.' },
    ],
    system_architecture: {
      components: [{ name: 'Test', description: 'Test component' }],
    },
    test_scenarios: [
      { id: 'TS-001', scenario: 'Pass test', expected: 'Passes' },
    ],
    acceptance_criteria: ['Tests pass'],
    implementation_approach: 'Standard implementation approach with tests.',
    risks: [{ risk: 'None', impact: 'low', mitigation: 'N/A' }],
    ...overrides,
  };
}

/**
 * Create a mock validator context (passed to gate validator functions).
 * @param {Object} overrides - Fields to override
 * @returns {Object} Validator context
 */
export function createValidatorContext(overrides = {}) {
  const sd = createMockSD(overrides.sd);
  const prd = createMockPRD(overrides.prd);
  return {
    sd,
    sdId: sd.id,
    _prd: prd,
    handoffType: overrides.handoffType || 'LEAD-TO-PLAN',
    ...overrides,
  };
}

/**
 * Create a mock Supabase client for testing.
 * @param {Object} config - Mock configuration
 * @returns {Object} Mock Supabase client
 */
export function createMockSupabase(config = {}) {
  const defaultSelect = { data: config.selectData || [], error: config.selectError || null };
  const defaultRpc = { data: config.rpcData || null, error: config.rpcError || null };
  const defaultUpdate = { data: null, error: config.updateError || null };

  const chainable = {
    select: () => chainable,
    eq: () => chainable,
    neq: () => chainable,
    lt: () => chainable,
    gt: () => chainable,
    in: () => chainable,
    is: () => chainable,
    order: () => chainable,
    limit: () => chainable,
    single: () => Promise.resolve(defaultSelect),
    then: (fn) => Promise.resolve(defaultSelect).then(fn),
  };

  // Make chainable itself thenable
  Object.defineProperty(chainable, 'then', {
    value: (fn) => Promise.resolve(defaultSelect).then(fn),
    writable: true,
  });

  return {
    from: () => ({
      select: () => chainable,
      update: () => ({ eq: () => Promise.resolve(defaultUpdate) }),
      insert: () => ({ select: () => Promise.resolve(defaultSelect) }),
    }),
    rpc: () => Promise.resolve(defaultRpc),
  };
}

/**
 * Assert standard validator result shape.
 * @param {Object} result - Validator result
 * @param {Object} expect - Vitest expect function
 */
export function assertValidatorResult(result, expect) {
  expect(result).toHaveProperty('pass');
  expect(result).toHaveProperty('score');
  expect(typeof result.pass).toBe('boolean');
  expect(typeof result.score).toBe('number');
  expect(result.score).toBeGreaterThanOrEqual(0);
  expect(result.score).toBeLessThanOrEqual(100);
  if (result.issues) {
    expect(Array.isArray(result.issues)).toBe(true);
  }
  if (result.warnings) {
    expect(Array.isArray(result.warnings)).toBe(true);
  }
}
