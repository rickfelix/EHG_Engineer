/**
 * Carry-Forward Validator - Unit Tests
 * SD Split Carry-Forward Mechanism (Phase A)
 *
 * Tests validate gate logic for child SD validation:
 * - G1: carry_forward block required
 * - G4: anchor coverage (own OR inherited)
 * - G5: version validation (semver)
 * - G6: dependency edges (phase-aware)
 * - G9: file path validation
 * - G10: lineage consistency
 *
 * Each gate has at least one passing and one failing test case.
 */

import { jest } from '@jest/globals';

// Mock fs module before importing validator
jest.unstable_mockModule('fs', () => ({
  existsSync: jest.fn()
}));

const { existsSync } = await import('fs');
const {
  validateCarryForward,
  formatValidationResults,
  ValidationSeverity,
  Gates
} = await import('../../../scripts/validators/carry-forward-validator.js');

describe('Carry-Forward Validator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: all files exist
    existsSync.mockReturnValue(true);
  });

  describe('Non-Child SDs', () => {
    it('should pass immediately for SDs without parent_sd_id', async () => {
      const sd = {
        id: 'SD-VISION-V2-000',
        parent_sd_id: null,
        metadata: {}
      };

      const result = await validateCarryForward(sd, { phase: 'PLAN_ENTRY' });

      expect(result.overallStatus).toBe(ValidationSeverity.PASS);
      expect(result.isChildSd).toBe(false);
      expect(result.gates[Gates.G1_CARRY_FORWARD_REQUIRED].status).toBe(ValidationSeverity.PASS);
      expect(result.gates[Gates.G1_CARRY_FORWARD_REQUIRED].message).toContain('Not a child SD');
    });
  });

  describe('G1: Carry-Forward Required', () => {
    it('PASS: should pass when carry_forward block is present', async () => {
      const sd = {
        id: 'SD-VISION-V2-001',
        parent_sd_id: 'SD-VISION-V2-000',
        metadata: {
          carry_forward: {
            version: '1.0',
            lineage: {
              root_sd_id: 'SD-VISION-V2-000',
              ancestor_chain: ['SD-VISION-V2-000'],
              from_parent: 'SD-VISION-V2-000',
              split_depth: 1
            }
          },
          references: {
            anchor_specs: [{ path: 'docs/vision/specs/01-database-schema.md', spec: '01-database-schema.md' }]
          }
        }
      };

      const mockFetchAncestors = jest.fn().mockResolvedValue({
        id: 'SD-VISION-V2-000',
        parent_sd_id: null,
        metadata: {}
      });

      const result = await validateCarryForward(sd, {
        phase: 'PLAN_ENTRY',
        projectRoot: '/mnt/c/_EHG/EHG_Engineer',
        fetchAncestors: mockFetchAncestors
      });

      expect(result.gates[Gates.G1_CARRY_FORWARD_REQUIRED].status).toBe(ValidationSeverity.PASS);
      expect(result.gates[Gates.G1_CARRY_FORWARD_REQUIRED].message).toContain('carry_forward block present');
    });

    it('FAIL: should fail when carry_forward block is missing', async () => {
      const sd = {
        id: 'SD-VISION-V2-001',
        parent_sd_id: 'SD-VISION-V2-000',
        metadata: {}
      };

      const result = await validateCarryForward(sd, { phase: 'PLAN_ENTRY' });

      expect(result.overallStatus).toBe(ValidationSeverity.FAIL);
      expect(result.gates[Gates.G1_CARRY_FORWARD_REQUIRED].status).toBe(ValidationSeverity.FAIL);
      expect(result.gates[Gates.G1_CARRY_FORWARD_REQUIRED].message).toContain('missing required carry_forward block');
    });

    it('FAIL: should fail when carry_forward is not an object', async () => {
      const sd = {
        id: 'SD-VISION-V2-001',
        parent_sd_id: 'SD-VISION-V2-000',
        metadata: {
          carry_forward: 'invalid'
        }
      };

      const result = await validateCarryForward(sd, { phase: 'PLAN_ENTRY' });

      expect(result.gates[Gates.G1_CARRY_FORWARD_REQUIRED].status).toBe(ValidationSeverity.FAIL);
      expect(result.gates[Gates.G1_CARRY_FORWARD_REQUIRED].message).toContain('must be an object');
    });
  });

  describe('G4: Anchor Coverage', () => {
    const createChildSD = (overrides = {}) => ({
      id: 'SD-VISION-V2-001',
      parent_sd_id: 'SD-VISION-V2-000',
      metadata: {
        carry_forward: {
          version: '1.0',
          lineage: {
            root_sd_id: 'SD-VISION-V2-000',
            ancestor_chain: ['SD-VISION-V2-000'],
            from_parent: 'SD-VISION-V2-000',
            split_depth: 1
          },
          inherited_anchors: {
            anchors: []
          },
          ...overrides.carry_forward
        },
        references: {
          anchor_specs: [],
          ...overrides.references
        },
        ...overrides
      }
    });

    it('PASS: should pass at PLAN_ENTRY with own anchor_specs', async () => {
      const sd = createChildSD({
        references: {
          anchor_specs: [{ path: 'docs/vision/specs/01-database-schema.md', spec: '01-database-schema.md' }]
        }
      });

      const result = await validateCarryForward(sd, { phase: 'PLAN_ENTRY' });

      expect(result.gates[Gates.G4_ANCHOR_COVERAGE].status).toBe(ValidationSeverity.PASS);
      expect(result.gates[Gates.G4_ANCHOR_COVERAGE].message).toContain('Own anchor_specs present');
    });

    it('PASS: should pass at PLAN_ENTRY with inherited_anchors only', async () => {
      const sd = createChildSD({
        carry_forward: {
          version: '1.0',
          lineage: {
            root_sd_id: 'SD-VISION-V2-000',
            ancestor_chain: ['SD-VISION-V2-000'],
            from_parent: 'SD-VISION-V2-000',
            split_depth: 1
          },
          inherited_anchors: {
            anchors: [{ path: 'docs/vision/specs/01-database-schema.md' }]
          }
        },
        references: {
          anchor_specs: []
        }
      });

      const result = await validateCarryForward(sd, { phase: 'PLAN_ENTRY' });

      expect(result.gates[Gates.G4_ANCHOR_COVERAGE].status).toBe(ValidationSeverity.PASS);
      expect(result.gates[Gates.G4_ANCHOR_COVERAGE].message).toContain('Using inherited anchors');
    });

    it('FAIL: should fail at PLAN_ENTRY with neither own nor inherited anchors', async () => {
      const sd = createChildSD({
        carry_forward: {
          version: '1.0',
          lineage: {
            root_sd_id: 'SD-VISION-V2-000',
            ancestor_chain: ['SD-VISION-V2-000'],
            from_parent: 'SD-VISION-V2-000',
            split_depth: 1
          },
          inherited_anchors: {
            anchors: []
          }
        },
        references: {
          anchor_specs: []
        }
      });

      const result = await validateCarryForward(sd, { phase: 'PLAN_ENTRY' });

      expect(result.gates[Gates.G4_ANCHOR_COVERAGE].status).toBe(ValidationSeverity.FAIL);
      expect(result.gates[Gates.G4_ANCHOR_COVERAGE].message).toContain('neither found');
    });

    it('FAIL: should fail at PRD_APPROVAL without own anchor_specs', async () => {
      const sd = createChildSD({
        carry_forward: {
          version: '1.0',
          lineage: {
            root_sd_id: 'SD-VISION-V2-000',
            ancestor_chain: ['SD-VISION-V2-000'],
            from_parent: 'SD-VISION-V2-000',
            split_depth: 1
          },
          inherited_anchors: {
            anchors: [{ path: 'docs/vision/specs/01-database-schema.md' }]
          }
        },
        references: {
          anchor_specs: []
        }
      });

      const result = await validateCarryForward(sd, { phase: 'PRD_APPROVAL' });

      expect(result.gates[Gates.G4_ANCHOR_COVERAGE].status).toBe(ValidationSeverity.FAIL);
      expect(result.gates[Gates.G4_ANCHOR_COVERAGE].message).toContain('references.anchor_specs required');
    });
  });

  describe('G5: Version Validation', () => {
    const createChildSD = (version) => ({
      id: 'SD-VISION-V2-001',
      parent_sd_id: 'SD-VISION-V2-000',
      metadata: {
        carry_forward: {
          version,
          lineage: {
            root_sd_id: 'SD-VISION-V2-000',
            ancestor_chain: ['SD-VISION-V2-000'],
            from_parent: 'SD-VISION-V2-000',
            split_depth: 1
          }
        },
        references: {
          anchor_specs: [{ path: 'docs/vision/specs/01-database-schema.md' }]
        }
      }
    });

    it('PASS: should pass with valid semver 1.0', async () => {
      const sd = createChildSD('1.0');
      const result = await validateCarryForward(sd, { phase: 'PLAN_ENTRY' });

      expect(result.gates[Gates.G5_VERSION_VALID].status).toBe(ValidationSeverity.PASS);
      expect(result.gates[Gates.G5_VERSION_VALID].message).toContain('1.0 is valid');
    });

    it('PASS: should pass with valid semver 1.0.0', async () => {
      const sd = createChildSD('1.0.0');
      const result = await validateCarryForward(sd, { phase: 'PLAN_ENTRY' });

      expect(result.gates[Gates.G5_VERSION_VALID].status).toBe(ValidationSeverity.PASS);
    });

    it('FAIL: should fail with missing version', async () => {
      const sd = createChildSD(undefined);
      const result = await validateCarryForward(sd, { phase: 'PLAN_ENTRY' });

      expect(result.gates[Gates.G5_VERSION_VALID].status).toBe(ValidationSeverity.FAIL);
      expect(result.gates[Gates.G5_VERSION_VALID].message).toContain('version is required');
    });

    it('FAIL: should fail with invalid version format', async () => {
      const sd = createChildSD('v1.0-beta');
      const result = await validateCarryForward(sd, { phase: 'PLAN_ENTRY' });

      expect(result.gates[Gates.G5_VERSION_VALID].status).toBe(ValidationSeverity.FAIL);
      expect(result.gates[Gates.G5_VERSION_VALID].message).toContain('Invalid version format');
    });
  });

  describe('G6: Dependency Edges', () => {
    const createChildSD = (depPolicy, declaredDeps = []) => ({
      id: 'SD-VISION-V2-001',
      parent_sd_id: 'SD-VISION-V2-000',
      metadata: {
        carry_forward: {
          version: '1.0',
          lineage: {
            root_sd_id: 'SD-VISION-V2-000',
            ancestor_chain: ['SD-VISION-V2-000'],
            from_parent: 'SD-VISION-V2-000',
            split_depth: 1
          },
          dependency_policy: depPolicy,
          inherited_context_closure: {
            declared_dependencies: declaredDeps
          }
        },
        references: {
          anchor_specs: [{ path: 'docs/vision/specs/01-database-schema.md' }]
        }
      }
    });

    it('PASS: should pass with EDGES_REQUIRED and declared dependencies', async () => {
      const sd = createChildSD(
        { policy: 'EDGES_REQUIRED' },
        ['SD-VISION-V2-002', 'SD-VISION-V2-003']
      );

      const result = await validateCarryForward(sd, { phase: 'PLAN_ENTRY' });

      expect(result.gates[Gates.G6_DEPENDENCY_EDGES].status).toBe(ValidationSeverity.PASS);
      expect(result.gates[Gates.G6_DEPENDENCY_EDGES].message).toContain('2 dependency edges declared');
    });

    it('PASS: should pass with NO_EDGES_EXPECTED and reason', async () => {
      const sd = createChildSD(
        { policy: 'NO_EDGES_EXPECTED', no_edges_reason: 'Independent scope - no cross-SD dependencies' },
        []
      );

      const result = await validateCarryForward(sd, { phase: 'PLAN_ENTRY' });

      expect(result.gates[Gates.G6_DEPENDENCY_EDGES].status).toBe(ValidationSeverity.PASS);
      expect(result.gates[Gates.G6_DEPENDENCY_EDGES].message).toContain('NO_EDGES_EXPECTED with reason');
    });

    it('ESCALATE: should escalate at PLAN_ENTRY when EDGES_REQUIRED but none declared', async () => {
      const sd = createChildSD({ policy: 'EDGES_REQUIRED' }, []);

      const result = await validateCarryForward(sd, { phase: 'PLAN_ENTRY' });

      expect(result.gates[Gates.G6_DEPENDENCY_EDGES].status).toBe(ValidationSeverity.ESCALATE);
      expect(result.gates[Gates.G6_DEPENDENCY_EDGES].message).toContain('Chairman review');
    });

    it('FAIL: should fail at PRD_APPROVAL when EDGES_REQUIRED but none declared', async () => {
      const sd = createChildSD({ policy: 'EDGES_REQUIRED' }, []);

      const result = await validateCarryForward(sd, { phase: 'PRD_APPROVAL' });

      expect(result.gates[Gates.G6_DEPENDENCY_EDGES].status).toBe(ValidationSeverity.FAIL);
      expect(result.gates[Gates.G6_DEPENDENCY_EDGES].message).toContain('EDGES_REQUIRED but no declared_dependencies');
    });

    it('WARN: should warn when NO_EDGES_EXPECTED but no reason provided', async () => {
      const sd = createChildSD({ policy: 'NO_EDGES_EXPECTED', no_edges_reason: '' }, []);

      const result = await validateCarryForward(sd, { phase: 'PLAN_ENTRY' });

      expect(result.gates[Gates.G6_DEPENDENCY_EDGES].status).toBe(ValidationSeverity.WARN);
      expect(result.gates[Gates.G6_DEPENDENCY_EDGES].message).toContain('requires no_edges_reason');
    });
  });

  describe('G9: File Path Validation', () => {
    const createChildSD = (anchors = []) => ({
      id: 'SD-VISION-V2-001',
      parent_sd_id: 'SD-VISION-V2-000',
      metadata: {
        carry_forward: {
          version: '1.0',
          lineage: {
            root_sd_id: 'SD-VISION-V2-000',
            ancestor_chain: ['SD-VISION-V2-000'],
            from_parent: 'SD-VISION-V2-000',
            split_depth: 1
          },
          inherited_anchors: {
            anchors
          }
        },
        references: {
          anchor_specs: [{ path: 'docs/vision/specs/01-database-schema.md' }]
        }
      }
    });

    it('PASS: should pass when all inherited anchor paths exist', async () => {
      existsSync.mockReturnValue(true);
      const sd = createChildSD([
        { path: 'docs/vision/specs/01-database-schema.md' },
        { path: 'docs/vision/specs/02-api-contracts.md' }
      ]);

      const result = await validateCarryForward(sd, {
        phase: 'PLAN_ENTRY',
        projectRoot: '/mnt/c/_EHG/EHG_Engineer'
      });

      expect(result.gates[Gates.G9_FILE_PATHS_VALID].status).toBe(ValidationSeverity.PASS);
      expect(result.gates[Gates.G9_FILE_PATHS_VALID].message).toContain('All 2 inherited anchor paths valid');
    });

    it('PASS: should pass when no inherited anchors to validate', async () => {
      const sd = createChildSD([]);

      const result = await validateCarryForward(sd, { phase: 'PLAN_ENTRY' });

      expect(result.gates[Gates.G9_FILE_PATHS_VALID].status).toBe(ValidationSeverity.PASS);
      expect(result.gates[Gates.G9_FILE_PATHS_VALID].message).toContain('No inherited anchors');
    });

    it('FAIL: should fail when inherited anchor path does not exist', async () => {
      existsSync.mockImplementation((path) => {
        return !path.includes('non-existent.md');
      });

      const sd = createChildSD([
        { path: 'docs/vision/specs/01-database-schema.md' },
        { path: 'docs/vision/specs/non-existent.md' }
      ]);

      const result = await validateCarryForward(sd, {
        phase: 'PLAN_ENTRY',
        projectRoot: '/mnt/c/_EHG/EHG_Engineer'
      });

      expect(result.gates[Gates.G9_FILE_PATHS_VALID].status).toBe(ValidationSeverity.FAIL);
      expect(result.gates[Gates.G9_FILE_PATHS_VALID].message).toContain('inherited anchor paths invalid');
    });
  });

  describe('G10: Lineage Consistency', () => {
    it('PASS: should pass with valid lineage', async () => {
      const sd = {
        id: 'SD-VISION-V2-001',
        parent_sd_id: 'SD-VISION-V2-000',
        metadata: {
          carry_forward: {
            version: '1.0',
            lineage: {
              root_sd_id: 'SD-VISION-V2-000',
              ancestor_chain: ['SD-VISION-V2-000'],
              from_parent: 'SD-VISION-V2-000',
              split_depth: 1
            }
          },
          references: {
            anchor_specs: [{ path: 'docs/vision/specs/01-database-schema.md' }]
          }
        }
      };

      // Mock ancestor fetch - parent is root
      const mockFetchAncestors = jest.fn().mockResolvedValue({
        id: 'SD-VISION-V2-000',
        parent_sd_id: null,
        metadata: {}
      });

      const result = await validateCarryForward(sd, {
        phase: 'PLAN_ENTRY',
        fetchAncestors: mockFetchAncestors
      });

      expect(result.gates[Gates.G10_LINEAGE_CONSISTENT].status).toBe(ValidationSeverity.PASS);
      expect(result.gates[Gates.G10_LINEAGE_CONSISTENT].message).toContain('Lineage valid');
    });

    it('PASS: should pass with multi-level lineage', async () => {
      const sd = {
        id: 'SD-VISION-V2-001-A',
        parent_sd_id: 'SD-VISION-V2-001',
        metadata: {
          carry_forward: {
            version: '1.0',
            lineage: {
              root_sd_id: 'SD-VISION-V2-000',
              ancestor_chain: ['SD-VISION-V2-000', 'SD-VISION-V2-001'],
              from_parent: 'SD-VISION-V2-001',
              split_depth: 2
            }
          },
          references: {
            anchor_specs: [{ path: 'docs/vision/specs/01-database-schema.md' }]
          }
        }
      };

      // Mock ancestor fetch for 2-level hierarchy
      const mockFetchAncestors = jest.fn()
        .mockImplementation((sdId) => {
          if (sdId === 'SD-VISION-V2-001') {
            return Promise.resolve({
              id: 'SD-VISION-V2-001',
              parent_sd_id: 'SD-VISION-V2-000',
              metadata: {}
            });
          } else if (sdId === 'SD-VISION-V2-000') {
            return Promise.resolve({
              id: 'SD-VISION-V2-000',
              parent_sd_id: null,
              metadata: {}
            });
          }
          return Promise.resolve(null);
        });

      const result = await validateCarryForward(sd, {
        phase: 'PLAN_ENTRY',
        fetchAncestors: mockFetchAncestors
      });

      expect(result.gates[Gates.G10_LINEAGE_CONSISTENT].status).toBe(ValidationSeverity.PASS);
    });

    it('FAIL: should fail when from_parent does not match parent_sd_id', async () => {
      const sd = {
        id: 'SD-VISION-V2-001',
        parent_sd_id: 'SD-VISION-V2-000',
        metadata: {
          carry_forward: {
            version: '1.0',
            lineage: {
              root_sd_id: 'SD-VISION-V2-000',
              ancestor_chain: ['SD-VISION-V2-000'],
              from_parent: 'SD-WRONG-PARENT',  // Wrong!
              split_depth: 1
            }
          },
          references: {
            anchor_specs: [{ path: 'docs/vision/specs/01-database-schema.md' }]
          }
        }
      };

      const mockFetchAncestors = jest.fn().mockResolvedValue({
        id: 'SD-VISION-V2-000',
        parent_sd_id: null
      });

      const result = await validateCarryForward(sd, {
        phase: 'PLAN_ENTRY',
        fetchAncestors: mockFetchAncestors
      });

      expect(result.gates[Gates.G10_LINEAGE_CONSISTENT].status).toBe(ValidationSeverity.FAIL);
      expect(result.gates[Gates.G10_LINEAGE_CONSISTENT].message).toContain('from_parent');
    });

    it('FAIL: should fail when split_depth does not match ancestor_chain length', async () => {
      const sd = {
        id: 'SD-VISION-V2-001',
        parent_sd_id: 'SD-VISION-V2-000',
        metadata: {
          carry_forward: {
            version: '1.0',
            lineage: {
              root_sd_id: 'SD-VISION-V2-000',
              ancestor_chain: ['SD-VISION-V2-000'],
              from_parent: 'SD-VISION-V2-000',
              split_depth: 5  // Wrong! Should be 1
            }
          },
          references: {
            anchor_specs: [{ path: 'docs/vision/specs/01-database-schema.md' }]
          }
        }
      };

      const mockFetchAncestors = jest.fn().mockResolvedValue({
        id: 'SD-VISION-V2-000',
        parent_sd_id: null
      });

      const result = await validateCarryForward(sd, {
        phase: 'PLAN_ENTRY',
        fetchAncestors: mockFetchAncestors
      });

      expect(result.gates[Gates.G10_LINEAGE_CONSISTENT].status).toBe(ValidationSeverity.FAIL);
      expect(result.gates[Gates.G10_LINEAGE_CONSISTENT].message).toContain('split_depth');
    });

    it('WARN: should warn when fetchAncestors not provided', async () => {
      const sd = {
        id: 'SD-VISION-V2-001',
        parent_sd_id: 'SD-VISION-V2-000',
        metadata: {
          carry_forward: {
            version: '1.0',
            lineage: {
              root_sd_id: 'SD-VISION-V2-000',
              ancestor_chain: ['SD-VISION-V2-000'],
              from_parent: 'SD-VISION-V2-000',
              split_depth: 1
            }
          },
          references: {
            anchor_specs: [{ path: 'docs/vision/specs/01-database-schema.md' }]
          }
        }
      };

      const result = await validateCarryForward(sd, {
        phase: 'PLAN_ENTRY'
        // No fetchAncestors
      });

      expect(result.gates[Gates.G10_LINEAGE_CONSISTENT].status).toBe(ValidationSeverity.WARN);
      expect(result.gates[Gates.G10_LINEAGE_CONSISTENT].message).toContain('skipped');
    });
  });

  describe('formatValidationResults', () => {
    it('should format results with correct emojis', async () => {
      const sd = {
        id: 'SD-VISION-V2-001',
        parent_sd_id: 'SD-VISION-V2-000',
        metadata: {
          carry_forward: {
            version: '1.0',
            lineage: {
              root_sd_id: 'SD-VISION-V2-000',
              ancestor_chain: ['SD-VISION-V2-000'],
              from_parent: 'SD-VISION-V2-000',
              split_depth: 1
            }
          },
          references: {
            anchor_specs: [{ path: 'docs/vision/specs/01-database-schema.md' }]
          }
        }
      };

      const result = await validateCarryForward(sd, { phase: 'PLAN_ENTRY' });
      const formatted = formatValidationResults(result);

      expect(formatted).toContain('SD-VISION-V2-001');
      expect(formatted).toContain('PLAN_ENTRY');
      expect(formatted).toMatch(/[✅⚠️🔶❌]/);
    });
  });

  describe('Overall Status Calculation', () => {
    it('should return FAIL if any gate fails', async () => {
      const sd = {
        id: 'SD-VISION-V2-001',
        parent_sd_id: 'SD-VISION-V2-000',
        metadata: {}  // Missing carry_forward
      };

      const result = await validateCarryForward(sd, { phase: 'PLAN_ENTRY' });

      expect(result.overallStatus).toBe(ValidationSeverity.FAIL);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should return highest severity among all gates', async () => {
      // SD with carry_forward but EDGES_REQUIRED without dependencies
      // This should escalate at PLAN_ENTRY
      const sd = {
        id: 'SD-VISION-V2-001',
        parent_sd_id: 'SD-VISION-V2-000',
        metadata: {
          carry_forward: {
            version: '1.0',
            lineage: {
              root_sd_id: 'SD-VISION-V2-000',
              ancestor_chain: ['SD-VISION-V2-000'],
              from_parent: 'SD-VISION-V2-000',
              split_depth: 1
            },
            dependency_policy: { policy: 'EDGES_REQUIRED' },
            inherited_context_closure: { declared_dependencies: [] }
          },
          references: {
            anchor_specs: [{ path: 'docs/vision/specs/01-database-schema.md' }]
          }
        }
      };

      const result = await validateCarryForward(sd, { phase: 'PLAN_ENTRY' });

      // G6 should escalate, making overall status ESCALATE
      expect(result.overallStatus).toBe(ValidationSeverity.ESCALATE);
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });
});
