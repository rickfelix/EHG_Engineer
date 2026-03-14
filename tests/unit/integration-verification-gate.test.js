import { describe, it, expect, beforeAll } from 'vitest';
import {
  verifyIntegration,
  verifyChildrenCompleted,
  crossReferenceDeliverables,
  detectOrphanedCapabilities,
  parseDeliverables,
  formatGateResult,
  resolveSD
} from '../../scripts/gates/integration-verification-gate.js';

// Helper: create a mock supabase client
function createMockSupabase(tables = {}) {
  function buildQuery(tableName) {
    let filters = {};
    let limitVal = null;
    let singleMode = false;

    const chain = {
      select: () => chain,
      eq: (col, val) => { filters[col] = val; return chain; },
      order: () => chain,
      limit: (n) => { limitVal = n; return chain; },
      single: () => { singleMode = true; return resolve(); },
      then: (fn, rej) => resolve().then(fn, rej),
      catch: (fn) => resolve().catch(fn)
    };

    function resolve() {
      const tableData = tables[tableName] || [];
      let result = tableData.filter(row => {
        return Object.entries(filters).every(([col, val]) => row[col] === val);
      });

      if (limitVal) result = result.slice(0, limitVal);

      if (singleMode) {
        if (result.length === 0) {
          return Promise.resolve({ data: null, error: { message: 'Not found' } });
        }
        return Promise.resolve({ data: result[0], error: null });
      }

      return Promise.resolve({ data: result, error: null });
    }

    return chain;
  }

  return {
    from: (tableName) => buildQuery(tableName)
  };
}

// ============================================================
// Test: parseDeliverables
// ============================================================

describe('parseDeliverables', () => {
  it('returns empty array for null/undefined', () => {
    expect(parseDeliverables(null)).toEqual([]);
    expect(parseDeliverables(undefined)).toEqual([]);
  });

  it('handles array of strings', () => {
    const result = parseDeliverables(['file-a.js', 'file-b.ts']);
    expect(result).toEqual(['file-a.js', 'file-b.ts']);
  });

  it('handles array of objects with path', () => {
    const result = parseDeliverables([
      { path: 'src/index.js', type: 'source' },
      { file: 'tests/test.js', type: 'test' }
    ]);
    expect(result).toEqual(['src/index.js', 'tests/test.js']);
  });

  it('handles object with items array', () => {
    const result = parseDeliverables({ items: ['a.js', 'b.js'] });
    expect(result).toEqual(['a.js', 'b.js']);
  });

  it('handles object with files array', () => {
    const result = parseDeliverables({ files: ['x.js'] });
    expect(result).toEqual(['x.js']);
  });

  it('extracts paths from string', () => {
    const result = parseDeliverables('Created scripts/gates/gate.js and tests/gate.test.js');
    expect(result).toContain('scripts/gates/gate.js');
    expect(result).toContain('tests/gate.test.js');
  });
});

// ============================================================
// Test: resolveSD
// ============================================================

describe('resolveSD', () => {
  it('resolves by sd_key', async () => {
    const supabase = createMockSupabase({
      strategic_directives_v2: [
        { id: 'uuid-123', sd_key: 'SD-TEST-001', sd_type: 'feature' }
      ]
    });
    const result = await resolveSD('SD-TEST-001', supabase);
    expect(result).not.toBeNull();
    expect(result.sd_key).toBe('SD-TEST-001');
  });

  it('resolves by UUID id', async () => {
    const supabase = createMockSupabase({
      strategic_directives_v2: [
        { id: 'uuid-456', sd_key: 'SD-TEST-002', sd_type: 'feature' }
      ]
    });
    const result = await resolveSD('uuid-456', supabase);
    expect(result).not.toBeNull();
    expect(result.id).toBe('uuid-456');
  });

  it('returns null for unknown ID', async () => {
    const supabase = createMockSupabase({ strategic_directives_v2: [] });
    const result = await resolveSD('SD-GHOST', supabase);
    expect(result).toBeNull();
  });
});

// ============================================================
// Test: verifyChildrenCompleted
// ============================================================

