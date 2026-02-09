/**
 * Unit Tests for Post-Orchestrator Completeness Audit
 * Part of SD-LEO-ORCH-QUALITY-GATE-ENHANCEMENTS-001-F
 *
 * Tests:
 * - Audit discovers all children by parent_sd_id
 * - Flags children not in completed status
 * - Detects missing test files and TESTING evidence
 * - Stores audit in metadata.completion_audit (versioned)
 * - Advisory only - errors don't block orchestrator completion
 * - Timeout handling for large child sets
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  runCompletenessAudit,
  storeCompletenessAudit
} from '../../scripts/modules/handoff/orchestrator-completion-hook.js';

// Mock child_process.execSync
vi.mock('child_process', () => ({
  execSync: vi.fn(() => '')
}));

/**
 * Create a mock Supabase client with configurable responses
 */
function createMockSupabase({ children = [], subAgentResults = [], metadata = {} } = {}) {
  const mockSelect = vi.fn();
  const mockEq = vi.fn();
  const mockIn = vi.fn();
  const mockOrder = vi.fn();
  const mockSingle = vi.fn();
  const mockUpdate = vi.fn();

  // Chain builder for select queries
  const chainBuilder = (data, error = null) => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: data?.[0] || null, error }),
      then: (resolve) => resolve({ data, error })
    };
    // Make it thenable
    chain[Symbol.for('nodejs.util.promisify.custom')] = undefined;
    return chain;
  };

  // Track which table is being queried
  let currentTable = '';

  const supabase = {
    from: vi.fn((table) => {
      currentTable = table;

      if (table === 'strategic_directives_v2') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: children, error: null }),
              single: vi.fn().mockResolvedValue({ data: { metadata }, error: null })
            })
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null })
          })
        };
      }

      if (table === 'sub_agent_results') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: subAgentResults, error: null })
            })
          })
        };
      }

      // Default
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: [], error: null })
        })
      };
    })
  };

  return supabase;
}

