/**
 * JSONB Schema Definitions for product_requirements_v2 table
 * SD-MAN-ORCH-VISION-ARCHITECTURE-HARDENING-001-E
 */

export const PRODUCT_REQUIREMENTS_SCHEMAS = {
  functional_requirements: {
    type: 'array',
    required: true,
    minItems: 1,
    items: {
      properties: {
        id: { type: 'string', required: true },
        requirement: { type: 'string', required: true },
      },
    },
  },

  technical_requirements: {
    type: 'array',
    required: false,
    items: {
      properties: {
        id: { type: 'string', required: true },
        requirement: { type: 'string', required: true },
      },
    },
  },

  acceptance_criteria: {
    type: 'array',
    required: false,
    items: {
      properties: {},
    },
  },

  test_scenarios: {
    type: 'array',
    required: false,
    items: {
      properties: {
        id: { type: 'string', required: true },
        scenario: { type: 'string', required: true },
      },
    },
  },

  risks: {
    type: 'array',
    required: false,
    items: {
      properties: {
        risk: { type: 'string', required: true },
      },
    },
  },

  system_architecture: {
    type: 'object',
    required: false,
    properties: {
      components: { type: 'array' },
      data_flow: { type: 'string' },
    },
  },

  dependencies: {
    type: 'array',
    required: false,
    items: {
      properties: {},
    },
  },
};

/**
 * Register all product_requirements_v2 schemas with a registry
 * @param {import('../jsonb-schema-registry.js').JsonbSchemaRegistry} registry
 */
export function registerProductRequirementsSchemas(registry) {
  const table = 'product_requirements_v2';
  for (const [field, schema] of Object.entries(PRODUCT_REQUIREMENTS_SCHEMAS)) {
    registry.register(table, field, schema);
  }
}