describe('verifyChildrenCompleted', () => {
  it('returns complete=true when all children completed', async () => {
    const supabase = createMockSupabase({
      strategic_directives_v2: [
        { id: 'uuid-a', sd_key: 'SD-ORCH-001-A', status: 'completed', progress: 100, current_phase: 'COMPLETED', parent_sd_id: 'uuid-parent' },
        { id: 'uuid-b', sd_key: 'SD-ORCH-001-B', status: 'completed', progress: 100, current_phase: 'COMPLETED', parent_sd_id: 'uuid-parent' }
      ]
    });

    const result = await verifyChildrenCompleted('uuid-parent', 'SD-ORCH-001', supabase);
    expect(result.complete).toBe(true);
    expect(result.warnings).toHaveLength(0);
    expect(result.children).toHaveLength(2);
  });

  it('returns warnings for incomplete children', async () => {
    const supabase = createMockSupabase({
      strategic_directives_v2: [
        { id: 'uuid-a', sd_key: 'SD-ORCH-002-A', status: 'completed', progress: 100, parent_sd_id: 'uuid-parent' },
        { id: 'uuid-b', sd_key: 'SD-ORCH-002-B', status: 'in_progress', progress: 60, parent_sd_id: 'uuid-parent' }
      ]
    });

    const result = await verifyChildrenCompleted('uuid-parent', 'SD-ORCH-002', supabase);
    expect(result.complete).toBe(false);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings.some(w => w.includes('SD-ORCH-002-B'))).toBe(true);
  });

  it('returns warning when no children found', async () => {
    const supabase = createMockSupabase({ strategic_directives_v2: [] });
    const result = await verifyChildrenCompleted('uuid-lonely', 'SD-SOLO-001', supabase);
    expect(result.complete).toBe(false);
    expect(result.warnings.some(w => w.includes('No children'))).toBe(true);
  });
});

// ============================================================
// Test: crossReferenceDeliverables
// ============================================================

describe('crossReferenceDeliverables', () => {
  it('detects no overlaps when deliverables are unique', async () => {
    const supabase = createMockSupabase({
      strategic_directives_v2: [
        { id: 'uuid-a', sd_key: 'SD-ORCH-003-A', parent_sd_id: 'uuid-p' },
        { id: 'uuid-b', sd_key: 'SD-ORCH-003-B', parent_sd_id: 'uuid-p' }
      ],
      sd_phase_handoffs: [
        { sd_id: 'SD-ORCH-003-A', status: 'accepted', deliverables_manifest: ['file-a.js'], created_at: '2026-01-01' },
        { sd_id: 'SD-ORCH-003-B', status: 'accepted', deliverables_manifest: ['file-b.js'], created_at: '2026-01-01' }
      ]
    });

    const result = await crossReferenceDeliverables('uuid-p', 'SD-ORCH-003', supabase);
    expect(result.deliverableSummary.overlaps).toBe(0);
    expect(result.deliverableSummary.deliverableCount).toBe(2);
  });

  it('detects overlapping deliverables', async () => {
    const supabase = createMockSupabase({
      strategic_directives_v2: [
        { id: 'uuid-a', sd_key: 'SD-ORCH-004-A', parent_sd_id: 'uuid-p' },
        { id: 'uuid-b', sd_key: 'SD-ORCH-004-B', parent_sd_id: 'uuid-p' }
      ],
      sd_phase_handoffs: [
        { sd_id: 'SD-ORCH-004-A', status: 'accepted', deliverables_manifest: ['shared.js', 'a-only.js'], created_at: '2026-01-01' },
        { sd_id: 'SD-ORCH-004-B', status: 'accepted', deliverables_manifest: ['shared.js', 'b-only.js'], created_at: '2026-01-01' }
      ]
    });

    const result = await crossReferenceDeliverables('uuid-p', 'SD-ORCH-004', supabase);
    expect(result.deliverableSummary.overlaps).toBe(1);
    expect(result.warnings.some(w => w.includes('shared.js'))).toBe(true);
  });

  it('warns when child has no deliverables manifest', async () => {
    const supabase = createMockSupabase({
      strategic_directives_v2: [
        { id: 'uuid-a', sd_key: 'SD-ORCH-005-A', parent_sd_id: 'uuid-p' }
      ],
      sd_phase_handoffs: []
    });

    const result = await crossReferenceDeliverables('uuid-p', 'SD-ORCH-005', supabase);
    expect(result.warnings.some(w => w.includes('no deliverables manifest'))).toBe(true);
  });
});

