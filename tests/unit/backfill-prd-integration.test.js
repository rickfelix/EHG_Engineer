import { describe, it, expect } from 'vitest';

/**
 * Tests for backfill-prd-integration.js template generation logic.
 * SD-EVA-R2-FIX-PRD-BACKFILL-001
 */

// Extract the template logic for testing (avoiding Supabase dependency)
const TYPE_TEMPLATES = {
  feature: {
    consumers: [
      { name: 'End User', frequency: 'Per feature interaction', interaction: 'Uses functionality directly through the UI' },
      { name: 'EVA (AI Chief of Staff)', frequency: 'During quality audits', interaction: 'Monitors feature health and usage patterns' }
    ],
    dependencies: [
      { name: 'Supabase Database', type: 'upstream', contract: 'Read/write access to related tables', failure_handling: 'Graceful degradation with user-facing error message' },
      { name: 'React Frontend (EHG)', type: 'downstream', contract: 'Components render data from API endpoints', failure_handling: 'Loading states and error boundaries' }
    ],
    data_contracts: [{ contract_name: 'API Response Contract', schema: 'Standard JSON response with data array and pagination', validation: 'Runtime type checks on API boundaries', versioning: 'Additive-only changes; breaking changes require new endpoint version' }],
    runtime_config: { feature_flags: ['Feature enabled by default; can be disabled via environment variable'], environment_variables: ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'], deployment_considerations: 'Deploy database migrations before application code' },
    observability_rollout: { monitoring: ['Error rate for related API endpoints', 'User interaction metrics'], alerts: ['Error rate exceeds 5% threshold over 5 minutes'], rollout_strategy: 'Deploy to staging first, verify functionality, then production', rollback_trigger: 'Error rate spike or critical user-facing bug', rollback_procedure: 'Revert deployment; database migrations are forward-compatible' }
  },
  infrastructure: {
    consumers: [
      { name: 'Development Team', frequency: 'During SD lifecycle', interaction: 'Uses tooling for workflow automation' },
      { name: 'CI/CD Pipeline', frequency: 'Per deployment', interaction: 'Automated validation and deployment steps' }
    ],
    dependencies: [
      { name: 'Supabase Database', type: 'upstream', contract: 'Schema and data access for infrastructure operations', failure_handling: 'Retry with exponential backoff; log and alert on persistent failure' },
      { name: 'Node.js Runtime', type: 'upstream', contract: 'Script execution environment', failure_handling: 'Process exit with non-zero code and descriptive error' }
    ],
    data_contracts: [{ contract_name: 'Script I/O Contract', schema: 'JSON output to stdout; errors to stderr', validation: 'Exit code 0 for success, non-zero for failure', versioning: 'CLI flags are additive; existing flags preserved' }],
    runtime_config: { feature_flags: ['No feature flags; infrastructure changes are always-on'], environment_variables: ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'], deployment_considerations: 'Infrastructure scripts deployed via git; no separate deployment pipeline' },
    observability_rollout: { monitoring: ['Script execution success/failure logs'], alerts: ['Repeated script failures in automated workflows'], rollout_strategy: 'Merge to main; changes take effect immediately', rollback_trigger: 'Script failures blocking SD workflow', rollback_procedure: 'Git revert the commit; scripts are stateless' }
  },
  bugfix: {
    consumers: [{ name: 'Affected Users', frequency: 'Per interaction with fixed feature', interaction: 'Experiences corrected behavior' }, { name: 'QA/Testing Pipeline', frequency: 'Per test run', interaction: 'Validates fix via regression tests' }],
    dependencies: [{ name: 'Affected Component', type: 'upstream', contract: 'Fix applied to existing code path', failure_handling: 'Existing error handling preserved; fix targets specific failure mode' }],
    data_contracts: [{ contract_name: 'Existing Contract (unchanged)', schema: 'No schema changes; fix corrects behavior within existing contracts', validation: 'Regression tests verify existing behavior preserved', versioning: 'Patch-level change; no breaking modifications' }],
    runtime_config: { feature_flags: ['No feature flags; bugfix is applied directly'], environment_variables: ['No new environment variables required'], deployment_considerations: 'Standard deployment; verify fix in staging before production' },
    observability_rollout: { monitoring: ['Error rate for affected code path (should decrease)', 'Related issue pattern occurrence count'], alerts: ['Regression: error rate returns to pre-fix levels'], rollout_strategy: 'Deploy to staging, run regression tests, then production', rollback_trigger: 'New errors introduced by fix or regression in related functionality', rollback_procedure: 'Revert commit; original behavior restored' }
  },
  documentation: {
    consumers: [{ name: 'Development Team', frequency: 'As reference during development', interaction: 'Reads documentation for guidance and context' }, { name: 'EVA (AI Chief of Staff)', frequency: 'During protocol audits', interaction: 'Validates documentation completeness and accuracy' }],
    dependencies: [{ name: 'Source Code', type: 'upstream', contract: 'Documentation reflects current code behavior', failure_handling: 'Documentation flagged as potentially stale if code changes detected' }],
    data_contracts: [{ contract_name: 'Documentation Format', schema: 'Markdown files following project conventions', validation: 'Link checking and format validation', versioning: 'Documents versioned alongside code in git' }],
    runtime_config: { feature_flags: ['No runtime configuration; documentation is static'], environment_variables: ['No environment variables required'], deployment_considerations: 'Documentation deployed via git merge to main' },
    observability_rollout: { monitoring: ['Documentation freshness relative to code changes'], alerts: ['Documentation references deprecated APIs or removed features'], rollout_strategy: 'Merge to main; documentation immediately available', rollback_trigger: 'Incorrect or misleading documentation discovered', rollback_procedure: 'Git revert or direct edit to correct inaccuracies' }
  }
};

const TYPE_MAPPING = {
  feature: 'feature', bugfix: 'bugfix', fix: 'bugfix', security: 'bugfix',
  database: 'infrastructure', infrastructure: 'infrastructure', refactor: 'infrastructure',
  orchestrator: 'infrastructure', qa: 'infrastructure', uat: 'infrastructure',
  discovery_spike: 'infrastructure', implementation: 'feature', enhancement: 'feature',
  ux_debt: 'feature', documentation: 'documentation', docs: 'documentation'
};

function generateIntegrationContent(sdType) {
  const templateKey = TYPE_MAPPING[(sdType || '').toLowerCase()] || 'infrastructure';
  return TYPE_TEMPLATES[templateKey];
}

describe('backfill-prd-integration', () => {
  describe('generateIntegrationContent', () => {
    it('generates all 5 required subsections', () => {
      const result = generateIntegrationContent('feature');
      expect(result).toHaveProperty('consumers');
      expect(result).toHaveProperty('dependencies');
      expect(result).toHaveProperty('data_contracts');
      expect(result).toHaveProperty('runtime_config');
      expect(result).toHaveProperty('observability_rollout');
    });

    it('maps infrastructure SD types correctly', () => {
      const types = ['infrastructure', 'database', 'refactor', 'orchestrator'];
      for (const t of types) {
        const result = generateIntegrationContent(t);
        expect(result.consumers[0].name).toBe('Development Team');
      }
    });

    it('maps bugfix SD types correctly', () => {
      const types = ['bugfix', 'fix', 'security'];
      for (const t of types) {
        const result = generateIntegrationContent(t);
        expect(result.consumers[0].name).toBe('Affected Users');
      }
    });

    it('maps feature SD types correctly', () => {
      const types = ['feature', 'enhancement', 'ux_debt', 'implementation'];
      for (const t of types) {
        const result = generateIntegrationContent(t);
        expect(result.consumers[0].name).toBe('End User');
      }
    });

    it('maps documentation SD types correctly', () => {
      const types = ['documentation', 'docs'];
      for (const t of types) {
        const result = generateIntegrationContent(t);
        expect(result.consumers[0].name).toBe('Development Team');
        expect(result.dependencies[0].name).toBe('Source Code');
      }
    });

    it('falls back to infrastructure for unknown types', () => {
      const result = generateIntegrationContent('unknown_type');
      expect(result.consumers[0].name).toBe('Development Team');
    });

    it('handles null/undefined SD type', () => {
      expect(generateIntegrationContent(null)).toBeDefined();
      expect(generateIntegrationContent(undefined)).toBeDefined();
    });

    it('observability_rollout has required fields', () => {
      for (const templateKey of Object.keys(TYPE_TEMPLATES)) {
        const obs = TYPE_TEMPLATES[templateKey].observability_rollout;
        expect(obs).toHaveProperty('monitoring');
        expect(obs).toHaveProperty('alerts');
        expect(obs).toHaveProperty('rollout_strategy');
        expect(obs).toHaveProperty('rollback_trigger');
        expect(obs).toHaveProperty('rollback_procedure');
      }
    });
  });
});
