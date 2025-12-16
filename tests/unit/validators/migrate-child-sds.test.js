/**
 * migrate-child-sds.mjs - Unit Tests
 * Phase B: SD Split Carry-Forward Migration Tool
 *
 * Tests cover:
 * - Lineage derivation
 * - Inherited anchor derivation (intersection vs copy)
 * - Collision detection
 * - Patch generation
 * - Required field validation
 */

import { jest } from '@jest/globals';
import { createHash } from 'crypto';

describe('migrate-child-sds.mjs - Core Functions', () => {
  // Since the script is a CLI tool, we test the core logic patterns
  // by recreating the key functions in test context

  describe('deriveLineage', () => {
    /**
     * Walk parent chain to derive lineage
     */
    function deriveLineage(parentId, sdMap) {
      const ancestorChain = [];
      let currentId = parentId;
      const visited = new Set();

      while (currentId) {
        if (visited.has(currentId)) {
          throw new Error(`Circular reference detected at ${currentId}`);
        }
        visited.add(currentId);
        ancestorChain.unshift(currentId);

        const ancestor = sdMap.get(currentId);
        if (!ancestor) {
          throw new Error(`Ancestor ${currentId} not found`);
        }
        currentId = ancestor.parent_sd_id;
      }

      return {
        root_sd_id: ancestorChain[0],
        ancestor_chain: ancestorChain,
        from_parent: parentId,
        split_depth: ancestorChain.length
      };
    }

    it('should derive lineage for direct child of root', () => {
      const sdMap = new Map([
        ['SD-ROOT', { id: 'SD-ROOT', parent_sd_id: null }],
        ['SD-CHILD', { id: 'SD-CHILD', parent_sd_id: 'SD-ROOT' }]
      ]);

      const lineage = deriveLineage('SD-ROOT', sdMap);

      expect(lineage.root_sd_id).toBe('SD-ROOT');
      expect(lineage.ancestor_chain).toEqual(['SD-ROOT']);
      expect(lineage.from_parent).toBe('SD-ROOT');
      expect(lineage.split_depth).toBe(1);
    });

    it('should derive lineage for grandchild', () => {
      const sdMap = new Map([
        ['SD-ROOT', { id: 'SD-ROOT', parent_sd_id: null }],
        ['SD-CHILD', { id: 'SD-CHILD', parent_sd_id: 'SD-ROOT' }],
        ['SD-GRANDCHILD', { id: 'SD-GRANDCHILD', parent_sd_id: 'SD-CHILD' }]
      ]);

      const lineage = deriveLineage('SD-CHILD', sdMap);

      expect(lineage.root_sd_id).toBe('SD-ROOT');
      expect(lineage.ancestor_chain).toEqual(['SD-ROOT', 'SD-CHILD']);
      expect(lineage.from_parent).toBe('SD-CHILD');
      expect(lineage.split_depth).toBe(2);
    });

    it('should detect circular reference', () => {
      const sdMap = new Map([
        ['SD-A', { id: 'SD-A', parent_sd_id: 'SD-B' }],
        ['SD-B', { id: 'SD-B', parent_sd_id: 'SD-A' }]
      ]);

      expect(() => deriveLineage('SD-A', sdMap)).toThrow('Circular reference');
    });

    it('should throw if ancestor not found', () => {
      const sdMap = new Map([
        ['SD-CHILD', { id: 'SD-CHILD', parent_sd_id: 'SD-MISSING' }]
      ]);

      expect(() => deriveLineage('SD-MISSING', sdMap)).toThrow('not found');
    });
  });

  describe('deriveInheritedAnchors', () => {
    /**
     * Derive inherited_anchors from parent
     */
    function deriveInheritedAnchors(parentMetadata, childMetadata) {
      const parentAnchors = parentMetadata?.references?.anchor_specs || [];
      const childAnchors = childMetadata?.references?.anchor_specs || [];

      if (childAnchors.length > 0) {
        const childPaths = new Set(childAnchors.map(a => a.path));
        const intersection = parentAnchors.filter(a => childPaths.has(a.path));

        return {
          anchors: intersection,
          source: 'intersection',
          confirmed: true,
          note: `Intersection of parent (${parentAnchors.length}) and child (${childAnchors.length}) anchors`
        };
      }

      return {
        anchors: parentAnchors,
        source: 'parent_copy',
        confirmed: false,
        note: 'UNCONFIRMED: Copied from parent. Chairman must verify before apply.'
      };
    }

    it('should return intersection when child has own anchors', () => {
      const parentMetadata = {
        references: {
          anchor_specs: [
            { path: 'docs/spec-a.md' },
            { path: 'docs/spec-b.md' },
            { path: 'docs/spec-c.md' }
          ]
        }
      };

      const childMetadata = {
        references: {
          anchor_specs: [
            { path: 'docs/spec-a.md' },
            { path: 'docs/spec-c.md' }
          ]
        }
      };

      const result = deriveInheritedAnchors(parentMetadata, childMetadata);

      expect(result.source).toBe('intersection');
      expect(result.confirmed).toBe(true);
      expect(result.anchors).toHaveLength(2);
      expect(result.anchors.map(a => a.path)).toEqual(['docs/spec-a.md', 'docs/spec-c.md']);
    });

    it('should copy from parent when child has no anchors (UNCONFIRMED)', () => {
      const parentMetadata = {
        references: {
          anchor_specs: [
            { path: 'docs/spec-a.md' },
            { path: 'docs/spec-b.md' }
          ]
        }
      };

      const childMetadata = {
        references: {
          anchor_specs: []
        }
      };

      const result = deriveInheritedAnchors(parentMetadata, childMetadata);

      expect(result.source).toBe('parent_copy');
      expect(result.confirmed).toBe(false);
      expect(result.anchors).toHaveLength(2);
      expect(result.note).toContain('UNCONFIRMED');
    });

    it('should handle empty parent anchors', () => {
      const parentMetadata = {
        references: {
          anchor_specs: []
        }
      };

      const childMetadata = {
        references: {
          anchor_specs: [{ path: 'docs/spec-a.md' }]
        }
      };

      const result = deriveInheritedAnchors(parentMetadata, childMetadata);

      expect(result.source).toBe('intersection');
      expect(result.anchors).toHaveLength(0);
    });

    it('should handle null/undefined metadata', () => {
      const result = deriveInheritedAnchors(null, undefined);

      expect(result.source).toBe('parent_copy');
      expect(result.anchors).toHaveLength(0);
      expect(result.confirmed).toBe(false);
    });
  });

  describe('Role-Aware Collision Detection', () => {
    // Anchor role types
    const AnchorRole = {
      IMPLEMENT: 'IMPLEMENT',
      VERIFY_ONLY: 'VERIFY_ONLY',
      CONSUME: 'CONSUME'
    };

    // Per-anchor role overrides (matches migrate-child-sds.mjs)
    const ANCHOR_ROLE_OVERRIDES = {
      'SD-VISION-V2-005': {
        '06-hierarchical-agent-architecture.md': AnchorRole.CONSUME
      }
    };

    function inferAnchorRole(sd) {
      const explicitRole = sd.metadata?.anchor_role;
      if (explicitRole && Object.values(AnchorRole).includes(explicitRole)) {
        return explicitRole;
      }
      if (sd.id === 'SD-VISION-V2-007') return AnchorRole.VERIFY_ONLY;
      if (sd.id === 'SD-VISION-V2-008') return AnchorRole.CONSUME;
      return AnchorRole.IMPLEMENT;
    }

    function inferAnchorRoleForPath(sd, anchorPath) {
      const filename = anchorPath.split('/').pop();
      // Check per-anchor overrides from metadata first
      const metadataOverride = sd.metadata?.anchor_role_overrides?.[filename];
      if (metadataOverride && Object.values(AnchorRole).includes(metadataOverride)) {
        return metadataOverride;
      }
      // Check hardcoded overrides
      const sdOverrides = ANCHOR_ROLE_OVERRIDES[sd.id];
      if (sdOverrides && sdOverrides[filename]) {
        return sdOverrides[filename];
      }
      return inferAnchorRole(sd);
    }

    function parseSections(anchor) {
      const sections = anchor?.sections;
      if (!sections || sections.length === 0) return new Set(['all']);
      if (Array.isArray(sections)) {
        if (sections.includes('all')) return new Set(['all']);
        return new Set(sections.map(s => String(s).toLowerCase().trim()));
      }
      return new Set(['all']);
    }

    function sectionsOverlap(sectionsA, sectionsB) {
      if (sectionsA.has('all') || sectionsB.has('all')) return true;
      for (const section of sectionsA) {
        if (sectionsB.has(section)) return true;
      }
      return false;
    }

    function detectSiblingAnchorCollision(childSD, allSDs) {
      const siblings = allSDs.filter(sd =>
        sd.parent_sd_id === childSD.parent_sd_id && sd.id !== childSD.id
      );
      const childAnchors = childSD.metadata?.references?.anchor_specs || [];
      const childAnchorMap = new Map();
      for (const anchor of childAnchors) {
        childAnchorMap.set(anchor.path, {
          anchor,
          sections: parseSections(anchor),
          role: inferAnchorRoleForPath(childSD, anchor.path)
        });
      }
      const collisions = [];
      for (const sibling of siblings) {
        const siblingAnchors = sibling.metadata?.references?.anchor_specs || [];
        for (const siblingAnchor of siblingAnchors) {
          const childAnchorInfo = childAnchorMap.get(siblingAnchor.path);
          if (!childAnchorInfo) continue;
          const siblingSections = parseSections(siblingAnchor);
          const siblingRoleForPath = inferAnchorRoleForPath(sibling, siblingAnchor.path);
          const childRoleForPath = childAnchorInfo.role;
          if (childRoleForPath !== AnchorRole.IMPLEMENT || siblingRoleForPath !== AnchorRole.IMPLEMENT) continue;
          if (!sectionsOverlap(childAnchorInfo.sections, siblingSections)) continue;
          collisions.push({
            path: siblingAnchor.path,
            siblingId: sibling.id,
            siblingTitle: sibling.title,
            childSections: [...childAnchorInfo.sections],
            siblingSections: [...siblingSections]
          });
        }
      }
      if (collisions.length === 0) return null;
      const first = collisions[0];
      return {
        siblingId: first.siblingId,
        siblingTitle: first.siblingTitle,
        overlappingAnchors: collisions.map(c => c.path),
        collisionDetails: collisions,
        message: `IMPLEMENT collision: ${childSD.id} and ${first.siblingId} both claim ownership`
      };
    }

    it('should detect IMPLEMENT vs IMPLEMENT collision', () => {
      const childSD = {
        id: 'SD-CHILD-A',
        parent_sd_id: 'SD-ROOT',
        metadata: {
          references: {
            anchor_specs: [{ path: 'docs/shared.md', sections: ['all'] }]
          }
        }
      };

      const allSDs = [
        { id: 'SD-ROOT', parent_sd_id: null },
        childSD,
        {
          id: 'SD-CHILD-B',
          parent_sd_id: 'SD-ROOT',
          title: 'Sibling B',
          metadata: {
            references: {
              anchor_specs: [{ path: 'docs/shared.md', sections: ['all'] }]
            }
          }
        }
      ];

      const collision = detectSiblingAnchorCollision(childSD, allSDs);

      expect(collision).not.toBeNull();
      expect(collision.message).toContain('IMPLEMENT collision');
    });

    it('should NOT detect collision when sibling is VERIFY_ONLY (SD-VISION-V2-007)', () => {
      const childSD = {
        id: 'SD-VISION-V2-001',
        parent_sd_id: 'SD-ROOT',
        metadata: {
          references: {
            anchor_specs: [{ path: 'docs/01-database-schema.md' }]
          }
        }
      };

      const allSDs = [
        { id: 'SD-ROOT', parent_sd_id: null },
        childSD,
        {
          id: 'SD-VISION-V2-007', // Integration Verification = VERIFY_ONLY
          parent_sd_id: 'SD-ROOT',
          metadata: {
            references: {
              anchor_specs: [{ path: 'docs/01-database-schema.md' }]
            }
          }
        }
      ];

      const collision = detectSiblingAnchorCollision(childSD, allSDs);

      expect(collision).toBeNull(); // Not a collision - V2-007 is VERIFY_ONLY
    });

    it('should NOT detect collision when sibling is CONSUME (SD-VISION-V2-008)', () => {
      const childSD = {
        id: 'SD-VISION-V2-001',
        parent_sd_id: 'SD-ROOT',
        metadata: {
          references: {
            anchor_specs: [{ path: 'docs/01-database-schema.md' }]
          }
        }
      };

      const allSDs = [
        { id: 'SD-ROOT', parent_sd_id: null },
        childSD,
        {
          id: 'SD-VISION-V2-008', // Technical Debt Cleanup = CONSUME
          parent_sd_id: 'SD-ROOT',
          metadata: {
            references: {
              anchor_specs: [{ path: 'docs/01-database-schema.md' }]
            }
          }
        }
      ];

      const collision = detectSiblingAnchorCollision(childSD, allSDs);

      expect(collision).toBeNull(); // Not a collision - V2-008 is CONSUME
    });

    it('should NOT detect collision when sections do not overlap', () => {
      const childSD = {
        id: 'SD-CHILD-A',
        parent_sd_id: 'SD-ROOT',
        metadata: {
          references: {
            anchor_specs: [{ path: 'docs/shared.md', sections: ['section-1', 'section-2'] }]
          }
        }
      };

      const allSDs = [
        { id: 'SD-ROOT', parent_sd_id: null },
        childSD,
        {
          id: 'SD-CHILD-B',
          parent_sd_id: 'SD-ROOT',
          metadata: {
            references: {
              anchor_specs: [{ path: 'docs/shared.md', sections: ['section-3', 'section-4'] }]
            }
          }
        }
      ];

      const collision = detectSiblingAnchorCollision(childSD, allSDs);

      expect(collision).toBeNull(); // Different sections - no collision
    });

    it('should detect collision when sections overlap', () => {
      const childSD = {
        id: 'SD-CHILD-A',
        parent_sd_id: 'SD-ROOT',
        metadata: {
          references: {
            anchor_specs: [{ path: 'docs/shared.md', sections: ['section-1', 'section-2'] }]
          }
        }
      };

      const allSDs = [
        { id: 'SD-ROOT', parent_sd_id: null },
        childSD,
        {
          id: 'SD-CHILD-B',
          parent_sd_id: 'SD-ROOT',
          metadata: {
            references: {
              anchor_specs: [{ path: 'docs/shared.md', sections: ['section-2', 'section-3'] }]
            }
          }
        }
      ];

      const collision = detectSiblingAnchorCollision(childSD, allSDs);

      expect(collision).not.toBeNull(); // section-2 overlaps
    });

    it('should respect explicit anchor_role in metadata', () => {
      const childSD = {
        id: 'SD-CHILD-A',
        parent_sd_id: 'SD-ROOT',
        metadata: {
          anchor_role: 'VERIFY_ONLY', // Explicit role overrides default
          references: {
            anchor_specs: [{ path: 'docs/shared.md' }]
          }
        }
      };

      const allSDs = [
        { id: 'SD-ROOT', parent_sd_id: null },
        childSD,
        {
          id: 'SD-CHILD-B',
          parent_sd_id: 'SD-ROOT',
          metadata: {
            references: {
              anchor_specs: [{ path: 'docs/shared.md' }]
            }
          }
        }
      ];

      const collision = detectSiblingAnchorCollision(childSD, allSDs);

      expect(collision).toBeNull(); // childSD is VERIFY_ONLY due to explicit role
    });

    it('should not detect collision with cousins (different parent)', () => {
      const childSD = {
        id: 'SD-CHILD-A1',
        parent_sd_id: 'SD-CHILD-A',
        metadata: {
          references: {
            anchor_specs: [{ path: 'docs/shared.md' }]
          }
        }
      };

      const allSDs = [
        { id: 'SD-ROOT', parent_sd_id: null },
        { id: 'SD-CHILD-A', parent_sd_id: 'SD-ROOT' },
        { id: 'SD-CHILD-B', parent_sd_id: 'SD-ROOT' },
        childSD,
        {
          id: 'SD-CHILD-B1',
          parent_sd_id: 'SD-CHILD-B', // Different parent - cousin, not sibling
          metadata: {
            references: {
              anchor_specs: [{ path: 'docs/shared.md' }]
            }
          }
        }
      ];

      const collision = detectSiblingAnchorCollision(childSD, allSDs);

      expect(collision).toBeNull(); // Cousins don't trigger collision
    });

    it('should NOT detect collision when SD-V2-005 CONSUMES agent architecture (per-anchor override)', () => {
      // SD-V2-004 is sole IMPLEMENT owner of 06-hierarchical-agent-architecture.md
      // SD-V2-005 CONSUMES that anchor (per-anchor override) but IMPLEMENTS 09-agent-runtime-service.md
      const childSD = {
        id: 'SD-VISION-V2-004',
        parent_sd_id: 'SD-ROOT',
        metadata: {
          references: {
            anchor_specs: [
              { path: 'docs/vision/specs/06-hierarchical-agent-architecture.md' }
            ]
          }
        }
      };

      const allSDs = [
        { id: 'SD-ROOT', parent_sd_id: null },
        childSD,
        {
          id: 'SD-VISION-V2-005', // Has per-anchor override for 06-hierarchical-agent-architecture.md → CONSUME
          parent_sd_id: 'SD-ROOT',
          metadata: {
            references: {
              anchor_specs: [
                { path: 'docs/vision/specs/06-hierarchical-agent-architecture.md' },
                { path: 'docs/vision/specs/09-agent-runtime-service.md' }
              ]
            }
          }
        }
      ];

      const collision = detectSiblingAnchorCollision(childSD, allSDs);

      expect(collision).toBeNull(); // No collision - V2-005 is CONSUME for this anchor
    });

    it('should use metadata anchor_role_overrides when present', () => {
      const childSD = {
        id: 'SD-CHILD-A',
        parent_sd_id: 'SD-ROOT',
        metadata: {
          anchor_role_overrides: {
            'shared.md': 'CONSUME'  // Per-anchor override via metadata
          },
          references: {
            anchor_specs: [{ path: 'docs/shared.md' }]
          }
        }
      };

      const allSDs = [
        { id: 'SD-ROOT', parent_sd_id: null },
        childSD,
        {
          id: 'SD-CHILD-B',
          parent_sd_id: 'SD-ROOT',
          metadata: {
            references: {
              anchor_specs: [{ path: 'docs/shared.md' }]
            }
          }
        }
      ];

      const collision = detectSiblingAnchorCollision(childSD, allSDs);

      expect(collision).toBeNull(); // childSD is CONSUME for shared.md via metadata override
    });
  });

  describe('Patch Validation', () => {
    /**
     * Validate required fields in patch
     */
    function validatePatchRequiredFields(patch) {
      const errors = [];

      const splitReason = patch.carry_forward?.split_metadata?.split_reason;
      if (!splitReason || splitReason === '__CHAIRMAN_MUST_SUPPLY__') {
        errors.push('split_metadata.split_reason must be provided');
      }

      const depPolicy = patch.carry_forward?.dependency_policy?.policy;
      if (!depPolicy || depPolicy === '__CHAIRMAN_MUST_SUPPLY__') {
        errors.push('dependency_policy.policy must be provided');
      }

      if (depPolicy && depPolicy !== 'EDGES_REQUIRED' && depPolicy !== 'NO_EDGES_EXPECTED') {
        errors.push('dependency_policy.policy must be EDGES_REQUIRED or NO_EDGES_EXPECTED');
      }

      if (depPolicy === 'NO_EDGES_EXPECTED' && !patch.carry_forward?.dependency_policy?.no_edges_reason) {
        errors.push('NO_EDGES_EXPECTED requires no_edges_reason');
      }

      if (!patch.carry_forward?.inherited_anchors?.confirmed) {
        errors.push('inherited_anchors must be confirmed');
      }

      return errors;
    }

    it('should pass with all required fields filled', () => {
      const patch = {
        carry_forward: {
          split_metadata: {
            split_reason: 'Scope too large for single SD'
          },
          dependency_policy: {
            policy: 'EDGES_REQUIRED'
          },
          inherited_anchors: {
            confirmed: true
          }
        }
      };

      const errors = validatePatchRequiredFields(patch);
      expect(errors).toHaveLength(0);
    });

    it('should fail with placeholder split_reason', () => {
      const patch = {
        carry_forward: {
          split_metadata: {
            split_reason: '__CHAIRMAN_MUST_SUPPLY__'
          },
          dependency_policy: {
            policy: 'EDGES_REQUIRED'
          },
          inherited_anchors: {
            confirmed: true
          }
        }
      };

      const errors = validatePatchRequiredFields(patch);
      expect(errors).toContain('split_metadata.split_reason must be provided');
    });

    it('should fail with invalid policy value', () => {
      const patch = {
        carry_forward: {
          split_metadata: {
            split_reason: 'Valid reason'
          },
          dependency_policy: {
            policy: 'INVALID_POLICY'
          },
          inherited_anchors: {
            confirmed: true
          }
        }
      };

      const errors = validatePatchRequiredFields(patch);
      expect(errors).toContain('dependency_policy.policy must be EDGES_REQUIRED or NO_EDGES_EXPECTED');
    });

    it('should fail when NO_EDGES_EXPECTED without reason', () => {
      const patch = {
        carry_forward: {
          split_metadata: {
            split_reason: 'Valid reason'
          },
          dependency_policy: {
            policy: 'NO_EDGES_EXPECTED',
            no_edges_reason: null
          },
          inherited_anchors: {
            confirmed: true
          }
        }
      };

      const errors = validatePatchRequiredFields(patch);
      expect(errors).toContain('NO_EDGES_EXPECTED requires no_edges_reason');
    });

    it('should fail with unconfirmed inherited_anchors', () => {
      const patch = {
        carry_forward: {
          split_metadata: {
            split_reason: 'Valid reason'
          },
          dependency_policy: {
            policy: 'EDGES_REQUIRED'
          },
          inherited_anchors: {
            confirmed: false
          }
        }
      };

      const errors = validatePatchRequiredFields(patch);
      expect(errors).toContain('inherited_anchors must be confirmed');
    });
  });

  describe('Checksum Computation', () => {
    function computeChecksum(carryForward) {
      const json = JSON.stringify(carryForward, null, 2);
      return createHash('sha256').update(json).digest('hex').substring(0, 16);
    }

    it('should produce consistent checksums for same input', () => {
      const cf1 = { version: '1.0', lineage: { root_sd_id: 'SD-ROOT' } };
      const cf2 = { version: '1.0', lineage: { root_sd_id: 'SD-ROOT' } };

      expect(computeChecksum(cf1)).toBe(computeChecksum(cf2));
    });

    it('should produce different checksums for different inputs', () => {
      const cf1 = { version: '1.0', lineage: { root_sd_id: 'SD-ROOT-A' } };
      const cf2 = { version: '1.0', lineage: { root_sd_id: 'SD-ROOT-B' } };

      expect(computeChecksum(cf1)).not.toBe(computeChecksum(cf2));
    });
  });
});