// ============================================================
// Test: detectOrphanedCapabilities
// ============================================================

describe('detectOrphanedCapabilities', () => {
  it('no orphans when all capabilities consumed', async () => {
    const supabase = createMockSupabase({
      strategic_directives_v2: [
        {
          id: 'uuid-a', sd_key: 'SD-ORCH-006-A', parent_sd_id: 'uuid-p',
          delivers_capabilities: [{ capability_key: 'scorer', name: 'Scorer' }],
          dependencies: []
        },
        {
          id: 'uuid-b', sd_key: 'SD-ORCH-006-B', parent_sd_id: 'uuid-p',
          delivers_capabilities: [],
          dependencies: [{ capability_key: 'scorer' }]
        }
      ]
    });

    const result = await detectOrphanedCapabilities('uuid-p', 'SD-ORCH-006', supabase);
    expect(result.capabilitySummary.orphaned).toBe(0);
  });

  it('detects orphaned capabilities', async () => {
    const supabase = createMockSupabase({
      strategic_directives_v2: [
        {
          id: 'uuid-a', sd_key: 'SD-ORCH-007-A', parent_sd_id: 'uuid-p',
          delivers_capabilities: [{ capability_key: 'unused-tool', name: 'Unused' }],
          dependencies: []
        },
        {
          id: 'uuid-b', sd_key: 'SD-ORCH-007-B', parent_sd_id: 'uuid-p',
          delivers_capabilities: [],
          dependencies: []
        }
      ]
    });

    const result = await detectOrphanedCapabilities('uuid-p', 'SD-ORCH-007', supabase);
    expect(result.capabilitySummary.orphaned).toBe(1);
    expect(result.warnings.some(w => w.includes('unused-tool'))).toBe(true);
  });

  it('handles children with no capabilities', async () => {
    const supabase = createMockSupabase({
      strategic_directives_v2: [
        { id: 'uuid-a', sd_key: 'SD-ORCH-008-A', parent_sd_id: 'uuid-p', delivers_capabilities: null, dependencies: null }
      ]
    });

    const result = await detectOrphanedCapabilities('uuid-p', 'SD-ORCH-008', supabase);
    expect(result.capabilitySummary.delivered).toBe(0);
    expect(result.capabilitySummary.orphaned).toBe(0);
  });
});

// ============================================================
// Test: verifyIntegration (main entry point)
// ============================================================