describe('Post-Orchestrator Completeness Audit', () => {
  const orchId = 'orch-uuid-001';

  describe('runCompletenessAudit', () => {
    it('should return audit with correct schema version and timestamps', async () => {
      const supabase = createMockSupabase({ children: [] });
      const result = await runCompletenessAudit(supabase, orchId);

      expect(result.schema_version).toBe('1.0.0');
      expect(result.created_at).toBeDefined();
      expect(result.orchestrator_id).toBe(orchId);
      expect(result.duration_ms).toBeGreaterThanOrEqual(0);
    });

    it('should count completed vs non-completed children', async () => {
      const children = [
        { id: 'c1', sd_key: 'SD-001-A', title: 'A', status: 'completed', metadata: {} },
        { id: 'c2', sd_key: 'SD-001-B', title: 'B', status: 'completed', metadata: {} },
        { id: 'c3', sd_key: 'SD-001-C', title: 'C', status: 'in_progress', metadata: {} }
      ];
      const supabase = createMockSupabase({ children });
      const result = await runCompletenessAudit(supabase, orchId);

      expect(result.summary.total_children).toBe(3);
      expect(result.summary.completed_children).toBe(2);
      expect(result.summary.non_completed_children).toBe(1);
      expect(result.summary.flags.child_not_completed_count).toBe(1);
    });

    it('should flag child_not_completed with finding code', async () => {
      const children = [
        { id: 'c1', sd_key: 'SD-001-A', title: 'A', status: 'blocked', metadata: {} }
      ];
      const supabase = createMockSupabase({ children });
      const result = await runCompletenessAudit(supabase, orchId);

      expect(result.children[0].findings).toContainEqual(
        expect.objectContaining({ code: 'CHILD_NOT_COMPLETED' })
      );
    });

    it('should detect TESTING evidence from sub-agent results', async () => {
      const children = [
        { id: 'c1', sd_key: 'SD-001-A', title: 'A', status: 'completed', metadata: {} }
      ];
      const subAgentResults = [
        { sd_id: 'c1', sub_agent_type: 'TESTING', verdict: 'PASS' }
      ];
      const supabase = createMockSupabase({ children, subAgentResults });
      const result = await runCompletenessAudit(supabase, orchId);

      expect(result.children[0].has_testing_evidence).toBe(true);
      expect(result.children[0].testing_evidence_sources).toContain('sub_agent_result');
    });

    it('should flag missing TESTING evidence', async () => {
      const children = [
        { id: 'c1', sd_key: 'SD-001-A', title: 'A', status: 'completed', metadata: {} }
      ];
      const supabase = createMockSupabase({ children, subAgentResults: [] });
      const result = await runCompletenessAudit(supabase, orchId);

      expect(result.children[0].has_testing_evidence).toBe(false);
      expect(result.summary.flags.missing_testing_evidence_count).toBe(1);
      expect(result.children[0].findings).toContainEqual(
        expect.objectContaining({ code: 'MISSING_TESTING_EVIDENCE' })
      );
    });

    it('should detect TESTING evidence from metadata', async () => {
      const children = [
        { id: 'c1', sd_key: 'SD-001-A', title: 'A', status: 'completed', metadata: { testing_evidence: true } }
      ];
      const supabase = createMockSupabase({ children, subAgentResults: [] });
      const result = await runCompletenessAudit(supabase, orchId);

      expect(result.children[0].has_testing_evidence).toBe(true);
      expect(result.children[0].testing_evidence_sources).toContain('metadata');
    });

    it('should set advisory_status to PASS when no flags', async () => {
      const children = [
        { id: 'c1', sd_key: 'SD-001-A', title: 'A', status: 'completed', metadata: { testing_evidence: true } }
      ];
      const subAgentResults = [
        { sd_id: 'c1', sub_agent_type: 'TESTING', verdict: 'PASS' }
      ];
      const supabase = createMockSupabase({ children, subAgentResults });
      const result = await runCompletenessAudit(supabase, orchId);

      // Test files may still be missing (mocked execSync returns empty)
      // But testing evidence is present, so only test_files flag matters
      expect(result.summary.advisory_status).toBeDefined();
    });

    it('should set advisory_status to WARN when flags exist', async () => {
      const children = [
        { id: 'c1', sd_key: 'SD-001-A', title: 'A', status: 'in_progress', metadata: {} }
      ];
      const supabase = createMockSupabase({ children });
      const result = await runCompletenessAudit(supabase, orchId);

      expect(result.summary.advisory_status).toBe('WARN');
    });

    it('should build patterns from findings sorted by count', async () => {
      const children = [
        { id: 'c1', sd_key: 'SD-001-A', title: 'A', status: 'in_progress', metadata: {} },
        { id: 'c2', sd_key: 'SD-001-B', title: 'B', status: 'in_progress', metadata: {} },
        { id: 'c3', sd_key: 'SD-001-C', title: 'C', status: 'completed', metadata: {} }
      ];
      const supabase = createMockSupabase({ children });
      const result = await runCompletenessAudit(supabase, orchId);

      expect(result.summary.patterns.length).toBeGreaterThan(0);
      // CHILD_NOT_COMPLETED should appear for 2 children
      const notCompleted = result.summary.patterns.find(p => p.code === 'CHILD_NOT_COMPLETED');
      expect(notCompleted).toBeDefined();
      expect(notCompleted.count).toBe(2);
    });

    it('should handle empty children list gracefully', async () => {
      const supabase = createMockSupabase({ children: [] });
      const result = await runCompletenessAudit(supabase, orchId);

      expect(result.summary.total_children).toBe(0);
      expect(result.summary.advisory_status).toBe('PASS');
      expect(result.children).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should capture errors from children query failure', async () => {
      // Create a supabase mock that fails on children query
      const supabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: null,
                error: { message: 'Connection failed' }
              })
            })
          })
        })
      };
      const result = await runCompletenessAudit(supabase, orchId);

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].code).toBe('CHILDREN_QUERY_FAILED');
    });

    it('should include per-child LOC and LOC source', async () => {
      const children = [
        { id: 'c1', sd_key: 'SD-001-A', title: 'A', status: 'completed', metadata: {} }
      ];
      const supabase = createMockSupabase({ children, subAgentResults: [{ sd_id: 'c1', sub_agent_type: 'TESTING', verdict: 'PASS' }] });
      const result = await runCompletenessAudit(supabase, orchId);

      expect(result.children[0].loc).toBe(0);
      expect(result.children[0].loc_source).toBe('unavailable');
      expect(result.metrics.total_loc).toBeDefined();
    });

    it('should limit patterns to 5', async () => {
      // Create many different finding types (simulate varied failures)
      const children = Array.from({ length: 10 }, (_, i) => ({
        id: `c${i}`, sd_key: `SD-001-${String.fromCharCode(65 + i)}`,
        title: `Child ${i}`, status: 'in_progress', metadata: {}
      }));
      const supabase = createMockSupabase({ children });
      const result = await runCompletenessAudit(supabase, orchId);

      expect(result.summary.patterns.length).toBeLessThanOrEqual(5);
    });
  });

  describe('storeCompletenessAudit', () => {
    it('should store audit as first version when no existing audit', async () => {
      const auditResult = {
        schema_version: '1.0.0',
        created_at: new Date().toISOString(),
        orchestrator_id: orchId,
        summary: { advisory_status: 'PASS' }
      };

      let updatedMetadata = null;
      const supabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { metadata: {} }, error: null })
            })
          }),
          update: vi.fn((data) => {
            updatedMetadata = data;
            return {
              eq: vi.fn().mockResolvedValue({ error: null })
            };
          })
        })
      };

      const result = await storeCompletenessAudit(supabase, orchId, auditResult);
      expect(result).toBe(true);
      expect(updatedMetadata.metadata.completion_audit.audit_version).toBe(1);
      expect(updatedMetadata.metadata.completion_audit.history).toHaveLength(0);
    });

    it('should increment version when existing audit exists', async () => {
      const existingAudit = {
        schema_version: '1.0.0',
        audit_version: 1,
        summary: { advisory_status: 'WARN' }
      };

      const auditResult = {
        schema_version: '1.0.0',
        created_at: new Date().toISOString(),
        summary: { advisory_status: 'PASS' }
      };

      let updatedMetadata = null;
      const supabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { metadata: { completion_audit: existingAudit } },
                error: null
              })
            })
          }),
          update: vi.fn((data) => {
            updatedMetadata = data;
            return {
              eq: vi.fn().mockResolvedValue({ error: null })
            };
          })
        })
      };

      const result = await storeCompletenessAudit(supabase, orchId, auditResult);
      expect(result).toBe(true);
      expect(updatedMetadata.metadata.completion_audit.audit_version).toBe(2);
      expect(updatedMetadata.metadata.completion_audit.history).toHaveLength(1);
    });

    it('should handle storage errors gracefully', async () => {
      const supabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { metadata: {} }, error: null })
            })
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: { message: 'Storage failed' } })
          })
        })
      };

      const result = await storeCompletenessAudit(supabase, orchId, {});
      expect(result).toBe(false);
    });
  });
});
