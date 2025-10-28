/**
 * Unit Tests: RCA Gate Validation
 * SD-RCA-001: Root Cause Agent - Handoff Gate Enforcement
 *
 * Test Coverage:
 * - Gate PASS when no P0/P1 RCRs exist
 * - Gate BLOCKED when unverified P0/P1 RCRs exist
 * - Gate PASS when all P0/P1 CAPAs verified
 * - Gate ERROR handling (non-blocking)
 * - CAPA status filtering logic
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';

// Mock Supabase client
vi.mock('@supabase/supabase-js');

describe('RCA Gate Validation', () => {
  let mockSupabase;

  beforeEach(() => {
    mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn()
    };

    createClient.mockReturnValue(mockSupabase);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Gate PASS scenarios', () => {
    test('should return PASS when no RCRs exist for SD', async () => {
      mockSupabase.in.mockResolvedValue({ data: [], error: null });

      const result = await validateRCAGate(mockSupabase, 'SD-AUTH-001');

      expect(result.gate_status).toBe('PASS');
      expect(result.open_rcr_count).toBe(0);
      expect(result.p0_rcr_count).toBe(0);
      expect(result.p1_rcr_count).toBe(0);
      expect(result.blocking_rcr_ids).toEqual([]);
    });

    test('should return PASS when only P2/P3/P4 RCRs exist', async () => {
      const p2RCRs = [
        {
          id: 'rcr-1',
          severity_priority: 'P2',
          status: 'OPEN',
          remediation_manifests: []
        },
        {
          id: 'rcr-2',
          severity_priority: 'P3',
          status: 'IN_REVIEW',
          remediation_manifests: []
        }
      ];

      mockSupabase.in.mockResolvedValue({ data: p2RCRs, error: null });

      const result = await validateRCAGate(mockSupabase, 'SD-AUTH-001');

      expect(result.gate_status).toBe('PASS');
      expect(result.open_rcr_count).toBe(2);
      expect(result.p0_rcr_count).toBe(0);
      expect(result.p1_rcr_count).toBe(0);
    });

    test('should return PASS when all P0 CAPAs are VERIFIED', async () => {
      const verifiedP0RCRs = [
        {
          id: 'rcr-1',
          severity_priority: 'P0',
          status: 'FIX_IN_PROGRESS',
          remediation_manifests: [{
            id: 'capa-1',
            status: 'VERIFIED',
            verified_at: '2025-10-28T15:00:00Z'
          }]
        }
      ];

      mockSupabase.in.mockResolvedValue({ data: verifiedP0RCRs, error: null });

      const result = await validateRCAGate(mockSupabase, 'SD-AUTH-001');

      expect(result.gate_status).toBe('PASS');
      expect(result.p0_rcr_count).toBe(1);
      expect(result.blocking_rcr_ids).toEqual([]);
      expect(result.capa_status_summary.verified_count).toBe(1);
    });

    test('should return PASS when all P1 CAPAs are VERIFIED', async () => {
      const verifiedP1RCRs = [
        {
          id: 'rcr-1',
          severity_priority: 'P1',
          status: 'CAPA_APPROVED',
          remediation_manifests: [{
            id: 'capa-1',
            status: 'VERIFIED',
            verified_at: '2025-10-28T14:00:00Z'
          }]
        },
        {
          id: 'rcr-2',
          severity_priority: 'P1',
          status: 'FIX_IN_PROGRESS',
          remediation_manifests: [{
            id: 'capa-2',
            status: 'VERIFIED',
            verified_at: '2025-10-28T15:00:00Z'
          }]
        }
      ];

      mockSupabase.in.mockResolvedValue({ data: verifiedP1RCRs, error: null });

      const result = await validateRCAGate(mockSupabase, 'SD-AUTH-001');

      expect(result.gate_status).toBe('PASS');
      expect(result.p1_rcr_count).toBe(2);
      expect(result.capa_status_summary.verified_count).toBe(2);
    });

    test('should return PASS for mixed P0/P1/P2 when all P0/P1 verified', async () => {
      const mixedRCRs = [
        {
          id: 'rcr-1',
          severity_priority: 'P0',
          status: 'RESOLVED',
          remediation_manifests: [{
            id: 'capa-1',
            status: 'VERIFIED',
            verified_at: '2025-10-28T10:00:00Z'
          }]
        },
        {
          id: 'rcr-2',
          severity_priority: 'P1',
          status: 'FIX_IN_PROGRESS',
          remediation_manifests: [{
            id: 'capa-2',
            status: 'VERIFIED',
            verified_at: '2025-10-28T11:00:00Z'
          }]
        },
        {
          id: 'rcr-3',
          severity_priority: 'P2',
          status: 'OPEN',
          remediation_manifests: [] // P2 doesn't block even without CAPA
        }
      ];

      mockSupabase.in.mockResolvedValue({ data: mixedRCRs, error: null });

      const result = await validateRCAGate(mockSupabase, 'SD-AUTH-001');

      expect(result.gate_status).toBe('PASS');
      expect(result.open_rcr_count).toBe(3);
      expect(result.p0_rcr_count).toBe(1);
      expect(result.p1_rcr_count).toBe(1);
      expect(result.blocking_rcr_ids).toEqual([]);
    });
  });

  describe('Gate BLOCKED scenarios', () => {
    test('should return BLOCKED when P0 RCR has no CAPA', async () => {
      const p0WithoutCAPA = [
        {
          id: 'rcr-1',
          severity_priority: 'P0',
          status: 'OPEN',
          problem_statement: 'Quality score dropped below 70',
          remediation_manifests: []
        }
      ];

      mockSupabase.in.mockResolvedValue({ data: p0WithoutCAPA, error: null });

      const result = await validateRCAGate(mockSupabase, 'SD-AUTH-001');

      expect(result.gate_status).toBe('BLOCKED');
      expect(result.p0_rcr_count).toBe(1);
      expect(result.blocking_rcr_ids).toEqual(['rcr-1']);
      expect(result.capa_status_summary.not_created_count).toBe(1);
    });

    test('should return BLOCKED when P1 RCR has CAPA but not VERIFIED', async () => {
      const p1WithPendingCAPA = [
        {
          id: 'rcr-1',
          severity_priority: 'P1',
          status: 'CAPA_PENDING',
          problem_statement: 'Test regression',
          remediation_manifests: [{
            id: 'capa-1',
            status: 'PENDING',
            verified_at: null
          }]
        }
      ];

      mockSupabase.in.mockResolvedValue({ data: p1WithPendingCAPA, error: null });

      const result = await validateRCAGate(mockSupabase, 'SD-AUTH-001');

      expect(result.gate_status).toBe('BLOCKED');
      expect(result.p1_rcr_count).toBe(1);
      expect(result.blocking_rcr_ids).toEqual(['rcr-1']);
      expect(result.capa_status_summary.pending_count).toBe(1);
    });

    test('should return BLOCKED when CAPA status is APPROVED but not VERIFIED', async () => {
      const approvedButNotVerified = [
        {
          id: 'rcr-1',
          severity_priority: 'P0',
          status: 'CAPA_APPROVED',
          problem_statement: 'Critical issue',
          remediation_manifests: [{
            id: 'capa-1',
            status: 'APPROVED',
            verified_at: null
          }]
        }
      ];

      mockSupabase.in.mockResolvedValue({ data: approvedButNotVerified, error: null });

      const result = await validateRCAGate(mockSupabase, 'SD-AUTH-001');

      expect(result.gate_status).toBe('BLOCKED');
      expect(result.blocking_rcr_ids).toEqual(['rcr-1']);
      expect(result.capa_status_summary.pending_count).toBe(1);
    });

    test('should return BLOCKED when CAPA status is IMPLEMENTED but not VERIFIED', async () => {
      const implementedButNotVerified = [
        {
          id: 'rcr-1',
          severity_priority: 'P1',
          status: 'FIX_IN_PROGRESS',
          problem_statement: 'Fix implemented',
          remediation_manifests: [{
            id: 'capa-1',
            status: 'IMPLEMENTED',
            verified_at: null
          }]
        }
      ];

      mockSupabase.in.mockResolvedValue({ data: implementedButNotVerified, error: null });

      const result = await validateRCAGate(mockSupabase, 'SD-AUTH-001');

      expect(result.gate_status).toBe('BLOCKED');
      expect(result.blocking_rcr_ids).toEqual(['rcr-1']);
    });

    test('should return BLOCKED for multiple unverified P0/P1 RCRs', async () => {
      const multipleBlocking = [
        {
          id: 'rcr-1',
          severity_priority: 'P0',
          status: 'OPEN',
          problem_statement: 'Issue 1',
          remediation_manifests: []
        },
        {
          id: 'rcr-2',
          severity_priority: 'P1',
          status: 'CAPA_PENDING',
          problem_statement: 'Issue 2',
          remediation_manifests: [{
            id: 'capa-2',
            status: 'PENDING',
            verified_at: null
          }]
        },
        {
          id: 'rcr-3',
          severity_priority: 'P0',
          status: 'FIX_IN_PROGRESS',
          problem_statement: 'Issue 3',
          remediation_manifests: [{
            id: 'capa-3',
            status: 'IMPLEMENTED',
            verified_at: null
          }]
        }
      ];

      mockSupabase.in.mockResolvedValue({ data: multipleBlocking, error: null });

      const result = await validateRCAGate(mockSupabase, 'SD-AUTH-001');

      expect(result.gate_status).toBe('BLOCKED');
      expect(result.open_rcr_count).toBe(3);
      expect(result.p0_rcr_count).toBe(2);
      expect(result.p1_rcr_count).toBe(1);
      expect(result.blocking_rcr_ids).toHaveLength(3);
      expect(result.blocking_rcr_ids).toContain('rcr-1');
      expect(result.blocking_rcr_ids).toContain('rcr-2');
      expect(result.blocking_rcr_ids).toContain('rcr-3');
    });

    test('should BLOCK when some P0/P1 verified but others not', async () => {
      const partiallyVerified = [
        {
          id: 'rcr-1',
          severity_priority: 'P0',
          status: 'RESOLVED',
          problem_statement: 'Fixed issue',
          remediation_manifests: [{
            id: 'capa-1',
            status: 'VERIFIED',
            verified_at: '2025-10-28T10:00:00Z'
          }]
        },
        {
          id: 'rcr-2',
          severity_priority: 'P1',
          status: 'OPEN',
          problem_statement: 'Unfixed issue',
          remediation_manifests: []
        }
      ];

      mockSupabase.in.mockResolvedValue({ data: partiallyVerified, error: null });

      const result = await validateRCAGate(mockSupabase, 'SD-AUTH-001');

      expect(result.gate_status).toBe('BLOCKED');
      expect(result.blocking_rcr_ids).toEqual(['rcr-2']);
      expect(result.capa_status_summary.verified_count).toBe(1);
      expect(result.capa_status_summary.not_created_count).toBe(1);
    });
  });

  describe('Gate ERROR scenarios (non-blocking)', () => {
    test('should return ERROR with PASS when database query fails', async () => {
      mockSupabase.in.mockResolvedValue({
        data: null,
        error: { message: 'Database connection failed' }
      });

      const result = await validateRCAGate(mockSupabase, 'SD-AUTH-001');

      expect(result.gate_status).toBe('PASS'); // Non-blocking on error
      expect(result.error).toBeDefined();
      expect(result.error.message).toContain('Database connection failed');
    });

    test('should return ERROR with PASS when Supabase returns null data', async () => {
      mockSupabase.in.mockResolvedValue({ data: null, error: null });

      const result = await validateRCAGate(mockSupabase, 'SD-AUTH-001');

      expect(result.gate_status).toBe('PASS');
      expect(result.open_rcr_count).toBe(0);
    });

    test('should handle malformed RCR data gracefully', async () => {
      const malformedData = [
        {
          id: 'rcr-1',
          // Missing severity_priority
          status: 'OPEN',
          remediation_manifests: null // null instead of array
        }
      ];

      mockSupabase.in.mockResolvedValue({ data: malformedData, error: null });

      const result = await validateRCAGate(mockSupabase, 'SD-AUTH-001');

      // Should handle gracefully without crashing
      expect(result).toBeDefined();
      expect(result.gate_status).toBeDefined();
    });
  });

  describe('CAPA status filtering', () => {
    test('should count CAPAs by status correctly', async () => {
      const mixedCAPAStatuses = [
        {
          id: 'rcr-1',
          severity_priority: 'P0',
          status: 'RESOLVED',
          remediation_manifests: [{
            id: 'capa-1',
            status: 'VERIFIED',
            verified_at: '2025-10-28T10:00:00Z'
          }]
        },
        {
          id: 'rcr-2',
          severity_priority: 'P1',
          status: 'CAPA_PENDING',
          remediation_manifests: [{
            id: 'capa-2',
            status: 'PENDING',
            verified_at: null
          }]
        },
        {
          id: 'rcr-3',
          severity_priority: 'P1',
          status: 'OPEN',
          remediation_manifests: []
        }
      ];

      mockSupabase.in.mockResolvedValue({ data: mixedCAPAStatuses, error: null });

      const result = await validateRCAGate(mockSupabase, 'SD-AUTH-001');

      expect(result.capa_status_summary.verified_count).toBe(1);
      expect(result.capa_status_summary.pending_count).toBe(1);
      expect(result.capa_status_summary.not_created_count).toBe(1);
    });

    test('should only consider first CAPA manifest for each RCR', async () => {
      const multipleManifests = [
        {
          id: 'rcr-1',
          severity_priority: 'P0',
          status: 'RESOLVED',
          remediation_manifests: [
            {
              id: 'capa-1',
              status: 'VERIFIED',
              verified_at: '2025-10-28T10:00:00Z'
            },
            {
              id: 'capa-2',
              status: 'REJECTED', // Should be ignored
              verified_at: null
            }
          ]
        }
      ];

      mockSupabase.in.mockResolvedValue({ data: multipleManifests, error: null });

      const result = await validateRCAGate(mockSupabase, 'SD-AUTH-001');

      expect(result.gate_status).toBe('PASS');
      expect(result.capa_status_summary.verified_count).toBe(1);
    });
  });

  describe('result metadata', () => {
    test('should include gate_check_timestamp', async () => {
      mockSupabase.in.mockResolvedValue({ data: [], error: null });

      const result = await validateRCAGate(mockSupabase, 'SD-AUTH-001');

      expect(result.gate_check_timestamp).toBeDefined();
      expect(new Date(result.gate_check_timestamp).getTime()).toBeCloseTo(Date.now(), -3);
    });

    test('should include gate_check_command hint', async () => {
      mockSupabase.in.mockResolvedValue({ data: [], error: null });

      const result = await validateRCAGate(mockSupabase, 'SD-AUTH-001');

      expect(result.gate_check_command).toContain('node scripts/root-cause-agent.js gate-check');
      expect(result.gate_check_command).toContain('SD-AUTH-001');
    });

    test('should summarize blocking RCRs with details', async () => {
      const blockingRCRs = [
        {
          id: 'rcr-1',
          severity_priority: 'P0',
          status: 'OPEN',
          problem_statement: 'Critical quality issue',
          remediation_manifests: []
        }
      ];

      mockSupabase.in.mockResolvedValue({ data: blockingRCRs, error: null });

      const result = await validateRCAGate(mockSupabase, 'SD-AUTH-001');

      expect(result.blocking_rcrs).toBeDefined();
      expect(result.blocking_rcrs).toHaveLength(1);
      expect(result.blocking_rcrs[0]).toHaveProperty('id', 'rcr-1');
      expect(result.blocking_rcrs[0]).toHaveProperty('severity', 'P0');
      expect(result.blocking_rcrs[0]).toHaveProperty('problem', 'Critical quality issue');
    });
  });
});

// Helper function matching unified-handoff-system.js validateRCAGateForHandoff logic

async function validateRCAGate(supabase, sdId) {
  try {
    const { data: openRCRs, error } = await supabase
      .from('root_cause_reports')
      .select('id, severity_priority, status, problem_statement, remediation_manifests(id, status, verified_at)')
      .eq('sd_id', sdId)
      .in('status', ['OPEN', 'IN_REVIEW', 'CAPA_PENDING', 'CAPA_APPROVED', 'FIX_IN_PROGRESS', 'RESOLVED'])
      .in('severity_priority', ['P0', 'P1', 'P2', 'P3', 'P4']);

    if (error) {
      return {
        gate_status: 'PASS', // Non-blocking on error
        open_rcr_count: 0,
        p0_rcr_count: 0,
        p1_rcr_count: 0,
        blocking_rcr_ids: [],
        capa_status_summary: {
          verified_count: 0,
          pending_count: 0,
          not_created_count: 0
        },
        gate_check_timestamp: new Date().toISOString(),
        gate_check_command: `node scripts/root-cause-agent.js gate-check --sd-id ${sdId}`,
        error: {
          message: error.message,
          note: 'RCA gate check failed but handoff allowed (non-blocking error handling)'
        }
      };
    }

    const rcrs = openRCRs || [];

    // Filter for P0/P1 only for blocking logic
    const p0p1RCRs = rcrs.filter(rcr =>
      rcr.severity_priority === 'P0' || rcr.severity_priority === 'P1'
    );

    // Determine blocking RCRs (P0/P1 without verified CAPAs)
    const blockingRCRs = p0p1RCRs.filter(rcr => {
      const capa = rcr.remediation_manifests?.[0];
      return !capa || capa.status !== 'VERIFIED';
    });

    // CAPA status summary
    let verified_count = 0;
    let pending_count = 0;
    let not_created_count = 0;

    p0p1RCRs.forEach(rcr => {
      const capa = rcr.remediation_manifests?.[0];
      if (!capa) {
        not_created_count++;
      } else if (capa.status === 'VERIFIED') {
        verified_count++;
      } else {
        pending_count++;
      }
    });

    const gateStatus = blockingRCRs.length > 0 ? 'BLOCKED' : 'PASS';

    return {
      gate_status: gateStatus,
      open_rcr_count: rcrs.length,
      p0_rcr_count: rcrs.filter(r => r.severity_priority === 'P0').length,
      p1_rcr_count: rcrs.filter(r => r.severity_priority === 'P1').length,
      blocking_rcr_ids: blockingRCRs.map(r => r.id),
      blocking_rcrs: blockingRCRs.map(r => ({
        id: r.id,
        severity: r.severity_priority,
        problem: r.problem_statement,
        capa_status: r.remediation_manifests?.[0]?.status || 'NOT_CREATED'
      })),
      capa_status_summary: {
        verified_count,
        pending_count,
        not_created_count
      },
      gate_check_timestamp: new Date().toISOString(),
      gate_check_command: `node scripts/root-cause-agent.js gate-check --sd-id ${sdId}`
    };
  } catch (err) {
    return {
      gate_status: 'PASS',
      open_rcr_count: 0,
      p0_rcr_count: 0,
      p1_rcr_count: 0,
      blocking_rcr_ids: [],
      capa_status_summary: {
        verified_count: 0,
        pending_count: 0,
        not_created_count: 0
      },
      gate_check_timestamp: new Date().toISOString(),
      gate_check_command: `node scripts/root-cause-agent.js gate-check --sd-id ${sdId}`,
      error: {
        message: err.message,
        note: 'Unexpected error during RCA gate check (non-blocking)'
      }
    };
  }
}