describe('verifyIntegration', () => {
  it('returns null for non-orchestrator SD (no children)', async () => {
    const supabase = createMockSupabase({
      strategic_directives_v2: [
        { id: 'uuid-leaf', sd_key: 'SD-LEAF-001', sd_type: 'feature' }
      ]
    });

    const result = await verifyIntegration('SD-LEAF-001', { supabase });
    expect(result).toBeNull();
  });

  it('returns null for unknown SD', async () => {
    const supabase = createMockSupabase({ strategic_directives_v2: [] });
    const result = await verifyIntegration('SD-GHOST', { supabase });
    expect(result).toBeNull();
  });

  it('returns pass=true even with warnings (advisory mode)', async () => {
    const supabase = createMockSupabase({
      strategic_directives_v2: [
        { id: 'uuid-p', sd_key: 'SD-ORCH-009', sd_type: 'orchestrator', parent_sd_id: null },
        {
          id: 'uuid-a', sd_key: 'SD-ORCH-009-A', status: 'in_progress', progress: 50,
          current_phase: 'EXEC', parent_sd_id: 'uuid-p',
          delivers_capabilities: [{ capability_key: 'orphan-cap' }],
          dependencies: []
        }
      ],
      sd_phase_handoffs: []
    });

    const result = await verifyIntegration('SD-ORCH-009', { supabase });
    expect(result).not.toBeNull();
    expect(result.pass).toBe(true);
    expect(result.advisory).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.score).toBeLessThan(100);
  });

  it('accepts UUID id as first argument', async () => {
    const supabase = createMockSupabase({
      strategic_directives_v2: [
        { id: 'uuid-p', sd_key: 'SD-ORCH-UUID', sd_type: 'orchestrator', parent_sd_id: null },
        {
          id: 'uuid-a', sd_key: 'SD-ORCH-UUID-A', status: 'completed', progress: 100,
          parent_sd_id: 'uuid-p', delivers_capabilities: [], dependencies: []
        }
      ],
      sd_phase_handoffs: [
        { sd_id: 'SD-ORCH-UUID-A', status: 'accepted', deliverables_manifest: ['a.js'], created_at: '2026-01-01' }
      ]
    });

    const result = await verifyIntegration('uuid-p', { supabase });
    expect(result).not.toBeNull();
    expect(result.sdKey).toBe('SD-ORCH-UUID');
  });

  it('returns score 100 when all checks pass', async () => {
    const supabase = createMockSupabase({
      strategic_directives_v2: [
        { id: 'uuid-p', sd_key: 'SD-ORCH-010', sd_type: 'orchestrator', parent_sd_id: null },
        {
          id: 'uuid-a', sd_key: 'SD-ORCH-010-A', status: 'completed', progress: 100,
          current_phase: 'COMPLETED', parent_sd_id: 'uuid-p',
          delivers_capabilities: [{ capability_key: 'cap-a' }],
          dependencies: []
        },
        {
          id: 'uuid-b', sd_key: 'SD-ORCH-010-B', status: 'completed', progress: 100,
          current_phase: 'COMPLETED', parent_sd_id: 'uuid-p',
          delivers_capabilities: [],
          dependencies: [{ capability_key: 'cap-a' }]
        }
      ],
      sd_phase_handoffs: [
        { sd_id: 'SD-ORCH-010-A', status: 'accepted', deliverables_manifest: ['a.js'], created_at: '2026-01-01' },
        { sd_id: 'SD-ORCH-010-B', status: 'accepted', deliverables_manifest: ['b.js'], created_at: '2026-01-01' }
      ]
    });

    const result = await verifyIntegration('SD-ORCH-010', { supabase });
    expect(result.pass).toBe(true);
    expect(result.score).toBe(100);
    expect(result.warnings).toHaveLength(0);
    expect(result.checks.childrenComplete).toBe(true);
    expect(result.checks.deliverablesClean).toBe(true);
    expect(result.checks.capabilitiesConsumed).toBe(true);
  });

  it('includes checks and details objects', async () => {
    const supabase = createMockSupabase({
      strategic_directives_v2: [
        { id: 'uuid-p', sd_key: 'SD-ORCH-011', sd_type: 'orchestrator', parent_sd_id: null },
        {
          id: 'uuid-a', sd_key: 'SD-ORCH-011-A', status: 'completed', progress: 100,
          current_phase: 'COMPLETED', parent_sd_id: 'uuid-p',
          delivers_capabilities: [], dependencies: []
        }
      ],
      sd_phase_handoffs: [
        { sd_id: 'SD-ORCH-011-A', status: 'accepted', deliverables_manifest: ['x.js'], created_at: '2026-01-01' }
      ]
    });

    const result = await verifyIntegration('SD-ORCH-011', { supabase });
    expect(result.checks).toHaveProperty('childrenComplete');
    expect(result.checks).toHaveProperty('deliverablesClean');
    expect(result.checks).toHaveProperty('capabilitiesConsumed');
    expect(result.details).toHaveProperty('children');
    expect(result.details).toHaveProperty('deliverables');
    expect(result.details).toHaveProperty('capabilities');
  });
});

// ============================================================
// Test: formatGateResult
// ============================================================

describe('formatGateResult', () => {
  it('formats clean result', () => {
    const result = {
      pass: true,
      score: 100,
      max_score: 100,
      advisory: true,
      warnings: [],
      checks: { childrenComplete: true, deliverablesClean: true, capabilitiesConsumed: true }
    };
    const output = formatGateResult(result);
    expect(output).toContain('100/100');
    expect(output).toContain('No warnings');
  });

  it('formats result with warnings', () => {
    const result = {
      pass: true,
      score: 70,
      max_score: 100,
      advisory: true,
      warnings: ['Child SD-X incomplete'],
      checks: { childrenComplete: false, deliverablesClean: true, capabilitiesConsumed: true }
    };
    const output = formatGateResult(result);
    expect(output).toContain('70/100');
    expect(output).toContain('Child SD-X incomplete');
  });
});
